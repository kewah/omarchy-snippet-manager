var maxCatalogBytes = 10 * 1024 * 1024

function success(value) {
  return { ok: true, value: value }
}

function failure(code, message) {
  return { ok: false, error: { code: code, message: message } }
}

function invalidCatalog() {
  return failure("INVALID_CATALOG", "Invalid snippet catalog")
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]"
}

function unicodeLength(value) {
  var characters = String(value).match(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\s\S]/g)
  return characters ? characters.length : 0
}

function isUuid(value) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  )
}

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

function isUtcTimestamp(value) {
  if (typeof value !== "string") return false

  var parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/.exec(value)
  if (!parts) return false

  var year = Number(parts[1])
  var month = Number(parts[2])
  var day = Number(parts[3])
  var hour = Number(parts[4])
  var minute = Number(parts[5])
  var second = Number(parts[6])
  if (year < 1970 || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59)
    return false

  var daysInMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day >= 1 && day <= daysInMonth[month - 1]
}

function normalizeRecord(value) {
  if (!isPlainObject(value) || !isUuid(value.id)) return null
  if (typeof value.title !== "string" || typeof value.content !== "string") return null
  if (!isUtcTimestamp(value.createdAt) || !isUtcTimestamp(value.updatedAt)) return null

  var title = value.title.trim()

  if (!title || unicodeLength(title) > 120 || !/\S/.test(value.content)) return null

  return {
    id: value.id,
    title: title,
    content: value.content,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  }
}

function normalizeCatalog(value) {
  if (!isPlainObject(value)) return invalidCatalog()

  if (value.schemaVersion !== 1) {
    if (value.schemaVersion === undefined) return invalidCatalog()
    return failure("UNSUPPORTED_SCHEMA", "Unsupported snippet catalog schema")
  }

  if (!Array.isArray(value.snippets) || value.snippets.length >= 500) return invalidCatalog()

  var snippets = []
  var ids = {}

  for (var i = 0; i < value.snippets.length; i++) {
    var snippet = normalizeRecord(value.snippets[i])
    if (!snippet) return invalidCatalog()

    var idKey = snippet.id.toLowerCase()
    if (ids[idKey]) return invalidCatalog()

    ids[idKey] = true
    snippets.push(snippet)
  }

  return success({ schemaVersion: 1, snippets: snippets })
}

function utf8ByteLength(value) {
  var text = String(value)
  var bytes = 0

  for (var i = 0; i < text.length; i++) {
    var code = text.charCodeAt(i)
    if (code <= 0x7f) bytes += 1
    else if (code <= 0x7ff) bytes += 2
    else if (
      code >= 0xd800 &&
      code <= 0xdbff &&
      i + 1 < text.length &&
      text.charCodeAt(i + 1) >= 0xdc00 &&
      text.charCodeAt(i + 1) <= 0xdfff
    ) {
      bytes += 4
      i += 1
    } else bytes += 3
  }

  return bytes
}

function catalogFits(catalog) {
  return utf8ByteLength(JSON.stringify(catalog, null, 2) + "\n") <= maxCatalogBytes
}

function parseCatalog(raw) {
  var parsed
  var text = String(raw)
  if (utf8ByteLength(text) > maxCatalogBytes) return invalidCatalog()

  try {
    parsed = JSON.parse(text)
  } catch (_error) {
    return failure("INVALID_JSON", "Snippet catalog is not valid JSON")
  }

  return normalizeCatalog(parsed)
}

function serializeCatalog(catalog) {
  var normalized = normalizeCatalog(catalog)
  if (!normalized.ok) return normalized

  var serialized = JSON.stringify(normalized.value, null, 2) + "\n"
  if (utf8ByteLength(serialized) > maxCatalogBytes) return invalidCatalog()
  return success(serialized)
}

function validationError(message) {
  return failure("VALIDATION_ERROR", message)
}

function notFound() {
  return failure("NOT_FOUND", "Snippet not found")
}

