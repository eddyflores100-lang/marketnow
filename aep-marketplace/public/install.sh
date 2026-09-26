#!/usr/bin/env bash
# MarketNow Universal Trust Adapter (UTA) — Installer
# Usage: curl -fsSL https://www.marketnow.site/install.sh | bash
#
# What it does:
#   1. Verifies Node.js + npm are available (the npm registry is the live
#      release channel: every MarketNow package is published there and
#      mirrored by jsDelivr/unpkg automatically)
#   2. Installs @marketnow/uta-verify globally (the `uta-verify` CLI)
#   3. Verifies the installed CLI actually runs before reporting success
#   4. Prints the optional next steps (MCP server, ATC SDK)
#
# Binary release channel note: a cosign-verified prebuilt-binary channel
# (GitHub Releases + SHA-256 manifest) is planned; the npm channel is the
# live, working path today.
#
# Exit codes:
#   0  success
#   1  general error
#   2  Node.js / npm not available
#   5  network error (npm registry unreachable)
#   6  permission denied on global install (try sudo, or use npx)
#
# Repository: https://github.com/alicelabs-llc/MARKETNOW
# Protocol:  https://github.com/alicelabs-llc/universal-trust-adapter
# License: MIT OR Apache-2.0 (packages); AL-1.0 (engine core)

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================
NPM_REGISTRY="https://registry.npmjs.org"
CLI_PACKAGE="@marketnow/uta-verify"
MCP_PACKAGE="marketnow-mcp"
SDK_PACKAGE="agent-trust-card"

# Colors for output
if [ -t 1 ]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[0;33m'
  BLUE='\033[0;34m'
  BOLD='\033[1m'
  NC='\033[0m'
else
  RED='' GREEN='' YELLOW='' BLUE='' BOLD='' NC=''
fi

log() { echo -e "${BLUE}[uta-installer]${NC} $*" >&2; }
ok()   { echo -e "${GREEN}✓${NC} $*" >&2; }
warn() { echo -e "${YELLOW}!${NC} $*" >&2; }
err()  { echo -e "${RED}✗${NC} $*" >&2; }

# ============================================================================
# Step 1: Verify prerequisites (Node.js + npm)
# ============================================================================
check_prerequisites() {
  log "Checking prerequisites..."

  if ! command -v node >/dev/null 2>&1; then
    err "Node.js is required but not installed."
    err "  Install it from https://nodejs.org (LTS) or your package manager:"
    err "    macOS:  brew install node"
    err "    Linux:  sudo apt install nodejs npm   (or use nvm)"
    exit 2
  fi
  ok "Node.js $(node --version)"

  if ! command -v npm >/dev/null 2>&1; then
    err "npm is required but not installed (it ships with Node.js)."
    err "  Re-install Node.js from https://nodejs.org"
    exit 2
  fi
  ok "npm $(npm --version)"

  if ! curl -fsSL --max-time 10 "$NPM_REGISTRY/$MCP_PACKAGE" -o /dev/null 2>/dev/null; then
    err "npm registry unreachable ($NPM_REGISTRY)."
    err "  Check your network connection and try again."
    exit 5
  fi
  ok "npm registry reachable"
}

# ============================================================================
# Step 2: Install the uta-verify CLI (global)
# ============================================================================
install_cli() {
  log "Installing ${BOLD}${CLI_PACKAGE}${NC} (the uta-verify CLI)..."

  if ! npm install -g "$CLI_PACKAGE" 2>/tmp/uta-npm-err.$$; then
    local npm_err
    npm_err="$(cat /tmp/uta-npm-err.$$ 2>/dev/null || true)"
    rm -f /tmp/uta-npm-err.$$
    if echo "$npm_err" | grep -q "EACCES\|permission"; then
      err "Permission denied on the global npm prefix."
      err "  Either re-run with sudo:"
      err "    curl -fsSL https://www.marketnow.site/install.sh | sudo bash"
      err "  Or skip the global install and run on demand:"
      err "    npx -y $CLI_PACKAGE --help"
      exit 6
    fi
    err "npm install failed: $npm_err"
    exit 1
  fi
  rm -f /tmp/uta-npm-err.$$
  ok "Installed $CLI_PACKAGE"
}

# ============================================================================
# Step 3: Verify the CLI actually runs
# ============================================================================
verify_install() {
  log "Verifying the install..."
  if ! command -v uta-verify >/dev/null 2>&1; then
    warn "uta-verify is not on PATH yet (new global bin dir not picked up by this shell)."
    warn "  Open a NEW terminal, or add \$(npm prefix -g)/bin to your PATH."
  elif ! uta-verify --help >/dev/null 2>&1; then
    err "uta-verify was installed but failed to run:"
    uta-verify --help >&2 || true
    exit 1
  else
    ok "uta-verify runs"
  fi
}

# ============================================================================
# Step 4: Next steps
# ============================================================================
print_next_steps() {
  echo "" >&2
  echo -e "${BOLD}Installed:${NC}" >&2
  echo -e "  uta-verify        CLI credential verifier (ATC v3, JWT, VC, A2A, EAT, ZTA, MCP)" >&2
  echo "" >&2
  echo -e "${BOLD}Optional (not installed):${NC}" >&2
  echo -e "  npm i -g $MCP_PACKAGE     # MCP server for Claude Desktop / Cursor / Cline" >&2
  echo -e "  npm i    $SDK_PACKAGE     # ATC SDK (issue, verify, inspect trust cards)" >&2
  echo -e "  npx -y @marketnow/uta-conformance   # run the 14-vector conformance suite" >&2
  echo "" >&2
  echo -e "${BOLD}Try it:${NC}" >&2
  echo -e "  uta-verify card.json --ca-key ca.pem" >&2
  echo "" >&2
  echo -e "Docs: https://www.marketnow.site/uta/docs" >&2
  echo -e "Status: https://status.marketnow.site" >&2
}

# ============================================================================
# Main
# ============================================================================
main() {
  echo -e "${BOLD}MarketNow UTA installer${NC} (npm channel)" >&2
  echo "" >&2
  check_prerequisites
  install_cli
  verify_install
  print_next_steps
  echo -e "${GREEN}Done.${NC}" >&2
}

main "$@"
