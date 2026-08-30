#!/bin/bash

set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
RUNTIME_ROOT="${XDG_RUNTIME_DIR:-/tmp}/omarchy-snippet-overlay-manual"
TEST_ROOT="$RUNTIME_ROOT/run"

[[ -f $ROOT_DIR/Snippets.qml ]] || {
  printf 'Missing overlay root: %s\n' "$ROOT_DIR/Snippets.qml" >&2
  exit 1
}
[[ -f $ROOT_DIR/lib/SnippetOverlayModel.js ]] || {
  printf 'Missing overlay model: %s\n' "$ROOT_DIR/lib/SnippetOverlayModel.js" >&2
  exit 1
}
[[ -d /usr/share/omarchy/shell/Commons && -d /usr/share/omarchy/shell/Ui ]] || {
  printf 'Installed Omarchy shell modules are unavailable\n' >&2
  exit 1
}
command -v qs >/dev/null 2>&1 || {
  printf 'Quickshell executable is unavailable\n' >&2
  exit 1
}

isolated_home="$RUNTIME_ROOT/home"
isolated_data="$RUNTIME_ROOT/data"
isolated_config="$RUNTIME_ROOT/config"
isolated_state="$RUNTIME_ROOT/state"
isolated_cache="$RUNTIME_ROOT/cache"
harness="$TEST_ROOT/harness"
mkdir -m 700 -p "$isolated_home" "$isolated_data" "$isolated_config" "$isolated_state" "$isolated_cache"
rm -rf "$TEST_ROOT"
mkdir -m 700 -p "$harness"

case "$isolated_data" in
  "$RUNTIME_ROOT"/*) ;;
  *) printf 'Refusing unsafe runtime data path\n' >&2; exit 1 ;;
esac

if [[ ! -f $isolated_data/omarchy-snippets/snippets.json ]]; then
  fixture=$'{\n  "schemaVersion": 1,\n  "snippets": [\n    {\n      "id": "550e8400-e29b-41d4-a716-446655440000",\n      "title": "Support email",\n      "content": "Exact 👋\\r\\nmultiline\\n",\n      "createdAt": "2026-08-29T12:00:00.000Z",\n      "updatedAt": "2026-08-29T12:00:00.000Z"\n    }\n  ]\n}\n'
  printf '%s' "$fixture" | HOME="$isolated_home" XDG_DATA_HOME="$isolated_data" "$ROOT_DIR/bin/snippet-store" write
fi

ln -s /usr/share/omarchy/shell/Commons "$harness/Commons"
ln -s /usr/share/omarchy/shell/Ui "$harness/Ui"
ln -s "$ROOT_DIR/lib" "$harness/lib"
ln -s "$ROOT_DIR/ui" "$harness/ui"
ln -s "$ROOT_DIR/Snippets.qml" "$harness/Snippets.qml"

cat >"$harness/shell.qml" <<'QML'
import Quickshell
import QtQuick
import "."

ShellRoot {
  Snippets {
    Component.onCompleted: open("{}")
  }
}
QML

printf '%s\n' \
  "Interactive snippet overlay (disposable catalog; transfer actions use your real clipboard and keyboard)." \
  "Escape closes without transfer. Enter pastes; Ctrl+Enter copies. Run this script again to reopen." \
  "Ctrl+C in this terminal stops Quickshell." \
  "Catalog: $isolated_data/omarchy-snippets/snippets.json"

HOME="$isolated_home" \
XDG_DATA_HOME="$isolated_data" \
XDG_CONFIG_HOME="$isolated_config" \
XDG_STATE_HOME="$isolated_state" \
XDG_CACHE_HOME="$isolated_cache" \
OMARCHY_PATH=/usr/share/omarchy \
SNIPPET_STORE_PATH="$ROOT_DIR/bin/snippet-store" \
SNIPPET_TRANSFER_PATH="$ROOT_DIR/bin/snippet-transfer" \
qs -p "$harness/shell.qml"
