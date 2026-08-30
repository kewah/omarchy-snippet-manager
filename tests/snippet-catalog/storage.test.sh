#!/bin/bash

set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
STORE="$ROOT_DIR/bin/snippet-store"
TEST_ROOT=$(mktemp -d)
trap 'chmod -R u+rwX "$TEST_ROOT" 2>/dev/null || true; rm -rf "$TEST_ROOT"' EXIT

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

catalog() {
  local id="$1"
  local title="$2"
  jq -n \
    --arg id "$id" \
    --arg title "$title" \
    '{schemaVersion:1,snippets:[{id:$id,title:$title,content:"Exact\r\nUnicode 👋\n",createdAt:"2026-08-28T12:00:00.000Z",updatedAt:"2026-08-28T12:00:00.000Z"}]}'
}

run_store() {
  HOME="$TEST_ROOT/home" XDG_DATA_HOME="$TEST_ROOT/data" "$STORE" "$@"
}

mkdir -p "$TEST_ROOT/home"

expected_empty=$'{\n  "schemaVersion": 1,\n  "snippets": []\n}'
actual_empty=$(run_store read)
assert_equal "$expected_empty" "$actual_empty" "missing storage should read as an empty V1 catalog"
pass "missing storage reads as an empty catalog"

first=$(catalog "550e8400-e29b-41d4-a716-446655440000" "First")
printf '%s\n' "$first" | run_store write
primary="$TEST_ROOT/data/omarchy-snippets/snippets.json"
backup="$primary.bak"
[[ -f $primary ]] || fail "initial write should create the primary catalog"
assert_equal "700" "$(stat -c '%a' "$(dirname "$primary")")" "data directory mode"
assert_equal "600" "$(stat -c '%a' "$primary")" "primary mode"
assert_equal "$first" "$(run_store read)" "read should return the stored catalog"
first_hash=$(sha256sum "$primary" | awk '{print $1}')
[[ ! -e $backup ]] || fail "initial write should not create a backup"
pass "initial write uses the XDG path and approved permissions"

second=$(catalog "6ba7b810-9dad-41d1-80b4-00c04fd430c8" "Second")
printf '%s\n' "$second" | run_store write
assert_equal "$second" "$(run_store read)" "second write should replace the primary"
assert_equal "$first" "$(<"$backup")" "backup should contain the prior catalog"
assert_equal "$first_hash" "$(sha256sum "$backup" | awk '{print $1}')" "backup should preserve exact prior bytes"
assert_equal "600" "$(stat -c '%a' "$backup")" "backup mode"
pass "replacement is atomic and retains one exact backup"

before_invalid=$(sha256sum "$primary" | awk '{print $1}')
set +e
invalid_error=$(printf '{broken-json' | run_store write 2>&1)
invalid_status=$?
set -e
assert_equal "3" "$invalid_status" "invalid JSON exit status"
assert_equal "Snippet catalog is not valid JSON" "$invalid_error" "invalid JSON error"
assert_equal "$before_invalid" "$(sha256sum "$primary" | awk '{print $1}')" "invalid input must not alter primary"
pass "invalid JSON input fails without mutation"

set +e
schema_error=$(printf '%s\n' '{"schemaVersion":2,"snippets":[]}' | run_store write 2>&1)
schema_status=$?
set -e
assert_equal "4" "$schema_status" "unsupported schema exit status"
assert_equal "Unsupported snippet catalog schema" "$schema_error" "unsupported schema error"
assert_equal "$before_invalid" "$(sha256sum "$primary" | awk '{print $1}')" "unsupported input must not alter primary"
pass "unsupported schema input fails distinctly without mutation"

set +e
string_schema_error=$(printf '%s\n' '{"schemaVersion":"1","snippets":[]}' | run_store write 2>&1)
string_schema_status=$?
schema_first_error=$(printf '%s\n' '{"schemaVersion":2,"snippets":"invalid"}' | run_store write 2>&1)
schema_first_status=$?
set -e
assert_equal "4" "$string_schema_status" "string schema version exit status"
assert_equal "Unsupported snippet catalog schema" "$string_schema_error" "string schema version error"
assert_equal "4" "$schema_first_status" "schema-first exit status"
assert_equal "Unsupported snippet catalog schema" "$schema_first_error" "schema-first error"
pass "schema type and version are validated before document structure"

