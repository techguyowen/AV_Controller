#!/bin/bash
# ==============================================================================
# ⛪ Sanctuary AV Controller — 1-Click macOS Desktop Launcher
# ==============================================================================

# Change working directory to script location
cd "$(dirname "$0")"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║          ⛪ SANCTUARY AV CONTROLLER — 1-CLICK LAUNCHER        ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed or not in PATH."
    echo "Please download and install Node.js from https://nodejs.org"
    echo ""
    read -p "Press enter to exit..."
    exit 1
fi

echo "🚀 Starting Sanctuary AV Controller daemon on port 3050..."
echo ""

# Open the master dashboard in the default browser after 1.5 seconds
(sleep 1.5 && open "http://localhost:3050") &

# Run server in foreground so logs are visible
node server.js
