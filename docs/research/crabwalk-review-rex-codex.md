# Crabwalk Engineering Deep Dive — Rex Codex Review

> **Reviewer:** Rex Codex (GPT/Codex perspective)
> **Date:** 2026-02-06
> **Repo:** https://github.com/luccast/crabwalk (v1.0.11, commit `6ca27b1`)
> **Purpose:** Engineering intel for The Reef (VS Code extension for OpenClaw agent orchestration)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [OpenClaw Gateway Integration — The Crown Jewels](#3-openclaw-gateway-integration)
4. [Rendering & UI Approach](#4-rendering--ui-approach)
5. [Performance Analysis](#5-performance-analysis)
6. [Reusable Code & Patterns for The Reef](#6-reusable-code--patterns-for-the-reef)
7. [Code Quality Assessment](#7-code-quality-assessment)
8. [Key Files Reference](#8-key-files-reference)
9. [Recommendations for The Reef](#9-recommendations-for-the-reef)

---

## 1. Executive Summary

Crabwalk is a **full-stack React monitoring dashboard** for OpenClaw agents. It connects to the OpenClaw gateway via WebSocket (protocol v3), receives real-time agent events, and renders them as an interactive node graph using ReactFlow. It also includes a workspace file browser.

**Key takeaways for The Reef:**
- The **Gateway Protocol v3 types and client** (`src/integrations/openclaw/`) are the most valuable code to study — they define exactly how to talk to OpenClaw
- The **event parsing and collection management** patterns show how to normalize raw gateway events into usable UI state
- The custom **graph layout algorithm** (no dagre dependency!) is simple, fast, and effective
- The app uses **TanStack DB** for client-side reactive state — worth understanding but we'd use VS Code's own state management
- **Zero test files** exist — the entire project ships without automated tests

---

## 2. Architecture Overview

### 2.1 Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | TanStack Start (Vite + Nitro) | Full-stack SSR React framework |
| Routing | TanStack Router | File-based routing in `src/routes/` |
| API | tRPC over HTTP + SSE | `httpBatchLink` for queries/mutations, `unstable_httpSubscriptionLink` for subscriptions |
| Client State | TanStack DB (`@tanstack/db`) | Local-only reactive collections |
| Data Fetching | TanStack Query | 5-minute stale time, wraps tRPC |
| Visualization | ReactFlow (`@xyflow/react` v12) | Node graph with custom node types |
| Animation | Framer Motion | Entry animations, sidebar transitions, crab mascot |
| Styling | Tailwind CSS v4 | Custom retro-futuristic design system |
| Gateway Client | Raw `ws` (Node.js WebSocket) | Server-side only — connects to OpenClaw gateway |

### 2.2 Data Flow

```
OpenClaw Gateway (ws://127.0.0.1:18789)
    │
    ▼ WebSocket (Node.js `ws` library)
Server-side ClawdbotClient (singleton)
    │
    ▼ tRPC subscription (SSE over HTTP)
Browser tRPC client
    │
    ▼ Event parsing + collection updates
TanStack DB Collections (sessionsCollection, actionsCollection, execsCollection)
    │
    ▼ useLiveQuery() reactive hooks
React Components (ActionGraph, SessionList, etc.)
```

**Critical insight:** The WebSocket connection to OpenClaw lives **server-side only**. The browser never directly connects to the gateway. Instead, tRPC subscriptions relay events from server → browser via Server-Sent Events. This is an architectural decision driven by the `ws` library being Node-only.

### 2.3 File Structure

```
src/
├── integrations/
│   ├── openclaw/           # ← MOST IMPORTANT FOR US
│   │   ├── protocol.ts     # Gateway Protocol v3 types
│   │   ├── client.ts       # WebSocket client (server-side)
│   │   ├── parser.ts       # Event frame → domain model conversion
│   │   ├── collections.ts  # TanStack DB collections + mutation logic
│   │   ├── persistence.ts  # JSONL file-based persistence
│   │   └── index.ts        # Re-exports
│   ├── trpc/
│   │   ├── router.ts       # tRPC router (openclaw + workspace procedures)
│   │   └── client.ts       # tRPC client config
│   └── query/
│       └── provider.tsx     # React Query provider
├── components/
│   ├── monitor/            # Graph visualization components
│   │   ├── ActionGraph.tsx  # Main ReactFlow graph + crab AI
│   │   ├── ActionNode.tsx   # Chat/agent event node
│   │   ├── ExecNode.tsx     # Shell execution node
│   │   ├── SessionNode.tsx  # Agent session node
│   │   ├── SessionList.tsx  # Sidebar session list
│   │   ├── CrabNode.tsx     # Origin crab mascot node
│   │   ├── ChaserCrabNode.tsx # Animated follower crab
│   │   ├── SettingsPanel.tsx
│   │   └── StatusIndicator.tsx
│   ├── workspace/          # File browser components
│   └── ani/                # Frame-based sprite animations
├── lib/
│   ├── graph-layout.ts     # Custom layout algorithm (no dagre!)
│   └── workspace-fs.ts     # Server-side file system operations
├── routes/
│   ├── index.tsx           # Landing page
│   ├── monitor/index.tsx   # Main monitor page
│   ├── workspace/index.tsx # File browser page
│   ├── api/trpc.$.ts       # tRPC catch-all handler
│   └── __root.tsx          # Root layout
└── styles.css              # Full design system
```

---

## 3. OpenClaw Gateway Integration

### 3.1 Protocol v3 Types (`src/integrations/openclaw/protocol.ts`)

**This is the single most valuable file for our build.** It defines the complete Gateway Protocol v3 type system:

#### Frame Types (the wire protocol)
```typescript
// Three frame types on the wire:
interface RequestFrame  { type: 'req';   id: string; method: string; params?: unknown }
interface ResponseFrame { type: 'res';   id: string; ok: boolean; payload?: unknown; error?: {...} }
interface EventFrame    { type: 'event'; event: string; payload?: unknown; seq?: number }
```

#### Connection Handshake
```typescript
interface ConnectParams {
  minProtocol: 3; maxProtocol: 3;
  client: ClientInfo;      // { id, displayName, version, platform, mode }
  auth?: { token?: string };
}

interface HelloOk {
  type: 'hello-ok';
  protocol: number;
  snapshot: { presence: PresenceEntry[]; health: unknown; stateVersion: {...} };
  features: { methods: string[]; events: string[] };
}
```

#### Event Types (what the gateway sends)
- **`chat`** → `ChatEvent` — Agent chat messages (delta/final/aborted/error states, content blocks, usage tokens)
- **`agent`** → `AgentEvent` — Agent lifecycle events (stream: 'lifecycle' | 'assistant', with tool_use/tool_result data)
- **`exec.started`** → `ExecStartedEvent` — Shell command started (pid, command, sessionId)
- **`exec.output`** → `ExecOutputEvent` — Shell output chunks (stdout/stderr)
- **`exec.completed`** → `ExecCompletedEvent` — Shell command finished (exitCode, durationMs)
- **`health`** and **`tick`** — System events (skipped by parser)

#### Domain Models (derived from events)
- `MonitorSession` — Active agent session (key, agentId, platform, recipient, status)
- `MonitorAction` — Chat/agent action (runId, sessionKey, type, content, toolName, tokens)
- `MonitorExecProcess` — Aggregated exec process with output chunks

#### Session Key Format
```typescript
// Format: "agent:<agentId>:<platform>:<type>:<recipient>"
// Examples:
//   "agent:main:discord:channel:1234567890"
//   "agent:main:whatsapp:+1234567890"
//   "agent:main:telegram:group:12345"
//   "agent:rex-codex:subagent:6b7d8adc-..."
parseSessionKey(key) → { agentId, platform, recipient, isGroup }
```

### 3.2 WebSocket Client (`src/integrations/openclaw/client.ts`)

**Key implementation details:**

```typescript
class ClawdbotClient {
  // Connection
  constructor(url = 'ws://127.0.0.1:18789', token?: string)
  async connect(): Promise<HelloOk>     // Returns hello-ok with snapshot
  disconnect(): void

  // Request-response pattern
  async request<T>(method: string, params?: unknown): Promise<T>  // 30s timeout

  // Event subscription
  onEvent(callback: (event: EventFrame) => void): () => void  // Returns unsubscribe fn

  // Convenience methods
  async listSessions(params?: SessionsListParams): Promise<SessionInfo[]>
}
```

**Connection flow:**
1. Open WebSocket to `ws://127.0.0.1:18789`
2. Gateway sends `connect.challenge` event with nonce
3. Client responds with `connect` request containing auth token + client info
4. Gateway responds with `hello-ok` (wrapped in `res` frame) containing snapshot + features
5. Auto-reconnect on disconnect (5s delay, only if previously connected)

**API methods used:**
| Method | Purpose | Params |
|--------|---------|--------|
| `connect` | Authenticate + handshake | `ConnectParams` with token, client info, scopes |
| `sessions.list` | List active sessions | `{ limit?, activeMinutes?, includeLastMessage?, agentId? }` |

**Events consumed:**
| Event | Description |
|-------|-------------|
| `connect.challenge` | Auth challenge from gateway |
| `chat` | Agent chat messages (cumulative content, not incremental) |
| `agent` | Agent lifecycle + tool events |
| `exec.started` | Shell command started |
| `exec.output` | Shell output chunks |
| `exec.completed` | Shell command finished |
| `health` | System health (skipped) |
| `tick` | Heartbeat (skipped) |

**Auth token resolution:** Auto-detected from `~/.openclaw/openclaw.json` at `gateway.auth.token` (CLI does this via Python one-liner in bash script), or via `CLAWDBOT_API_TOKEN` env var.

### 3.3 Event Parser (`src/integrations/openclaw/parser.ts`)

Converts raw `EventFrame` into typed domain objects:

```typescript
parseEventFrame(frame) → {
  session?: Partial<MonitorSession>,  // Status update for a session
  action?: MonitorAction,             // Chat/agent action to display
  execEvent?: MonitorExecEvent,       // Exec process event
} | null
```

**Key parsing logic:**

- **Chat events (`chatEventToAction`):** Extracts content from message blocks (handles `text`, `tool_use`, `tool_result` block types). Maps `delta` → `streaming`, `final` → `complete`. Extracts usage tokens and stop reason from final events.

- **Agent events (`agentEventToAction`):** Handles lifecycle stream (`phase: start/end`), assistant stream (cumulative `text` + `delta`), and tool events (`tool_use`/`tool_result`). Maps lifecycle phases to `start`/`complete`.

- **Exec events:** Creates composite IDs like `exec-${runId}-${pid}` for deduplication.

**Important note on chat content:** The gateway sends **cumulative** message content with each delta, not incremental characters. This means each `delta` event contains the full message so far.

### 3.4 Collection Management (`src/integrations/openclaw/collections.ts`)

This is where raw events become organized, deduplicated UI state. **Heavy logic here.**

#### Three Collections (TanStack DB)
```typescript
sessionsCollection  // MonitorSession, keyed by session.key
actionsCollection   // MonitorAction, keyed by action.id
execsCollection     // MonitorExecProcess, keyed by process.id
```

#### Action Node Lifecycle (Critical Pattern)
All lifecycle states for the same `runId` share **one node ID** (`${runId}-action`):
```
start → streaming → complete/error/aborted
```
This means the graph shows ONE node per agent run that updates in-place, not a chain of separate nodes. Only `tool_call` and `tool_result` get separate nodes.

#### runId → sessionKey Resolution
Events don't always carry a `sessionKey`. The collections module maintains a `runSessionMap` that learns the mapping from events that do carry it, then backfills exec processes that only have a `runId`.

#### Subagent Spawn Inference
When a subagent session appears without an explicit `spawnedBy` field, the system **infers** which parent spawned it using temporal correlation:
```typescript
// Tracks last N action timestamps per parent session
// When subagent appears, finds parent with most recent action within 10s window
inferSpawnedBy(subagentKey, timestamp) → parentSessionKey | undefined
```

#### Exec Output Management
- Per-chunk max: 4,000 chars (truncated with `...[truncated]`)
- Per-process max: 200 chunks
- Total output max: 50,000 chars
- Oldest chunks dropped first when limits exceeded

### 3.5 Persistence (`src/integrations/openclaw/persistence.ts`)

Server-side file persistence for surviving restarts:
- `data/sessions.json` — Full JSON array
- `data/actions.jsonl` — JSONL append-only (10K max, rotated)
- `data/exec-events.jsonl` — JSONL append-only (20K max, rotated)
- `data/state.json` — Enabled/startedAt state

Uses **synchronous** fs operations for simplicity. Append-only for actions/execs during normal operation, full rewrite only on rotation.

---

## 4. Rendering & UI Approach

### 4.1 React 19 + TanStack Start

Full-stack React using TanStack Start (Vite + Nitro SSR). File-based routing with these pages:
- `/` — Landing page with retro crab aesthetic
- `/monitor` — Main monitoring dashboard
- `/workspace` — File browser/editor

### 4.2 ReactFlow Graph (`src/components/monitor/ActionGraph.tsx`)

The graph visualization is the core feature. Key aspects:

**Node Types:**
| Type | Component | Purpose |
|------|-----------|---------|
| `session` | `SessionNode` | Agent session card with platform, recipient, status |
| `action` | `ActionNode` | Chat/agent event with expandable content + markdown |
| `exec` | `ExecNode` | Shell execution with output viewer |
| `crab` | `CrabNode` | Origin node (static crab mascot) |
| `chaserCrab` | `ChaserCrabNode` | Animated crab that chases new nodes |

**Edge Styling:** Color-coded by state:
- Streaming: animated cyan dashed
- Complete: solid mint green
- Error: solid red
- Spawn (parent→child session): animated cyan dashed with arrow

**Session Handles:** Sessions have directional handles for different connection types:
- Top/Bottom: Normal flow (action chains)
- Left: `spawn-target` (receives spawn edge from parent)
- Right: `spawn-source` (emits spawn edge to children)

**Interactive Features:**
- Click session node to filter graph to that session
- Click action/exec nodes to expand details (markdown content, tool args, exec output)
- Drag nodes to pin positions (preserved across layout updates)
- Follow mode: auto-pan viewport to track new nodes
- Layout toggle: horizontal (LR) vs vertical (TB)
- Re-organize button: clear pins, re-layout
- MiniMap with color-coded node dots

### 4.3 Custom Graph Layout (`src/lib/graph-layout.ts`)

**No dagre dependency.** Custom column-based layout:

```
Crab Origin → Root Sessions (column 0) → Subagent Sessions (column 1+)
                    │                           │
                    ▼                           ▼
              Actions/Execs               Actions/Execs
              (stacked below)             (stacked below)
```

**Key constants:**
- `COLUMN_GAP = 400` — Horizontal spacing between depth levels
- `ROW_GAP = 80` — Vertical spacing between items in a column
- `SPAWN_OFFSET = 60` — Y offset for spawn position

**Layout stability tricks:**
- Sessions sorted by key (not activity time) to prevent positional swapping during streaming
- `spawnYCache` persists spawn Y positions across re-layouts to prevent jitter
- Collision avoidance: sessions in the same column check occupied Y ranges
- Orphan nodes placed at bottom-left

### 4.4 Design System (`src/styles.css`)

Custom retro-futuristic theme with:
- **Fonts:** Press Start 2P (arcade headlines), JetBrains Mono (everything else)
- **Colors:** Crab reds, shell darks, neon accents (cyan, mint, peach, lavender)
- **Effects:** Glow (text-shadow/box-shadow), scanline textures, grid patterns
- **Components:** `.btn-retro` (3D push buttons), `.panel-retro`, `.input-retro`
- **ReactFlow overrides:** Dark theme for controls, minimap, background

### 4.5 Mobile Support

Responsive design with dedicated mobile components:
- `useIsMobile()` hook (MediaQuery-based, 640px breakpoint)
- `MobileMonitorToolbar` — Bottom toolbar replacing sidebar
- `MobileSessionDrawer` — Slide-up sheet for session list
- QR code display on CLI startup for phone access

---

## 5. Performance Analysis

### 5.1 Why It Feels Fast

1. **O(n) layout algorithm:** Custom column layout is linear — no dagre's graph traversal overhead. Just iterate sessions, assign columns, stack items vertically.

2. **Bounded data sets:**
   - Actions capped at 50 when no session selected (`actions.slice(-50)`)
   - Exec output capped at 200 chunks / 50K chars
   - Server persistence capped at 10K actions, 20K exec events
   - Node lifecycle merged: one node per runId instead of one per event

3. **Memo everywhere:**
   - All custom node components are `memo()`-wrapped
   - `useMemo` for filtered actions/execs, raw nodes, raw edges, layout computation
   - `useCallback` for all event handlers

4. **TanStack DB reactive queries:** `useLiveQuery()` only re-renders when collection data actually changes, not on every event tick.

5. **Layout stability:** `spawnYCache` and `pinnedPositions` prevent unnecessary layout recalculations and node movement.

6. **Deduplication in collections:** Actions with same ID update in-place rather than creating new entries. The `actionsCollection.update()` path avoids delete+insert churn.

7. **Server-side WebSocket:** The browser doesn't manage WebSocket connections — the tRPC SSE subscription is simpler and more reliable than raw WS in browser.

### 5.2 Potential Bottlenecks

- **Synchronous file I/O in persistence:** `fs.writeFileSync` / `fs.appendFileSync` block the event loop. Would matter at high event throughput.
- **Full collection rewrites on rotation:** When action count exceeds 10K, the entire JSONL file is rewritten synchronously.
- **Session polling:** 5-second interval polling for sessions alongside real-time event subscription. Redundant but safe.
- **Unbounded spawn inference history:** `parentActionHistory` grows without limit on long-running sessions (mitigated by per-parent cap of 10 entries).

---

## 6. Reusable Code & Patterns for The Reef

### 6.1 Directly Liftable

#### Protocol Types (`src/integrations/openclaw/protocol.ts`)
**Lift the entire file.** All Gateway Protocol v3 types, session key parsing, connect params. This is the contract.

Key types to use:
- `RequestFrame`, `ResponseFrame`, `EventFrame` — wire protocol
- `ChatEvent`, `AgentEvent`, `ExecStartedEvent/Output/Completed` — event payloads
- `MonitorSession`, `MonitorAction`, `MonitorExecProcess` — domain models
- `parseSessionKey()` — session key decomposition
- `createConnectParams()` — handshake payload builder

#### Event Parser (`src/integrations/openclaw/parser.ts`)
**Lift with modifications.** The parsing logic for converting raw events to domain models. Functions:
- `chatEventToAction()` — Chat event → action
- `agentEventToAction()` — Agent event → action (handles lifecycle, assistant, tool events)
- `parseEventFrame()` — Top-level dispatcher

#### WebSocket Client Pattern (`src/integrations/openclaw/client.ts`)
**Adapt for VS Code.** The client class is well-structured:
- Request-response with pending map + timeout
- Event listener pattern with unsubscribe
- Auto-reconnect with backoff
- Challenge-response auth flow

For VS Code, we'd use the `ws` package directly since extensions run in Node.js. We could also use the browser WebSocket for webview panels.

### 6.2 Patterns to Adopt

#### Action Node Lifecycle Merging
```typescript
// All states for same runId share one node ID
const actionNodeId = `${action.runId}-action`
// start → streaming → complete updates the SAME node
```
This is crucial for keeping the UI clean. Without it, each streaming delta would create a separate node.

#### runId → sessionKey Resolution
```typescript
const runSessionMap = new Map<string, string>()
// Learn mapping from events that have both
// Backfill exec processes that only have runId
```
This solves a real problem: exec events often lack session context.

#### Spawn Inference via Temporal Correlation
```typescript
// Track parent session activity timestamps
// When subagent appears, find parent with recent action within 10s window
```
Clever heuristic when explicit spawn chains aren't available.

#### Exec Output Capping
```typescript
const MAX_EXEC_OUTPUT_CHUNKS = 200
const MAX_EXEC_OUTPUT_CHARS = 50000
const MAX_EXEC_CHUNK_CHARS = 4000
// Drop oldest chunks first, mark as truncated
```

### 6.3 Patterns to Adapt

#### State Management
Crabwalk uses TanStack DB collections. For The Reef (VS Code extension), we should use:
- **Extension host:** Plain Maps/objects with event emitters
- **Webview panels:** Message passing from extension → webview, with local state in the webview

#### tRPC Subscription → Direct WebSocket
Crabwalk has an extra hop (Gateway WS → Server → SSE → Browser). In VS Code, our extension host can connect directly to the gateway WS and push updates to webviews via `postMessage`.

#### File Persistence
Crabwalk's JSONL persistence is reasonable for a web app. For VS Code, we'd use `context.globalState` or `context.workspaceState` for small data, or write to `globalStoragePath` for larger datasets.

---

## 7. Code Quality Assessment

### 7.1 TypeScript

**Strict mode enabled** with good settings:
```json
"strict": true,
"noUnusedLocals": true,
"noUnusedParameters": true,
"noFallthroughCasesInSwitch": true,
"noUncheckedIndexedAccess": true
```

**Type safety gaps:**
- `createConnectParams()` returns `any` explicitly — the connect params object has extra fields beyond the typed `ConnectParams` interface (role, scopes, caps, commands, permissions, locale, userAgent)
- ReactFlow node types use `as any` casts: `const nodeTypes: NodeTypes = { session: SessionNode as any, ... }`
- `nodeData<T>()` helper casts domain data to `Record<string, unknown>` to satisfy ReactFlow's type constraints
- Gateway event payloads are cast from `unknown`: `frame.payload as ChatEvent`

### 7.2 Tests

**Zero test files.** No `*.test.*` or `*.spec.*` files anywhere in the repository. No test framework configured (no jest, vitest, or playwright in dependencies).

This is a significant gap. The event parsing and collection management code has complex logic that would benefit from unit tests.

### 7.3 Error Handling

**Generally good pattern:** Most async operations are wrapped in try/catch with user-facing error states:
```typescript
// Pattern used consistently:
try {
  const result = await trpc.openclaw.sessions.query(...)
  return { sessions: result.sessions }
} catch (error) {
  return { sessions: [], error: error instanceof Error ? error.message : 'Failed...' }
}
```

**Weak spots:**
- Persistence silently swallows errors with empty `catch {}` blocks
- Connection failures in the client only log to console
- File operations in workspace-fs could expose internal paths in error messages

### 7.4 Security

**Path traversal protection** in workspace-fs is well-implemented:
- Symlink resolution via `fs.realpath()` before path comparison
- Trailing separator check to prevent prefix attacks (`/workspace-evil` matching `/workspace`)
- File size limit (10MB)

**Auth:** Simple token-based auth. Token auto-detected from local OpenClaw config. No CORS configuration visible (relies on same-origin default).

---

## 8. Key Files Reference

### Must-Read for The Reef Build

| Priority | File | Why |
|----------|------|-----|
| 🔴 | `src/integrations/openclaw/protocol.ts` | Complete Gateway Protocol v3 types — our contract with OpenClaw |
| 🔴 | `src/integrations/openclaw/client.ts` | WebSocket client implementation — how to connect, authenticate, request, subscribe |
| 🔴 | `src/integrations/openclaw/parser.ts` | Event → domain model conversion — how to make sense of raw events |
| 🟡 | `src/integrations/openclaw/collections.ts` | Collection management patterns — dedup, lifecycle merging, spawn inference |
| 🟡 | `src/lib/graph-layout.ts` | Custom layout algorithm — if we do graph visualization |
| 🟡 | `src/components/monitor/ActionNode.tsx` | How to render action details — markdown, tool args, expansion |
| 🟡 | `src/components/monitor/ExecNode.tsx` | How to render exec output — chunking, streaming, truncation |
| 🟡 | `src/components/monitor/SessionNode.tsx` | Session card UI — platform detection, status, subagent styling |
| 🟢 | `src/integrations/trpc/router.ts` | Full tRPC API surface — shows all server operations |
| 🟢 | `src/routes/monitor/index.tsx` | Main page wiring — connection, subscription, hydration flow |
| 🟢 | `src/lib/workspace-fs.ts` | File system operations with path traversal protection |
| 🟢 | `bin/crabwalk` | CLI packaging — token auto-detection, daemon mode |

### Gateway Methods Used

| Method | File | Description |
|--------|------|-------------|
| `connect` | `client.ts:handleChallenge()` | Auth handshake (sends after challenge event) |
| `sessions.list` | `client.ts:listSessions()` | List active sessions with filters |

### Gateway Events Consumed

| Event | Parser Function | Output |
|-------|----------------|--------|
| `connect.challenge` | `client.ts` (inline) | Triggers auth response |
| `chat` | `chatEventToAction()` | `MonitorAction` + session status |
| `agent` | `agentEventToAction()` | `MonitorAction` + session status |
| `exec.started` | `parseEventFrame()` (inline) | `MonitorExecEvent` |
| `exec.output` | `parseEventFrame()` (inline) | `MonitorExecEvent` |
| `exec.completed` | `parseEventFrame()` (inline) | `MonitorExecEvent` |
| `health` | skipped | — |
| `tick` | skipped | — |

---

## 9. Recommendations for The Reef

### 9.1 What to Build Differently

1. **Direct WebSocket in extension host.** No tRPC relay layer needed. VS Code extension host runs Node.js — connect directly to `ws://127.0.0.1:18789` and push to webviews via `postMessage`.

2. **VS Code native UI where possible.** Use TreeView for session list, OutputChannel for exec output, WebviewPanel for the graph (if needed). Don't rebuild everything in a webview.

3. **Type-safe event handling.** Copy the protocol types but add discriminated unions and Zod validation at the boundary. Crabwalk trusts event payloads with `as` casts.

4. **Write tests for the parser.** The event parsing logic has enough edge cases (cumulative content, lifecycle phases, tool blocks) that tests are essential. Crabwalk ships without them.

5. **Consider incremental layout.** Crabwalk re-layouts the entire graph on every change. For a VS Code panel that might stay open for hours, incremental updates would be more efficient.

### 9.2 What to Copy/Adapt

1. **Protocol types** — verbatim, they're the API contract
2. **Client class structure** — request/response pattern, reconnect logic, event dispatch
3. **Parser functions** — event normalization logic (with added type safety)
4. **Action lifecycle merging** — one node per runId pattern
5. **Session key parsing** — `parseSessionKey()` utility
6. **runId→sessionKey resolution** — the mapping pattern for correlating events
7. **Exec output capping** — the truncation strategy with configurable limits

### 9.3 Architecture Comparison

| Aspect | Crabwalk | The Reef (Proposed) |
|--------|----------|-------------------|
| Runtime | Standalone web server | VS Code extension |
| Gateway connection | Server-side WS → tRPC SSE → browser | Extension host WS → postMessage → webview |
| State management | TanStack DB collections | Extension host state + webview local state |
| Session list | Custom React sidebar | VS Code TreeView |
| Graph visualization | ReactFlow in browser | Webview with lightweight graph lib |
| File browser | Custom React file tree | VS Code's native file explorer |
| Persistence | JSONL files in `data/` | VS Code globalState / workspaceState |
| Auth | Env var / config file | VS Code settings + SecretStorage |

---

*Review complete. The protocol types and event parsing logic are the crown jewels. The rest is competent UI code wrapped around a solid understanding of the OpenClaw gateway. For The Reef, we take the protocol knowledge and build VS Code-native UX on top of it.*