set +e
json_stream_error=$(printf '%s\n%s\n' "$first" "$second" | run_store write 2>&1)
json_stream_status=$?
set -e
assert_equal "3" "$json_stream_status" "JSON stream exit status"
assert_equal "Snippet catalog is not valid JSON" "$json_stream_error" "JSON stream error"
pass "concatenated JSON documents are rejected as invalid JSON"

uuid_v7=$(printf '%s\n' "$first" | jq '.snippets[0].id = "01900000-0000-7000-8000-000000000001"')
set +e
uuid_v7_error=$(printf '%s\n' "$uuid_v7" | run_store write 2>&1)
uuid_v7_status=$?
set -e
assert_equal "5" "$uuid_v7_status" "UUID v7 exit status"
assert_equal "Invalid snippet catalog" "$uuid_v7_error" "UUID v7 error"
pass "persistence accepts only UUID v4 records"

set +e
catalog_error=$(printf '%s\n' '{"schemaVersion":1,"snippets":"invalid"}' | run_store write 2>&1)
catalog_status=$?
set -e
assert_equal "5" "$catalog_status" "invalid catalog exit status"
assert_equal "Invalid snippet catalog" "$catalog_error" "invalid catalog error"
pass "structurally invalid catalog input fails distinctly"

oversized_catalog="$TEST_ROOT/oversized.json"
printf '%s' '{"schemaVersion":1,"snippets":[{"id":"550e8400-e29b-41d4-a716-446655440000","title":"Large","content":"' >"$oversized_catalog"
head -c 10485761 /dev/zero | tr '\0' x >>"$oversized_catalog"
printf '%s\n' '","createdAt":"2026-08-28T12:00:00.000Z","updatedAt":"2026-08-28T12:00:00.000Z"}]}' >>"$oversized_catalog"
set +e
oversized_error=$(run_store write <"$oversized_catalog" 2>&1)
oversized_status=$?
set -e
assert_equal "5" "$oversized_status" "oversized catalog exit status"
assert_equal "Invalid snippet catalog" "$oversized_error" "oversized catalog error"
pass "catalogs larger than 10 MiB are rejected before parsing"

invalid_timestamp=$(printf '%s\n' "$first" | jq '.snippets[0].updatedAt = "2026-99-99T12:00:00.000Z"')
set +e
timestamp_error=$(printf '%s\n' "$invalid_timestamp" | run_store write 2>&1)
timestamp_status=$?
set -e
invalid_hour=$(printf '%s\n' "$first" | jq '.snippets[0].updatedAt = "2026-08-28T24:00:00.000Z"')
invalid_leap_day=$(printf '%s\n' "$first" | jq '.snippets[0].updatedAt = "2026-02-29T12:00:00.000Z"')
invalid_old_year=$(printf '%s\n' "$first" | jq '.snippets[0].updatedAt = "1969-12-31T23:59:59.999Z"')
set +e
printf '%s\n' "$invalid_hour" | run_store write >/dev/null 2>&1
hour_status=$?
printf '%s\n' "$invalid_leap_day" | run_store write >/dev/null 2>&1
leap_day_status=$?
printf '%s\n' "$invalid_old_year" | run_store write >/dev/null 2>&1
old_year_status=$?
set -e
assert_equal "5" "$timestamp_status" "invalid timestamp exit status"
assert_equal "Invalid snippet catalog" "$timestamp_error" "invalid timestamp error"
assert_equal "5" "$hour_status" "hour 24 exit status"
assert_equal "5" "$leap_day_status" "invalid leap day exit status"
assert_equal "5" "$old_year_status" "out-of-range year exit status"
assert_equal "$before_invalid" "$(sha256sum "$primary" | awk '{print $1}')" "invalid timestamp must not alter primary"
pass "semantically invalid timestamps are rejected"

