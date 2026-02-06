# 🐙 The Reef

**Mission control for AI agent orchestration — inside VS Code.**

The Reef is a VS Code extension that connects to [OpenClaw](https://openclaw.com) to give you real-time visibility, management, and analytics for your multi-agent workflows. See all your agents, watch them work, track what they cost, and visualize how they interact.

![Status: In Development](https://img.shields.io/badge/status-in%20development-yellow)

---

## Why The Reef?

You're running multiple AI agents — coding, researching, communicating, automating. But you can't *see* them. You don't know what they cost. You can't tell when they're stepping on each other's files.

**The Reef fixes that.** It's the observability layer for AI agent orchestration.

### vs. The Competition

| | The Reef | Claude Code Teams | Antigravity |
|---|---|---|---|
| See all agents | ✅ Sidebar + Graph | Terminal panes only | Web dashboard |
| Agent terminals | ✅ Native VS Code | ✅ tmux/iTerm2 | ❌ |
| Cost tracking | ✅ Per-agent, per-squad | ❌ | ❌ |
| Persistence | ✅ Across sessions | ❌ Ephemeral | ❌ Ephemeral |
| Graph visualization | ✅ Interactive 3D | ❌ | ❌ |
| IDE-native | ✅ VS Code | ❌ CLI-only | ❌ Web-only |
| Beyond coding | ✅ Any agent workflow | ❌ Coding only | ❌ Coding only |

---

## Features

### 🌊 Session Explorer
Sidebar tree view of all OpenClaw sessions. Group agents into squads. See status and cost at a glance.

### 💻 Agent Terminals
Click any agent → opens their live terminal in VS Code. Watch them work, send them messages.

### 📊 Cost Dashboard
Status bar shows total spend. Open the dashboard for per-agent breakdowns, cost trends, and budget alerts.

### 🕸️ Agent Graph View
Interactive force-directed graph showing agents as nodes, with edges for messages, shared files, and communication channels. Real-time activity visualization.

### 📋 Task Board
GitHub Issues as your shared task list. See which agent claimed which task. Kanban-style board.

### 📁 Workspace Monitor
See which agents are touching which files. Get warnings when agents collide on the same file.

### 📈 Analytics
Session timelines, activity heatmaps, cost trends, and export capabilities.

---

## Getting Started

### Prerequisites
- VS Code 1.85+
- [OpenClaw](https://openclaw.com) Gateway running locally or remotely
- Node.js 18+

### Install from Source

```bash
git clone https://github.com/keith-vs-kev/the-reef.git
cd the-reef
npm install
npm run build
```

Press **F5** in VS Code to launch the Extension Development Host.

### Configure

1. Open VS Code Settings → search "Reef"
2. Set **Gateway URL** (default: `http://localhost:4440`)
3. Set your **API Token** (stored securely in OS keychain)

---

## Development

```bash
# Install dependencies
npm install

# Build extension + webviews
npm run build

# Watch mode
npm run watch

# Run tests
npm test

# Package for distribution
npm run package
```

### Project Structure

```
src/
├── extension.ts           # Entry point
├── api/                   # OpenClaw API client
├── state/                 # State management
├── views/                 # Tree views, status bar
├── terminals/             # Agent pseudo-terminals
├── commands/              # VS Code commands
└── webviews/              # React webview panels
    ├── cost-dashboard/
    ├── graph-view/
    └── task-board/
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for full technical details.

---

## Roadmap

| Milestone | Focus | Status |
|-----------|-------|--------|
| **M1: MVP** | Session explorer, agent terminals, status bar cost | 🔨 In Progress |
| **M2: Observability** | Cost dashboard, squad management, settings | 📋 Planned |
| **M3: Visualization** | Graph view, workspace monitor | 📋 Planned |
| **M4: Coordination** | Task board, templates, analytics, budgets | 📋 Planned |
| **M5: Polish** | Performance, onboarding, marketplace | 📋 Planned |

See [PRD.md](./PRD.md) for full product requirements.

---

## Contributing

We welcome contributions! This project is part of the [keith-vs-kev](https://github.com/keith-vs-kev) ecosystem.

1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Submit a PR

---

## License

MIT

---

*Built with 🐙 by the OpenClaw crew*
