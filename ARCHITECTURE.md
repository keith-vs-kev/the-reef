# The Reef — Technical Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────┐
│                    VS Code Extension Host                │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Session     │  │   Cost       │  │   Graph      │  │
│  │   Explorer    │  │   Dashboard  │  │   View       │  │
│  │  (TreeView)   │  │  (Webview)   │  │  (Webview)   │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         │                 │                 │           │
│  ┌──────┴─────────────────┴─────────────────┴───────┐  │
│  │              ReefStateManager                     │  │
│  │  (Singleton — sessions, squads, costs, events)    │  │
│  └──────────────────────┬───────────────────────────┘  │
│                         │                               │
│  ┌──────────────────────┴───────────────────────────┐  │
│  │              OpenClawClient                       │  │
│  │  sessions_list | sessions_spawn | sessions_send   │  │
│  │  sessions_history | session_status                │  │
│  └──────────────────────┬───────────────────────────┘  │
│                         │                               │
└─────────────────────────┼───────────────────────────────┘
                          │ HTTP/WS
                ┌─────────┴──────────┐
                │  OpenClaw Gateway   │
                │  (localhost:4440)   │
                └────────────────────┘
```

## Component Architecture

### 1. Extension Entry Point (`src/extension.ts`)

Registers all commands, tree views, webview providers, and the status bar item. Creates the singleton `ReefStateManager`.

```typescript
export function activate(context: vscode.ExtensionContext) {
  const client = new OpenClawClient(config);
  const state = new ReefStateManager(client, context);
  
  // Register providers
  const sessionTree = new SessionTreeProvider(state);
  vscode.window.registerTreeDataProvider('reef.sessions', sessionTree);
  
  const costBar = new CostStatusBar(state);
  const terminalManager = new TerminalManager(state, client);
  
  // Register webview providers
  CostDashboardPanel.register(context, state);
  GraphViewPanel.register(context, state);
  TaskBoardPanel.register(context, state);
  
  // Register commands
  registerCommands(context, state, client, terminalManager);
  
  // Start polling
  state.startPolling();
}
```

### 2. OpenClaw API Client (`src/api/openclaw-client.ts`)

Typed TypeScript client wrapping the OpenClaw Gateway HTTP API.

```typescript
interface OpenClawClient {
  // Session management
  sessionsList(): Promise<Session[]>;
  sessionsSpawn(opts: SpawnOptions): Promise<Session>;
  sessionsSend(sessionId: string, message: string): Promise<void>;
  sessionsHistory(sessionId: string, opts?: HistoryOptions): Promise<HistoryEntry[]>;
  sessionStatus(sessionId: string): Promise<SessionStatus>;
  
  // Lifecycle
  connect(): Promise<void>;
  disconnect(): void;
  onSessionUpdate(cb: (session: Session) => void): Disposable;
}

interface Session {
  id: string;
  label: string;
  agent: string;
  channel: string;
  status: 'active' | 'idle' | 'stopped';
  createdAt: string;
  tokenUsage: { input: number; output: number; cacheRead: number; cacheWrite: number };
  model: string;
}
```

### 3. State Manager (`src/state/reef-state-manager.ts`)

Central state store. All UI components subscribe to state changes via events.

```typescript
class ReefStateManager extends EventEmitter {
  sessions: Map<string, Session>;
  squads: Map<string, Squad>;
  costs: CostTracker;
  
  // Polling loop
  async poll(): Promise<void>;
  
  // State accessors
  getSessionsGrouped(): GroupedSessions;
  getTotalCost(): number;
  getCostByAgent(agent: string): number;
  
  // Persistence (VS Code globalState)
  saveSquads(): void;
  loadSquads(): void;
}
```

### 4. Session Explorer (`src/views/session-tree-provider.ts`)

VS Code `TreeDataProvider` rendering the sidebar.

**Tree Item Types:**
- `SquadItem` — collapsible group
- `SessionItem` — leaf node with status icon, cost label, context menu

### 5. Agent Terminals (`src/terminals/terminal-manager.ts`)

Creates `vscode.Pseudoterminal` instances that stream agent session output.

```typescript
class AgentPseudoterminal implements vscode.Pseudoterminal {
  private writeEmitter = new vscode.EventEmitter<string>();
  onDidWrite = this.writeEmitter.event;
  
  open(): void {
    // Start streaming sessions_history with polling
    this.startStreaming();
  }
  
