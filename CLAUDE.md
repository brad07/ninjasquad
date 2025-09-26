# Claude Development Guidelines for Ninja Squad

## Critical: Tauri Parameter Naming Convention

⚠️ **IMPORTANT UPDATE**: There's inconsistency in how Tauri handles parameter names. Testing shows that some commands require snake_case parameters from the frontend.

### The Current Situation
When invoking Tauri commands from TypeScript, you need to check which format works:

```typescript
// Some commands expect snake_case (matching Rust exactly)
await invoke('stop_opencode_server', { server_id: serverId });

// Some commands may expect camelCase (auto-converted)
await invoke('create_terminal', { serverId: serverId });

// When in doubt, check the error message and try the other format
```

### Common Parameter Issues in This Codebase
- `stop_opencode_server` expects `server_id` (snake_case)
- `open_terminal_for_server` expects `serverId` (camelCase)
- When you see: `"invalid args serverId for command"` - try snake_case
- When you see: `"missing required key server_id"` - try camelCase

## Project Architecture

### Current Mode: SDK Only
The application now defaults to SDK mode for spawning OpenCode servers. Process mode code is preserved but not actively used.

### Backend (Rust/Tauri)
- `/src-tauri/src/lib.rs` - Main Tauri application with command handlers
- `/src-tauri/src/opencode/service.rs` - OpenCode server management
- `/src-tauri/src/session/manager.rs` - Session management
- `/src-tauri/src/pty/` - PTY management for embedded terminals
- `/src-tauri/scripts/sdk-server.js` - Node.js script for SDK server spawning

### Frontend (React/TypeScript)
- `/src/components/ServerControl.tsx` - Server management with tabbed interface
- `/src/components/Terminal.tsx` - Embedded terminal using xterm.js
- `/src/services/OpenCodeSDKService.ts` - SDK integration service
- `/src/App.tsx` - Main application component

## Key Features & Implementation Details

### 1. OpenCode Server Management
- **SDK Mode**: Spawns servers via Node.js script using OpenCode SDK
- **Default Model**: `claude-sonnet-4-0`
- **Port Range**: Starting from 4097
- **Tabbed Interface**: Each server appears as a tab with integrated terminal

### 2. Session Creation Flow
**Critical**: Must follow this exact sequence:
1. Spawn server (waits 3 seconds for initialization)
2. Create SDK connection to server
3. Create session on server
4. Terminal connects using: `opencode -h 127.0.0.1 --port PORT -s SESSION_ID`

**Important**: The `-s SESSION_ID` flag is required for connection

### 3. Terminal Integration
- Uses xterm.js for frontend display
- PTY backend for actual shell interaction
- Auto-connects to OpenCode when server selected
- Commands sent with `\r` (carriage return) for execution

### Common Issues & Solutions

#### 1. Terminal Command Not Executing
**Problem**: Command appears but doesn't run
**Solutions**:
- Use `\r` instead of `\n` for command execution
- Increase delay before sending (2-3 seconds)
- Ensure terminal session ID is captured correctly
- Prevent duplicate command sends with state tracking

#### 2. Session Not Found
**Problem**: "Server not found" when creating session
**Solution**: Ensure SDK connection established before session creation:
```typescript
// Wait for connection to stabilize
await new Promise(resolve => setTimeout(resolve, 1000));
```

#### 3. Duplicate/Jumbled Commands
**Problem**: Commands appear twice or interleaved
**Solution**: Track command sending state:
```typescript
const [commandSent, setCommandSent] = useState(false);
if (!commandSent) {
  setCommandSent(true);
  // send command
}
```

#### 4. Model Configuration
To change the default model, update in:
- `/src-tauri/scripts/sdk-server.js` (line ~10)
- `/src-tauri/src/opencode/service.rs` (line ~134)
- `/src/services/OpenCodeSDKService.ts` (line ~60)
- `/src/components/ServerControl.tsx` (default state)

## Development Commands

```bash
# Start development server
npm run tauri dev

# Build the application
npm run tauri build

# Kill all OpenCode processes (cleanup)
pkill -f "opencode serve"

# Check what's using a port
lsof -i :4096

# View OpenCode logs
tail -f ~/.local/share/opencode/log/*.log
```

## Testing Checklist

When making changes, ensure:
- [ ] Test parameter names (try both snake_case and camelCase if issues)
- [ ] Verify session creation before terminal connection
- [ ] Check browser console for frontend errors
- [ ] Check terminal where `npm run tauri dev` runs for Rust errors
- [ ] Ensure async operations are properly awaited
- [ ] Test server stop/kill functionality
- [ ] Verify terminal commands execute properly

## Current UI Layout
- **Servers Page**: Tabbed interface with integrated terminals
- **Control Panel**: Port input, model selector, spawn/refresh/kill buttons
- **Terminal**: Automatically opens when server tab selected
- **Window Size**: 90% of screen dimensions

## Future Improvements
- [ ] Standardize Tauri parameter naming (create wrapper)
- [ ] Add retry logic for SDK connections
- [ ] Improve terminal command reliability
- [ ] Add session persistence
- [ ] Better error messages for users