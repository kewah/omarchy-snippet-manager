#!/bin/bash

set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
HELPER="$ROOT_DIR/bin/snippet-transfer"
TEST_ROOT=$(mktemp -d)
trap 'rm -rf "$TEST_ROOT"' EXIT

FAKE_BIN="$TEST_ROOT/bin"
LOG="$TEST_ROOT/log"
mkdir -p "$FAKE_BIN"

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

write_fakes() {
  cat >"$FAKE_BIN/wl-copy" <<'EOF'
#!/bin/bash
printf 'wl-copy argv:%s\n' "$*" >>"$TRANSFER_LOG"
cat >"$TRANSFER_LOG.stdin"
if [[ ${WL_COPY_FAIL:-} == "1" ]]; then
  exit 1
fi
exit 0
EOF

  cat >"$FAKE_BIN/wtype" <<'EOF'
#!/bin/bash
printf 'wtype argv:%s\n' "$*" >>"$TRANSFER_LOG"
if [[ $* == "-" ]]; then
  cat >"$TRANSFER_LOG.wtype-stdin"
fi
if [[ ${WTYPE_FAIL:-} == "1" ]]; then
  exit 1
fi
exit 0
EOF

  cat >"$FAKE_BIN/sleep" <<'EOF'
#!/bin/bash
printf 'sleep argv:%s\n' "$*" >>"$TRANSFER_LOG"
exit 0
EOF

  chmod +x "$FAKE_BIN/wl-copy" "$FAKE_BIN/wtype" "$FAKE_BIN/sleep"
}

write_fakes

export PATH="$FAKE_BIN:/usr/bin:/bin"
export TRANSFER_LOG="$LOG"

[[ $(command -v wl-copy) == "$FAKE_BIN/wl-copy" ]] || fail "tests must resolve wl-copy to the fake binary"
[[ $(command -v wtype) == "$FAKE_BIN/wtype" ]] || fail "tests must resolve wtype to the fake binary"
[[ $(command -v sleep) == "$FAKE_BIN/sleep" ]] || fail "tests must resolve sleep to the fake binary"

[[ -x $HELPER ]] || fail "bin/snippet-transfer must exist and be executable"

run_helper() {
  : >"$LOG"
  : >"$LOG.stdin"
  rm -f "$LOG".wtype-*
  "$HELPER" "$@"
}

CONTENT=$'Exact\r\nUnicode 👋\nline'

set +e
printf '%s' "$CONTENT" | run_helper copy
copy_status=$?
set -e
assert_equal "0" "$copy_status" "copy should succeed"
assert_equal "wl-copy argv:--type text/plain" "$(grep '^wl-copy argv:' "$LOG")" "copy should invoke wl-copy --type text/plain"
assert_equal "$CONTENT" "$(cat "$LOG.stdin")" "copy should pass exact stdin to wl-copy"
! grep -q -- '--sensitive' "$LOG" || fail "copy must not pass --sensitive to wl-copy"
! grep -q '^wtype argv:' "$LOG" || fail "copy must not invoke wtype"
! grep -q '^sleep argv:' "$LOG" || fail "copy must not invoke sleep"
! grep -Fq -- "$CONTENT" <<<"$(tr '\n' ' ' <"$LOG")" || fail "snippet bytes must not appear on helper argv logs"
pass "copy writes exact stdin through wl-copy without --sensitive and skips sleep and wtype"

set +e
printf '' | run_helper copy
empty_status=$?
set -e
[[ $empty_status -ne 0 ]] || fail "empty stdin should fail"
! grep -q '^wl-copy argv:' "$LOG" || fail "empty stdin must not invoke wl-copy"
! grep -q '^wtype argv:' "$LOG" || fail "empty stdin must not invoke wtype"
! grep -q '^sleep argv:' "$LOG" || fail "empty stdin must not invoke sleep"
pass "empty stdin fails without clipboard or paste side effects"

set +e
printf '%s' "$CONTENT" | run_helper explode
unknown_status=$?
set -e
[[ $unknown_status -ne 0 ]] || fail "unknown verb should fail"
! grep -q '^wl-copy argv:' "$LOG" || fail "unknown verb must not invoke wl-copy"
! grep -q '^wtype argv:' "$LOG" || fail "unknown verb must not invoke wtype"
! grep -q '^sleep argv:' "$LOG" || fail "unknown verb must not invoke sleep"
pass "unknown verbs fail without clipboard or paste side effects"

set +e
printf '%s' "$CONTENT" | run_helper paste
paste_status=$?
set -e
assert_equal "0" "$paste_status" "paste should succeed"
mapfile -t events < <(grep -E '^(wl-copy|sleep|wtype) argv:' "$LOG")
assert_equal "3" "${#events[@]}" "paste should invoke wl-copy, sleep, then wtype"
assert_equal "wl-copy argv:--type text/plain --sensitive" "${events[0]}" "paste should invoke wl-copy --type text/plain --sensitive"
assert_equal "sleep argv:0.15" "${events[1]}" "paste should sleep 0.15 after copying"
assert_equal "wtype argv:-M shift -k Insert -m shift" "${events[2]}" "paste should synthesize Shift+Insert"
assert_equal "$CONTENT" "$(cat "$LOG.stdin")" "paste should pass exact stdin to wl-copy"
grep -q -- '--sensitive' "$LOG" || fail "paste must pass --sensitive to wl-copy"
! grep -q 'wtype argv:-$' "$LOG" || fail "paste must not type snippet text through wtype -"
! [[ -f $LOG.wtype-stdin ]] || fail "paste must not pipe snippet bytes to wtype"
! grep -Fq -- "$CONTENT" <<<"$(tr '\n' ' ' <"$LOG")" || fail "snippet bytes must not appear on helper argv logs"
pass "paste copies exact stdin with --sensitive, sleeps, then synthesizes Shift+Insert"

set +e
printf '%s' "$CONTENT" | WL_COPY_FAIL=1 run_helper paste
wl_fail_status=$?
set -e
[[ $wl_fail_status -ne 0 ]] || fail "wl-copy failure should fail paste"
grep -q '^wl-copy argv:' "$LOG" || fail "paste should invoke wl-copy before failing"
! grep -q '^sleep argv:' "$LOG" || fail "wl-copy failure must not invoke sleep"
! grep -q '^wtype argv:' "$LOG" || fail "wl-copy failure must not invoke wtype"
pass "paste fails when wl-copy fails without sleep or wtype"

set +e
printf '%s' "$CONTENT" | WTYPE_FAIL=1 run_helper paste
wtype_fail_status=$?
set -e
[[ $wtype_fail_status -ne 0 ]] || fail "wtype failure should fail paste"
grep -q '^wtype argv:' "$LOG" || fail "paste should invoke wtype before failing"
pass "paste fails when wtype fails"

set +e
printf '%s' "$CONTENT" | run_helper copy
copy_again=$?
set -e
assert_equal "0" "$copy_again" "copy should still succeed after paste exists"
assert_equal "wl-copy argv:--type text/plain" "$(grep '^wl-copy argv:' "$LOG")" "copy must still omit --sensitive"
! grep -q -- '--sensitive' "$LOG" || fail "copy must still omit --sensitive after paste is implemented"
! grep -q '^sleep argv:' "$LOG" || fail "copy must still skip sleep"
! grep -q '^wtype argv:' "$LOG" || fail "copy must still skip wtype"
pass "copy still skips --sensitive, sleep, and wtype after paste is implemented"

printf '%d helper tests passed\n' "$pass_count"
