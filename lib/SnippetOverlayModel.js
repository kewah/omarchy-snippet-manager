function stateForMode(mode) {
  return {
    mode: mode,
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
  }
}

function initialState() {
  return stateForMode("closed")
}

function openedState() {
  return stateForMode("loading")
}

function transitionResult(state, effects) {
  return { state: state, effects: effects || [] }
}

function copyState(state) {
  var next = {}
  for (var key in state) next[key] = state[key]
  return next
}

function copyDraft(draft) {
  return {
    title: draft.title,
    content: draft.content,
  }
}

function loadErrorMessage(code) {
  if (code === "INVALID_JSON") return "Snippet catalog contains invalid JSON"
  if (code === "UNSUPPORTED_SCHEMA") return "Snippet catalog format is unsupported"
  if (code === "INVALID_CATALOG") return "Snippet catalog is invalid"
  return "Unable to read snippet catalog"
}

function failedLoadState(code) {
  var state = stateForMode("load-error")
  state.errorMessage = loadErrorMessage(code)
  return state
}

function findResultIndex(state, id) {
  if (!id) return -1

  for (var i = 0; i < state.results.length; i++) {
    if (state.results[i].id === id) return i
  }

  return -1
}

function searchState(catalog, query, preferredId, catalogApi) {
  var searched = catalogApi.searchSnippets(catalog, query)
  if (!searched.ok) return failedLoadState(searched.error.code)

  var state = stateForMode("search")
  state.query = query
  state.catalog = catalog
  state.results = searched.value

  var preferredIndex = -1
  for (var i = 0; i < state.results.length; i++) {
    if (state.results[i].id === preferredId) {
      preferredIndex = i
      break
    }
  }

  if (preferredIndex >= 0) state.selectedId = state.results[preferredIndex].id
  else if (state.results.length > 0) state.selectedId = state.results[0].id
  return state
}

function selectedState(state, index) {
  if (state.results.length === 0) return state

  var bounded = Math.max(0, Math.min(index, state.results.length - 1))
  var next = copyState(state)
  next.selectedId = state.results[bounded].id
  return next
}

function moveSelection(state, delta) {
  if (state.results.length === 0) return state

  var index = findResultIndex(state, state.selectedId)
  if (index < 0) index = delta < 0 ? 0 : -1
  index = (index + delta) % state.results.length
  if (index < 0) index += state.results.length
  return selectedState(state, index)
}

function pageSelection(state, direction, visibleCount) {
  if (state.results.length === 0) return state

  var index = findResultIndex(state, state.selectedId)
  if (index < 0) index = 0
  var pageSize = Math.max(1, Math.floor(Number(visibleCount) || 1))
  var delta = direction < 0 ? -pageSize : pageSize
  return selectedState(state, index + delta)
}

function selectedRecord(state) {
  var index = findResultIndex(state, state.selectedId)
  return index < 0 ? null : state.results[index]
}

function closeResult() {
  return transitionResult(initialState(), [{ type: "DISMISS" }])
}

function transferResult(state, kind) {
  if (kind !== "PASTE" && kind !== "COPY") return transitionResult(state)

  var snippet = selectedRecord(state)
  if (!snippet) return transitionResult(state)

  return transitionResult(initialState(), [
    { type: "DISMISS" },
    {
      type: "DISPATCH_TRANSFER",
      payload: {
        kind: kind,
        snippet: { id: snippet.id, content: snippet.content },
      },
    },
  ])
}

function createState(state) {
  var next = stateForMode("create")
  next.catalog = state.catalog
  next.draft = { title: "", content: "" }
  next.focusField = "title"
  next.returnSearch = { query: state.query, selectedId: state.selectedId }
  return next
}

function editState(state) {
  var snippet = selectedRecord(state)
  if (!snippet) return state

  var next = stateForMode("edit")
  next.catalog = state.catalog
  next.draft = {
    title: snippet.title,
    content: snippet.content,
  }
  next.focusField = "title"
  next.returnSearch = { query: state.query, selectedId: state.selectedId }
  next.targetId = snippet.id
  return next
}

