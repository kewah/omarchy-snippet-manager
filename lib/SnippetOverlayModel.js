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
    targetId: null
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
    keywords: draft.keywords.slice(),
    content: draft.content
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
        snippet: { id: snippet.id, content: snippet.content }
      }
    }
  ])
}

function createState(state) {
  var next = stateForMode("create")
  next.catalog = state.catalog
  next.draft = { title: "", keywords: [], content: "" }
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
    keywords: snippet.keywords.slice(),
    content: snippet.content
  }
  next.focusField = "title"
  next.returnSearch = { query: state.query, selectedId: state.selectedId }
  next.targetId = snippet.id
  return next
}

function changedDraftState(state, field, value) {
  if (state.busy || (field !== "title" && field !== "content") || typeof value !== "string") return state

  var next = copyState(state)
  next.draft = copyDraft(state.draft)
  next.draft[field] = value
  next.fieldErrors = {}
  next.errorMessage = ""
  return next
}

function addedKeywordState(state, value) {
  if (state.busy || typeof value !== "string" || !value.trim()) return state

  var next = copyState(state)
  next.draft = copyDraft(state.draft)
  next.draft.keywords.push(value)
  next.fieldErrors = {}
  next.errorMessage = ""
  return next
}

function updatedKeywordState(state, index, value) {
  var target = Number(index)
  if (state.busy || typeof value !== "string" || target < 0
      || target >= state.draft.keywords.length || Math.floor(target) !== target) return state

  var next = copyState(state)
  next.draft = copyDraft(state.draft)
  next.draft.keywords[target] = value
  next.fieldErrors = {}
  next.errorMessage = ""
  return next
}

function removedKeywordState(state, index) {
  var target = Number(index)
  if (state.busy || target < 0 || target >= state.draft.keywords.length || Math.floor(target) !== target) return state

  var next = copyState(state)
  next.draft = copyDraft(state.draft)
  next.draft.keywords.splice(target, 1)
  next.fieldErrors = {}
  next.errorMessage = ""
  return next
}

function submittedCreateState(state) {
  if (state.busy) return transitionResult(state)

  var next = copyState(state)
  next.busy = true
  next.errorMessage = ""
  next.fieldErrors = {}
  next.focusField = ""
  next.pendingIntent = { kind: "create", draft: copyDraft(state.draft) }
  return transitionResult(next, [{ type: "GENERATE_CREATE_ID" }])
}

function validationField(message) {
  var text = String(message || "")
  if (text.indexOf("Title") === 0) return "title"
  if (text.indexOf("Content") === 0) return "content"
  if (text.indexOf("Keywords") === 0) return "keywords"
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
  if (!state.busy || !state.pendingIntent || state.pendingIntent.kind !== "create") return transitionResult(state)

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
    nextCatalog: created.value
  }
  return transitionResult(next, [{ type: "WRITE_STORE", payload: serialized.value }])
}

function preparedEdit(state, event, catalogApi) {
  if (state.busy) return transitionResult(state)

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

  var next = copyState(state)
  next.busy = true
  next.errorMessage = ""
  next.fieldErrors = {}
  next.focusField = ""
  next.pendingIntent = {
    kind: "edit",
    draft: copyDraft(state.draft),
    id: state.targetId,
    now: event.now,
    nextCatalog: updated.value
  }
  return transitionResult(next, [{ type: "WRITE_STORE", payload: updatedBytes.value }])
}

function completedWrite(state, catalogApi) {
  if (!state.pendingIntent || !state.pendingIntent.nextCatalog) return transitionResult(state)
  if (state.pendingIntent.kind !== "create" && state.pendingIntent.kind !== "edit") return transitionResult(state)
  return transitionResult(searchState(state.pendingIntent.nextCatalog, "", state.pendingIntent.id, catalogApi))
}

function failedWriteState(state) {
  if (!state.pendingIntent) return state
  var next = copyState(state)
  next.busy = false
  next.errorMessage = "Unable to save snippet"
  return next
}

function canceledEditorState(state, catalogApi) {
  if (state.busy || !state.returnSearch) return state
  return searchState(state.catalog, state.returnSearch.query, state.returnSearch.selectedId, catalogApi)
}

