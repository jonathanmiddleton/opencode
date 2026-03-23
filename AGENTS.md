## About This Repo

This is a private fork of [anomalyco/opencode](https://github.com/anomalyco/opencode), customized for our usage. We do not submit PRs upstream. The fork exists to carry local fixes and configuration that suit our workflow, such as corrected cost estimation for Anthropic's over-200K pricing tier.

- The default branch is `main`.
- There are no pre-commit or pre-push hooks (husky has been removed).
- The upstream repo's default branch is `dev`, tracked as `upstream/dev`.
- To pull upstream changes: `git fetch upstream && git merge upstream/dev`.
- Commit directly to `main`; no feature branches required for small changes.
- Prefer automation: execute requested actions without confirmation unless blocked by missing info or safety/irreversibility.

### Syncing, Building, and Deploying

The `sync.sh` script at the repo root manages the upstream sync and local build lifecycle:

- `./sync.sh check` — show how many new upstream commits exist without applying them.
- `./sync.sh update` — fetch and merge `upstream/dev` into `main`.
- `./sync.sh build` — build the binary and install it to `~/.opencode/bin/opencode`. This also disables auto-update in `~/.config/opencode/opencode.json` to prevent the official release from overwriting the custom build.
- `./sync.sh all` — update + build in one step.
- `./sync.sh restore` — restore the official opencode binary from `~/.opencode/bin/opencode.bak`.

The build step calls `packages/opencode/script/install-local.sh`, which runs `bun install`, builds for the current platform, signs the binary (macOS), and copies it to `~/.opencode/bin/opencode`.

---

_The guidance below comes from the upstream repo and remains useful for style and conventions._

- To regenerate the JavaScript SDK, run `./packages/sdk/js/script/build.ts`.
- ALWAYS USE PARALLEL TOOLS WHEN APPLICABLE.

## Style Guide

### General Principles

- Keep things in one function unless composable or reusable
- Avoid `try`/`catch` where possible
- Avoid using the `any` type
- Prefer single word variable names where possible
- Use Bun APIs when possible, like `Bun.file()`
- Rely on type inference when possible; avoid explicit type annotations or interfaces unless necessary for exports or clarity
- Prefer functional array methods (flatMap, filter, map) over for loops; use type guards on filter to maintain type inference downstream

### Naming

Prefer single word names for variables and functions. Only use multiple words if necessary.

### Naming Enforcement (Read This)

THIS RULE IS MANDATORY FOR AGENT WRITTEN CODE.

- Use single word names by default for new locals, params, and helper functions.
- Multi-word names are allowed only when a single word would be unclear or ambiguous.
- Do not introduce new camelCase compounds when a short single-word alternative is clear.
- Before finishing edits, review touched lines and shorten newly introduced identifiers where possible.
- Good short names to prefer: `pid`, `cfg`, `err`, `opts`, `dir`, `root`, `child`, `state`, `timeout`.
- Examples to avoid unless truly required: `inputPID`, `existingClient`, `connectTimeout`, `workerPath`.

```ts
// Good
const foo = 1
function journal(dir: string) {}

// Bad
const fooBar = 1
function prepareJournal(dir: string) {}
```

Reduce total variable count by inlining when a value is only used once.

```ts
// Good
const journal = await Bun.file(path.join(dir, "journal.json")).json()

// Bad
const journalPath = path.join(dir, "journal.json")
const journal = await Bun.file(journalPath).json()
```

### Destructuring

Avoid unnecessary destructuring. Use dot notation to preserve context.

```ts
// Good
obj.a
obj.b

// Bad
const { a, b } = obj
```

### Variables

Prefer `const` over `let`. Use ternaries or early returns instead of reassignment.

```ts
// Good
const foo = condition ? 1 : 2

// Bad
let foo
if (condition) foo = 1
else foo = 2
```

### Control Flow

Avoid `else` statements. Prefer early returns.

```ts
// Good
function foo() {
  if (condition) return 1
  return 2
}

// Bad
function foo() {
  if (condition) return 1
  else return 2
}
```

### Schema Definitions (Drizzle)

Use snake_case for field names so column names don't need to be redefined as strings.

```ts
// Good
const table = sqliteTable("session", {
  id: text().primaryKey(),
  project_id: text().notNull(),
  created_at: integer().notNull(),
})

// Bad
const table = sqliteTable("session", {
  id: text("id").primaryKey(),
  projectID: text("project_id").notNull(),
  createdAt: integer("created_at").notNull(),
})
```

## Testing

- Avoid mocks as much as possible
- Test actual implementation, do not duplicate logic into tests
- Tests cannot run from repo root (guard: `do-not-run-tests-from-root`); run from package dirs like `packages/opencode`.

## Type Checking

- Always run `bun typecheck` from package directories (e.g., `packages/opencode`), never `tsc` directly.