bom_catalog=$(printf '%s\n' "$first" | jq '.snippets[0].content = "﻿"')
set +e
bom_error=$(printf '%s\n' "$bom_catalog" | run_store write 2>&1)
bom_status=$?
set -e
assert_equal "5" "$bom_status" "byte-order-mark whitespace exit status"
assert_equal "Invalid snippet catalog" "$bom_error" "byte-order-mark whitespace error"
pass "persistence matches JavaScript whitespace semantics for U+FEFF"

malformed_root="$TEST_ROOT/malformed-read"
mkdir -p "$malformed_root/home" "$malformed_root/data/omarchy-snippets"
printf '{malformed-primary' >"$malformed_root/data/omarchy-snippets/snippets.json"
set +e
malformed_error=$(HOME="$malformed_root/home" XDG_DATA_HOME="$malformed_root/data" "$STORE" read 2>&1)
malformed_status=$?
set -e
assert_equal "3" "$malformed_status" "malformed primary exit status"
assert_equal "Snippet catalog is not valid JSON" "$malformed_error" "malformed primary error"
pass "malformed primary data is not treated as an empty catalog"

no_jq_bin="$TEST_ROOT/no-jq-bin"
mkdir "$no_jq_bin"
for command_name in mkdir chmod flock cat; do
  ln -s "$(command -v "$command_name")" "$no_jq_bin/$command_name"
done
set +e
missing_jq_error=$(PATH="$no_jq_bin" HOME="$TEST_ROOT/home" XDG_DATA_HOME="$TEST_ROOT/data" "$STORE" read 2>&1)
missing_jq_status=$?
set -e
assert_equal "6" "$missing_jq_status" "missing jq exit status"
assert_equal "Unable to read snippet catalog" "$missing_jq_error" "missing jq error"
pass "missing jq is reported as an I/O failure"

set +e
usage_error=$(run_store read unexpected-argument 2>&1)
usage_status=$?
set -e
assert_equal "2" "$usage_status" "extra argument exit status"
assert_equal "Usage: snippet-store {read|write|restore-backup}" "$usage_error" "extra argument usage error"
pass "extra command arguments are rejected"

data_link_root="$TEST_ROOT/data-dir-link"
mkdir -p "$data_link_root/home" "$data_link_root/data" "$data_link_root/target"
chmod 755 "$data_link_root/target"
ln -s "$data_link_root/target" "$data_link_root/data/omarchy-snippets"
set +e
data_link_error=$(HOME="$data_link_root/home" XDG_DATA_HOME="$data_link_root/data" "$STORE" read 2>&1)
data_link_status=$?
set -e
assert_equal "6" "$data_link_status" "symlinked data directory exit status"
assert_equal "Unable to secure snippet data directory" "$data_link_error" "symlinked data directory error"
assert_equal "755" "$(stat -c '%a' "$data_link_root/target")" "symlink target directory mode"
[[ ! -e $data_link_root/target/.lock ]] || fail "symlink target directory must not receive a lock"
pass "symlinked data directories are rejected without touching their target"

lock_link_root="$TEST_ROOT/lock-link"
lock_link_dir="$lock_link_root/data/omarchy-snippets"
mkdir -p "$lock_link_root/home" "$lock_link_dir"
chmod 700 "$lock_link_dir"
printf '%s' 'do-not-touch' >"$lock_link_root/target"
chmod 644 "$lock_link_root/target"
ln -s "$lock_link_root/target" "$lock_link_dir/.lock"
set +e
lock_link_error=$(HOME="$lock_link_root/home" XDG_DATA_HOME="$lock_link_root/data" "$STORE" read 2>&1)
lock_link_status=$?
set -e
assert_equal "6" "$lock_link_status" "symlinked lock exit status"
assert_equal "Unable to lock snippet catalog" "$lock_link_error" "symlinked lock error"
assert_equal "do-not-touch" "$(<"$lock_link_root/target")" "lock symlink target content"
assert_equal "644" "$(stat -c '%a' "$lock_link_root/target")" "lock symlink target mode"
pass "symlinked lock files are rejected without touching their target"