function deleteState(state) {
  var snippet = selectedRecord(state)
  if (!snippet) return state

  var next = copyState(state)
  next.mode = "delete-confirm"
  next.targetId = snippet.id
  next.confirmAction = "cancel"
  next.errorMessage = ""
  next.busy = false
  next.pendingIntent = null
  return next
}

function canceledDeleteState(state, catalogApi) {
  if (state.busy) return state
  if (state.reconcileStatus === "blocked") return failedLoadState("IO_ERROR")
  return searchState(state.catalog, state.query, state.targetId, catalogApi)
}

function movedConfirmState(state) {
  if (state.busy) return state
  var next = copyState(state)
  next.confirmAction = state.confirmAction === "cancel" ? "delete" : "cancel"
  return next
}

function preparedDelete(state, event, catalogApi) {
  if (state.busy || state.reconcileStatus === "blocked") return transitionResult(state)
  if (state.confirmAction !== "delete")
    return transitionResult(canceledDeleteState(state, catalogApi))

  var resultIndex = findResultIndex(state, state.targetId)
  var deleted = catalogApi.deleteSnippet(state.catalog, state.targetId)
  if (!deleted.ok) {
    var failed = copyState(state)
    failed.errorMessage = "Unable to delete snippet"
    return transitionResult(failed)
  }

  var serialized = catalogApi.serializeCatalog(deleted.value)
  if (!serialized.ok) {
    var invalid = copyState(state)
    invalid.errorMessage = "Unable to delete snippet"
    return transitionResult(invalid)
  }

  var operationId = operationIdFor(state, event)
  var next = copyState(state)
  next.busy = true
  next.operationId = operationId
  next.errorMessage = ""
  next.pendingIntent = {
    kind: "delete",
    id: state.targetId,
    nextCatalog: deleted.value,
    query: state.query,
    resultIndex: resultIndex,
    operationId: operationId,
  }
  return transitionResult(next, [
    {
      type: "WRITE_STORE",
      payload: serialized.value,
      operationId: operationId,
    },
  ])
}

function deleteTransition(state, event, catalogApi) {
  if (event.type === "MOVE_CONFIRM") return transitionResult(movedConfirmState(state))
  if (event.type === "CANCEL_DELETE" || event.type === "ESCAPE") {
    return transitionResult(canceledDeleteState(state, catalogApi))
  }
  if (event.type === "CONFIRM_DELETE") return preparedDelete(state, event, catalogApi)
  if (event.type === "WRITE_SUCCEEDED") {
    if (!matchesPendingOperation(state, event)) return transitionResult(state)
    return completedWrite(state, catalogApi)
  }
  if (event.type === "WRITE_FAILED") return failedWriteResult(state, event)
  if (event.type === "RECONCILE_SUCCEEDED") return reconciledWrite(state, event, catalogApi)
  if (event.type === "RECONCILE_FAILED") return failedReconciliation(state, event)
  return transitionResult(state)
}

function operationIdFor(state, event) {
  var supplied = Number(event && event.operationId)
  if (supplied > 0 && Math.floor(supplied) === supplied) return supplied
  return state.operationId + 1
}

function matchesPendingOperation(state, event) {
  if (!state.pendingIntent) return false
  if (event.operationId === undefined) return true
  return Number(event.operationId) === state.pendingIntent.operationId
}

function changedDraftState(state, field, value) {
  if (
    state.busy ||
    state.reconcileStatus === "blocked" ||
    (field !== "title" && field !== "content") ||
    typeof value !== "string"
  )
    return state

  var next = copyState(state)
  next.draft = copyDraft(state.draft)
  next.draft[field] = value
  next.fieldErrors = {}
  next.errorMessage = ""
  return next
}

