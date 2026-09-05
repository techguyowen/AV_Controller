#!/bin/bash
# ==============================================================================
# ⛪ Sanctuary AV Controller — 1-Click macOS Stop Script
# ==============================================================================

cd "$(dirname "$0")"

echo "🛑 Stopping Sanctuary AV Controller server..."

# Find and kill any process on port 3050
PID=$(lsof -ti:3050)
if [ -n "$PID" ]; then
    kill -9 $PID
    echo "✓ Sanctuary AV Controller (PID $PID) has been stopped."
else
    echo "ℹ️ No running Sanctuary AV Controller found on port 3050."
fi

sleep 1
