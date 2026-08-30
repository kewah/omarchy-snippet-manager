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

fixture=$'{\n  "schemaVersion": 1,\n  "snippets": [\n    {\n      "id": "550e8400-e29b-41d4-a716-446655440000",\n      "title": "Support email",\n      "content": "Exact 👋\\r\\nmultiline\\n",\n      "createdAt": "2026-08-29T12:00:00.000Z",\n      "updatedAt": "2026-08-29T12:00:00.000Z"\n    }\n  ]\n}\n'
printf '%s' "$fixture" | HOME="$isolated_home" XDG_DATA_HOME="$isolated_data" "$ROOT_DIR/bin/snippet-store" write

fake_transfer="$TEST_ROOT/fake-transfer"
cat >"$fake_transfer" <<'EOF'
#!/bin/bash
cat >/dev/null
exit 0
EOF
chmod +x "$fake_transfer"

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
  property int phase: 0

  Snippets {
    id: snippets
    onTransferRequested: function(payload) {
      if (payload.kind !== "COPY"
          || payload.snippet.id !== "550e8400-e29b-41d4-a716-446655440000"
          || payload.snippet.content !== "Exact 👋\r\nmultiline\n") {
        console.error("SNIPPET_SMOKE_FAILURE invalid transfer payload")
        Qt.quit()
        return
      }
      phase = 1
      Qt.callLater(function() { snippets.open("{}") })
    }
  }

  Timer {
    property int attempts: 0
    interval: 50
    repeat: true
    running: true
    onTriggered: {
      attempts += 1
      if (attempts === 1) snippets.open("{}")
      if (attempts > 100) {
        console.error("SNIPPET_SMOKE_FAILURE overlay flow timed out")
        Qt.quit()
        return
      }
      if (phase === 0) {
        if (snippets.overlayState.mode !== "search") return
        phase = -1
        if (snippets.overlayState.results.length !== 1) {
          console.error("SNIPPET_SMOKE_FAILURE catalog did not render")
          Qt.quit()
          return
        }
        snippets.applyEvent({ type: "SET_QUERY", query: "support" })
        snippets.applyEvent({ type: "REQUEST_TRANSFER", kind: "COPY" })
      } else if (phase === 1) {
        if (snippets.overlayState.mode !== "search") return
        phase = 2
        snippets.applyEvent({ type: "OPEN_CREATE" })
      } else if (phase === 2) {
        if (snippets.overlayState.mode !== "create") return
        if (snippets.keyCatcherHasFocus) {
          if (attempts > 40) {
            console.error("SNIPPET_SMOKE_FAILURE create editor did not take keyboard focus")
            Qt.quit()
          }
          return
        }
        phase = 3
        snippets.applyEvent({ type: "UPDATE_DRAFT", field: "title", value: "Created in runtime" })
        snippets.applyEvent({ type: "UPDATE_DRAFT", field: "content", value: "Runtime 👋\ncontent" })
        snippets.applyEvent({ type: "SUBMIT_CREATE" })
      } else if (phase === 3) {
        if (snippets.overlayState.mode !== "search") return
        if (snippets.overlayState.catalog.snippets.length !== 2
            || snippets.overlayState.selectedId === "550e8400-e29b-41d4-a716-446655440000") {
          console.error("SNIPPET_SMOKE_FAILURE create did not persist and select")
          Qt.quit()
          return
        }
        if (!snippets.searchKeysArmed) {
          console.error("SNIPPET_SMOKE_FAILURE search keys lost after create")
          Qt.quit()
          return
        }
        phase = 4
        snippets.applyEvent({ type: "OPEN_EDIT" })
        snippets.applyEvent({ type: "UPDATE_DRAFT", field: "title", value: "Edited in runtime" })
        snippets.applyEvent({ type: "SUBMIT_EDIT", now: "2026-08-29T13:00:00.000Z" })
      } else if (phase === 4) {
        if (snippets.overlayState.mode !== "search") return
        var edited = snippets.overlayState.catalog.snippets.filter(function(record) {
          return record.title === "Edited in runtime"
        })
        if (edited.length !== 1 || edited[0].updatedAt !== "2026-08-29T13:00:00.000Z") {
          console.error("SNIPPET_SMOKE_FAILURE edit did not persist and select")
          Qt.quit()
          return
        }
        phase = 5
        snippets.applyEvent({ type: "OPEN_DELETE" })
        snippets.applyEvent({ type: "MOVE_CONFIRM" })
        snippets.applyEvent({ type: "CONFIRM_DELETE" })
      } else if (phase === 5) {
        if (snippets.overlayState.mode !== "search") return
        if (snippets.overlayState.catalog.snippets.length !== 1
            || snippets.overlayState.catalog.snippets[0].id !== "550e8400-e29b-41d4-a716-446655440000") {
          console.error("SNIPPET_SMOKE_FAILURE delete did not persist")
        }
        Qt.quit()
      }
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
SNIPPET_STORE_PATH="$ROOT_DIR/bin/snippet-store" \
SNIPPET_TRANSFER_PATH="$fake_transfer" \
timeout 10 qs --no-color -p "$harness/shell.qml" >"$log_file" 2>&1
status=$?
set -e

if [[ $status -ne 0 ]]; then
  printf 'Disposable Quickshell runtime failed with status %s\n' "$status" >&2
  sed -n '1,160p' "$log_file" >&2
  exit 1
fi

if grep -Eiq '(SNIPPET_SMOKE_FAILURE|QQmlComponent: Component is not ready|Type .* unavailable|is not a type|ReferenceError|SyntaxError|Unable to assign|ASSERT:| FATAL | CRITICAL )' "$log_file"; then
  printf 'Disposable Quickshell runtime reported an error\n' >&2
  sed -n '1,160p' "$log_file" >&2
  exit 1
fi

[[ ! -e $isolated_config/omarchy/plugins ]] || {
  printf 'Runtime smoke test created a user plugin\n' >&2
  exit 1
}
catalog_path="$isolated_data/omarchy-snippets/snippets.json"
[[ -f $catalog_path ]] || {
  printf 'Runtime smoke test did not use isolated snippet data\n' >&2
  exit 1
}
jq -e '.snippets | length == 1 and .[0].id == "550e8400-e29b-41d4-a716-446655440000"' "$catalog_path" >/dev/null || {
  printf 'Runtime smoke test did not persist the created, edited, and deleted snippet flow\n' >&2
  exit 1
}

fake_bin="$TEST_ROOT/fake-bin"
notification_log="$TEST_ROOT/notification.log"
mkdir "$fake_bin"
cat >"$fake_bin/omarchy-notification-send" <<'EOF'
#!/bin/bash
printf '%s\n' "$*" >"$NOTIFICATION_LOG"
EOF
chmod +x "$fake_bin/omarchy-notification-send"

cat >"$harness/spawn-failure.qml" <<'QML'
import Quickshell
import QtQuick
import "."

ShellRoot {
  property bool requested: false

  Snippets { id: snippets }

  Timer {
    interval: 50
    repeat: true
    running: true
    onTriggered: {
      if (!requested) {
        if (snippets.overlayState.mode !== "search") {
          snippets.open("{}")
          return
        }
        requested = true
        snippets.applyEvent({ type: "REQUEST_TRANSFER", kind: "COPY" })
        quitTimer.start()
      }
    }
  }

  Timer {
    id: quitTimer
    interval: 500
    onTriggered: Qt.quit()
  }
}
QML

spawn_log="$TEST_ROOT/spawn-failure.log"
set +e
PATH="$fake_bin:$PATH" \
HOME="$isolated_home" \
XDG_DATA_HOME="$isolated_data" \
XDG_CONFIG_HOME="$isolated_config" \
XDG_STATE_HOME="$isolated_state" \
XDG_CACHE_HOME="$isolated_cache" \
OMARCHY_PATH=/usr/share/omarchy \
NOTIFICATION_LOG="$notification_log" \
SNIPPET_STORE_PATH="$ROOT_DIR/bin/snippet-store" \
SNIPPET_TRANSFER_PATH="$TEST_ROOT/missing-transfer" \
timeout 5 qs --no-color -p "$harness/spawn-failure.qml" >"$spawn_log" 2>&1
spawn_status=$?
set -e

if [[ $spawn_status -ne 0 ]]; then
  printf 'Spawn-failure runtime test failed with status %s\n' "$spawn_status" >&2
  sed -n '1,160p' "$spawn_log" >&2
  exit 1
fi

[[ -f $notification_log ]] || {
  printf 'Missing helper did not produce a transfer failure notification\n' >&2
  sed -n '1,160p' "$spawn_log" >&2
  exit 1
}
[[ $(<"$notification_log") == "Unable to transfer snippet" ]] || {
  printf 'Spawn-failure notification did not use allowlisted text\n' >&2
  exit 1
}

printf 'ok - disposable Quickshell runtime loaded and exercised snippet overlay\n'
printf 'ok - missing transfer helper produced a safe failure notification\n'