function submittedCreateState(state, event, catalogApi) {
  if (state.busy || state.reconcileStatus === "blocked") return transitionResult(state)

  var operationId = operationIdFor(state, event)
  var next = copyState(state)
  next.busy = true
  next.operationId = operationId
  next.errorMessage = ""
  next.fieldErrors = {}
  next.focusField = ""

  if (state.pendingIntent && state.pendingIntent.kind === "create" && state.pendingIntent.id) {
    next.pendingIntent = {
      kind: "create",
      draft: copyDraft(state.draft),
      id: state.pendingIntent.id,
      now: state.pendingIntent.now,
      operationId: operationId,
    }
    return preparedCreate(
      next,
      {
        id: next.pendingIntent.id,
        now: next.pendingIntent.now,
        operationId: operationId,
      },
      catalogApi
    )
  }

  next.pendingIntent = {
    kind: "create",
    draft: copyDraft(state.draft),
    operationId: operationId,
  }
  return transitionResult(next, [{ type: "GENERATE_CREATE_ID", operationId: operationId }])
}

function validationField(message) {
  var text = String(message || "")
  if (text.indexOf("Title") === 0) return "title"
  if (text.indexOf("Content") === 0) return "content"
  return "form"
}

function failedCreateValidation(state, error) {
  var next = copyState(state)
  var field = validationField(error.message)
  next.busy = false
  next.pendingIntent = null
  next.focusField = field === "form" ? "title" : field
  next.fieldErrors = {}
  next.fieldErrors[field] = error.message
  return transitionResult(next)
}

function failedCreateIdentity(state) {
  var next = copyState(state)
  next.busy = false
  next.pendingIntent = null
  next.errorMessage = "Unable to create snippet"
  return transitionResult(next)
}

function preparedCreate(state, event, catalogApi) {
  if (
    !state.busy ||
    !state.pendingIntent ||
    state.pendingIntent.kind !== "create" ||
    !matchesPendingOperation(state, event)
  )
    return transitionResult(state)

  var created = catalogApi.createSnippet(
    state.catalog,
    state.pendingIntent.draft,
    event.id,
    event.now
  )
  if (!created.ok) return failedCreateValidation(state, created.error)

  var serialized = catalogApi.serializeCatalog(created.value)
  if (!serialized.ok) return failedCreateValidation(state, serialized.error)

  var next = copyState(state)
  next.pendingIntent = {
    kind: "create",
    draft: copyDraft(state.pendingIntent.draft),
    id: event.id,
    now: event.now,
    nextCatalog: created.value,
    operationId: state.pendingIntent.operationId,
  }
  return transitionResult(next, [
    {
      type: "WRITE_STORE",
      payload: serialized.value,
      operationId: state.pendingIntent.operationId,
    },
  ])
}

function preparedEdit(state, event, catalogApi) {
  if (state.busy || state.reconcileStatus === "blocked") return transitionResult(state)

  var updated = catalogApi.updateSnippet(state.catalog, state.targetId, state.draft, event.now)
  if (!updated.ok) return failedCreateValidation(state, updated.error)

  var currentBytes = catalogApi.serializeCatalog(state.catalog)
  var updatedBytes = catalogApi.serializeCatalog(updated.value)
  if (!currentBytes.ok || !updatedBytes.ok) {
    var serializationError = !updatedBytes.ok ? updatedBytes.error : currentBytes.error
    return failedCreateValidation(state, serializationError)
  }

  if (currentBytes.value === updatedBytes.value) {
    return transitionResult(searchState(updated.value, "", state.targetId, catalogApi))
  }

  var operationId = operationIdFor(state, event)
  var next = copyState(state)
  next.busy = true
  next.operationId = operationId
  next.errorMessage = ""
  next.fieldErrors = {}
  next.focusField = ""
  next.pendingIntent = {
    kind: "edit",
    draft: copyDraft(state.draft),
    id: state.targetId,
    now: event.now,
    nextCatalog: updated.value,
    operationId: operationId,
  }
  return transitionResult(next, [
    {
      type: "WRITE_STORE",
      payload: updatedBytes.value,
      operationId: operationId,
    },
  ])
}

