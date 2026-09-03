const test = require("node:test")
const assert = require("node:assert/strict")

const SnippetCatalog = require("../../lib/SnippetCatalog.js")
const OverlayModel = require("../../lib/SnippetOverlayModel.js")

const CREATED_AT = "2026-08-29T12:00:00.000Z"
const ID_ONE = "550e8400-e29b-41d4-a716-446655440000"

function snippet(index, overrides = {}) {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    title: `Snippet ${index}`,
    content: `Content ${index}`,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
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
    catalog: catalog(records),
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
    busy: false,
    draft: null,
    fieldErrors: {},
    focusField: "",
    returnSearch: null,
    pendingIntent: null,
    targetId: null,
    confirmAction: "",
    operationId: 0,
    reconcileStatus: "",
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

test("LOAD_SUCCEEDED enters search with last-used then catalog order", () => {
  const state = transition(OverlayModel.initialState(), { type: "OPEN" }).state
  const source = catalog([
    snippet(2, { title: "Zulu" }),
    snippet(1, { title: "Alpha", lastUsedAt: "2026-08-29T13:00:00.000Z" }),
  ])

  const result = transition(state, { type: "LOAD_SUCCEEDED", catalog: source })

  assert.equal(result.state.mode, "search")
  assert.deepEqual(
    result.state.results.map((record) => record.id),
    [snippet(1).id, snippet(2).id]
  )
  assert.equal(result.state.selectedId, snippet(1).id)
  assert.deepEqual(result.effects, [])
})

test("LOAD_SUCCEEDED keeps an empty catalog distinct from a load failure", () => {
  const loading = transition(OverlayModel.initialState(), {
    type: "OPEN",
  }).state

  const empty = transition(loading, {
    type: "LOAD_SUCCEEDED",
    catalog: catalog([]),
  })
  const failed = transition(loading, {
    type: "LOAD_FAILED",
    code: "INVALID_JSON",
    detail: "{private-content",
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
  const unsupported = transition(loading, {
    type: "LOAD_FAILED",
    code: "UNSUPPORTED_SCHEMA",
  })
  const unknown = transition(loading, {
    type: "LOAD_FAILED",
    code: "untrusted-error-text",
  })
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
    snippet(2, {
      title: "Greeting",
      content: "Support hello customer",
    }),
    snippet(3, { title: "Other", content: "No match" }),
  ])

  const result = transition(state, {
    type: "SET_QUERY",
    query: "support hello",
  })

  assert.equal(result.state.query, "support hello")
  assert.deepEqual(
    result.state.results.map((record) => record.id),
    [snippet(1).id, snippet(2).id]
  )
  assert.equal(result.state.selectedId, snippet(1).id)
})

test("MOVE_SELECTION wraps and stores selection by stable ID", () => {
  const state = loaded([snippet(1), snippet(2), snippet(3)])

  const movedUp = transition(state, { type: "MOVE_SELECTION", delta: -1 })
  const movedDown = transition(movedUp.state, {
    type: "MOVE_SELECTION",
    delta: 1,
  })

  assert.equal(movedUp.state.selectedId, state.results[2].id)
  assert.equal(movedDown.state.selectedId, state.results[0].id)
})

test("page movement clamps while first and last select absolute endpoints", () => {
  const state = loaded(Array.from({ length: 8 }, (_, index) => snippet(index)))
  const selectedMiddle = transition(state, {
    type: "MOVE_SELECTION",
    delta: 3,
  }).state

  const pageDown = transition(selectedMiddle, {
    type: "PAGE_SELECTION",
    direction: 1,
    visibleCount: 3,
  })
  const pageUp = transition(pageDown.state, {
    type: "PAGE_SELECTION",
    direction: -1,
    visibleCount: 20,
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
    { type: "SELECT_LAST" },
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
    query: "content",
  }).state

  const cleared = transition(queried, { type: "ESCAPE" })
  const closed = transition(cleared.state, { type: "ESCAPE" })

  assert.equal(cleared.state.mode, "search")
  assert.equal(cleared.state.query, "")
  assert.deepEqual(cleared.effects, [])
  assert.deepEqual(closed.state, OverlayModel.initialState())
  assert.deepEqual(closed.effects, [{ type: "DISMISS" }])
})

test("transfer requests persist lastUsedAt then dismiss and dispatch detached content", () => {
  const usedAt = "2026-08-29T16:00:00.000Z"
  const state = loaded([snippet(1, { content: "Exact 👋\r\nmultiline\n" })])

  const pasted = transition(state, { type: "REQUEST_TRANSFER", kind: "PASTE", now: usedAt })
  const copied = transition(state, { type: "REQUEST_TRANSFER", kind: "COPY", now: usedAt })

  for (const result of [pasted, copied]) {
    assert.deepEqual(result.state, OverlayModel.initialState())
    assert.equal(result.effects[0].type, "WRITE_STORE")
    const written = JSON.parse(result.effects[0].payload)
    assert.equal(written.snippets[0].lastUsedAt, usedAt)
    assert.equal(written.snippets[0].updatedAt, CREATED_AT)
    assert.equal(written.snippets[0].content, "Exact 👋\r\nmultiline\n")
    assert.equal(result.effects[1].type, "DISMISS")
    assert.equal(result.effects[2].type, "DISPATCH_TRANSFER")
    assert.deepEqual(Object.keys(result.effects[2].payload.snippet), ["id", "content"])
    assert.equal(result.effects[2].payload.snippet.content, "Exact 👋\r\nmultiline\n")
    assert.notEqual(result.effects[2].payload.snippet, state.results[0])
  }
  assert.equal(pasted.effects[2].payload.kind, "PASTE")
  assert.equal(copied.effects[2].payload.kind, "COPY")
})

test("transfer still dispatches when lastUsedAt cannot be recorded", () => {
  const state = loaded([snippet(1)])

  const result = transition(state, { type: "REQUEST_TRANSFER", kind: "PASTE", now: "not-a-time" })

  assert.deepEqual(result.state, OverlayModel.initialState())
  assert.equal(result.effects[0].type, "DISMISS")
  assert.equal(result.effects[1].type, "DISPATCH_TRANSFER")
})

test("transfer requests with no selection or invalid kinds are no-ops", () => {
  const empty = loaded([])
  const withResult = loaded([snippet(1)])

  const absent = transition(empty, { type: "REQUEST_TRANSFER", kind: "PASTE" })
  const invalid = transition(withResult, {
    type: "REQUEST_TRANSFER",
    kind: "EXECUTE",
  })

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

test("previewText keeps ZWJ emoji sequences as one unit", () => {
  const family = "👨‍👩‍👧‍👦 extra"
  const preview = OverlayModel.previewText(family, 2)

  assert.equal(preview, "👨‍👩‍👧‍👦…")
  assert.equal(preview.includes("👨‍…"), false)
  assert.equal(preview.includes("👨…"), false)
})

test("fittedSize clamps to available space and never returns a non-positive size", () => {
  assert.equal(OverlayModel.fittedSize(875, 800), 800)
  assert.equal(OverlayModel.fittedSize(875, 1000), 875)
  assert.equal(OverlayModel.fittedSize(875, 200), 200)
  assert.equal(OverlayModel.fittedSize(875, -20), 1)
  assert.equal(OverlayModel.fittedSize("wide", "400"), 400)
})

test("OPEN_CREATE starts an empty draft and cancel restores query and selection", () => {
  const searched = transition(loaded([snippet(1), snippet(2)]), {
    type: "SET_QUERY",
    query: "content",
  }).state
  const selected = transition(searched, {
    type: "SELECT_INDEX",
    index: 1,
  }).state

  const opened = transition(selected, { type: "OPEN_CREATE" })
  const canceled = transition(opened.state, { type: "CANCEL_EDITOR" })

  assert.equal(opened.state.mode, "create")
  assert.deepEqual(opened.state.draft, { title: "", content: "" })
  assert.deepEqual(opened.state.returnSearch, {
    query: "content",
    selectedId: selected.selectedId,
  })
  assert.equal(opened.state.focusField, "title")
  assert.equal(canceled.state.mode, "search")
  assert.equal(canceled.state.query, "content")
  assert.equal(canceled.state.selectedId, selected.selectedId)
  assert.deepEqual(canceled.effects, [])
})

test("create drafts update title and content without mutating prior state", () => {
  const create = transition(loaded([]), { type: "OPEN_CREATE" }).state
  const original = structuredClone(create)

  const titled = transition(create, {
    type: "UPDATE_DRAFT",
    field: "title",
    value: "Title",
  }).state
  const content = transition(titled, {
    type: "UPDATE_DRAFT",
    field: "content",
    value: "Line 1\nLine 2 👋",
  }).state

  assert.deepEqual(create, original)
  assert.equal(content.draft.title, "Title")
  assert.equal(content.draft.content, "Line 1\nLine 2 👋")
})

test("SUBMIT_CREATE suppresses duplicates while requesting one kernel identity", () => {
  let state = transition(loaded([]), { type: "OPEN_CREATE" }).state
  state = transition(state, {
    type: "UPDATE_DRAFT",
    field: "title",
    value: "Title",
  }).state
  state = transition(state, {
    type: "UPDATE_DRAFT",
    field: "content",
    value: "Content",
  }).state

  const submitted = transition(state, { type: "SUBMIT_CREATE" })
  const duplicate = transition(submitted.state, { type: "SUBMIT_CREATE" })

  assert.equal(submitted.state.busy, true)
  assert.equal(submitted.state.pendingIntent.kind, "create")
  assert.deepEqual(submitted.effects, [{ type: "GENERATE_CREATE_ID", operationId: 1 }])
  assert.deepEqual(OverlayModel.processCommand(submitted.effects[0], "/store"), [
    "cat",
    "/proc/sys/kernel/random/uuid",
  ])
  assert.deepEqual(duplicate, { state: submitted.state, effects: [] })
})

test("CREATE_ID_GENERATED returns field validation without scheduling a write", () => {
  const create = transition(loaded([]), { type: "OPEN_CREATE" }).state
  const submitted = transition(create, { type: "SUBMIT_CREATE" }).state

  const result = transition(submitted, {
    type: "CREATE_ID_GENERATED",
    id: ID_ONE,
    now: CREATED_AT,
  })

  assert.equal(result.state.mode, "create")
  assert.equal(result.state.busy, false)
  assert.equal(result.state.focusField, "title")
  assert.equal(result.state.fieldErrors.title, "Title must contain between 1 and 120 characters")
  assert.equal(result.state.pendingIntent, null)
  assert.deepEqual(result.effects, [])
})

test("CREATE_ID_FAILED preserves the draft with a safe retryable error", () => {
  let state = transition(loaded([]), { type: "OPEN_CREATE" }).state
  state = transition(state, {
    type: "UPDATE_DRAFT",
    field: "title",
    value: "Private",
  }).state
  state = transition(state, {
    type: "UPDATE_DRAFT",
    field: "content",
    value: "Private content",
  }).state
  state = transition(state, { type: "SUBMIT_CREATE" }).state

  const failed = transition(state, {
    type: "CREATE_ID_FAILED",
    detail: "Private content",
  })

  assert.equal(failed.state.busy, false)
  assert.equal(failed.state.pendingIntent, null)
  assert.equal(failed.state.draft.title, "Private")
  assert.equal(failed.state.errorMessage, "Unable to create snippet")
  assert.equal(failed.state.errorMessage.includes("Private content"), false)
})

test("valid create schedules canonical store bytes without committing memory", () => {
  const source = loaded([])
  let state = transition(source, { type: "OPEN_CREATE" }).state
  state = transition(state, {
    type: "UPDATE_DRAFT",
    field: "title",
    value: "  New title  ",
  }).state
  state = transition(state, {
    type: "UPDATE_DRAFT",
    field: "content",
    value: "Exact\r\ncontent 👋",
  }).state
  state = transition(state, { type: "SUBMIT_CREATE" }).state

  const prepared = transition(state, {
    type: "CREATE_ID_GENERATED",
    id: ID_ONE,
    now: CREATED_AT,
  })

  assert.equal(prepared.state.catalog.snippets.length, 0)
  assert.equal(prepared.state.busy, true)
  assert.equal(prepared.effects.length, 1)
  assert.equal(prepared.effects[0].type, "WRITE_STORE")
  assert.equal(prepared.effects[0].payload.endsWith("\n"), true)
  const parsed = JSON.parse(prepared.effects[0].payload)
  assert.equal(parsed.snippets[0].title, "New title")
  assert.equal(parsed.snippets[0].content, "Exact\r\ncontent 👋")
  assert.deepEqual(OverlayModel.processCommand(prepared.effects[0], "/store"), ["/store", "write"])
})

test("WRITE_SUCCEEDED commits create and selects it with a cleared query", () => {
  let state = transition(loaded([]), { type: "OPEN_CREATE" }).state
  state = transition(state, {
    type: "UPDATE_DRAFT",
    field: "title",
    value: "New",
  }).state
  state = transition(state, {
    type: "UPDATE_DRAFT",
    field: "content",
    value: "Content",
  }).state
  state = transition(state, { type: "SUBMIT_CREATE" }).state
  state = transition(state, {
    type: "CREATE_ID_GENERATED",
    id: ID_ONE,
    now: CREATED_AT,
  }).state

  const saved = transition(state, { type: "WRITE_SUCCEEDED" })

  assert.equal(saved.state.mode, "search")
  assert.equal(saved.state.query, "")
  assert.equal(saved.state.selectedId, ID_ONE)
  assert.equal(saved.state.catalog.snippets.length, 1)
  assert.equal(saved.state.busy, false)
  assert.equal(saved.state.pendingIntent, null)
})

test("WRITE_FAILED preserves the create draft and does not commit pending catalog", () => {
  let state = transition(loaded([]), { type: "OPEN_CREATE" }).state
  state = transition(state, {
    type: "UPDATE_DRAFT",
    field: "title",
    value: "Private title",
  }).state
  state = transition(state, {
    type: "UPDATE_DRAFT",
    field: "content",
    value: "Private content",
  }).state
  state = transition(state, { type: "SUBMIT_CREATE" }).state
  state = transition(state, {
    type: "CREATE_ID_GENERATED",
    id: ID_ONE,
    now: CREATED_AT,
  }).state

  const failed = transition(state, {
    type: "WRITE_FAILED",
    detail: "Private content",
  })

  assert.equal(failed.state.mode, "create")
  assert.equal(failed.state.busy, true)
  assert.equal(failed.state.reconcileStatus, "loading")
  assert.equal(failed.state.draft.title, "Private title")
  assert.equal(failed.state.catalog.snippets.length, 0)
  assert.equal(failed.state.errorMessage, "Unable to confirm snippet save")
  assert.equal(failed.state.errorMessage.includes("Private"), false)
  assert.equal(failed.effects[0].type, "READ_STORE")
  assert.equal(failed.effects[0].purpose, "RECONCILE")
})

test("OPEN_EDIT loads the selected stable ID and cancel restores search", () => {
  const source = loaded([
    snippet(1, {
      title: "Original",
      content: "Line 1\r\nLine 2",
    }),
  ])

  const opened = transition(source, { type: "OPEN_EDIT" })
  const canceled = transition(opened.state, { type: "CANCEL_EDITOR" })

  assert.equal(opened.state.mode, "edit")
  assert.equal(opened.state.targetId, snippet(1).id)
  assert.deepEqual(opened.state.draft, {
    title: "Original",
    content: "Line 1\r\nLine 2",
  })
  assert.equal(canceled.state.mode, "search")
  assert.equal(canceled.state.selectedId, snippet(1).id)
})

test("OPEN_EDIT without a result is a no-op", () => {
  const empty = loaded([])
  assert.deepEqual(transition(empty, { type: "OPEN_EDIT" }), {
    state: empty,
    effects: [],
  })
})

test("SUBMIT_EDIT validates fields and preserves the draft", () => {
  let state = transition(loaded([snippet(1)]), { type: "OPEN_EDIT" }).state
  state = transition(state, {
    type: "UPDATE_DRAFT",
    field: "title",
    value: "   ",
  }).state

  const result = transition(state, {
    type: "SUBMIT_EDIT",
    now: "2026-08-29T13:00:00.000Z",
  })

  assert.equal(result.state.mode, "edit")
  assert.equal(result.state.busy, false)
  assert.equal(result.state.focusField, "title")
  assert.equal(result.state.draft.title, "   ")
  assert.deepEqual(result.effects, [])
})

test("changed edit schedules canonical bytes without committing memory", () => {
  const original = snippet(1)
  let state = transition(loaded([original]), { type: "OPEN_EDIT" }).state
  state = transition(state, {
    type: "UPDATE_DRAFT",
    field: "title",
    value: " Updated ",
  }).state
  state = transition(state, {
    type: "UPDATE_DRAFT",
    field: "content",
    value: "Updated\ncontent",
  }).state

  const prepared = transition(state, {
    type: "SUBMIT_EDIT",
    now: "2026-08-29T13:00:00.000Z",
  })

  assert.equal(prepared.state.catalog.snippets[0].title, original.title)
  assert.equal(prepared.state.busy, true)
  assert.equal(prepared.state.pendingIntent.kind, "edit")
  assert.equal(prepared.state.pendingIntent.id, original.id)
  assert.equal(prepared.effects[0].type, "WRITE_STORE")
  const serialized = JSON.parse(prepared.effects[0].payload)
  assert.equal(serialized.snippets[0].title, "Updated")
  assert.equal(serialized.snippets[0].updatedAt, "2026-08-29T13:00:00.000Z")
})

test("normalization-equivalent edit succeeds without a store write", () => {
  let state = transition(loaded([snippet(1, { title: "Original" })]), {
    type: "OPEN_EDIT",
  }).state
  state = transition(state, {
    type: "UPDATE_DRAFT",
    field: "title",
    value: "  Original  ",
  }).state
  const result = transition(state, {
    type: "SUBMIT_EDIT",
    now: "2026-08-29T13:00:00.000Z",
  })

  assert.equal(result.state.mode, "search")
  assert.equal(result.state.query, "")
  assert.equal(result.state.selectedId, snippet(1).id)
  assert.equal(result.state.catalog.snippets[0].updatedAt, CREATED_AT)
  assert.deepEqual(result.effects, [])
})

test("edit submission and write completion are duplicate-safe", () => {
  let state = transition(loaded([snippet(1)]), { type: "OPEN_EDIT" }).state
  state = transition(state, {
    type: "UPDATE_DRAFT",
    field: "title",
    value: "Changed",
  }).state
  const submitted = transition(state, {
    type: "SUBMIT_EDIT",
    now: "2026-08-29T13:00:00.000Z",
  })
  const duplicate = transition(submitted.state, {
    type: "SUBMIT_EDIT",
    now: "2026-08-29T14:00:00.000Z",
  })
  const saved = transition(submitted.state, { type: "WRITE_SUCCEEDED" })

  assert.deepEqual(duplicate, { state: submitted.state, effects: [] })
  assert.equal(saved.state.mode, "search")
  assert.equal(saved.state.selectedId, snippet(1).id)
  assert.equal(saved.state.catalog.snippets[0].title, "Changed")
  assert.equal(saved.state.catalog.snippets[0].createdAt, CREATED_AT)
  assert.equal(saved.state.catalog.snippets[0].updatedAt, "2026-08-29T13:00:00.000Z")
})

test("OPEN_DELETE defaults to Cancel and preserves the selected title", () => {
  const source = loaded([snippet(1, { title: "Delete me" })])

  const opened = transition(source, { type: "OPEN_DELETE" })

  assert.equal(opened.state.mode, "delete-confirm")
  assert.equal(opened.state.targetId, snippet(1).id)
  assert.equal(opened.state.confirmAction, "cancel")
  assert.equal(opened.state.results[0].title, "Delete me")
  assert.deepEqual(opened.effects, [])
  assert.deepEqual(transition(loaded([]), { type: "OPEN_DELETE" }), {
    state: loaded([]),
    effects: [],
  })
})

test("confirmation movement toggles actions and Escape cancels without effects", () => {
  const source = loaded([snippet(1)])
  const opened = transition(source, { type: "OPEN_DELETE" }).state

  const moved = transition(opened, { type: "MOVE_CONFIRM" })
  const movedBack = transition(moved.state, { type: "MOVE_CONFIRM" })
  const canceled = transition(moved.state, { type: "CANCEL_DELETE" })

  assert.equal(moved.state.confirmAction, "delete")
  assert.equal(movedBack.state.confirmAction, "cancel")
  assert.equal(canceled.state.mode, "search")
  assert.equal(canceled.state.selectedId, snippet(1).id)
  assert.deepEqual(canceled.effects, [])
})

test("confirming the default Cancel action never deletes", () => {
  const opened = transition(loaded([snippet(1)]), { type: "OPEN_DELETE" }).state
  const result = transition(opened, { type: "CONFIRM_DELETE" })

  assert.equal(result.state.mode, "search")
  assert.equal(result.state.catalog.snippets.length, 1)
  assert.deepEqual(result.effects, [])
})

test("confirmed Delete schedules canonical bytes without committing memory", () => {
  let state = loaded([snippet(1), snippet(2)])
  state = transition(state, { type: "SELECT_INDEX", index: 1 }).state
  state = transition(state, { type: "OPEN_DELETE" }).state
  state = transition(state, { type: "MOVE_CONFIRM" }).state

  const prepared = transition(state, { type: "CONFIRM_DELETE" })
  const duplicate = transition(prepared.state, { type: "CONFIRM_DELETE" })

  assert.equal(prepared.state.busy, true)
  assert.equal(prepared.state.catalog.snippets.length, 2)
  assert.equal(prepared.state.pendingIntent.kind, "delete")
  assert.equal(prepared.state.pendingIntent.id, state.targetId)
  assert.equal(prepared.effects[0].type, "WRITE_STORE")
  assert.equal(JSON.parse(prepared.effects[0].payload).snippets.length, 1)
  assert.deepEqual(duplicate, { state: prepared.state, effects: [] })
})

test("successful delete preserves query and selects the same filtered index", () => {
  let state = loaded([
    snippet(1, { title: "Alpha target" }),
    snippet(2, { title: "Beta target" }),
    snippet(3, { title: "Gamma target" }),
  ])
  state = transition(state, { type: "SET_QUERY", query: "target" }).state
  state = transition(state, { type: "SELECT_INDEX", index: 1 }).state
  const deletedId = state.selectedId
  state = transition(state, { type: "OPEN_DELETE" }).state
  state = transition(state, { type: "MOVE_CONFIRM" }).state
  state = transition(state, { type: "CONFIRM_DELETE" }).state

  const saved = transition(state, { type: "WRITE_SUCCEEDED" })

  assert.equal(saved.state.mode, "search")
  assert.equal(saved.state.query, "target")
  assert.equal(saved.state.results.length, 2)
  assert.equal(
    saved.state.results.some((record) => record.id === deletedId),
    false
  )
  assert.equal(saved.state.selectedId, snippet(3).id)
})

test("deleting the last result selects its predecessor and deleting all clears selection", () => {
  let two = loaded([snippet(1, { title: "Alpha" }), snippet(2, { title: "Beta" })])
  two = transition(two, { type: "SELECT_LAST" }).state
  two = transition(two, { type: "OPEN_DELETE" }).state
  two = transition(two, { type: "MOVE_CONFIRM" }).state
  two = transition(two, { type: "CONFIRM_DELETE" }).state
  const oneLeft = transition(two, { type: "WRITE_SUCCEEDED" }).state

  let one = transition(oneLeft, { type: "OPEN_DELETE" }).state
  one = transition(one, { type: "MOVE_CONFIRM" }).state
  one = transition(one, { type: "CONFIRM_DELETE" }).state
  const empty = transition(one, { type: "WRITE_SUCCEEDED" }).state

  assert.equal(oneLeft.selectedId, snippet(1).id)
  assert.equal(empty.results.length, 0)
  assert.equal(empty.selectedId, null)
})

test("failed delete retains confirmation intent and safe error", () => {
  let state = transition(loaded([snippet(1)]), { type: "OPEN_DELETE" }).state
  state = transition(state, { type: "MOVE_CONFIRM" }).state
  state = transition(state, { type: "CONFIRM_DELETE" }).state

  const failed = transition(state, {
    type: "WRITE_FAILED",
    detail: "private snippet",
  })

  assert.equal(failed.state.mode, "delete-confirm")
  assert.equal(failed.state.busy, true)
  assert.equal(failed.state.reconcileStatus, "loading")
  assert.equal(failed.state.catalog.snippets.length, 1)
  assert.equal(failed.state.confirmAction, "delete")
  assert.equal(failed.state.errorMessage, "Unable to confirm snippet save")
  assert.equal(failed.state.errorMessage.includes("private"), false)
})

test("exact reloaded create result resolves an unknown write as success", () => {
  let state = transition(loaded([]), { type: "OPEN_CREATE" }).state
  state = transition(state, {
    type: "UPDATE_DRAFT",
    field: "title",
    value: "Created",
  }).state
  state = transition(state, {
    type: "UPDATE_DRAFT",
    field: "content",
    value: "Content",
  }).state
  state = transition(state, { type: "SUBMIT_CREATE", operationId: 41 }).state
  state = transition(state, {
    type: "CREATE_ID_GENERATED",
    operationId: 41,
    id: ID_ONE,
    now: CREATED_AT,
  }).state
  const intendedCatalog = state.pendingIntent.nextCatalog
  state = transition(state, { type: "WRITE_FAILED", operationId: 41 }).state

  const reconciled = transition(state, {
    type: "RECONCILE_SUCCEEDED",
    operationId: 41,
    catalog: intendedCatalog,
  })

  assert.equal(reconciled.state.mode, "search")
  assert.equal(reconciled.state.selectedId, ID_ONE)
  assert.equal(reconciled.state.catalog.snippets.length, 1)
  assert.equal(reconciled.state.pendingIntent, null)
})

test("absent reloaded create retries with the same ID and timestamp", () => {
  let state = transition(loaded([]), { type: "OPEN_CREATE" }).state
  state = transition(state, {
    type: "UPDATE_DRAFT",
    field: "title",
    value: "Created",
  }).state
  state = transition(state, {
    type: "UPDATE_DRAFT",
    field: "content",
    value: "Content",
  }).state
  state = transition(state, { type: "SUBMIT_CREATE", operationId: 42 }).state
  state = transition(state, {
    type: "CREATE_ID_GENERATED",
    operationId: 42,
    id: ID_ONE,
    now: CREATED_AT,
  }).state
  state = transition(state, { type: "WRITE_FAILED", operationId: 42 }).state
  state = transition(state, {
    type: "RECONCILE_SUCCEEDED",
    operationId: 42,
    catalog: { schemaVersion: 1, snippets: [] },
  }).state

  const retried = transition(state, { type: "SUBMIT_CREATE", operationId: 43 })
  const retriedRecord = JSON.parse(retried.effects[0].payload).snippets[0]

  assert.equal(retried.effects[0].type, "WRITE_STORE")
  assert.equal(
    retried.effects.some((effect) => effect.type === "GENERATE_CREATE_ID"),
    false
  )
  assert.equal(retriedRecord.id, ID_ONE)
  assert.equal(retriedRecord.createdAt, CREATED_AT)
  assert.equal(retried.state.pendingIntent.operationId, 43)
})

test("conflicting reloaded create identity requires a newly generated ID", () => {
  let state = transition(loaded([]), { type: "OPEN_CREATE" }).state
  state = transition(state, {
    type: "UPDATE_DRAFT",
    field: "title",
    value: "Created",
  }).state
  state = transition(state, {
    type: "UPDATE_DRAFT",
    field: "content",
    value: "Content",
  }).state
  state = transition(state, { type: "SUBMIT_CREATE", operationId: 44 }).state
  state = transition(state, {
    type: "CREATE_ID_GENERATED",
    operationId: 44,
    id: ID_ONE,
    now: CREATED_AT,
  }).state
  state = transition(state, { type: "WRITE_FAILED", operationId: 44 }).state
  state = transition(state, {
    type: "RECONCILE_SUCCEEDED",
    operationId: 44,
    catalog: {
      schemaVersion: 1,
      snippets: [snippet(9, { id: ID_ONE, title: "Collision" })],
    },
  }).state

  const resubmitted = transition(state, {
    type: "SUBMIT_CREATE",
    operationId: 45,
  })

  assert.equal(state.pendingIntent, null)
  assert.equal(state.errorMessage, "Snippet identity changed; retry with a new identity")
  assert.deepEqual(resubmitted.effects, [{ type: "GENERATE_CREATE_ID", operationId: 45 }])
})

test("edit reconciliation accepts intended values or retains draft against reloaded data", () => {
  let prepared = transition(loaded([snippet(1)]), { type: "OPEN_EDIT" }).state
  prepared = transition(prepared, {
    type: "UPDATE_DRAFT",
    field: "title",
    value: "Edited",
  }).state
  prepared = transition(prepared, {
    type: "SUBMIT_EDIT",
    operationId: 51,
    now: "2026-08-29T13:00:00.000Z",
  }).state
  const intended = prepared.pendingIntent.nextCatalog
  let failed = transition(prepared, {
    type: "WRITE_FAILED",
    operationId: 51,
  }).state

  const applied = transition(failed, {
    type: "RECONCILE_SUCCEEDED",
    operationId: 51,
    catalog: intended,
  })
  const notApplied = transition(failed, {
    type: "RECONCILE_SUCCEEDED",
    operationId: 51,
    catalog: {
      schemaVersion: 1,
      snippets: [snippet(1, { title: "External value" })],
    },
  })

  assert.equal(applied.state.mode, "search")
  assert.equal(applied.state.catalog.snippets[0].title, "Edited")
  assert.equal(notApplied.state.mode, "edit")
  assert.equal(notApplied.state.catalog.snippets[0].title, "External value")
  assert.equal(notApplied.state.draft.title, "Edited")
  assert.equal(notApplied.state.busy, false)
  assert.equal(notApplied.state.reconcileStatus, "")
})

test("delete reconciliation treats absence as success and presence as retryable", () => {
  let prepared = transition(loaded([snippet(1), snippet(2)]), {
    type: "OPEN_DELETE",
  }).state
  prepared = transition(prepared, { type: "MOVE_CONFIRM" }).state
  prepared = transition(prepared, {
    type: "CONFIRM_DELETE",
    operationId: 61,
  }).state
  let failed = transition(prepared, {
    type: "WRITE_FAILED",
    operationId: 61,
  }).state

  const absent = transition(failed, {
    type: "RECONCILE_SUCCEEDED",
    operationId: 61,
    catalog: prepared.pendingIntent.nextCatalog,
  })
  const present = transition(failed, {
    type: "RECONCILE_SUCCEEDED",
    operationId: 61,
    catalog: { schemaVersion: 1, snippets: [snippet(1), snippet(2)] },
  })

  assert.equal(absent.state.mode, "search")
  assert.equal(absent.state.catalog.snippets.length, 1)
  assert.equal(present.state.mode, "delete-confirm")
  assert.equal(present.state.busy, false)
  assert.equal(present.state.confirmAction, "delete")
  assert.equal(present.state.catalog.snippets.length, 2)
})

test("reconciliation reload failure blocks retry but retains intent until cancel", () => {
  let state = transition(loaded([snippet(1)]), { type: "OPEN_EDIT" }).state
  state = transition(state, {
    type: "UPDATE_DRAFT",
    field: "title",
    value: "Retained draft",
  }).state
  state = transition(state, {
    type: "SUBMIT_EDIT",
    operationId: 71,
    now: "2026-08-29T13:00:00.000Z",
  }).state
  state = transition(state, { type: "WRITE_FAILED", operationId: 71 }).state

  const blocked = transition(state, {
    type: "RECONCILE_FAILED",
    operationId: 71,
    code: "IO_ERROR",
  })
  const retry = transition(blocked.state, {
    type: "SUBMIT_EDIT",
    operationId: 72,
    now: "2026-08-29T14:00:00.000Z",
  })
  const canceled = transition(blocked.state, { type: "CANCEL_EDITOR" })

  assert.equal(blocked.state.reconcileStatus, "blocked")
  assert.equal(blocked.state.draft.title, "Retained draft")
  assert.equal(blocked.state.pendingIntent.operationId, 71)
  assert.equal(blocked.state.errorMessage, "Unable to reload snippet catalog")
  assert.deepEqual(retry, { state: blocked.state, effects: [] })
  assert.equal(canceled.state.mode, "load-error")
  assert.equal(canceled.state.catalog, null)
})

test("searchStatus distinguishes empty catalog, no matches, and results", () => {
  const empty = loaded([])
  const queriedEmpty = transition(empty, {
    type: "SET_QUERY",
    query: "support",
  }).state
  const unmatched = transition(loaded([snippet(1)]), {
    type: "SET_QUERY",
    query: "missing",
  }).state
  const matched = loaded([snippet(1)])

  assert.equal(OverlayModel.searchStatus(empty), "empty")
  assert.equal(OverlayModel.searchStatus(queriedEmpty), "empty")
  assert.equal(OverlayModel.searchStatus(unmatched), "no-results")
  assert.equal(OverlayModel.searchStatus(matched), "results")
  assert.equal(OverlayModel.searchStatus(OverlayModel.openedState()), "")
  assert.equal(
    OverlayModel.searchStatus(transition(matched, { type: "OPEN_DELETE" }).state),
    "results"
  )
})

test("showsSearchField hides search only for a true empty catalog", () => {
  assert.equal(OverlayModel.showsSearchField("empty"), false)
  assert.equal(OverlayModel.showsSearchField("no-results"), true)
  assert.equal(OverlayModel.showsSearchField("results"), true)
  assert.equal(OverlayModel.showsSearchField(""), true)
})

test("usesSplitDetail keeps two panes only when the surface is wide enough", () => {
  assert.equal(OverlayModel.usesSplitDetail(560, 560), true)
  assert.equal(OverlayModel.usesSplitDetail(559, 560), false)
  assert.equal(OverlayModel.usesSplitDetail("640"), true)
  assert.equal(OverlayModel.usesSplitDetail("narrow", 560), false)
})

test("shortcutHints name every approved search action", () => {
  const hints = OverlayModel.shortcutHints()
  const expected = [
    OverlayModel.labeledShortcut("Next", "Ctrl+N"),
    OverlayModel.labeledShortcut("Prev", "Ctrl+P"),
    OverlayModel.labeledShortcut("Create", "Ctrl+Shift+N"),
    OverlayModel.labeledShortcut("Edit", "Ctrl+E"),
    OverlayModel.labeledShortcut("Delete", "Ctrl+X"),
    OverlayModel.labeledShortcut("Paste", "Enter"),
    OverlayModel.labeledShortcut("Copy", "Ctrl+Enter"),
  ].join("  ·  ")

  assert.equal(hints, expected)
  assert.equal(hints.includes("Ctrl+N Next"), false)
})

test("resultAccessibleName uses title without snippet content", () => {
  const named = OverlayModel.resultAccessibleName({
    title: "Support email",
    content: "secret-token",
  })
  const untitled = OverlayModel.resultAccessibleName(null)

  assert.equal(named, "Support email")
  assert.equal(named.includes("secret-token"), false)
  assert.equal(untitled, "")
})

test("stale identity and write completions cannot mutate a newer intent", () => {
  let state = transition(loaded([]), { type: "OPEN_CREATE" }).state
  state = transition(state, {
    type: "UPDATE_DRAFT",
    field: "title",
    value: "Current",
  }).state
  state = transition(state, {
    type: "UPDATE_DRAFT",
    field: "content",
    value: "Content",
  }).state
  state = transition(state, { type: "SUBMIT_CREATE", operationId: 81 }).state

  const staleIdentity = transition(state, {
    type: "CREATE_ID_GENERATED",
    operationId: 80,
    id: ID_ONE,
    now: CREATED_AT,
  })
  const current = transition(state, {
    type: "CREATE_ID_GENERATED",
    operationId: 81,
    id: ID_ONE,
    now: CREATED_AT,
  }).state
  const staleWrite = transition(current, {
    type: "WRITE_SUCCEEDED",
    operationId: 80,
  })

  assert.deepEqual(staleIdentity, { state, effects: [] })
  assert.deepEqual(staleWrite, { state: current, effects: [] })
})
