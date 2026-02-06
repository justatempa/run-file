#!/usr/bin/env bash

set -euo pipefail

echo "=== PWT App Local Dev Start (bash) ==="
echo

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js not found. Please install Node.js LTS."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "[ERROR] npm not found. Please install npm."
  exit 1
fi

env_file=".env"
example_file=".env.example"

if [ ! -f "$env_file" ]; then
  if [ -f "$example_file" ]; then
    cp "$example_file" "$env_file"
    echo "[OK] Created .env from .env.example"
  else
    echo "[ERROR] .env.example not found."
    exit 1
  fi
fi

sed_inplace() {
  local script="$1"
  local file="$2"
  if [[ "${OSTYPE:-}" == "darwin"* ]]; then
    sed -i '' -e "$script" "$file"
  else
    sed -i -e "$script" "$file"
  fi
}

get_value() {
  local key="$1"
  local line
  line="$(grep -E "^${key}=" "$env_file" | tail -n 1 || true)"
  if [ -z "$line" ]; then
    echo ""
    return 0
  fi
  echo "${line#${key}=}"
}

is_missing_or_empty() {
  local key="$1"
  local val
  val="$(get_value "$key")"
  if [ -z "$val" ] || [ "$val" = "\"\"" ] || [ "$val" = "''" ]; then
    return 0
  fi
  return 1
}

set_or_add() {
  local key="$1"
  local value="$2"
  if grep -q -E "^${key}=" "$env_file"; then
    sed_inplace "s|^${key}=.*|${key}=${value}|" "$env_file"
  else
    if [ -s "$env_file" ]; then
      printf "\n" >>"$env_file"
    fi
    printf "%s=%s\n" "$key" "$value" >>"$env_file"
  fi
}

if is_missing_or_empty "AUTH_SECRET"; then
  secret="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")"
  set_or_add "AUTH_SECRET" "\"${secret}\""
  echo "[OK] AUTH_SECRET set."
fi

if is_missing_or_empty "DATABASE_URL"; then
  set_or_add "DATABASE_URL" "\"file:./db.sqlite\""
  echo "[OK] DATABASE_URL set."
fi

if [ ! -d node_modules ]; then
  echo "[INFO] Installing dependencies..."
  npm install
fi

echo "[INFO] Initializing database..."
npm run db:push

echo "[INFO] Seeding sample account..."
npm run db:seed

export PORT="${PORT:-3001}"

echo
echo "=== Start Dev Server (PORT=${PORT}) ==="
echo "Sample account:"
echo "  Email: test@example.com"
echo "  Password: password123"
echo
npm run dev