canonical_root="$TEST_ROOT/canonical-handoff"
mkdir -p "$canonical_root/home"
canonical_file="$canonical_root/catalog.json"
canonical_read_file="$canonical_root/read.json"
CATALOG_JSON="$first" CATALOG_MODULE="$ROOT_DIR/lib/SnippetCatalog.js" node -e '
  const catalog = require(process.env.CATALOG_MODULE)
  const parsed = catalog.parseCatalog(process.env.CATALOG_JSON)
  if (!parsed.ok) process.exit(1)
  const serialized = catalog.serializeCatalog(parsed.value)
  if (!serialized.ok) process.exit(1)
  process.stdout.write(serialized.value)
' >"$canonical_file"
HOME="$canonical_root/home" XDG_DATA_HOME="$canonical_root/data" "$STORE" write <"$canonical_file"
HOME="$canonical_root/home" XDG_DATA_HOME="$canonical_root/data" "$STORE" read >"$canonical_read_file"
assert_equal "$(sha256sum "$canonical_file" | awk '{print $1}')" "$(sha256sum "$canonical_read_file" | awk '{print $1}')" "canonical JavaScript bytes should round-trip through storage"
pass "canonical JavaScript serialization is accepted byte-for-byte from any working directory"

fixture_root="$TEST_ROOT/fixture-499"
mkdir -p "$fixture_root/home"
fixture_file="$fixture_root/catalog.json"
fixture_read_file="$fixture_root/read.json"
CATALOG_MODULE="$ROOT_DIR/lib/SnippetCatalog.js" node -e '
  const catalog = require(process.env.CATALOG_MODULE)
  const timestamp = "2026-08-28T12:00:00.000Z"
  const snippets = Array.from({ length: 499 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    title: `Snippet ${index}`,
    content: `Content ${index}`,
    createdAt: timestamp,
    updatedAt: timestamp
  }))
  const result = catalog.serializeCatalog({ schemaVersion: 1, snippets })
  if (!result.ok) process.exit(1)
  process.stdout.write(result.value)
' >"$fixture_file"
HOME="$fixture_root/home" XDG_DATA_HOME="$fixture_root/data" "$STORE" write <"$fixture_file"
HOME="$fixture_root/home" XDG_DATA_HOME="$fixture_root/data" "$STORE" read >"$fixture_read_file"
assert_equal "$(sha256sum "$fixture_file" | awk '{print $1}')" "$(sha256sum "$fixture_read_file" | awk '{print $1}')" "499-record fixture bytes"
pass "a canonical 499-record catalog persists byte-for-byte"

backup_link_root="$TEST_ROOT/backup-link"
mkdir -p "$backup_link_root/home"
printf '%s\n' "$first" | HOME="$backup_link_root/home" XDG_DATA_HOME="$backup_link_root/data" "$STORE" write
backup_link_dir="$backup_link_root/data/omarchy-snippets"
backup_link_target="$backup_link_root/target"
printf '%s' 'do-not-touch' >"$backup_link_target"
ln -s "$backup_link_target" "$backup_link_dir/snippets.json.bak"
set +e
backup_link_error=$(printf '%s\n' "$second" | HOME="$backup_link_root/home" XDG_DATA_HOME="$backup_link_root/data" "$STORE" write 2>&1)
backup_link_status=$?
set -e
assert_equal "6" "$backup_link_status" "symlinked backup exit status"
assert_equal "Unable to read snippet catalog" "$backup_link_error" "symlinked backup error"
assert_equal "do-not-touch" "$(<"$backup_link_target")" "symlink target must remain unchanged"
assert_equal "$first" "$(<"$backup_link_dir/snippets.json")" "primary must remain unchanged when backup is symlinked"
pass "writes reject symlinked backup paths"

