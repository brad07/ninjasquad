# OpenCode Terminal Orchestrator

A Tauri-based application for orchestrating multiple OpenCode.ai terminal instances across local and remote machines using WezTerm's multiplexer capabilities.

## Architecture Overview

The application follows a Test-Driven Development (TDD) approach with three main layers:

### Backend (Rust/Tauri)
- **OpenCode Service**: Manages OpenCode server instances, spawning, health checks, and API communication
- **WezTerm Controller**: Handles terminal multiplexing via WezTerm's SSH domains and CLI
- **Session Manager**: Coordinates task distribution across multiple OpenCode instances

### Frontend (React/TypeScript)
- **Terminal Views**: Real-time display of OpenCode output
- **Server Cards**: Visual representation of server status and controls
- **Session Dashboard**: Overview of all active sessions and task distribution

### Communication
- **OpenCode Server API**: HTTP/REST API with Server-Sent Events for real-time updates
- **WezTerm Multiplexer**: SSH/TLS connections for remote terminal control
- **Tauri IPC**: Bridge between Rust backend and React frontend

## Project Structure

```
opencode-orchestrator/
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── opencode/       # OpenCode service layer
│   │   ├── wezterm/        # WezTerm controller
│   │   └── session/        # Session management
│   └── tests/              # Rust integration tests
├── src/                    # React frontend
│   ├── components/         # UI components
│   ├── services/           # API services
│   ├── types/              # TypeScript types
│   └── test/               # Test setup
└── tests/                  # E2E tests
```

## Development Setup

### Prerequisites
- Node.js 18+
- Rust 1.70+
- Tauri CLI
- OpenCode.ai installed
- WezTerm (optional, for terminal display)

### Installation

```bash
# Install dependencies
npm install

# Run development server
npm run tauri dev
```

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

## TDD Implementation Status

### ✅ Completed
- [x] Project initialization with Tauri + React + TypeScript
- [x] Testing framework setup (Vitest + Rust tests)
- [x] Project structure creation
- [x] OpenCode service tests (TDD)
- [x] WezTerm controller tests (TDD)
- [x] Session manager tests (TDD)
- [x] Frontend component tests

### 🚧 In Progress
- [ ] OpenCode service implementation
- [ ] WezTerm controller implementation
- [ ] Session manager implementation

### 📋 TODO
- [ ] Event stream handling
- [ ] Task distribution algorithms
- [ ] Error recovery mechanisms
- [ ] Performance optimizations
- [ ] E2E test suite
- [ ] Documentation completion

## API Endpoints

### Tauri Commands
- `spawn_opencode_server(port)` - Start new OpenCode server
- `list_opencode_servers()` - Get all active servers
- `create_wezterm_domain(name, address, username)` - Setup SSH domain
- `distribute_task(prompt)` - Assign task to available session

### OpenCode Server API
- `GET /health` - Health check endpoint
- `GET /doc` - OpenAPI specification
- `POST /tui` - Send prompts to TUI
- `GET /event` - Server-sent events stream

## Configuration

### Remote Server Setup
1. Install OpenCode on remote server
2. Install WezTerm on remote server
3. Configure SSH access with key authentication
4. Run OpenCode in server mode: `opencode server --port 4096`

### Local Configuration
1. Configure WezTerm domains in the app
2. Set distribution strategy (RoundRobin, LeastLoaded, Random)
3. Configure event handlers for real-time updates

## Architecture Benefits

1. **Scalability**: Distribute tasks across multiple machines
2. **Resilience**: Automatic failure recovery and task redistribution
3. **Performance**: Parallel execution of independent tasks
4. **Flexibility**: Mix local and remote OpenCode instances
5. **Monitoring**: Real-time status and progress tracking

## Security Considerations

- SSH key-based authentication for remote connections
- TLS encryption for WezTerm multiplexer
- API authentication for OpenCode server
- Input sanitization and validation
- Rate limiting for API calls

## Performance Targets

- Server spawn: < 2 seconds
- API response: < 100ms
- Event latency: < 50ms
- UI updates: 60 FPS
- Memory usage: < 50MB per instance

## Contributing

This project follows TDD principles:
1. Write failing test first
2. Implement minimal code to pass
3. Refactor for clarity
4. Ensure all tests pass before committing

## License

MIT