function completedWrite(state, catalogApi) {
  if (!state.pendingIntent || !state.pendingIntent.nextCatalog) return transitionResult(state)

  if (state.pendingIntent.kind === "delete") {
    var searched = searchState(
      state.pendingIntent.nextCatalog,
      state.pendingIntent.query,
      null,
      catalogApi
    )
    if (searched.mode !== "search" || searched.results.length === 0)
      return transitionResult(searched)
    var nextIndex = Math.min(state.pendingIntent.resultIndex, searched.results.length - 1)
    return transitionResult(selectedState(searched, nextIndex))
  }

  if (state.pendingIntent.kind !== "create" && state.pendingIntent.kind !== "edit")
    return transitionResult(state)
  return transitionResult(
    searchState(state.pendingIntent.nextCatalog, "", state.pendingIntent.id, catalogApi)
  )
}

function editableRecordEquals(left, right) {
  return !!left && !!right && left.title === right.title && left.content === right.content
}

function completeRecordEquals(left, right) {
  return (
    editableRecordEquals(left, right) &&
    left.id === right.id &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt
  )
}

function failedWriteResult(state, event) {
  if (!matchesPendingOperation(state, event)) return transitionResult(state)

  var next = copyState(state)
  next.busy = true
  next.reconcileStatus = "loading"
  next.errorMessage = "Unable to confirm snippet save"
  return transitionResult(next, [
    {
      type: "READ_STORE",
      purpose: "RECONCILE",
      operationId: state.pendingIntent.operationId,
    },
  ])
}

function reconciledCreate(state, catalog, catalogApi) {
  var loaded = catalogApi.getSnippet(catalog, state.pendingIntent.id)
  var intended = catalogApi.getSnippet(state.pendingIntent.nextCatalog, state.pendingIntent.id)

  if (loaded.ok && intended.ok && completeRecordEquals(loaded.value, intended.value)) {
    return transitionResult(searchState(catalog, "", state.pendingIntent.id, catalogApi))
  }

  var next = copyState(state)
  next.catalog = catalog
  next.busy = false
  next.reconcileStatus = ""
  if (!loaded.ok && loaded.error.code === "NOT_FOUND") {
    next.errorMessage = "Snippet save was not applied; retry to save"
    return transitionResult(next)
  }

  next.pendingIntent = null
  next.errorMessage = "Snippet identity changed; retry with a new identity"
  return transitionResult(next)
}

function reconciledEdit(state, catalog, catalogApi) {
  var loaded = catalogApi.getSnippet(catalog, state.pendingIntent.id)
  var intended = catalogApi.getSnippet(state.pendingIntent.nextCatalog, state.pendingIntent.id)
  if (loaded.ok && intended.ok && editableRecordEquals(loaded.value, intended.value)) {
    return transitionResult(searchState(catalog, "", state.pendingIntent.id, catalogApi))
  }

  var next = copyState(state)
  next.catalog = catalog
  next.busy = false
  next.reconcileStatus = ""
  next.errorMessage = "Snippet save was not applied; review and retry"
  return transitionResult(next)
}

function reconciledDelete(state, catalog, catalogApi) {
  var loaded = catalogApi.getSnippet(catalog, state.pendingIntent.id)
  if (!loaded.ok && loaded.error.code === "NOT_FOUND") {
    var completed = copyState(state)
    completed.pendingIntent = {
      kind: "delete",
      id: state.pendingIntent.id,
      nextCatalog: catalog,
      query: state.pendingIntent.query,
      resultIndex: state.pendingIntent.resultIndex,
      operationId: state.pendingIntent.operationId,
    }
    return completedWrite(completed, catalogApi)
  }

  var searched = searchState(catalog, state.pendingIntent.query, state.pendingIntent.id, catalogApi)
  if (searched.mode !== "search") return transitionResult(searched)
  var next = copyState(searched)
  next.mode = "delete-confirm"
  next.targetId = state.pendingIntent.id
  next.confirmAction = "delete"
  next.pendingIntent = state.pendingIntent
  next.operationId = state.operationId
  next.errorMessage = "Snippet deletion was not applied; retry to delete"
  return transitionResult(next)
}

