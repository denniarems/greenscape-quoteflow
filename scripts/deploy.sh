#!/usr/bin/env bash
#
# scripts/deploy.sh — Production deployment runner for QuoteFlow on Vercel.
# Can be run independently or triggered at the end of setup-vercel-wizard.sh.

set -euo pipefail

if [[ -t 1 ]] && command -v tput >/dev/null 2>&1 && [[ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]]; then
  BOLD=$(tput bold); DIM=$(tput dim); RESET=$(tput sgr0)
  BLUE=$(tput setaf 4); GREEN=$(tput setaf 2); YELLOW=$(tput setaf 3); RED=$(tput setaf 1)
else
  BOLD=""; DIM=""; RESET=""; BLUE=""; GREEN=""; YELLOW=""; RED=""
fi

say()  { printf '  %s\n' "$1"; }
step() { printf '  %s•%s %s\n' "$BLUE" "$RESET" "$1"; }
note() { printf '  %s%s%s\n' "$DIM" "$1" "$RESET"; }
warn() { printf '  %s⚠ %s%s\n' "$YELLOW" "$1" "$RESET"; }
ok()   { printf '  %s✓ %s%s\n' "$GREEN" "$1" "$RESET"; }

printf '\n%s%sQuoteFlow Vercel Production Deployment%s\n\n' "$BOLD" "$BLUE" "$RESET"

# 1. Package runner detection
RUNNER="bun"
if ! command -v bun >/dev/null 2>&1; then
  if command -v pnpm >/dev/null 2>&1; then
    RUNNER="pnpm"
  elif command -v npm >/dev/null 2>&1; then
    RUNNER="npm"
  fi
fi
note "Using package runner: $RUNNER"

# 2. Pre-flight verification
step "Running TypeScript check ($RUNNER run check)..."
$RUNNER run check
ok "Type checking passed"

step "Running unit and regression test suite ($RUNNER run test)..."
$RUNNER run test
ok "All tests passed"

step "Building production bundles ($RUNNER run build)..."
$RUNNER run build
ok "Client assets & server artifacts built in dist/public"

# 3. Git status check
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
UNCOMMITTED=$(git status --porcelain 2>/dev/null || true)
if [[ -n "$UNCOMMITTED" ]]; then
  warn "You have uncommitted changes:"
  printf '%s\n' "$UNCOMMITTED" | while read -r line; do note "    $line"; done
  printf '\n'
  printf '  %sDo you want to commit and push before deploying? [y/N]%s ' "$YELLOW" "$RESET"
  read -r reply || true
  if [[ "$reply" =~ ^[Yy] ]]; then
    printf '  %sEnter commit message [Default: deploy update]: %s' "$BOLD" "$RESET"
    read -r msg || true
    [[ -z "$msg" ]] && msg="deploy update"
    git add .
    git commit -m "$msg"
    ok "Committed changes: $msg"
  fi
fi

# 4. Deployment execution
step "Select deployment target:"
printf '    1) Vercel CLI direct deploy (%snpx vercel --prod%s)\n' "$BOLD" "$RESET"
printf '    2) Git Push to trigger Vercel Git Integration (%sgit push origin %s%s)\n' "$BOLD" "$CURRENT_BRANCH" "$RESET"
printf '    3) Exit without deploying\n'
printf '  %sChoose [1/2/3, default 1]: %s' "$BOLD" "$RESET"
read -r choice || true
[[ -z "$choice" ]] && choice="1"

case "$choice" in
  1)
    step "Deploying to Vercel via CLI..."
    if command -v vercel >/dev/null 2>&1; then
      vercel --prod
    else
      npx --yes vercel --prod
    fi
    ok "Vercel CLI deployment complete!"
    ;;
  2)
    step "Pushing commits to remote origin/$CURRENT_BRANCH..."
    git push origin "$CURRENT_BRANCH"
    ok "Pushed to origin/$CURRENT_BRANCH! Vercel Git Integration will build and deploy."
    say "Check deployment progress at: https://vercel.com"
    ;;
  *)
    note "Deployment cancelled by user. Local build is ready in dist/public."
    exit 0
    ;;
esac

printf '\n%s%sDeployment process finished successfully!%s\n\n' "$BOLD" "$GREEN" "$RESET"
