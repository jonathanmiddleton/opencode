import { test, expect, mock, beforeEach } from "bun:test"

// --- Mock state ---

// Track how many Client instances have been created
let clientInstanceCount = 0

// Per-instance listTools behavior: map from instance index to a queue of
// functions that return the listTools result or throw
type ListToolsBehavior = () => Promise<{ tools: Array<{ name: string; inputSchema: object }> }>
const listToolsBehaviors: Map<number, ListToolsBehavior[]> = new Map()

function setListToolsBehavior(instanceIndex: number, behaviors: ListToolsBehavior[]) {
  listToolsBehaviors.set(instanceIndex, [...behaviors])
}

// Mock the MCP SDK Client
mock.module("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: class MockClient {
    private instanceIndex: number

    constructor(_opts?: unknown) {
      this.instanceIndex = clientInstanceCount++
    }

    async connect(_transport: unknown) {
      // Connection always succeeds
    }

    async listTools() {
      const behaviors = listToolsBehaviors.get(this.instanceIndex)

      if (behaviors && behaviors.length > 0) {
        const behavior = behaviors.shift()!
        return behavior()
      }
      // Default: return empty tools
      return { tools: [] }
    }

    async close() {
      // No-op
    }

    setNotificationHandler(_schema: unknown, _handler: unknown) {
      // No-op
    }
  },
}))

// Mock transports — connect successfully (unlike headers.test.ts which throws)
mock.module("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: class MockStreamableHTTP {
    constructor(_url: URL, _options?: unknown) {}
    async start() {
      // Success — no throw
    }
  },
}))

mock.module("@modelcontextprotocol/sdk/client/sse.js", () => ({
  SSEClientTransport: class MockSSE {
    constructor(_url: URL, _options?: unknown) {}
    async start() {
      // Never reached since StreamableHTTP succeeds first
    }
  },
}))

// Mock UnauthorizedError (needed by create() error handling)
mock.module("@modelcontextprotocol/sdk/client/auth.js", () => ({
  UnauthorizedError: class MockUnauthorizedError extends Error {
    constructor() {
      super("Unauthorized")
    }
  },
}))

beforeEach(() => {
  clientInstanceCount = 0
  listToolsBehaviors.clear()
})

// Import after mocking
const { MCP } = await import("../../src/mcp/index")
const { Instance } = await import("../../src/project/instance")
const { tmpdir } = await import("../fixture/fixture")

const MOCK_TOOLS = [
  { name: "test_tool", inputSchema: { type: "object" as const, properties: {} } },
  { name: "another_tool", inputSchema: { type: "object" as const, properties: {} } },
]

const MCP_CONFIG = {
  type: "remote" as const,
  url: "https://example.com/mcp",
  oauth: false as const,
}

test("tools() reconnects and returns tools after listTools timeout", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        `${dir}/opencode.json`,
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          mcp: {
            "test-server": MCP_CONFIG,
          },
        }),
      )
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      // state() lazy init creates instance 0 from config:
      // - listTools in create(): succeeds (enters "connected")
      setListToolsBehavior(0, [async () => ({ tools: MOCK_TOOLS })])

      // add() creates instance 1, replacing instance 0:
      // - listTools in create(): succeeds (enters "connected")
      // - listTools in tools(): fails (triggers reconnect)
      setListToolsBehavior(1, [
        async () => ({ tools: MOCK_TOOLS }),
        async () => {
          throw new Error("MCP error -32001: Request timed out")
        },
      ])

      // connect() during reconnect creates instance 2:
      // - listTools in create(): succeeds (enters "connected")
      // - listTools in tools() retry: succeeds (returns tools)
      setListToolsBehavior(2, [
        async () => ({ tools: MOCK_TOOLS }),
        async () => ({ tools: MOCK_TOOLS }),
      ])

      // Establish the initial connection
      await MCP.add("test-server", MCP_CONFIG)

      // Verify initially connected
      const statusBefore = await MCP.status()
      expect(statusBefore["test-server"]?.status).toBe("connected")

      // Call tools() — first listTools fails, reconnect happens, retry succeeds
      const tools = await MCP.tools()

      // Should have tools from the reconnected client
      const toolNames = Object.keys(tools)
      expect(toolNames.length).toBe(2)
      expect(toolNames).toContain("test-server_test_tool")
      expect(toolNames).toContain("test-server_another_tool")

      // Status should be connected after successful reconnect
      const statusAfter = await MCP.status()
      expect(statusAfter["test-server"]?.status).toBe("connected")
    },
  })
})

test("tools() marks client as failed when reconnect also fails", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        `${dir}/opencode.json`,
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          mcp: {
            "test-server": MCP_CONFIG,
          },
        }),
      )
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      // state() lazy init creates instance 0 from config:
      // - listTools in create(): succeeds (enters "connected")
      setListToolsBehavior(0, [async () => ({ tools: MOCK_TOOLS })])

      // add() creates instance 1, replacing instance 0:
      // - listTools in create(): succeeds (enters "connected")
      // - listTools in tools(): fails (triggers reconnect)
      setListToolsBehavior(1, [
        async () => ({ tools: MOCK_TOOLS }),
        async () => {
          throw new Error("MCP error -32001: Request timed out")
        },
      ])

      // connect() during reconnect creates instance 2:
      // - listTools in create(): succeeds (enters "connected")
      // - listTools in tools() retry: also fails (reconnect didn't help)
      setListToolsBehavior(2, [
        async () => ({ tools: MOCK_TOOLS }),
        async () => {
          throw new Error("MCP error -32001: Request timed out")
        },
      ])

      // Establish the initial connection
      await MCP.add("test-server", MCP_CONFIG)

      // Verify initially connected
      const statusBefore = await MCP.status()
      expect(statusBefore["test-server"]?.status).toBe("connected")

      // Call tools() — both attempts fail
      const tools = await MCP.tools()

      // No tools should be returned for this server
      const toolNames = Object.keys(tools).filter((name) => name.startsWith("test-server_"))
      expect(toolNames.length).toBe(0)

      // Status should be failed
      const statusAfter = await MCP.status()
      expect(statusAfter["test-server"]?.status).toBe("failed")
    },
  })
})
