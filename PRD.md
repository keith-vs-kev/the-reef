# The Reef — Product Requirements Document

> **Version:** 1.0 | **Date:** 6 February 2026  
> **Authors:** Atlas (Strategy), Jake & Kev (Vision), Scout (Research)  
> **Repo:** [keith-vs-kev/the-reef](https://github.com/keith-vs-kev/the-reef)

---

## 1. Vision

**The Reef** is a VS Code extension that turns your IDE into mission control for AI agent orchestration. It connects directly to OpenClaw's Gateway API to provide real-time visibility, management, and analytics for multi-agent workflows — something no existing tool offers.

While Anthropic's Agent Teams gives you terminal panes and Google's Antigravity gives you a web dashboard, neither provides **persistent agent identity**, **real cost observability**, **cross-session continuity**, or **graph-based visualization** of your agent ecosystem. The Reef does all four, inside the editor you already use.

### One-Liner
> VS Code extension that makes AI agent orchestration visible, manageable, and persistent.

---

## 2. Problem Statement

Developers orchestrating multiple AI agents today face:

1. **Blindness** — No unified view of what agents are doing, what they cost, or how they interact
2. **Ephemeral state** — Agent teams vanish when sessions end. No continuity.
3. **No cost controls** — Token burn is invisible until the invoice arrives
4. **Tool fragmentation** — Terminal for some agents, browser for others, config files for coordination
5. **No visualization** — Agent relationships, file collisions, and communication flows are invisible

### What Exists Today

| Tool | Multi-Agent | Dashboard | Persistence | Cost Tracking | A2A Comms | IDE-Native |
|------|-------------|-----------|-------------|---------------|-----------|------------|
| Claude Code Agent Teams | ✅ | ❌ CLI only | ❌ Ephemeral | ❌ | ✅ Mesh | ❌ Terminal |
| Google Antigravity | ✅ Swarm | ✅ Manager Surface | ❌ Ephemeral | ❌ | ❌ | ❌ Web-only |
| Cursor / Windsurf | ❌ Single | ❌ | ❌ | ❌ | ❌ | ✅ |
| **The Reef** | ✅ Squads | ✅ Graph + Dashboard | ✅ Persistent | ✅ Per-agent | ✅ Via OpenClaw | ✅ VS Code |

---

## 3. Target Users

### Primary: Agent Orchestrators
Developers running multiple AI agents (via OpenClaw) for software development, research, automation, or creative work. They need visibility and control.

### Secondary: Team Leads
Technical leads managing a team where each member has their own AI agents. Need cost tracking, oversight, and coordination.

### Tertiary: Solo Developers
Individual devs using 2-5 agents who want a better experience than juggling terminal tabs.

---

## 4. User Stories

### Session Management
- **US-1.1** As a developer, I can see all active OpenClaw sessions in a sidebar tree view so I know what's running
- **US-1.2** As a developer, I can spawn a new agent session from the command palette with a persona and prompt
- **US-1.3** As a developer, I can group sessions into "squads" for related work
- **US-1.4** As a developer, I can stop/restart sessions from the sidebar

### Agent Terminals
- **US-2.1** As a developer, I can click an agent in the sidebar to open its live terminal output in a VS Code terminal tab
- **US-2.2** As a developer, I can send messages to an agent's session from the terminal
- **US-2.3** As a developer, I can see agent status (idle/working/waiting) at a glance in the sidebar

### Cost Tracking
- **US-3.1** As a developer, I can see total token spend in the VS Code status bar
- **US-3.2** As a developer, I can open a cost dashboard showing spend per agent, per session, per squad
- **US-3.3** As a developer, I can set budget alerts that warn when spend exceeds a threshold

### Graph View
- **US-4.1** As a developer, I can open an interactive graph showing all agents as nodes
- **US-4.2** As a developer, I can see edges representing A2A messages, shared files, and communication channels
- **US-4.3** As a developer, I can click a node to navigate to that agent's terminal/details
- **US-4.4** As a developer, I can see real-time activity (node size pulses, edge animations)

### Task Board
- **US-5.1** As a developer, I can see GitHub Issues assigned to my agents in a task board view
- **US-5.2** As a developer, I can see which agent claimed which task
- **US-5.3** As a developer, I can create new tasks and assign them to agents/squads

### Workspaces
- **US-6.1** As a developer, I can see which files each agent is currently working on
- **US-6.2** As a developer, I can detect file collisions (two agents editing the same file)
- **US-6.3** As a developer, I can see agent git branches and worktrees

### Analytics
- **US-7.1** As a developer, I can view session timelines showing agent activity over time
- **US-7.2** As a developer, I can see cost-over-time charts
- **US-7.3** As a developer, I can export analytics data

---

## 5. Feature Specifications

### F1: Session Explorer (Sidebar Tree View)

**Location:** VS Code Activity Bar → Reef icon → Sidebar panel

**Tree Structure:**
```
🐙 The Reef
├── 🟢 Squad: Feature Team
│   ├── 🟢 kev (agent:kev:session:abc)     $0.42  working
│   ├── 🟡 scout (agent:scout:session:def)  $0.18  idle
│   └── 🔴 atlas (agent:atlas:session:ghi)  $1.05  stopped
├── 🟢 Squad: Research
│   └── 🟢 scout (agent:scout:session:jkl)  $0.33  working
└── 📋 Ungrouped
    └── 🟢 kev (agent:kev:session:mno)      $0.07  working
```

**Actions:**
- Right-click → Open Terminal, Stop Session, Move to Squad, View Details
- Drag-and-drop between squads
- "+" button to spawn new session
- Refresh button / auto-refresh on configurable interval

**Data Source:** `sessions_list` API, polled every 5s (configurable)

### F2: Agent Terminals

**Behavior:** Clicking an agent in the Session Explorer opens a VS Code terminal tab connected to that agent's session.

**Implementation Options:**
1. **Pseudo-terminal (PTY)** — Create a `vscode.Pseudoterminal` that streams `sessions_history` output and sends input via `sessions_send`
2. **WebSocket stream** — If OpenClaw Gateway supports streaming, use that for real-time output

**Features:**
- Terminal tab named with agent name + session ID
- Input line sends to session via `sessions_send`
- Color-coded output (agent responses vs tool calls vs errors)
- "Pin" terminal to keep it open even when switching sidebar selection

### F3: Cost Dashboard

**Status Bar Widget:** Shows total spend: `🐙 $3.47 ↑$0.12/min`

**Webview Panel:** Detailed breakdown:
- Per-agent spend (bar chart)
- Per-session spend (table)
- Per-squad spend (pie chart)
- Cost over time (line chart)
- Budget alerts configuration

**Data Source:** `session_status` API → extract token counts → multiply by model pricing

### F4: Agent Graph View

**Webview Panel:** Interactive force-directed graph rendered with Three.js or D3.js

**Nodes:** Each agent session. Size = activity level. Color = status (green/yellow/red). Label = agent name.

**Edges:**
- A2A messages (blue, animated when recent)
- Shared file access (orange, thickness = frequency)
- Communication channels (green — WhatsApp, Discord, etc.)

**Interactions:**
- Click node → opens agent details panel
- Double-click node → opens agent terminal
- Hover edge → shows relationship details
- Zoom, pan, rotate
- Layout options: force-directed, hierarchical, circular

### F5: Task Board

**Webview Panel:** Kanban-style board powered by GitHub Issues

**Columns:** Backlog → In Progress → Review → Done

**Cards:** Issue title, assignee (agent), labels, dependencies

**Integration:**
- Fetch issues from configured GitHub repo
- Agents claim tasks via labels or assignee
- Real-time sync via GitHub webhooks or polling

### F6: Workspace Monitor

**Sidebar Panel or Webview:** Shows file access patterns

**Features:**
- File tree annotated with which agent(s) are touching each file
- Collision warnings (⚠️ icon when multiple agents edit same file)
- Git branch/worktree visualization per agent
- Recent file changes timeline

### F7: Analytics Panel

**Webview Panel:** Charts and data visualization

- Session timeline (Gantt-style showing agent lifetimes)
- Activity heatmap (time of day × agent)
- Cost trends (daily/weekly/monthly)
- Token efficiency metrics (output tokens per input token)
- Export to CSV/JSON

---

## 6. Milestones

### Milestone 1: MVP — "See Your Agents" (Weeks 1-3)

**Goal:** Basic session visibility and interaction

| Feature | Scope |
|---------|-------|
| Session Explorer | Tree view with sessions list, status indicators, basic squad grouping |
| Agent Terminals | Click-to-open PTY terminal for any session |
| Status Bar Cost | Simple total spend counter |
| OpenClaw API Client | TypeScript client for sessions_list, sessions_spawn, sessions_send, sessions_history, session_status |
| Extension Scaffold | package.json, activation, settings, commands |

**Exit Criteria:** User can see all OpenClaw sessions, click to open terminals, see total spend.

### Milestone 2: Observability — "Understand Your Agents" (Weeks 4-6)

**Goal:** Cost tracking and basic analytics

| Feature | Scope |
|---------|-------|
| Cost Dashboard | Full webview with per-agent/session/squad breakdowns |
| Session Details | Webview showing session history, token usage, timeline |
| Squad Management | Create/rename/delete squads, drag-and-drop agents |
| Settings UI | Configuration for API endpoint, refresh intervals, budget alerts |

**Exit Criteria:** User has full cost visibility and can organize agents into squads.

### Milestone 3: Visualization — "See the Network" (Weeks 7-10)

**Goal:** Graph view and workspace monitoring

| Feature | Scope |
|---------|-------|
| Agent Graph View | Interactive force-directed graph with nodes and edges |
| Workspace Monitor | File collision detection, agent-file mapping |
| Activity Indicators | Real-time status pulses in sidebar and graph |

**Exit Criteria:** User can visualize agent relationships and detect file collisions.

### Milestone 4: Coordination — "Direct Your Agents" (Weeks 11-14)

**Goal:** Task board and advanced orchestration

| Feature | Scope |
|---------|-------|
| Task Board | GitHub Issues kanban with agent assignment |
| Squad Templates | Pre-built squad configurations (e.g., "Feature Team", "Research Squad") |
| Analytics Panel | Full charts: timelines, heatmaps, cost trends |
| Budget Controls | Spend limits per agent/squad with auto-pause |

**Exit Criteria:** User can manage agent tasks, use templates, and control budgets.

### Milestone 5: Polish — "Ship It" (Weeks 15-16)

**Goal:** Quality, performance, and marketplace readiness

| Feature | Scope |
|---------|-------|
| Performance | Optimize polling, lazy-load webviews, minimize memory |
| Onboarding | Welcome walkthrough, demo mode with mock data |
| Marketplace | Icon, screenshots, README, changelog, VS Code marketplace listing |
| Telemetry | Optional anonymous usage analytics |

---

## 7. Non-Functional Requirements

- **Performance:** Sidebar refresh < 500ms. Terminal latency < 100ms. Graph renders 50+ nodes at 60fps.
- **Compatibility:** VS Code 1.85+. Works on macOS, Linux, Windows.
- **Security:** API tokens stored in VS Code SecretStorage. No tokens in settings.json.
- **Accessibility:** Keyboard navigation for all panels. Screen reader labels for tree items.
- **Offline:** Graceful degradation when OpenClaw Gateway is unreachable.

---

## 8. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| OpenClaw API changes | Breaks integration | Version the API client, abstract behind interface |
| Terminal performance with many sessions | Laggy UI | Lazy-load terminals, limit concurrent PTYs |
| Three.js bundle size | Slow extension load | Lazy-load graph view webview |
| GitHub API rate limits | Task board stalls | Cache aggressively, use conditional requests |
| Cost calculation accuracy | User trust | Document estimation methodology, allow custom pricing |

---

## 9. Success Metrics

- **Adoption:** 100 installs in first month on VS Code Marketplace
- **Engagement:** Average 3+ sessions visible per user
- **Retention:** 40% weekly active users after first month
- **Cost savings:** Users report catching runaway spend within 5 minutes

---

## 10. Future Vision

- **Multi-provider support** — Not just OpenClaw; support Claude Code Teams, Antigravity, and other orchestrators
- **AI-powered squad recommendations** — "Based on this PR, you should spin up a Test Agent and Security Agent"
- **Shared dashboards** — Team-wide cost and activity views
- **Mobile companion** — Monitor agents from your phone via OpenClaw nodes
- **Voice control** — "Hey Reef, spawn a research squad for this issue"
- **Plugin system** — Third-party extensions to The Reef (custom graph layouts, data sources, etc.)
