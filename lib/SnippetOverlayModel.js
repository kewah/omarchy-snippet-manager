function stateForMode(mode) {
  return {
    mode: mode,
    query: "",
    catalog: null,
    results: [],
    selectedId: null,
    errorMessage: "",
    busy: false
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
  var next = {
    mode: state.mode,
    query: state.query,
    catalog: state.catalog,
    results: state.results,
    selectedId: state.results[bounded].id,
    errorMessage: state.errorMessage,
    busy: state.busy
  }
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

  if (state.mode !== "search") return transitionResult(state)

  if (event.type === "SET_QUERY") {
    if (typeof event.query !== "string") return transitionResult(state)
    return transitionResult(searchState(state.catalog, event.query, null, catalogApi))
  }

  if (event.type === "MOVE_SELECTION") {
    return transitionResult(moveSelection(state, Number(event.delta) || 0))
  }

  if (event.type === "PAGE_SELECTION") {
    return transitionResult(pageSelection(state, event.direction, event.visibleCount))
  }

  if (event.type === "SELECT_FIRST") return transitionResult(selectedState(state, 0))
  if (event.type === "SELECT_LAST") return transitionResult(selectedState(state, state.results.length - 1))

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
    previewText: previewText
  }
}
