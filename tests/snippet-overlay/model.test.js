const test = require("node:test")
const assert = require("node:assert/strict")

const SnippetCatalog = require("../../lib/SnippetCatalog.js")
const OverlayModel = require("../../lib/SnippetOverlayModel.js")

const CREATED_AT = "2026-08-29T12:00:00.000Z"

function snippet(index, overrides = {}) {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    title: `Snippet ${index}`,
    keywords: [],
    content: `Content ${index}`,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides
  }
}

function catalog(records) {
  return { schemaVersion: 1, snippets: records }
}

function transition(state, event) {
  return OverlayModel.transition(state, event, SnippetCatalog)
}

function loaded(records) {
  const opened = transition(OverlayModel.initialState(), { type: "OPEN" })
  return transition(opened.state, {
    type: "LOAD_SUCCEEDED",
    catalog: catalog(records)
  }).state
}

test("initialState starts closed without transient catalog or selection", () => {
  assert.deepEqual(OverlayModel.initialState(), {
    mode: "closed",
    query: "",
    catalog: null,
    results: [],
    selectedId: null,
    errorMessage: "",
    busy: false
  })
})

test("OPEN enters loading and requests a storage read without mutating prior state", () => {
  const state = OverlayModel.initialState()
  const original = structuredClone(state)

  const result = transition(state, { type: "OPEN" })

  assert.deepEqual(state, original)
  assert.equal(result.state.mode, "loading")
  assert.deepEqual(result.effects, [{ type: "READ_STORE" }])
})

test("LOAD_SUCCEEDED enters search with catalog-ranked results and first selection", () => {
  const state = transition(OverlayModel.initialState(), { type: "OPEN" }).state
  const source = catalog([
    snippet(2, { title: "Zulu" }),
    snippet(1, { title: "Alpha" })
  ])

  const result = transition(state, { type: "LOAD_SUCCEEDED", catalog: source })

  assert.equal(result.state.mode, "search")
  assert.deepEqual(result.state.results.map((record) => record.id), [snippet(1).id, snippet(2).id])
  assert.equal(result.state.selectedId, snippet(1).id)
  assert.deepEqual(result.effects, [])
})

test("LOAD_SUCCEEDED keeps an empty catalog distinct from a load failure", () => {
  const loading = transition(OverlayModel.initialState(), { type: "OPEN" }).state

  const empty = transition(loading, {
    type: "LOAD_SUCCEEDED",
    catalog: catalog([])
  })
  const failed = transition(loading, {
    type: "LOAD_FAILED",
    code: "INVALID_JSON",
    detail: "{private-content"
  })

  assert.equal(empty.state.mode, "search")
  assert.deepEqual(empty.state.results, [])
  assert.equal(empty.state.selectedId, null)
  assert.equal(failed.state.mode, "load-error")
  assert.equal(failed.state.catalog, null)
  assert.equal(failed.state.errorMessage, "Snippet catalog contains invalid JSON")
  assert.equal(failed.state.errorMessage.includes("private-content"), false)
})

test("load errors use a fixed allowlist and RETRY requests a fresh read", () => {
  const loading = OverlayModel.openedState()
  const unsupported = transition(loading, { type: "LOAD_FAILED", code: "UNSUPPORTED_SCHEMA" })
  const unknown = transition(loading, { type: "LOAD_FAILED", code: "untrusted-error-text" })
  const retried = transition(unknown.state, { type: "RETRY_LOAD" })

  assert.equal(unsupported.state.errorMessage, "Snippet catalog format is unsupported")
  assert.equal(unknown.state.errorMessage, "Unable to read snippet catalog")
  assert.equal(unknown.state.errorMessage.includes("untrusted"), false)
  assert.equal(retried.state.mode, "loading")
  assert.equal(retried.state.errorMessage, "")
  assert.deepEqual(retried.effects, [{ type: "READ_STORE" }])
})

test("SET_QUERY delegates ranking to the catalog and selects the first result", () => {
  const state = loaded([
    snippet(1, { title: "Support reply", content: "Hello customer" }),
    snippet(2, { title: "Greeting", keywords: ["support"], content: "Hello customer" }),
    snippet(3, { title: "Other", content: "No match" })
  ])

  const result = transition(state, { type: "SET_QUERY", query: "support hello" })

  assert.equal(result.state.query, "support hello")
  assert.deepEqual(result.state.results.map((record) => record.id), [snippet(1).id, snippet(2).id])
  assert.equal(result.state.selectedId, snippet(1).id)
})

