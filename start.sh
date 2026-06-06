#!/bin/bash
# ═══════════════════════════════════════════════
# ANC Follow-Up System v2 — Mac Launcher
# Double-click in Finder or: bash start.sh
# ═══════════════════════════════════════════════

PORT=3000
DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  🏥  ANC FOLLOW-UP SYSTEM  v2  (2nd Edition) ║"
echo "║  Obstetric EMR · Localhost · Mac             ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# Already running?
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "⚡  Server already running on port $PORT"
  echo "   Opening browser..."
  open "http://localhost:$PORT"
  exit 0
fi

# Python check
if ! command -v python3 &>/dev/null; then
  echo "❌  Python 3 not found."
  echo "   Install from: https://www.python.org/downloads/"
  echo "   (All Macs with macOS 12.3+ have Python 3 built-in)"
  read -p "Press Enter to exit..."
  exit 1
fi

echo "✅  Python 3 found: $(python3 --version)"
echo "✅  Serving from: $DIR"
echo "✅  URL: http://localhost:$PORT"
echo ""
echo "   First launch: set up encryption password in the app."
echo "   Press Ctrl+C to stop the server."
echo ""

# Open browser after delay
(sleep 1.5 && open "http://localhost:$PORT") &

# Start server
cd "$DIR"
python3 -m http.server $PORT --bind 127.0.0.1 2>/dev/null

echo ""
echo "Server stopped."