function reconciledWrite(state, event, catalogApi) {
  if (!matchesPendingOperation(state, event) || state.reconcileStatus !== "loading") {
    return transitionResult(state)
  }
  if (state.pendingIntent.kind === "create")
    return reconciledCreate(state, event.catalog, catalogApi)
  if (state.pendingIntent.kind === "edit") return reconciledEdit(state, event.catalog, catalogApi)
  if (state.pendingIntent.kind === "delete")
    return reconciledDelete(state, event.catalog, catalogApi)
  return transitionResult(state)
}

function failedReconciliation(state, event) {
  if (!matchesPendingOperation(state, event) || state.reconcileStatus !== "loading") {
    return transitionResult(state)
  }
  var next = copyState(state)
  next.busy = false
  next.reconcileStatus = "blocked"
  next.errorMessage = "Unable to reload snippet catalog"
  return transitionResult(next)
}

function canceledEditorState(state, catalogApi) {
  if (state.busy || !state.returnSearch) return state
  if (state.reconcileStatus === "blocked") return failedLoadState("IO_ERROR")
  return searchState(
    state.catalog,
    state.returnSearch.query,
    state.returnSearch.selectedId,
    catalogApi
  )
}

function editorTransition(state, event, catalogApi) {
  if (event.type === "UPDATE_DRAFT")
    return transitionResult(changedDraftState(state, event.field, event.value))
  if (event.type === "SUBMIT_CREATE" && state.mode === "create")
    return submittedCreateState(state, event, catalogApi)
  if (event.type === "SUBMIT_EDIT" && state.mode === "edit")
    return preparedEdit(state, event, catalogApi)
  if (event.type === "CREATE_ID_GENERATED" && state.mode === "create")
    return preparedCreate(state, event, catalogApi)
  if (event.type === "CREATE_ID_FAILED" && state.mode === "create") {
    if (!matchesPendingOperation(state, event)) return transitionResult(state)
    return failedCreateIdentity(state)
  }
  if (event.type === "WRITE_SUCCEEDED") {
    if (!matchesPendingOperation(state, event)) return transitionResult(state)
    return completedWrite(state, catalogApi)
  }
  if (event.type === "WRITE_FAILED") return failedWriteResult(state, event)
  if (event.type === "RECONCILE_SUCCEEDED") return reconciledWrite(state, event, catalogApi)
  if (event.type === "RECONCILE_FAILED") return failedReconciliation(state, event)
  if (event.type === "CANCEL_EDITOR" || event.type === "ESCAPE") {
    return transitionResult(canceledEditorState(state, catalogApi))
  }
  return transitionResult(state)
}

function storeReadEvent(exitCode, output, catalogApi) {
  var status = Number(exitCode)
  if (status !== 0) {
    var code = "IO_ERROR"
    if (status === 3) code = "INVALID_JSON"
    else if (status === 4) code = "UNSUPPORTED_SCHEMA"
    else if (status === 5) code = "INVALID_CATALOG"
    return { type: "LOAD_FAILED", code: code }
  }

  var parsed = catalogApi.parseCatalog(String(output || ""))
  if (!parsed.ok) return { type: "LOAD_FAILED", code: parsed.error.code }
  return { type: "LOAD_SUCCEEDED", catalog: parsed.value }
}

function createIdEvent(exitCode, output, now, operationId) {
  var id = String(output || "").trim()
  var timestamp = String(now || "")
  var uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  var utcTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
  if (Number(exitCode) !== 0 || !uuidV4.test(id) || !utcTime.test(timestamp)) {
    return { type: "CREATE_ID_FAILED", operationId: operationId }
  }
  return {
    type: "CREATE_ID_GENERATED",
    id: id,
    now: timestamp,
    operationId: operationId,
  }
}

