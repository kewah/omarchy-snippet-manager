const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const Transfer = require("../../lib/SnippetTransfer.js")

const ID = "550e8400-e29b-41d4-a716-446655440000"
const CONTENT = "support@example.com"
const MULTILINE = "Exact\r\nUnicode 👋\nline"

function payload(kind, content) {
  return {
    kind: kind,
    snippet: { id: ID, content: content }
  }
}

test("PASTE plans expose only the paste verb and exact stdin content", () => {
  const result = Transfer.transferPlan(payload("PASTE", CONTENT))
  assert.equal(result.ok, true)
  assert.deepEqual(result.value.argv, ["paste"])
  assert.equal(result.value.stdin, CONTENT)
})

test("COPY plans expose only the copy verb and exact stdin content", () => {
  const result = Transfer.transferPlan(payload("COPY", MULTILINE))
  assert.equal(result.ok, true)
  assert.deepEqual(result.value.argv, ["copy"])
  assert.equal(result.value.stdin, MULTILINE)
})

test("Unicode, newlines, and CRLF survive as exact stdin bytes", () => {
  const result = Transfer.transferPlan(payload("PASTE", MULTILINE))
  assert.equal(result.ok, true)
  assert.equal(result.value.stdin, MULTILINE)
  assert.equal(result.value.stdin.includes("\r\n"), true)
  assert.equal(result.value.stdin.includes("👋"), true)
})

test("invalid kind, missing snippet, and non-string content are INVALID_TRANSFER", () => {
  const cases = [
    Transfer.transferPlan(null),
    Transfer.transferPlan({ kind: "EXECUTE", snippet: { id: ID, content: CONTENT } }),
    Transfer.transferPlan({ kind: "PASTE" }),
    Transfer.transferPlan({ kind: "PASTE", snippet: { id: ID } }),
    Transfer.transferPlan({ kind: "COPY", snippet: { id: ID, content: 12 } })
  ]

  for (const result of cases) {
    assert.equal(result.ok, false)
    assert.equal(result.error.code, "INVALID_TRANSFER")
    assert.equal(result.error.message, "Transfer request was invalid")
    assert.equal(result.value, undefined)
  }
})

test("errors never include snippet content", () => {
  const secret = "super-secret-snippet-body"
  const result = Transfer.transferPlan({
    kind: "EXECUTE",
    snippet: { id: ID, content: secret }
  })
  assert.equal(result.ok, false)
  assert.equal(JSON.stringify(result).includes(secret), false)
  assert.equal(result.error.message.includes(secret), false)
})

test("planner source does not load the catalog or snippet-store", () => {
  const source = fs.readFileSync(path.join(__dirname, "../../lib/SnippetTransfer.js"), "utf8")
  assert.equal(source.includes("SnippetCatalog"), false)
  assert.equal(source.includes("snippet-store"), false)
})

test("helperCommand uses helper path and allowlisted verb only", () => {
  const plan = Transfer.transferPlan(payload("PASTE", MULTILINE))
  const command = Transfer.helperCommand("/plugin/bin/snippet-transfer", plan.value)
  assert.deepEqual(command, ["/plugin/bin/snippet-transfer", "paste"])
  assert.equal(command.join(" ").includes(MULTILINE), false)

  const copy = Transfer.transferPlan(payload("COPY", CONTENT))
  assert.deepEqual(
    Transfer.helperCommand("/plugin/bin/snippet-transfer", copy.value),
    ["/plugin/bin/snippet-transfer", "copy"]
  )
})

test("toastCommand uses allowlisted text and never snippet content", () => {
  const secret = "super-secret-snippet-body"
  const invalid = Transfer.toastCommand("INVALID_TRANSFER")
  const spawn = Transfer.toastCommand("SPAWN_FAILED")
  const failed = Transfer.toastCommand("TRANSFER_FAILED")

  assert.deepEqual(invalid, ["omarchy-notification-send", "Transfer request was invalid"])
  assert.deepEqual(spawn, ["omarchy-notification-send", "Unable to transfer snippet"])
  assert.deepEqual(failed, ["omarchy-notification-send", "Unable to transfer snippet"])
  assert.equal(Transfer.toastCommand("UNKNOWN"), null)

  const serialized = JSON.stringify([invalid, spawn, failed])
  assert.equal(serialized.includes(secret), false)
  assert.equal(serialized.includes(ID), false)
})

test("helperCommand is a no-op without a valid path or plan", () => {
  const plan = Transfer.transferPlan(payload("PASTE", CONTENT))
  assert.equal(Transfer.helperCommand("", plan.value), null)
  assert.equal(Transfer.helperCommand("/plugin/bin/snippet-transfer", null), null)
  assert.equal(Transfer.helperCommand("/plugin/bin/snippet-transfer", { argv: ["explode"], stdin: CONTENT }), null)
  assert.equal(Transfer.helperCommand("/plugin/bin/snippet-transfer", { argv: ["paste"] }), null)
})
