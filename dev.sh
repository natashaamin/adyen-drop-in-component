#!/bin/bash
# dev.sh — single command to start the full local dev environment
# Usage: ./dev.sh

set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${CYAN}[dev]${NC} $*"; }
ok()   { echo -e "${GREEN}[dev]${NC} $*"; }
err()  { echo -e "${RED}[dev]${NC} $*"; }

# ── Cleanup on Ctrl-C / exit ──────────────────────────────────────────────────
PIDS=()
TUNNEL_LOG=""
cleanup() {
  echo ""
  log "Shutting down..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  [ -n "$TUNNEL_LOG" ] && rm -f "$TUNNEL_LOG"
  exit 0
}
trap cleanup SIGINT SIGTERM

# ── Check prerequisites ───────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  err "node is not installed. Get it from https://nodejs.org (v20+)"
  exit 1
fi

if ! command -v cloudflared &>/dev/null; then
  err "cloudflared is not installed."
  echo ""
  echo "  macOS:   brew install cloudflared"
  echo "  Linux:   https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
  echo ""
  exit 1
fi

# ── Install dependencies (skipped if node_modules already exists) ─────────────
if [ ! -d "$ROOT_DIR/backend/node_modules" ]; then
  log "Installing backend dependencies..."
  npm install --prefix "$ROOT_DIR/backend" --silent
fi

if [ ! -d "$ROOT_DIR/frontend/node_modules" ]; then
  log "Installing frontend dependencies..."
  npm install --prefix "$ROOT_DIR/frontend" --silent
fi

# ── Start Cloudflare tunnel ───────────────────────────────────────────────────
TUNNEL_LOG=$(mktemp /tmp/cloudflared.XXXXXX.log)
log "Starting Cloudflare tunnel..."
cloudflared tunnel --url http://localhost:8081 >"$TUNNEL_LOG" 2>&1 &
PIDS+=($!)

log "Waiting for tunnel URL (this takes ~10 seconds)..."
TUNNEL_URL=""
for i in $(seq 1 40); do
  TUNNEL_URL=$(grep -o 'https://[a-zA-Z0-9-]*\.trycloudflare\.com' "$TUNNEL_LOG" 2>/dev/null | head -1)
  if [ -n "$TUNNEL_URL" ]; then break; fi
  sleep 1
done

if [ -z "$TUNNEL_URL" ]; then
  err "Timed out waiting for tunnel URL. cloudflared output:"
  cat "$TUNNEL_LOG"
  exit 1
fi

ok "Tunnel: $TUNNEL_URL"

# ── Configure Adyen webhook ───────────────────────────────────────────────────
log "Configuring Adyen webhook..."
"$ROOT_DIR/setup-webhook.sh" "$TUNNEL_URL"

# ── Start backend ─────────────────────────────────────────────────────────────
log "Starting backend on http://localhost:8081..."
npm run dev --prefix "$ROOT_DIR/backend" &
PIDS+=($!)

sleep 2  # give backend a moment before frontend tries to connect

# ── Start frontend ────────────────────────────────────────────────────────────
log "Starting frontend on http://localhost:8080..."
npm run dev --prefix "$ROOT_DIR/frontend" &
PIDS+=($!)

echo ""
ok "All services running:"
ok "  App     → http://localhost:8080"
ok "  Backend → http://localhost:8081"
ok "  Tunnel  → $TUNNEL_URL"
echo ""
ok "Press Ctrl+C to stop everything."
echo ""

wait
