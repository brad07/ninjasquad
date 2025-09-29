#!/bin/bash

echo "🥷 Ninja Squad Process Cleanup Script"
echo "====================================="
echo ""

# Function to kill OpenCode processes started by Ninja Squad
kill_ninja_opencode() {
    echo "Looking for OpenCode processes spawned by Ninja Squad..."

    # Kill OpenCode TUI processes (these are specific to Ninja Squad)
    OPENCODE_PIDS=$(ps aux | grep -E "tui-0rp3j0zt|opencode-tui\.js" | grep -v grep | awk '{print $2}')

    if [ -n "$OPENCODE_PIDS" ]; then
        echo "Found OpenCode processes with PIDs: $OPENCODE_PIDS"
        echo "Killing OpenCode processes..."
        echo $OPENCODE_PIDS | xargs kill -9 2>/dev/null
        echo "✅ OpenCode processes killed"
    else
        echo "No Ninja Squad OpenCode processes found"
    fi

    # Also kill the parent opencode commands that were spawned
    OPENCODE_PARENTS=$(ps aux | grep "opencode --port" | grep -v grep | awk '{print $2}')

    if [ -n "$OPENCODE_PARENTS" ]; then
        echo "Found parent OpenCode commands: $OPENCODE_PARENTS"
        echo $OPENCODE_PARENTS | xargs kill -9 2>/dev/null
        echo "✅ Parent OpenCode processes killed"
    fi
}

# Function to list all Claude Code instances (but not kill them)
list_claude_code() {
    echo ""
    echo "Active Claude Code instances (NOT killed - running separately):"
    ps aux | grep -E "^.*claude( |$)" | grep -v grep | grep -v "kill-ninja" | awk '{printf "  PID: %s | Started: %s %s | TTY: %s\n", $2, $9, $10, $7}'

    CLAUDE_COUNT=$(ps aux | grep -E "^.*claude( |$)" | grep -v grep | grep -v "kill-ninja" | wc -l | tr -d ' ')
    echo "  Total Claude Code instances: $CLAUDE_COUNT"
}

# Main execution
kill_ninja_opencode
list_claude_code

echo ""
echo "====================================="
echo "✅ Ninja Squad cleanup complete!"
echo "Your Claude Code instances remain untouched."