test("MOVE_SELECTION wraps and stores selection by stable ID", () => {
  const state = loaded([snippet(1), snippet(2), snippet(3)])

  const movedUp = transition(state, { type: "MOVE_SELECTION", delta: -1 })
  const movedDown = transition(movedUp.state, { type: "MOVE_SELECTION", delta: 1 })

  assert.equal(movedUp.state.selectedId, state.results[2].id)
  assert.equal(movedDown.state.selectedId, state.results[0].id)
})

test("page movement clamps while first and last select absolute endpoints", () => {
  const state = loaded(Array.from({ length: 8 }, (_, index) => snippet(index)))
  const selectedMiddle = transition(state, { type: "MOVE_SELECTION", delta: 3 }).state

  const pageDown = transition(selectedMiddle, {
    type: "PAGE_SELECTION",
    direction: 1,
    visibleCount: 3
  })
  const pageUp = transition(pageDown.state, {
    type: "PAGE_SELECTION",
    direction: -1,
    visibleCount: 20
  })
  const last = transition(state, { type: "SELECT_LAST" })
  const first = transition(last.state, { type: "SELECT_FIRST" })

  assert.equal(pageDown.state.selectedId, state.results[6].id)
  assert.equal(pageUp.state.selectedId, state.results[0].id)
  assert.equal(last.state.selectedId, state.results[7].id)
  assert.equal(first.state.selectedId, state.results[0].id)
})

test("navigation without results remains safely unselected", () => {
  const state = loaded([])
  const events = [
    { type: "MOVE_SELECTION", delta: 1 },
    { type: "PAGE_SELECTION", direction: 1, visibleCount: 5 },
    { type: "SELECT_FIRST" },
    { type: "SELECT_LAST" }
  ]

  for (const event of events) {
    const result = transition(state, event)
    assert.equal(result.state.selectedId, null)
    assert.deepEqual(result.effects, [])
  }
})

test("Escape clears a query before it closes and dismisses the overlay", () => {
  const queried = transition(loaded([snippet(1)]), {
    type: "SET_QUERY",
    query: "content"
  }).state

  const cleared = transition(queried, { type: "ESCAPE" })
  const closed = transition(cleared.state, { type: "ESCAPE" })

  assert.equal(cleared.state.mode, "search")
  assert.equal(cleared.state.query, "")
  assert.deepEqual(cleared.effects, [])
  assert.deepEqual(closed.state, OverlayModel.initialState())
  assert.deepEqual(closed.effects, [{ type: "DISMISS" }])
})

test("transfer requests close before dispatching detached exact content", () => {
  const state = loaded([
    snippet(1, { content: "Exact 👋\r\nmultiline\n" })
  ])

  const pasted = transition(state, { type: "REQUEST_TRANSFER", kind: "PASTE" })
  const copied = transition(state, { type: "REQUEST_TRANSFER", kind: "COPY" })

  for (const result of [pasted, copied]) {
    assert.deepEqual(result.state, OverlayModel.initialState())
    assert.equal(result.effects[0].type, "DISMISS")
    assert.equal(result.effects[1].type, "DISPATCH_TRANSFER")
    assert.deepEqual(Object.keys(result.effects[1].payload.snippet), ["id", "content"])
    assert.equal(result.effects[1].payload.snippet.content, "Exact 👋\r\nmultiline\n")
    assert.notEqual(result.effects[1].payload.snippet, state.results[0])
  }
  assert.equal(pasted.effects[1].payload.kind, "PASTE")
  assert.equal(copied.effects[1].payload.kind, "COPY")
})

test("transfer requests with no selection or invalid kinds are no-ops", () => {
  const empty = loaded([])
  const withResult = loaded([snippet(1)])

  const absent = transition(empty, { type: "REQUEST_TRANSFER", kind: "PASTE" })
  const invalid = transition(withResult, { type: "REQUEST_TRANSFER", kind: "EXECUTE" })

  assert.deepEqual(absent, { state: empty, effects: [] })
  assert.deepEqual(invalid, { state: withResult, effects: [] })
})

test("previewText creates bounded single-line plain text without splitting Unicode", () => {
  const preview = OverlayModel.previewText("  First\r\nsecond\t😀😀😀😀  ", 16)
  const short = OverlayModel.previewText("<b>plain data</b>", 40)

  assert.equal(preview, "First second 😀😀…")
  assert.equal(Array.from(preview).length, 16)
  assert.equal(preview.includes("\n"), false)
  assert.equal(short, "<b>plain data</b>")
})