special_root="$TEST_ROOT/special-files"
special_home="$special_root/home"
special_data="$special_root/data"
special_dir="$special_data/omarchy-snippets"
mkdir -p "$special_home" "$special_dir"
ln -s "$special_dir/absent-target" "$special_dir/snippets.json"
set +e
broken_link_error=$(HOME="$special_home" XDG_DATA_HOME="$special_data" "$STORE" read 2>&1)
broken_link_status=$?
set -e
assert_equal "6" "$broken_link_status" "broken symlink exit status"
assert_equal "Unable to read snippet catalog" "$broken_link_error" "broken symlink error"
rm "$special_dir/snippets.json"
mkdir "$special_dir/snippets.json"
set +e
directory_error=$(HOME="$special_home" XDG_DATA_HOME="$special_data" "$STORE" read 2>&1)
directory_status=$?
set -e
assert_equal "6" "$directory_status" "directory primary exit status"
assert_equal "Unable to read snippet catalog" "$directory_error" "directory primary error"
rmdir "$special_dir/snippets.json"
mkfifo "$special_dir/snippets.json"
set +e
fifo_error=$(HOME="$special_home" XDG_DATA_HOME="$special_data" "$STORE" read 2>&1)
fifo_status=$?
set -e
assert_equal "6" "$fifo_status" "FIFO primary exit status"
assert_equal "Unable to read snippet catalog" "$fifo_error" "FIFO primary error"
rm "$special_dir/snippets.json"
live_target="$special_dir/live-target.json"
printf '%s\n' "$first" >"$live_target"
ln -s "$live_target" "$special_dir/snippets.json"
set +e
live_link_error=$(HOME="$special_home" XDG_DATA_HOME="$special_data" "$STORE" read 2>&1)
live_link_status=$?
set -e
assert_equal "6" "$live_link_status" "live symlink exit status"
assert_equal "Unable to read snippet catalog" "$live_link_error" "live symlink error"
pass "non-regular and symlinked catalog paths are reported as I/O failures"

exec 8>"$(dirname "$primary")/.lock"
flock -x 8
lock_output="$TEST_ROOT/locked-read.out"
run_store read >"$lock_output" &
locked_read_pid=$!
lock_observed=false
for _ in $(seq 1 50); do
  kill -0 "$locked_read_pid" 2>/dev/null || fail "read exited before acquiring the catalog lock"
  if find "/proc/$locked_read_pid/fd" -maxdepth 1 -lname "$(dirname "$primary")/.lock" -print -quit 2>/dev/null | grep -q .; then
    lock_observed=true
    break
  fi
  sleep 0.02
done
[[ $lock_observed == "true" ]] || fail "read never opened the catalog lock"
[[ ! -s $lock_output ]] || fail "read produced output while the exclusive lock was held"
flock -u 8
wait "$locked_read_pid"
assert_equal "$second" "$(<"$lock_output")" "locked read should return the catalog after release"
exec 8>&-
pass "reads participate in advisory locking"

relative_root="$TEST_ROOT/relative"
mkdir -p "$relative_root/home"
relative_output=$(cd "$relative_root" && HOME="$relative_root/home" XDG_DATA_HOME="relative/path" "$STORE" read)
assert_equal "$expected_empty" "$relative_output" "relative XDG_DATA_HOME should use the HOME fallback"
[[ ! -e $relative_root/relative ]] || fail "relative XDG_DATA_HOME must not be used"
pass "relative XDG_DATA_HOME is ignored according to the XDG specification"

concurrent_root="$TEST_ROOT/concurrent"
mkdir -p "$concurrent_root/home"
(
  printf '%s\n' "$first" | HOME="$concurrent_root/home" XDG_DATA_HOME="$concurrent_root/data" "$STORE" write
) &
first_pid=$!
(
  printf '%s\n' "$second" | HOME="$concurrent_root/home" XDG_DATA_HOME="$concurrent_root/data" "$STORE" write
) &
second_pid=$!
first_status=0
second_status=0
wait "$first_pid" || first_status=$?
wait "$second_pid" || second_status=$?
assert_equal "0" "$first_status" "first concurrent writer exit status"
assert_equal "0" "$second_status" "second concurrent writer exit status"
concurrent_primary=$(<"$concurrent_root/data/omarchy-snippets/snippets.json")
concurrent_backup=$(<"$concurrent_root/data/omarchy-snippets/snippets.json.bak")
[[ $concurrent_primary == "$first" || $concurrent_primary == "$second" ]] || fail "concurrent primary should be one complete input"
[[ $concurrent_backup == "$first" || $concurrent_backup == "$second" ]] || fail "concurrent backup should be one complete input"
[[ $concurrent_primary != "$concurrent_backup" ]] || fail "concurrent writes should serialize and preserve the prior input"
pass "concurrent writes serialize without partial data"