function cloneRecord(record) {
  return {
    id: record.id,
    title: record.title,
    content: record.content,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

function findSnippetIndex(catalog, id) {
  var target = String(id).toLowerCase()

  for (var i = 0; i < catalog.snippets.length; i++) {
    if (catalog.snippets[i].id.toLowerCase() === target) return i
  }

  return -1
}

function hasEditableValue(input, name) {
  return Object.prototype.hasOwnProperty.call(input, name) && input[name] !== undefined
}

function validateEditableInput(input, requireAll) {
  if (!isPlainObject(input)) return validationError("Invalid snippet input")

  var hasTitle = hasEditableValue(input, "title")
  var hasContent = hasEditableValue(input, "content")

  if ((requireAll || hasTitle) && typeof input.title !== "string") {
    return validationError("Title is required")
  }
  if ((requireAll || hasContent) && typeof input.content !== "string") {
    return validationError("Content is required")
  }

  var title = hasTitle ? input.title.trim() : undefined
  var content = hasContent ? input.content : undefined

  if (hasTitle && (!title || unicodeLength(title) > 120)) {
    return validationError("Title must contain between 1 and 120 characters")
  }
  if (hasContent && !/\S/.test(content)) {
    return validationError("Content must not be empty")
  }
  return success({ title: title, content: content })
}

function createSnippet(catalog, input, id, now) {
  var normalized = normalizeCatalog(catalog)
  if (!normalized.ok) return normalized
  if (normalized.value.snippets.length >= 499) return validationError("Snippet catalog is full")
  if (!isUuid(id)) return validationError("Snippet ID is invalid")
  if (!isUtcTimestamp(now)) return validationError("Snippet timestamp is invalid")
  if (findSnippetIndex(normalized.value, id) >= 0)
    return validationError("Snippet ID already exists")

  var editable = validateEditableInput(input, true)
  if (!editable.ok) return editable

  var snippet = {
    id: id,
    title: editable.value.title,
    content: editable.value.content,
    createdAt: now,
    updatedAt: now,
  }

  var createdCatalog = {
    schemaVersion: 1,
    snippets: normalized.value.snippets.concat([snippet]),
  }
  if (!catalogFits(createdCatalog)) return validationError("Snippet catalog exceeds 10 MiB")
  return success(createdCatalog)
}

function getSnippet(catalog, id) {
  var normalized = normalizeCatalog(catalog)
  if (!normalized.ok) return normalized
  if (!isUuid(id)) return validationError("Snippet ID is invalid")

  var index = findSnippetIndex(normalized.value, id)
  if (index < 0) return notFound()

  return success(cloneRecord(normalized.value.snippets[index]))
}

function updateSnippet(catalog, id, changes, now) {
  var normalized = normalizeCatalog(catalog)
  if (!normalized.ok) return normalized
  if (!isUuid(id)) return validationError("Snippet ID is invalid")
  if (!isUtcTimestamp(now)) return validationError("Snippet timestamp is invalid")

  var index = findSnippetIndex(normalized.value, id)
  if (index < 0) return notFound()

  var editable = validateEditableInput(changes, false)
  if (!editable.ok) return editable

  var current = normalized.value.snippets[index]
  var nextTitle = editable.value.title === undefined ? current.title : editable.value.title
  var nextContent = editable.value.content === undefined ? current.content : editable.value.content

  if (nextTitle === current.title && nextContent === current.content) {
    if (!catalogFits(normalized.value)) return validationError("Snippet catalog exceeds 10 MiB")
    return success(normalized.value)
  }

  var updated = {
    id: current.id,
    title: nextTitle,
    content: nextContent,
    createdAt: current.createdAt,
    updatedAt: now,
  }
  var snippets = normalized.value.snippets.slice()
  snippets[index] = updated
  var updatedCatalog = { schemaVersion: 1, snippets: snippets }

  if (!catalogFits(updatedCatalog)) return validationError("Snippet catalog exceeds 10 MiB")
  return success(updatedCatalog)
}

function deleteSnippet(catalog, id) {
  var normalized = normalizeCatalog(catalog)
  if (!normalized.ok) return normalized
  if (!isUuid(id)) return validationError("Snippet ID is invalid")

  var index = findSnippetIndex(normalized.value, id)
  if (index < 0) return notFound()

  var snippets = normalized.value.snippets.slice()
  snippets.splice(index, 1)
  return success({ schemaVersion: 1, snippets: snippets })
}

function compareText(left, right) {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function searchSnippets(catalog, query) {
  var normalized = normalizeCatalog(catalog)
  if (!normalized.ok) return normalized

  var queryText
  if (query === null || query === undefined) queryText = ""
  else if (typeof query !== "string") return validationError("Search query is invalid")
  else queryText = query.trim().toLowerCase()

  var tokens = queryText ? queryText.split(/\s+/) : []
  var matches = []

  for (var i = 0; i < normalized.value.snippets.length; i++) {
    var snippet = normalized.value.snippets[i]
    var title = snippet.title.toLowerCase()
    var content = snippet.content.toLowerCase()
    var score = 0
    var matched = true

    for (var j = 0; j < tokens.length; j++) {
      var token = tokens[j]
      if (title.indexOf(token) >= 0) score += 3
      else if (content.indexOf(token) >= 0) score += 1
      else {
        matched = false
        break
      }
    }

    if (matched) matches.push({ snippet: cloneRecord(snippet), score: score })
  }

  matches.sort(function (left, right) {
    if (left.score !== right.score) return right.score - left.score

    var titleOrder = compareText(
      left.snippet.title.toLowerCase(),
      right.snippet.title.toLowerCase()
    )
    if (titleOrder !== 0) return titleOrder
    return compareText(left.snippet.id, right.snippet.id)
  })

  var snippets = []
  for (var k = 0; k < matches.length; k++) snippets.push(matches[k].snippet)
  return success(snippets)
}

if (typeof module !== "undefined") {
  module.exports = {
    parseCatalog: parseCatalog,
    serializeCatalog: serializeCatalog,
    createSnippet: createSnippet,
    getSnippet: getSnippet,
    updateSnippet: updateSnippet,
    deleteSnippet: deleteSnippet,
    searchSnippets: searchSnippets,
  }
}
