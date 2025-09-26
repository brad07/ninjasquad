#!/usr/bin/env node

// This script is executed by Tauri to start OpenCode servers using the SDK
// It runs in a proper Node.js environment where spawn() is available

import { createOpencodeServer } from '@opencode-ai/sdk/server';

const args = process.argv.slice(2);
const port = parseInt(args[0]) || 4096;
const model = args[1] || 'claude-sonnet-4-0';

console.log(`SDK Server Configuration:`);
console.log(`  Port: ${port}`);
console.log(`  Model: ${model}`);

async function startServer() {
  try {
    console.log(`Starting OpenCode SDK server...`);

    const server = await createOpencodeServer({
      hostname: 'localhost',
      port: port,
      config: {
        model: model
      }
    });

    console.log(`SDK_SERVER_STARTED:${port}:${server.url}`);

    // Keep the process alive
    process.on('SIGINT', () => {
      console.log('Shutting down SDK server...');
      server.close();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      console.log('Shutting down SDK server...');
      server.close();
      process.exit(0);
    });

  } catch (error) {
    console.error('Failed to start SDK server:', error);
    process.exit(1);
  }
}

startServer();