chmod 000 "$primary"
set +e
io_error=$(run_store read 2>&1)
io_status=$?
set -e
chmod 600 "$primary"
assert_equal "6" "$io_status" "unreadable catalog exit status"
assert_equal "Unable to read snippet catalog" "$io_error" "unreadable catalog error"
pass "I/O failures are not treated as empty catalogs"

recovery_root="$TEST_ROOT/recovery"
recovery_home="$recovery_root/home"
recovery_data="$recovery_root/data"
recovery_dir="$recovery_data/omarchy-snippets"
recovery_primary="$recovery_dir/snippets.json"
recovery_backup="$recovery_primary.bak"
mkdir -p "$recovery_home" "$recovery_dir"
chmod 700 "$recovery_dir"
printf '%s\n' "$first" >"$recovery_backup"
chmod 600 "$recovery_backup"
malformed_bytes='{malformed-primary-with-user-data'
printf '%s' "$malformed_bytes" >"$recovery_primary"
chmod 600 "$recovery_primary"
set +e
blocked_error=$(printf '%s\n' "$second" | HOME="$recovery_home" XDG_DATA_HOME="$recovery_data" "$STORE" write 2>&1)
blocked_status=$?
set -e
assert_equal "3" "$blocked_status" "write against malformed primary exit status"
assert_equal "Snippet catalog is not valid JSON" "$blocked_error" "write against malformed primary error"
assert_equal "$malformed_bytes" "$(<"$recovery_primary")" "blocked write must preserve malformed primary bytes"
pass "normal writes fail closed when the primary is malformed"

HOME="$recovery_home" XDG_DATA_HOME="$recovery_data" "$STORE" restore-backup
assert_equal "$first" "$(<"$recovery_primary")" "restore should install the validated backup"
mapfile -t corrupt_files < <(find "$recovery_dir" -maxdepth 1 -type f -name 'snippets.json.corrupt-*')
assert_equal "1" "${#corrupt_files[@]}" "restore should preserve one corrupt primary"
assert_equal "$malformed_bytes" "$(<"${corrupt_files[0]}")" "preserved corrupt file should retain exact bytes"
assert_equal "600" "$(stat -c '%a' "${corrupt_files[0]}")" "preserved corrupt file mode"
assert_equal "$first" "$(<"$recovery_backup")" "restore should retain the backup"
pass "explicit recovery preserves corruption and restores a validated backup"

