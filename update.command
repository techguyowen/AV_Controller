#!/bin/bash
# ==============================================================================
# ⛪ Sanctuary AV Controller — 1-Click macOS Updater
# ==============================================================================

cd "$(dirname "$0")"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║          ⛪ SANCTUARY AV CONTROLLER — 1-CLICK UPDATER          ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "🛡️  Preserving config.json and .env settings..."
echo ""

if command -v git &> /dev/null && [ -d ".git" ]; then
    echo "⬇️  Pulling latest changes from GitHub (main)..."
    git pull origin main
    echo "📦 Updating dependencies..."
    npm install --no-audit --no-fund
else
    echo "⬇️  Updating via AutoUpdater..."
    node -e "const AutoUpdater = require('./modules/updater'); const u = new AutoUpdater(); u.performUpdate().then(() => console.log('Update complete!')).catch(e => { console.error(e); process.exit(1); });"
fi

echo ""
echo "✅ Update complete! Starting controller..."
echo ""
./start.command
