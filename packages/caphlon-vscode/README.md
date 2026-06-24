# Caphlon for VS Code

**⚡ Unified AI Agent Platform — directly in your IDE.**

Caphlon brings Qualixar OS orchestration, Open Design pipeline, and MiMo Code workflow management into VS Code.

## Prerequisites

Requires [Caphlon CLI](https://github.com/caphlon/caphlon) installed globally:

```bash
npm install -g caphlon
```

## Features

| Command | Keybinding | Description |
|---------|-----------|-------------|
| `Caphlon: Open Terminal` | `Cmd+Esc` | Open Caphlon CLI in a split terminal |
| `Caphlon: Run Task...` | — | Prompt and run a task via Caphlon agent |
| `Caphlon: Start Dev Mode` | — | Launch agent + dashboard |
| `Caphlon: Design Pipeline` | — | Prototype, deck, image generation |
| `Caphlon: Compose Workflow` | — | Specs-driven development (8 stages) |
| `Caphlon: System Status` | — | Check runtime status |
| `Caphlon: Diagnostics` | — | Run system checks |
| `Caphlon: Add File to Terminal` | `Cmd+Alt+K` | Insert @file ref with line numbers |

## Sidebar Panel

The Caphlon sidebar (activity bar icon) provides quick-access buttons for all major commands.

## Development

```bash
cd packages/caphlon-vscode

# Install dependencies
npm install

# Build
npm run build

# Package to .vsix
npm run package

# Debug (open this directory in VS Code, then F5)
code .
```

## License

MIT
