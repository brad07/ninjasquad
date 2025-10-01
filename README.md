# SensAI

An AI-powered project management and development assistant that integrates Claude Agent, intelligent error monitoring, and project tracking capabilities.

## Features

- **Claude Agent Integration**: Multiple AI coding agent sessions with persistent conversation history
- **SensAI Chat**: Intelligent assistant that monitors development activity and provides contextual recommendations
- **Ollama Integration**: Local LLM for dev server error monitoring and analysis
- **Project Management**: Track projects with integrated Linear issue management
- **Dev Server Monitoring**: Automatic error detection and notification via desktop or Slack
- **Multi-Session Support**: Run multiple AI agent sessions simultaneously with tabbed interface
- **Database Persistence**: SQLite-backed storage for sessions, conversations, and project data

## Architecture

### Backend (Rust/Tauri)
- **Claude Agent Service**: Spawns and manages Claude CLI processes for AI coding sessions
- **Plugin System**: Extensible plugin architecture for different AI agents
- **Database Layer**: SQLite for persistent storage of sessions and conversations
- **Slack Integration**: Node.js service for Slack notifications
- **PTY Manager**: Terminal emulation for embedded terminal views

### Frontend (React/TypeScript)
- **Plugin Architecture**: Modular plugin system for different AI agents (Claude Agent, Claude Code)
- **Session Management**: Multi-session support with tabbed interface
- **Real-time Chat**: Rich chat interface with markdown, code blocks, and artifacts
- **SensAI Panel**: Contextual AI assistant with auto-approve and notification features
- **Admin Dashboard**: Configuration for API keys, notifications, and integrations

## Project Structure

```
ninjasquad/
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── claude/         # Claude Agent service
│   │   ├── slack/          # Slack integration
│   │   ├── plugins/        # Plugin management
│   │   ├── db/             # Database layer
│   │   └── pty/            # Terminal emulation
│   └── scripts/            # Node.js services (Slack, browser launcher)
├── src/                    # React frontend
│   ├── components/         # UI components
│   │   ├── sensei/         # SensAI chat components
│   │   ├── plugins/        # Plugin UI components
│   │   └── shared/         # Shared components
│   ├── services/           # API services
│   ├── plugins/            # Plugin definitions
│   ├── hooks/              # Custom React hooks
│   └── types/              # TypeScript types
└── CLAUDE.md               # Development guidelines
```

## Development Setup

### Prerequisites
- Node.js 18+
- Rust 1.70+
- Tauri CLI
- Claude CLI (for Claude Agent integration)
- Ollama (optional, for local LLM error monitoring)

### Installation

```bash
# Install dependencies
npm install

# Run development server
npm run tauri:dev
```

### Configuration

1. **API Keys**: Configure in Admin → AI Models
   - Anthropic API key for Claude Agent

2. **Ollama** (optional): Configure in Admin → AI Models
   - Install Ollama and pull a model (e.g., `llama3.1`)
   - Set base URL (default: `http://localhost:11434`)

3. **Slack** (optional): Configure in Admin → Notifications
   - Set up Slack app and get bot token
   - Configure signing secret

4. **Linear** (optional): Configure in Projects
   - Get Linear API key and Team ID

## Testing

This project follows TDD principles. Tests are written before implementation.

### Run all tests
```bash
# Frontend tests (Vitest)
npm test

# Frontend tests with UI
npm run test:ui

# Frontend test coverage
npm run test:coverage

# Backend tests (Rust)
cd src-tauri
cargo test
```

### Test Structure

#### Frontend Tests
- **Unit Tests**: Services and utilities
- **Component Tests**: React components with React Testing Library
- **Integration Tests**: Service interactions

#### Backend Tests
- **Unit Tests**: Individual service methods
- **Integration Tests**: Cross-service interactions
- **Mock Tests**: Using wiremock for HTTP API testing

## Key Features in Detail

### Claude Agent Integration
- Multiple concurrent sessions with tabbed interface
- Persistent conversation history stored in SQLite
- Session management (create, switch, close, rename)
- Custom configuration per session

### SensAI Chat
- Monitors user activity and project changes
- Provides contextual recommendations
- Auto-approve mode for automated execution
- Desktop and Slack notifications
- Integration with dev server error monitoring

### Dev Server Monitoring
- Ollama-powered error detection from terminal output
- Automatic analysis of build errors and failures
- Smart filtering (only notifies on actual errors)
- Sends recommendations to SensAI for resolution
- Configurable analysis throttling and quiet periods

### Project Management
- Project tracking with working directories
- Linear integration for issue management
- Session association with projects
- Project-specific configuration

## Database Schema

SensAI uses SQLite for persistent storage:

- **plugin_sessions**: AI agent sessions with metadata
- **conversation_history**: Chat messages and agent responses
- **projects**: Project information and settings
- **linear_issues**: Cached Linear issue data

## Plugin System

The plugin architecture allows for different AI agents:

```typescript
interface CodingAgentPlugin {
  id: string;
  name: string;
  version: string;
  description: string;
  supportedModels: string[];
  capabilities: {
    fileOperations: boolean;
    terminalAccess: boolean;
    gitOperations: boolean;
    webSearch: boolean;
    codeExecution: boolean;
  };
  customRenderer?: React.ComponentType<any>;
}
```

Current plugins:
- **Claude Agent Direct**: Full Claude Agent integration with rich UI
- **OpenCode**: Terminal-based coding agent (planned)

## Notifications

SensAI supports multiple notification channels:

1. **Desktop Notifications**: Browser-based notifications when app is active
2. **Slack Notifications**: Fallback when user is away (configurable)
3. **In-App Notifications**: SensAI panel displays recommendations directly

## Contributing

This project follows TDD principles:
1. Write failing test first
2. Implement minimal code to pass
3. Refactor for clarity
4. Ensure all tests pass before committing

## License

MIT