function editorTransition(state, event, catalogApi) {
  if (event.type === "UPDATE_DRAFT") return transitionResult(changedDraftState(state, event.field, event.value))
  if (event.type === "ADD_KEYWORD") return transitionResult(addedKeywordState(state, event.value))
  if (event.type === "UPDATE_KEYWORD") return transitionResult(updatedKeywordState(state, event.index, event.value))
  if (event.type === "REMOVE_KEYWORD") return transitionResult(removedKeywordState(state, event.index))
  if (event.type === "SUBMIT_CREATE" && state.mode === "create") return submittedCreateState(state)
  if (event.type === "SUBMIT_EDIT" && state.mode === "edit") return preparedEdit(state, event, catalogApi)
  if (event.type === "CREATE_ID_GENERATED" && state.mode === "create") return preparedCreate(state, event, catalogApi)
  if (event.type === "CREATE_ID_FAILED" && state.mode === "create") return failedCreateIdentity(state)
  if (event.type === "WRITE_SUCCEEDED") return completedWrite(state, catalogApi)
  if (event.type === "WRITE_FAILED") return transitionResult(failedWriteState(state))
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

function createIdEvent(exitCode, output, now) {
  var id = String(output || "").trim()
  var timestamp = String(now || "")
  var uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  var utcTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
  if (Number(exitCode) !== 0 || !uuidV4.test(id) || !utcTime.test(timestamp)) {
    return { type: "CREATE_ID_FAILED" }
  }
  return { type: "CREATE_ID_GENERATED", id: id, now: timestamp }
}

function storeWriteEvent(exitCode) {
  return Number(exitCode) === 0 ? { type: "WRITE_SUCCEEDED" } : { type: "WRITE_FAILED" }
}

function processCommand(effect, storePath) {
  if (!effect) return null
  if (effect.type === "GENERATE_CREATE_ID") return ["cat", "/proc/sys/kernel/random/uuid"]
  if ((effect.type === "READ_STORE" || effect.type === "WRITE_STORE")
      && typeof storePath === "string" && storePath) {
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

  if (state.mode === "create" || state.mode === "edit") return editorTransition(state, event, catalogApi)
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
    if (selectedIndex < 0 || selectedIndex >= state.results.length || Math.floor(selectedIndex) !== selectedIndex) {
      return transitionResult(state)
    }
    return transitionResult(selectedState(state, selectedIndex))
  }

  if (event.type === "PAGE_SELECTION") {
    return transitionResult(pageSelection(state, event.direction, event.visibleCount))
  }

  if (event.type === "SELECT_FIRST") return transitionResult(selectedState(state, 0))
  if (event.type === "SELECT_LAST") return transitionResult(selectedState(state, state.results.length - 1))
  if (event.type === "OPEN_CREATE") return transitionResult(createState(state))
  if (event.type === "OPEN_EDIT") return transitionResult(editState(state))

  if (event.type === "ESCAPE") {
    if (state.query) return transitionResult(searchState(state.catalog, "", null, catalogApi))
    return closeResult()
  }

  if (event.type === "REQUEST_TRANSFER") return transferResult(state, event.kind)
  return transitionResult(state)
}

function unicodeCharacters(value) {
  var characters = String(value).match(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\s\S]/g)
  return characters || []
}

function previewText(content, maximumCharacters) {
  var compact = String(content).replace(/\s+/g, " ").trim()
  var characters = unicodeCharacters(compact)
  var maximum = Math.max(1, Math.floor(Number(maximumCharacters) || 100))
  if (characters.length <= maximum) return compact
  if (maximum === 1) return "…"
  return characters.slice(0, maximum - 1).join("") + "…"
}

if (typeof module !== "undefined") {
  module.exports = {
    initialState: initialState,
    openedState: openedState,
    transition: transition,
    previewText: previewText,
    storeReadEvent: storeReadEvent,
    createIdEvent: createIdEvent,
    storeWriteEvent: storeWriteEvent,
    processCommand: processCommand
  }
}