function reconcileReadEvent(exitCode, output, operationId, catalogApi) {
  var loaded = storeReadEvent(exitCode, output, catalogApi)
  if (loaded.type === "LOAD_SUCCEEDED") {
    return {
      type: "RECONCILE_SUCCEEDED",
      operationId: operationId,
      catalog: loaded.catalog,
    }
  }
  return {
    type: "RECONCILE_FAILED",
    operationId: operationId,
    code: loaded.code,
  }
}

function storeWriteEvent(exitCode, operationId) {
  return Number(exitCode) === 0
    ? { type: "WRITE_SUCCEEDED", operationId: operationId }
    : { type: "WRITE_FAILED", operationId: operationId }
}

function processCommand(effect, storePath) {
  if (!effect) return null
  if (effect.type === "GENERATE_CREATE_ID") return ["cat", "/proc/sys/kernel/random/uuid"]
  if (
    (effect.type === "READ_STORE" || effect.type === "WRITE_STORE") &&
    typeof storePath === "string" &&
    storePath
  ) {
    return [storePath, effect.type === "READ_STORE" ? "read" : "write"]
  }
  return null
}

function transition(state, event, catalogApi) {
  if (!state || !event || typeof event.type !== "string") return transitionResult(state)

  if (event.type === "OPEN") {
    return transitionResult(openedState(), [{ type: "READ_STORE" }])
  }

  if (event.type === "LOAD_SUCCEEDED") {
    return transitionResult(searchState(event.catalog, "", null, catalogApi))
  }

  if (event.type === "LOAD_FAILED") {
    return transitionResult(failedLoadState(event.code))
  }

  if (event.type === "RETRY_LOAD") {
    return transitionResult(openedState(), [{ type: "READ_STORE" }])
  }

  if (state.mode === "create" || state.mode === "edit")
    return editorTransition(state, event, catalogApi)
  if (state.mode === "delete-confirm") return deleteTransition(state, event, catalogApi)
  if (state.mode !== "search") return transitionResult(state)

  if (event.type === "SET_QUERY") {
    if (typeof event.query !== "string") return transitionResult(state)
    return transitionResult(searchState(state.catalog, event.query, null, catalogApi))
  }

  if (event.type === "MOVE_SELECTION") {
    return transitionResult(moveSelection(state, Number(event.delta) || 0))
  }

  if (event.type === "SELECT_INDEX") {
    var selectedIndex = Number(event.index)
    if (
      selectedIndex < 0 ||
      selectedIndex >= state.results.length ||
      Math.floor(selectedIndex) !== selectedIndex
    ) {
      return transitionResult(state)
    }
    return transitionResult(selectedState(state, selectedIndex))
  }

  if (event.type === "PAGE_SELECTION") {
    return transitionResult(pageSelection(state, event.direction, event.visibleCount))
  }

  if (event.type === "SELECT_FIRST") return transitionResult(selectedState(state, 0))
  if (event.type === "SELECT_LAST")
    return transitionResult(selectedState(state, state.results.length - 1))
  if (event.type === "OPEN_CREATE") return transitionResult(createState(state))
  if (event.type === "OPEN_EDIT") return transitionResult(editState(state))
  if (event.type === "OPEN_DELETE") return transitionResult(deleteState(state))

  if (event.type === "ESCAPE") {
    if (state.query) return transitionResult(searchState(state.catalog, "", null, catalogApi))
    return closeResult()
  }

  if (event.type === "REQUEST_TRANSFER") return transferResult(state, event.kind)
  return transitionResult(state)
}

function unicodeCharacters(value) {
  var text = String(value)
  if (typeof Intl !== "undefined" && Intl.Segmenter && typeof Array !== "undefined" && Array.from) {
    var segmented = Array.from(
      new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)
    )
    var segments = []
    for (var i = 0; i < segmented.length; i++) segments.push(segmented[i].segment)
    return segments
  }

  var characters = text.match(
    /(?:[\uD800-\uDBFF][\uDC00-\uDFFF]|[^\uD800-\uDFFF])(?:\u200D(?:[\uD800-\uDBFF][\uDC00-\uDFFF]|[^\uD800-\uDFFF]))*|[\s\S]/g
  )
  return characters || []
}

