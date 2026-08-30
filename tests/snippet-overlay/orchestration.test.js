const test = require("node:test")
const assert = require("node:assert/strict")

const SnippetCatalog = require("../../lib/SnippetCatalog.js")
const OverlayModel = require("../../lib/SnippetOverlayModel.js")

const ID = "550e8400-e29b-41d4-a716-446655440000"
const TIMESTAMP = "2026-08-29T12:00:00.000Z"

function validCatalog() {
  return {
    schemaVersion: 1,
    snippets: [
      {
        id: ID,
        title: "Support email",
        keywords: ["support"],
        content: "support@example.com",
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      },
    ],
  }
}

test("storeReadEvent parses successful stdout through SnippetCatalog", () => {
  const event = OverlayModel.storeReadEvent(0, JSON.stringify(validCatalog()), SnippetCatalog)

  assert.equal(event.type, "LOAD_SUCCEEDED")
  assert.deepEqual(event.catalog, validCatalog())
})

test("storeReadEvent reports invalid successful output without echoing it", () => {
  const raw = "{private-malformed-content"

  const event = OverlayModel.storeReadEvent(0, raw, SnippetCatalog)
  const loading = OverlayModel.openedState()
  const result = OverlayModel.transition(loading, event, SnippetCatalog)

  assert.deepEqual(event, { type: "LOAD_FAILED", code: "INVALID_JSON" })
  assert.equal(result.state.mode, "load-error")
  assert.equal(result.state.errorMessage.includes("private"), false)
})

test("storeReadEvent maps store statuses without accepting stderr text", () => {
  const expected = new Map([
    [3, "INVALID_JSON"],
    [4, "UNSUPPORTED_SCHEMA"],
    [5, "INVALID_CATALOG"],
    [6, "IO_ERROR"],
    [127, "IO_ERROR"],
  ])

  for (const [status, code] of expected) {
    const event = OverlayModel.storeReadEvent(status, "ignored stdout", SnippetCatalog)
    assert.deepEqual(event, { type: "LOAD_FAILED", code })
    assert.equal(JSON.stringify(event).includes("stdout"), false)
    assert.equal(JSON.stringify(event).includes("stderr"), false)
  }
})

test("processCommand builds a fixed read argv without catalog content", () => {
  const command = OverlayModel.processCommand({ type: "READ_STORE" }, "/plugin/bin/snippet-store")

  assert.deepEqual(command, ["/plugin/bin/snippet-store", "read"])
  assert.equal(OverlayModel.processCommand({ type: "DISMISS" }, "/store"), null)
  assert.equal(OverlayModel.processCommand({ type: "READ_STORE" }, ""), null)
})

test("createIdEvent accepts only a kernel UUID v4 and canonical timestamp", () => {
  assert.deepEqual(OverlayModel.createIdEvent(0, ID + "\n", TIMESTAMP, 11), {
    type: "CREATE_ID_GENERATED",
    id: ID,
    now: TIMESTAMP,
    operationId: 11,
  })
  assert.deepEqual(OverlayModel.createIdEvent(1, ID, TIMESTAMP, 11), {
    type: "CREATE_ID_FAILED",
    operationId: 11,
  })
  assert.deepEqual(OverlayModel.createIdEvent(0, "not-a-uuid", TIMESTAMP, 11), {
    type: "CREATE_ID_FAILED",
    operationId: 11,
  })
  assert.deepEqual(OverlayModel.createIdEvent(0, ID, "not-a-time", 11), {
    type: "CREATE_ID_FAILED",
    operationId: 11,
  })
})

test("reconcileReadEvent preserves operation identity without leaking output", () => {
  const succeeded = OverlayModel.reconcileReadEvent(
    0,
    JSON.stringify(validCatalog()),
    91,
    SnippetCatalog
  )
  const failed = OverlayModel.reconcileReadEvent(6, "private output", 91, SnippetCatalog)

  assert.equal(succeeded.type, "RECONCILE_SUCCEEDED")
  assert.equal(succeeded.operationId, 91)
  assert.deepEqual(succeeded.catalog, validCatalog())
  assert.deepEqual(failed, {
    type: "RECONCILE_FAILED",
    operationId: 91,
    code: "IO_ERROR",
  })
})

test("storeWriteEvent exposes only success or a fixed write failure", () => {
  assert.deepEqual(OverlayModel.storeWriteEvent(0, 12), {
    type: "WRITE_SUCCEEDED",
    operationId: 12,
  })
  assert.deepEqual(OverlayModel.storeWriteEvent(3, 12, "private stderr"), {
    type: "WRITE_FAILED",
    operationId: 12,
  })
  assert.deepEqual(OverlayModel.storeWriteEvent(6, 12, "private stderr"), {
    type: "WRITE_FAILED",
    operationId: 12,
  })
})

test("SELECT_INDEX changes selection by stable result ID and bounds input", () => {
  const records = [
    validCatalog().snippets[0],
    {
      ...validCatalog().snippets[0],
      id: "6ba7b810-9dad-41d1-80b4-00c04fd430c8",
      title: "Second",
    },
  ]
  const loading = OverlayModel.openedState()
  const state = OverlayModel.transition(
    loading,
    {
      type: "LOAD_SUCCEEDED",
      catalog: { schemaVersion: 1, snippets: records },
    },
    SnippetCatalog
  ).state

  const selected = OverlayModel.transition(
    state,
    {
      type: "SELECT_INDEX",
      index: 1,
    },
    SnippetCatalog
  )
  const outOfRange = OverlayModel.transition(
    state,
    {
      type: "SELECT_INDEX",
      index: 99,
    },
    SnippetCatalog
  )

  assert.equal(selected.state.selectedId, state.results[1].id)
  assert.equal(outOfRange.state.selectedId, state.selectedId)
})
