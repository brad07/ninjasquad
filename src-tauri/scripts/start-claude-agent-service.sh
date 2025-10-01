#!/bin/bash

# Start Claude Agent Service
# This must be run in a separate terminal before launching the Tauri app

cd "$(dirname "$0")"

echo "Starting Claude Agent Service on port 3457..."
echo "Make sure ANTHROPIC_API_KEY is set in your environment"
echo ""

if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "⚠️  Warning: ANTHROPIC_API_KEY is not set!"
    echo "The service will start but API calls will fail."
    echo ""
fi

export CLAUDE_AGENT_SERVICE_PORT=3457
npx tsx claude-agent-service.ts