function fittedSize(preferred, available) {
  var room = Math.floor(Number(available))
  var pref = Math.floor(Number(preferred))
  if (!isFinite(room) || room < 1) room = 1
  if (!isFinite(pref) || pref < 1) pref = room
  return Math.min(pref, room)
}

function previewText(content, maximumCharacters) {
  var compact = String(content).replace(/\s+/g, " ").trim()
  var characters = unicodeCharacters(compact)
  var maximum = Math.max(1, Math.floor(Number(maximumCharacters) || 100))
  if (characters.length <= maximum) return compact
  if (maximum === 1) return "…"
  return characters.slice(0, maximum - 1).join("") + "…"
}

function usesSplitDetail(width, minimumWidth) {
  var minimum = Math.max(1, Math.floor(Number(minimumWidth) || 560))
  return Number(width) >= minimum
}

function searchStatus(state) {
  if (!state || (state.mode !== "search" && state.mode !== "delete-confirm")) return ""
  var snippets = state.catalog && state.catalog.snippets
  if (!snippets) return ""
  if (snippets.length === 0) return "empty"
  if (!state.results || state.results.length === 0) return "no-results"
  return "results"
}

function showsSearchField(status) {
  return status !== "empty"
}

function shortcutHints() {
  return [
    labeledShortcut("Next", "Ctrl+N"),
    labeledShortcut("Prev", "Ctrl+P"),
    labeledShortcut("Create", "Ctrl+Shift+N"),
    labeledShortcut("Edit", "Ctrl+E"),
    labeledShortcut("Delete", "Ctrl+X"),
    labeledShortcut("Paste", "Enter"),
    labeledShortcut("Copy", "Ctrl+Enter"),
  ].join("  ·  ")
}

function labeledShortcut(label, shortcut) {
  return label + " [" + shortcut + "]"
}

function emptyStateCopy(status) {
  if (status === "empty") return { heading: "No snippets yet", subtitle: "" }
  if (status === "no-results")
    return { heading: "No matching snippets", subtitle: "Try a different search" }
  return { heading: "", subtitle: "" }
}

function listItemText(snippet) {
  if (!snippet) return ""
  return String(snippet.title || "")
}

function createButtonLabel() {
  return labeledShortcut("Create snippet", "Ctrl+Shift+N")
}

function saveButtonLabel(busy) {
  return labeledShortcut(busy ? "Saving…" : "Save", "Ctrl+S")
}

function cancelButtonLabel() {
  return labeledShortcut("Cancel", "Escape")
}

function editorShortcutHints() {
  return ""
}

function deleteDialogCopy(snippetTitle) {
  return {
    heading: "Delete " + String(snippetTitle || "") + "?",
    subtitle: "This cannot be undone",
  }
}

function resultAccessibleName(snippet) {
  if (!snippet) return ""
  return previewText(snippet.title || "", 100)
}

if (typeof module !== "undefined") {
  module.exports = {
    initialState: initialState,
    openedState: openedState,
    transition: transition,
    previewText: previewText,
    fittedSize: fittedSize,
    usesSplitDetail: usesSplitDetail,
    searchStatus: searchStatus,
    showsSearchField: showsSearchField,
    shortcutHints: shortcutHints,
    labeledShortcut: labeledShortcut,
    emptyStateCopy: emptyStateCopy,
    listItemText: listItemText,
    createButtonLabel: createButtonLabel,
    saveButtonLabel: saveButtonLabel,
    cancelButtonLabel: cancelButtonLabel,
    editorShortcutHints: editorShortcutHints,
    deleteDialogCopy: deleteDialogCopy,
    resultAccessibleName: resultAccessibleName,
    storeReadEvent: storeReadEvent,
    createIdEvent: createIdEvent,
    reconcileReadEvent: reconcileReadEvent,
    storeWriteEvent: storeWriteEvent,
    processCommand: processCommand,
  }
}
