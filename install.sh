#!/bin/sh
set -eu
if ! command -v node >/dev/null 2>&1; then
  echo 'Node.js 18+ is required (current LTS recommended). Install Node and npm first:' >&2
  case "$(uname -s)" in
    Darwin) echo 'brew install node' >&2 ;;
    Linux) echo 'Debian/Ubuntu: sudo apt-get update && sudo apt-get install nodejs npm' >&2 ;;
    *) echo 'See https://nodejs.org/en/download' >&2 ;;
  esac
  exit 1
fi
SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
exec node "$SCRIPT_DIR/src/cli.mjs" setup "$@"
