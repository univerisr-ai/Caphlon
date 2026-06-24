# Caphlon CLI

**Unified AI Agent Platform** — Qualixar OS + Open Design + MiMo Code.

```bash
npm install -g caphlon
# or
npx caphlon
```

## Quick Start

```bash
# Start the agent system
caphlon dev

# Run a task
caphlon run "Build a REST API for todos"

# Design something
caphlon design prototype "Modern landing page" --system linear-app

# Check status
caphlon status
```

## Commands

| Command | Description |
|---------|-------------|
| `init` | Initialize a new Caphlon project |
| `dev` | Start the agent + dashboard |
| `run <prompt>` | Run a task via Qualixar OS |
| `design` | Design pipeline (Open Design) |
| `compose` | Compose workflow (MiMo Code) |
| `status` | System status |
| `doctor` | Diagnostics |
| `-v, --version` | Version info |

## Aliases

- `caphlon` or `caph` — both work

## Architecture

```
caphlon → Qualixar OS (agent orchestration)
       → Open Design (design pipeline)
       → MiMo Code (memory + compose workflow)
```