  handleInput(data: string): void {
    // Send to agent via sessions_send
    this.client.sessionsSend(this.sessionId, data);
  }
}
```

### 6. Webview Panels

All webview panels follow the same pattern:
- Extension side: `*Panel.ts` — manages lifecycle, posts messages to webview
- Webview side: React app bundled with esbuild, communicates via `postMessage`

#### Cost Dashboard (`src/webviews/cost-dashboard/`)
- React + [Recharts](https://recharts.org/) for charts
- Bar chart (per-agent), line chart (over time), pie chart (per-squad)
- Budget alert configuration form

#### Graph View (`src/webviews/graph-view/`)
- React + [react-force-graph-3d](https://github.com/vasturiano/react-force-graph) (Three.js wrapper)
- Or D3.js force-directed graph for 2D option
- Nodes from sessions, edges computed from session history analysis

#### Task Board (`src/webviews/task-board/`)
- React + drag-and-drop kanban
- GitHub API via Octokit for issue fetching
- Labels map to columns (backlog, in-progress, review, done)

### 7. Status Bar (`src/views/cost-status-bar.ts`)

Simple `vscode.StatusBarItem` showing total spend. Click opens Cost Dashboard.

---

## Data Flow

### Polling Loop (every 5s)
```
OpenClaw Gateway → OpenClawClient.sessionsList()
  → ReefStateManager.updateSessions()
    → EventEmitter.emit('sessions-updated')
      → SessionTreeProvider.refresh()
      → CostStatusBar.update()
      → [Any open webview panels receive postMessage]
```

### Terminal Interaction
```
User types in terminal → AgentPseudoterminal.handleInput()
  → OpenClawClient.sessionsSend(sessionId, message)
  → [Next poll picks up response in sessions_history]
  → AgentPseudoterminal.writeEmitter.fire(output)
```

### Cost Calculation
```
session_status → tokenUsage { input, output, cacheRead, cacheWrite }
  → CostTracker.calculate(model, tokenUsage)
    → Apply model-specific pricing (configurable)
    → Aggregate by agent, session, squad, total
```

---

## Technology Choices

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Extension | TypeScript | VS Code standard, type safety |
| Build | esbuild | Fast bundling for extension + webviews |
| Webview UI | React 18 | Component model, ecosystem, familiar |
| Charts | Recharts | Lightweight, React-native, good defaults |
| 3D Graph | react-force-graph-3d | Three.js wrapper, handles force layout |
| 2D Graph | D3.js | Fallback for performance, accessibility |
| GitHub API | Octokit | Official GitHub SDK |
| State | EventEmitter + Maps | Simple, no framework overhead |
| Testing | Vitest + @vscode/test-electron | Unit + integration |

---

## Directory Structure

```
the-reef/
├── .vscode/
│   ├── extensions.json
│   └── launch.json          # Extension debug configs
├── src/
│   ├── extension.ts          # Entry point
│   ├── api/
│   │   └── openclaw-client.ts
│   ├── state/
│   │   ├── reef-state-manager.ts
│   │   └── cost-tracker.ts
│   ├── views/
│   │   ├── session-tree-provider.ts
│   │   └── cost-status-bar.ts
│   ├── terminals/
│   │   └── terminal-manager.ts
│   ├── commands/
│   │   └── index.ts           # All registered commands
│   └── webviews/
│       ├── shared/            # Shared React components
│       ├── cost-dashboard/
│       │   ├── index.tsx
│       │   └── CostDashboard.tsx
│       ├── graph-view/
│       │   ├── index.tsx
│       │   └── GraphView.tsx
│       └── task-board/
│           ├── index.tsx
│           └── TaskBoard.tsx
├── media/
│   └── reef-icon.svg
├── package.json
├── tsconfig.json
├── esbuild.mjs
├── PRD.md
├── ARCHITECTURE.md
└── README.md
```

---

## API Integration Points

### OpenClaw Gateway (Primary)

| Endpoint | Used For | Polling? |
|----------|----------|----------|
| `sessions_list` | Session Explorer, Squad management | Yes (5s) |
| `session_status` | Status indicators, token usage, cost | Yes (5s) |
| `sessions_spawn` | Create new agent sessions | On demand |
| `sessions_send` | Agent terminal input | On demand |
| `sessions_history` | Agent terminal output, analytics | Per-terminal (2s) |

### GitHub API (Secondary)

| Endpoint | Used For |
|----------|----------|
| `GET /repos/{owner}/{repo}/issues` | Task board |
| `PATCH /repos/{owner}/{repo}/issues/{number}` | Update task status |
| `POST /repos/{owner}/{repo}/issues` | Create tasks |

### Future: WebSocket/SSE

If OpenClaw Gateway adds streaming support, replace polling with:
- WebSocket connection for session updates
- SSE stream for terminal output
- Dramatically reduces latency and API calls

---

## Security

- **API tokens:** Stored in `vscode.SecretStorage` (OS keychain)
- **Webview CSP:** Strict content security policy, no inline scripts
- **No remote code:** Webviews bundle all dependencies locally
- **GitHub tokens:** OAuth flow or PAT via SecretStorage

---

## Performance Considerations

- **Lazy terminal creation:** PTYs only created when user clicks an agent
- **Webview lazy loading:** Graph/dashboard panels only initialized on first open
- **Polling backoff:** Reduce frequency when VS Code is not focused
- **History pagination:** Only fetch new history entries (offset-based)
- **Graph node limit:** Warn/aggregate when >100 nodes; virtualize rendering