bad_backup_root="$TEST_ROOT/bad-backup"
bad_backup_home="$bad_backup_root/home"
bad_backup_data="$bad_backup_root/data"
bad_backup_dir="$bad_backup_data/omarchy-snippets"
mkdir -p "$bad_backup_home" "$bad_backup_dir"
printf '%s' "$malformed_bytes" >"$bad_backup_dir/snippets.json"
printf '{malformed-backup' >"$bad_backup_dir/snippets.json.bak"
chmod 700 "$bad_backup_dir"
chmod 600 "$bad_backup_dir"/*
set +e
bad_backup_error=$(HOME="$bad_backup_home" XDG_DATA_HOME="$bad_backup_data" "$STORE" restore-backup 2>&1)
bad_backup_status=$?
set -e
assert_equal "3" "$bad_backup_status" "malformed backup exit status"
assert_equal "Snippet catalog is not valid JSON" "$bad_backup_error" "malformed backup error"
assert_equal "$malformed_bytes" "$(<"$bad_backup_dir/snippets.json")" "failed restore must preserve primary"
[[ -z $(find "$bad_backup_dir" -maxdepth 1 -name 'snippets.json.corrupt-*' -print -quit) ]] || fail "failed restore must not create a corrupt copy"
pass "malformed backups are rejected before recovery mutation"

unsupported_backup_root="$TEST_ROOT/unsupported-backup"
unsupported_backup_home="$unsupported_backup_root/home"
unsupported_backup_data="$unsupported_backup_root/data"
unsupported_backup_dir="$unsupported_backup_data/omarchy-snippets"
mkdir -p "$unsupported_backup_home" "$unsupported_backup_dir"
printf '%s' "$malformed_bytes" >"$unsupported_backup_dir/snippets.json"
printf '%s\n' '{"schemaVersion":2,"snippets":[]}' >"$unsupported_backup_dir/snippets.json.bak"
chmod 700 "$unsupported_backup_dir"
chmod 600 "$unsupported_backup_dir"/*
set +e
unsupported_backup_error=$(HOME="$unsupported_backup_home" XDG_DATA_HOME="$unsupported_backup_data" "$STORE" restore-backup 2>&1)
unsupported_backup_status=$?
set -e
assert_equal "4" "$unsupported_backup_status" "unsupported backup exit status"
assert_equal "Unsupported snippet catalog schema" "$unsupported_backup_error" "unsupported backup error"
assert_equal "$malformed_bytes" "$(<"$unsupported_backup_dir/snippets.json")" "unsupported restore must preserve primary"
pass "unsupported backup schemas are rejected before recovery mutation"

valid_restore_root="$TEST_ROOT/valid-restore"
valid_restore_home="$valid_restore_root/home"
valid_restore_data="$valid_restore_root/data"
valid_restore_dir="$valid_restore_data/omarchy-snippets"
mkdir -p "$valid_restore_home" "$valid_restore_dir"
printf '%s\n' "$second" >"$valid_restore_dir/snippets.json"
printf '%s\n' "$first" >"$valid_restore_dir/snippets.json.bak"
chmod 700 "$valid_restore_dir"
chmod 600 "$valid_restore_dir"/*
set +e
valid_restore_error=$(HOME="$valid_restore_home" XDG_DATA_HOME="$valid_restore_data" "$STORE" restore-backup 2>&1)
valid_restore_status=$?
set -e
assert_equal "6" "$valid_restore_status" "valid primary restore exit status"
assert_equal "Refusing to overwrite a valid snippet catalog" "$valid_restore_error" "valid primary restore error"
assert_equal "$second" "$(<"$valid_restore_dir/snippets.json")" "refused restore must preserve valid primary"
assert_equal "$first" "$(<"$valid_restore_dir/snippets.json.bak")" "refused restore must preserve backup"
pass "recovery refuses to overwrite a valid primary"

date_failure_root="$TEST_ROOT/date-failure"
date_failure_home="$date_failure_root/home"
date_failure_data="$date_failure_root/data"
date_failure_dir="$date_failure_data/omarchy-snippets"
fake_bin="$date_failure_root/bin"
mkdir -p "$date_failure_home" "$date_failure_dir" "$fake_bin"
printf '%s' "$malformed_bytes" >"$date_failure_dir/snippets.json"
printf '%s\n' "$first" >"$date_failure_dir/snippets.json.bak"
printf '%s\n' '#!/bin/sh' 'exit 1' >"$fake_bin/date"
chmod 700 "$date_failure_dir" "$fake_bin/date"
chmod 600 "$date_failure_dir"/*
set +e
date_failure_error=$(PATH="$fake_bin:$PATH" HOME="$date_failure_home" XDG_DATA_HOME="$date_failure_data" "$STORE" restore-backup 2>&1)
date_failure_status=$?
set -e
assert_equal "6" "$date_failure_status" "date failure exit status"
assert_equal "Unable to timestamp preserved snippet catalog" "$date_failure_error" "date failure error"
assert_equal "$malformed_bytes" "$(<"$date_failure_dir/snippets.json")" "date failure must preserve primary"
pass "recovery maps timestamp command failures to I/O"

printf '1..%d\n' "$pass_count"
