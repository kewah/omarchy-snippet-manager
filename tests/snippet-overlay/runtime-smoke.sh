#!/bin/bash

set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
TEST_ROOT=$(mktemp -d)
trap 'rm -rf "$TEST_ROOT"' EXIT

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

isolated_home="$TEST_ROOT/home"
isolated_data="$TEST_ROOT/data"
isolated_config="$TEST_ROOT/config"
isolated_state="$TEST_ROOT/state"
isolated_cache="$TEST_ROOT/cache"
harness="$TEST_ROOT/harness"
mkdir -m 700 "$isolated_home" "$isolated_data" "$isolated_config" "$isolated_state" "$isolated_cache" "$harness"

case "$isolated_data" in
  "$TEST_ROOT"/*) ;;
  *) printf 'Refusing unsafe runtime data path\n' >&2; exit 1 ;;
esac

ln -s /usr/share/omarchy/shell/Commons "$harness/Commons"
ln -s /usr/share/omarchy/shell/Ui "$harness/Ui"
ln -s "$ROOT_DIR/lib" "$harness/lib"
ln -s "$ROOT_DIR/Snippets.qml" "$harness/Snippets.qml"

cat >"$harness/shell.qml" <<'QML'
import Quickshell
import QtQuick
import "."

ShellRoot {
  Snippets { id: snippets }

  Timer {
    interval: 50
    running: true
    onTriggered: {
      snippets.open("{}")
      snippets.close()
      Qt.quit()
    }
  }
}
QML

log_file="$TEST_ROOT/quickshell.log"
set +e
HOME="$isolated_home" \
XDG_DATA_HOME="$isolated_data" \
XDG_CONFIG_HOME="$isolated_config" \
XDG_STATE_HOME="$isolated_state" \
XDG_CACHE_HOME="$isolated_cache" \
OMARCHY_PATH=/usr/share/omarchy \
timeout 10 qs --no-color -p "$harness/shell.qml" >"$log_file" 2>&1
status=$?
set -e

if [[ $status -ne 0 ]]; then
  printf 'Disposable Quickshell runtime failed with status %s\n' "$status" >&2
  sed -n '1,160p' "$log_file" >&2
  exit 1
fi

if grep -Eiq '(QQmlComponent: Component is not ready|Type .* unavailable|is not a type|ReferenceError|SyntaxError|Unable to assign|ASSERT:| FATAL | CRITICAL )' "$log_file"; then
  printf 'Disposable Quickshell runtime reported an error\n' >&2
  sed -n '1,160p' "$log_file" >&2
  exit 1
fi

[[ ! -e $isolated_config/omarchy/plugins ]] || {
  printf 'Runtime smoke test created a user plugin\n' >&2
  exit 1
}
[[ ! -e $isolated_data/omarchy-snippets/snippets.json ]] || {
  printf 'Runtime smoke test created snippet data\n' >&2
  exit 1
}

printf 'ok - disposable Quickshell runtime loaded snippet overlay\n'
