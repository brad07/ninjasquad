#!/usr/bin/env node

// This script spawns OpenCode in TUI mode with a server on the specified port
// The TUI provides the interface while also running a server for SDK access

import { spawn } from 'child_process';

const args = process.argv.slice(2);
const port = parseInt(args[0]) || 4096;
const model = args[1] || 'claude-sonnet-4-0';

console.log(`Starting OpenCode TUI with server:`);
console.log(`  Port: ${port}`);
console.log(`  Model: ${model}`);

// Spawn opencode with port argument
// This starts the TUI with a server on the specified port
const opencodeProcess = spawn('opencode', ['--port', port.toString(), '-m', model], {
  stdio: 'inherit',  // Inherit stdio so the TUI works properly
  env: {
    ...process.env,
    // Ensure the terminal type is set for proper TUI rendering
    TERM: process.env.TERM || 'xterm-256color'
  }
});

console.log(`OPENCODE_TUI_STARTED:${port}`);

opencodeProcess.on('error', (error) => {
  console.error('Failed to start OpenCode TUI:', error);
  process.exit(1);
});

opencodeProcess.on('exit', (code) => {
  console.log(`OpenCode TUI exited with code ${code}`);
  process.exit(code || 0);
});

// Handle termination signals
process.on('SIGINT', () => {
  console.log('Shutting down OpenCode TUI...');
  opencodeProcess.kill('SIGINT');
});

process.on('SIGTERM', () => {
  console.log('Shutting down OpenCode TUI...');
  opencodeProcess.kill('SIGTERM');
});