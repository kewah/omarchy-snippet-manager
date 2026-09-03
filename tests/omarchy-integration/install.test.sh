#!/bin/bash

set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
INSTALLER="$ROOT_DIR/bin/snippet-install"
TEST_ROOT=$(mktemp -d)
trap 'rm -rf "$TEST_ROOT"' EXIT

pass_count=0

fail() {
  printf 'not ok - %s\n' "$1" >&2
  exit 1
}

pass() {
  pass_count=$((pass_count + 1))
  printf 'ok %d - %s\n' "$pass_count" "$1"
}

assert_equal() {
  local expected="$1"
  local actual="$2"
  local message="$3"

  [[ $actual == "$expected" ]] || fail "$message (expected '$expected', got '$actual')"
}

[[ -x $INSTALLER ]] || fail "bin/snippet-install must exist and be executable"

MENU_FILE="$TEST_ROOT/omarchy-menu.jsonc"
BIND_FILE="$TEST_ROOT/bindings.lua"
PACKAGED="/usr/share/omarchy/default/omarchy/omarchy-menu.jsonc"

cat >"$MENU_FILE" <<'EOF'
{
  // Keep existing user rows
  "quicklinks": {
    "icon": "󰞧",
    "label": "Quicklinks",
    "aliases": ["links", "bookmarks"]
  },
  "quicklinks.github": {
    "icon": "",
    "label": "GitHub",
    "action": "omarchy-launch-browser 'https://github.com/kewah?tab=repositories'"
  },
}
EOF

cat >"$BIND_FILE" <<'EOF'
-- Keep only your personal keybinding overrides here.
o.bind("SUPER + SHIFT + R", "SSH", "alacritty -e ssh your-server")
EOF

"$INSTALLER" --menu-file "$MENU_FILE" --bind-file "$BIND_FILE"

grep -q '"quicklinks.github"' "$MENU_FILE" || fail "merge dropped quicklinks.github"
grep -q '"trigger.snippets"' "$MENU_FILE" || fail "merge did not insert trigger.snippets"
grep -q 'omarchy-shell shell toggle kewah.snippet-manager' "$MENU_FILE" || fail "menu action is not the native toggle"
grep -q 'Keep existing user rows' "$MENU_FILE" || fail "merge dropped JSONC comments"
grep -q 'o.bind("SUPER + SHIFT + R", "SSH"' "$BIND_FILE" || fail "merge dropped the personal bind"
grep -q 'o.bind("SUPER + CTRL + M", "Snippets", "omarchy-shell shell toggle kewah.snippet-manager")' "$BIND_FILE" || fail "merge did not append the snippets bind"
grep -q 'hl.unbind' "$BIND_FILE" && fail "merge inserted an unbind" || true

pass "merge inserts fragments without wiping Quicklinks or personal binds"

before_menu=$(cat "$MENU_FILE")
before_bind=$(cat "$BIND_FILE")
"$INSTALLER" --menu-file "$MENU_FILE" --bind-file "$BIND_FILE"
after_menu=$(cat "$MENU_FILE")
after_bind=$(cat "$BIND_FILE")
assert_equal "$before_menu" "$after_menu" "re-run must not change the menu file"
assert_equal "$before_bind" "$after_bind" "re-run must not change the bind file"
snippet_keys=$(grep -c '"trigger.snippets"' "$MENU_FILE")
assert_equal "1" "$snippet_keys" "re-run must not duplicate trigger.snippets"

pass "re-run is a no-op"

if [[ -f $PACKAGED ]]; then
  packaged_before=$(sha256sum "$PACKAGED")
  if "$INSTALLER" --menu-file "$PACKAGED" --bind-file "$BIND_FILE"; then
    fail "installer must refuse a packaged Omarchy path"
  fi
  packaged_after=$(sha256sum "$PACKAGED")
  assert_equal "$packaged_before" "$packaged_after" "installer must not modify packaged Omarchy files"
  pass "refuses packaged Omarchy paths"
else
  pass "skips packaged Omarchy path check when host has no packaged menu"
fi

real_menu="${XDG_CONFIG_HOME:-$HOME/.config}/omarchy/extensions/omarchy-menu.jsonc"
if [[ -f $real_menu ]]; then
  real_before=$(wc -c <"$real_menu")
  "$INSTALLER" --menu-file "$MENU_FILE" --bind-file "$BIND_FILE"
  real_after=$(wc -c <"$real_menu")
  assert_equal "$real_before" "$real_after" "tests must not write the user menu file"
fi

pass "tests do not write the user menu file"

printf '1..%s\n' "$pass_count"
