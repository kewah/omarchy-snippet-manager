const test = require("node:test")
const assert = require("node:assert/strict")

const SnippetCatalog = require("../../lib/SnippetCatalog.js")

const ID_ONE = "550e8400-e29b-41d4-a716-446655440000"
const ID_TWO = "6ba7b810-9dad-41d1-80b4-00c04fd430c8"
const CREATED_AT = "2026-08-28T12:00:00.000Z"

function validRecord(overrides = {}) {
  return {
    id: ID_ONE,
    title: "Support email",
    content: "support@example.com",
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  }
}

function validDocument(records = [validRecord()]) {
  return JSON.stringify({ schemaVersion: 1, snippets: records })
}

test("parseCatalog preserves exact Unicode, multiline, and CRLF content", () => {
  const content = "Hello 👋\r\nSecond line\n"

  const result = SnippetCatalog.parseCatalog(validDocument([validRecord({ content })]))

  assert.equal(result.ok, true)
  assert.equal(result.value.snippets[0].content, content)
})

test("parseCatalog normalizes titles", () => {
  const result = SnippetCatalog.parseCatalog(
    validDocument([
      validRecord({
        title: "  Support email  ",
      }),
    ])
  )

  assert.equal(result.ok, true)
  assert.equal(result.value.snippets[0].title, "Support email")
})

test("parseCatalog ignores unknown document and record fields", () => {
  const raw = JSON.stringify({
    schemaVersion: 1,
    futureDocumentField: true,
    snippets: [validRecord({ futureRecordField: "ignored" })],
  })

  const result = SnippetCatalog.parseCatalog(raw)

  assert.equal(result.ok, true)
  assert.deepEqual(Object.keys(result.value), ["schemaVersion", "snippets"])
  assert.deepEqual(Object.keys(result.value.snippets[0]), [
    "id",
    "title",
    "content",
    "createdAt",
    "updatedAt",
  ])
})

test("parseCatalog preserves optional lastUsedAt and omits missing or null values", () => {
  const usedAt = "2026-08-28T15:00:00.000Z"
  const withStamp = SnippetCatalog.parseCatalog(
    validDocument([validRecord({ lastUsedAt: usedAt })])
  )
  const missing = SnippetCatalog.parseCatalog(validDocument([validRecord()]))
  const nulled = SnippetCatalog.parseCatalog(validDocument([validRecord({ lastUsedAt: null })]))

  assert.equal(withStamp.ok, true)
  assert.equal(withStamp.value.snippets[0].lastUsedAt, usedAt)
  assert.deepEqual(Object.keys(withStamp.value.snippets[0]), [
    "id",
    "title",
    "content",
    "createdAt",
    "updatedAt",
    "lastUsedAt",
  ])
  assert.equal(missing.ok, true)
  assert.equal(Object.prototype.hasOwnProperty.call(missing.value.snippets[0], "lastUsedAt"), false)
  assert.equal(nulled.ok, true)
  assert.equal(Object.prototype.hasOwnProperty.call(nulled.value.snippets[0], "lastUsedAt"), false)
})

test("parseCatalog rejects an invalid lastUsedAt without treating it as unused", () => {
  const result = SnippetCatalog.parseCatalog(
    validDocument([validRecord({ lastUsedAt: "2026-99-99T12:00:00.000Z" })])
  )

  assert.equal(result.ok, false)
  assert.equal(result.error.code, "INVALID_CATALOG")
})

test("parseCatalog reports malformed JSON without echoing input", () => {
  const secretLikeContent = "{not-json-password-value"

  const result = SnippetCatalog.parseCatalog(secretLikeContent)

  assert.equal(result.ok, false)
  assert.equal(result.error.code, "INVALID_JSON")
  assert.equal(result.error.message.includes(secretLikeContent), false)
})

test("parseCatalog rejects unsupported schema versions", () => {
  const result = SnippetCatalog.parseCatalog(
    JSON.stringify({
      schemaVersion: 2,
      snippets: [],
    })
  )

  assert.deepEqual(result, {
    ok: false,
    error: {
      code: "UNSUPPORTED_SCHEMA",
      message: "Unsupported snippet catalog schema",
    },
  })
})

test("parseCatalog validates schema version before snippets structure", () => {
  const unknownWithoutSnippets = SnippetCatalog.parseCatalog(JSON.stringify({ schemaVersion: 2 }))
  const stringVersion = SnippetCatalog.parseCatalog(
    JSON.stringify({
      schemaVersion: "1",
      snippets: [],
    })
  )

  assert.equal(unknownWithoutSnippets.ok, false)
  assert.equal(unknownWithoutSnippets.error.code, "UNSUPPORTED_SCHEMA")
  assert.equal(stringVersion.ok, false)
  assert.equal(stringVersion.error.code, "UNSUPPORTED_SCHEMA")
})

test("parseCatalog rejects a non-object document", () => {
  const result = SnippetCatalog.parseCatalog("[]")

  assert.equal(result.ok, false)
  assert.equal(result.error.code, "INVALID_CATALOG")
})

test("parseCatalog rejects 500 records because V1 supports fewer than 500", () => {
  const records = Array.from({ length: 500 }, (_, index) =>
    validRecord({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    })
  )

  const result = SnippetCatalog.parseCatalog(validDocument(records))

  assert.equal(result.ok, false)
  assert.equal(result.error.code, "INVALID_CATALOG")
})

test("parseCatalog rejects duplicate stable IDs", () => {
  const result = SnippetCatalog.parseCatalog(
    validDocument([validRecord(), validRecord({ title: "Another title" })])
  )
  const mixedCase = SnippetCatalog.parseCatalog(
    validDocument([
      validRecord(),
      validRecord({ id: ID_ONE.toUpperCase(), title: "Another title" }),
    ])
  )

  assert.equal(result.ok, false)
  assert.equal(result.error.code, "INVALID_CATALOG")
  assert.equal(mixedCase.ok, false)
  assert.equal(mixedCase.error.code, "INVALID_CATALOG")
})

test("parseCatalog accepts UUID v4 and rejects other UUID versions", () => {
  const v4 = SnippetCatalog.parseCatalog(validDocument())
  const v7 = SnippetCatalog.parseCatalog(
    validDocument([validRecord({ id: "01900000-0000-7000-8000-000000000001" })])
  )

  assert.equal(v4.ok, true)
  assert.equal(v7.ok, false)
  assert.equal(v7.error.code, "INVALID_CATALOG")
})

test("parseCatalog rejects invalid UUIDs", () => {
  const result = SnippetCatalog.parseCatalog(validDocument([validRecord({ id: "not-a-uuid" })]))

  assert.equal(result.ok, false)
  assert.equal(result.error.code, "INVALID_CATALOG")
})

test("parseCatalog rejects empty and overlong titles", () => {
  const empty = SnippetCatalog.parseCatalog(validDocument([validRecord({ title: "   " })]))
  const long = SnippetCatalog.parseCatalog(
    validDocument([validRecord({ title: "😀".repeat(121) })])
  )

  assert.equal(empty.ok, false)
  assert.equal(empty.error.code, "INVALID_CATALOG")
  assert.equal(long.ok, false)
  assert.equal(long.error.code, "INVALID_CATALOG")
})

test("parseCatalog counts a Unicode surrogate pair as one title character", () => {
  const result = SnippetCatalog.parseCatalog(
    validDocument([validRecord({ title: "😀".repeat(120) })])
  )

  assert.equal(result.ok, true)
})

test("parseCatalog rejects content containing only JavaScript whitespace", () => {
  const ordinaryWhitespace = SnippetCatalog.parseCatalog(
    validDocument([validRecord({ content: " \r\n\t" })])
  )
  const byteOrderMark = SnippetCatalog.parseCatalog(
    validDocument([validRecord({ content: "\uFEFF" })])
  )

  assert.equal(ordinaryWhitespace.ok, false)
  assert.equal(ordinaryWhitespace.error.code, "INVALID_CATALOG")
  assert.equal(byteOrderMark.ok, false)
  assert.equal(byteOrderMark.error.code, "INVALID_CATALOG")
})

test("parseCatalog rejects invalid timestamps", () => {
  const timestampResult = SnippetCatalog.parseCatalog(
    validDocument([validRecord({ updatedAt: "2026-99-99T12:00:00.000Z" })])
  )

  assert.equal(timestampResult.ok, false)
  assert.equal(timestampResult.error.code, "INVALID_CATALOG")
})

test("parseCatalog rejects impossible, out-of-range, and hour-24 timestamps", () => {
  const impossibleDate = SnippetCatalog.parseCatalog(
    validDocument([validRecord({ updatedAt: "2026-02-29T12:00:00.000Z" })])
  )
  const oldYear = SnippetCatalog.parseCatalog(
    validDocument([validRecord({ updatedAt: "1969-12-31T23:59:59.999Z" })])
  )
  const hour24 = SnippetCatalog.parseCatalog(
    validDocument([validRecord({ updatedAt: "2026-08-28T24:00:00.000Z" })])
  )

  for (const result of [impossibleDate, oldYear, hour24]) {
    assert.equal(result.ok, false)
    assert.equal(result.error.code, "INVALID_CATALOG")
  }
})

test("serializeCatalog emits deterministic pretty JSON with one trailing newline", () => {
  const parsed = SnippetCatalog.parseCatalog(validDocument())
  assert.equal(parsed.ok, true)

  const result = SnippetCatalog.serializeCatalog(parsed.value)

  assert.equal(result.ok, true)
  assert.equal(result.value, `${JSON.stringify(parsed.value, null, 2)}\n`)
  assert.equal(result.value.endsWith("\n\n"), false)
})

test("catalog operations reject serialized data larger than 10 MiB", () => {
  const hugeContent = "x".repeat(10 * 1024 * 1024 + 1)
  const oversized = {
    schemaVersion: 1,
    snippets: [validRecord({ content: hugeContent })],
  }

  const parsed = SnippetCatalog.parseCatalog(JSON.stringify(oversized))
  const serialized = SnippetCatalog.serializeCatalog(oversized)
  const created = SnippetCatalog.createSnippet(
    { schemaVersion: 1, snippets: [] },
    { title: "Large", content: hugeContent },
    ID_ONE,
    CREATED_AT
  )
  const updated = SnippetCatalog.updateSnippet(
    { schemaVersion: 1, snippets: [validRecord()] },
    ID_ONE,
    { content: hugeContent },
    CREATED_AT
  )
  const noOpOnOversized = SnippetCatalog.updateSnippet(oversized, ID_ONE, {}, CREATED_AT)

  assert.equal(parsed.ok, false)
  assert.equal(parsed.error.code, "INVALID_CATALOG")
  assert.equal(serialized.ok, false)
  assert.equal(serialized.error.code, "INVALID_CATALOG")
  assert.equal(created.ok, false)
  assert.equal(created.error.code, "VALIDATION_ERROR")
  assert.equal(updated.ok, false)
  assert.equal(updated.error.code, "VALIDATION_ERROR")
  assert.equal(noOpOnOversized.ok, false)
  assert.equal(noOpOnOversized.error.code, "VALIDATION_ERROR")
})

test("serializeCatalog rejects an invalid in-memory catalog", () => {
  const result = SnippetCatalog.serializeCatalog({
    schemaVersion: 1,
    snippets: [validRecord({ id: ID_TWO, content: "" })],
  })

  assert.equal(result.ok, false)
  assert.equal(result.error.code, "INVALID_CATALOG")
})

test("createSnippet validates, normalizes, and appends without mutating the catalog", () => {
  const catalog = { schemaVersion: 1, snippets: [validRecord()] }
  const original = structuredClone(catalog)

  const result = SnippetCatalog.createSnippet(
    catalog,
    {
      title: "  Personal email  ",
      content: "me@example.com\n",
    },
    ID_TWO,
    "2026-08-28T13:00:00.000Z"
  )

  assert.equal(result.ok, true)
  assert.deepEqual(catalog, original)
  assert.deepEqual(result.value.snippets[1], {
    id: ID_TWO,
    title: "Personal email",
    content: "me@example.com\n",
    createdAt: "2026-08-28T13:00:00.000Z",
    updatedAt: "2026-08-28T13:00:00.000Z",
  })
})

test("createSnippet allows duplicate titles and content", () => {
  const catalog = { schemaVersion: 1, snippets: [validRecord()] }

  const result = SnippetCatalog.createSnippet(
    catalog,
    {
      title: "Support email",
      content: "support@example.com",
    },
    ID_TWO,
    "2026-08-28T13:00:00.000Z"
  )

  assert.equal(result.ok, true)
  assert.equal(result.value.snippets.length, 2)
})

test("createSnippet rejects invalid input, identity, timestamp, and capacity", () => {
  const invalidInput = SnippetCatalog.createSnippet(
    { schemaVersion: 1, snippets: [] },
    { title: "", content: "secret-value" },
    ID_ONE,
    CREATED_AT
  )
  const invalidIdentity = SnippetCatalog.createSnippet(
    { schemaVersion: 1, snippets: [] },
    { title: "Title", content: "Content" },
    "not-a-uuid",
    CREATED_AT
  )
  const invalidTimestamp = SnippetCatalog.createSnippet(
    { schemaVersion: 1, snippets: [] },
    { title: "Title", content: "Content" },
    ID_ONE,
    "not-a-date"
  )
  const fullCatalog = {
    schemaVersion: 1,
    snippets: Array.from({ length: 499 }, (_, index) =>
      validRecord({
        id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      })
    ),
  }
  const atCapacity = SnippetCatalog.createSnippet(
    fullCatalog,
    { title: "Title", content: "Content" },
    ID_ONE,
    CREATED_AT
  )

  for (const result of [invalidInput, invalidIdentity, invalidTimestamp, atCapacity]) {
    assert.equal(result.ok, false)
    assert.equal(result.error.code, "VALIDATION_ERROR")
    assert.equal(result.error.message.includes("secret-value"), false)
  }
})

test("createSnippet rejects an existing ID case-insensitively", () => {
  const catalog = { schemaVersion: 1, snippets: [validRecord()] }

  const result = SnippetCatalog.createSnippet(
    catalog,
    {
      title: "Another",
      content: "Another value",
    },
    ID_ONE.toUpperCase(),
    "2026-08-28T13:00:00.000Z"
  )

  assert.equal(result.ok, false)
  assert.equal(result.error.code, "VALIDATION_ERROR")
})

test("getSnippet returns a record by stable ID without exposing the catalog record", () => {
  const catalog = { schemaVersion: 1, snippets: [validRecord()] }

  const result = SnippetCatalog.getSnippet(catalog, ID_ONE.toUpperCase())

  assert.equal(result.ok, true)
  assert.deepEqual(result.value, validRecord())
  assert.notEqual(result.value, catalog.snippets[0])
})

test("updateSnippet changes editable fields and preserves identity and creation time", () => {
  const catalog = { schemaVersion: 1, snippets: [validRecord()] }
  const original = structuredClone(catalog)

  const result = SnippetCatalog.updateSnippet(
    catalog,
    ID_ONE,
    {
      title: "  Updated support  ",
      content: "updated@example.com",
    },
    "2026-08-28T14:00:00.000Z"
  )

  assert.equal(result.ok, true)
  assert.deepEqual(catalog, original)
  assert.deepEqual(result.value.snippets[0], {
    id: ID_ONE,
    title: "Updated support",
    content: "updated@example.com",
    createdAt: CREATED_AT,
    updatedAt: "2026-08-28T14:00:00.000Z",
  })
})

test("updateSnippet treats undefined fields as omitted", () => {
  const catalog = { schemaVersion: 1, snippets: [validRecord()] }

  const result = SnippetCatalog.updateSnippet(
    catalog,
    ID_ONE,
    { title: "New title", content: undefined },
    "2026-08-28T14:00:00.000Z"
  )

  assert.equal(result.ok, true)
  assert.equal(result.value.snippets[0].title, "New title")
  assert.equal(result.value.snippets[0].content, "support@example.com")
})

test("updateSnippet preserves lastUsedAt and does not treat it as an editable field", () => {
  const usedAt = "2026-08-28T15:00:00.000Z"
  const catalog = { schemaVersion: 1, snippets: [validRecord({ lastUsedAt: usedAt })] }

  const result = SnippetCatalog.updateSnippet(
    catalog,
    ID_ONE,
    { title: "Updated support" },
    "2026-08-28T14:00:00.000Z"
  )

  assert.equal(result.ok, true)
  assert.equal(result.value.snippets[0].title, "Updated support")
  assert.equal(result.value.snippets[0].lastUsedAt, usedAt)
  assert.equal(result.value.snippets[0].updatedAt, "2026-08-28T14:00:00.000Z")
})

test("markSnippetUsed sets lastUsedAt without changing content or updatedAt", () => {
  const catalog = { schemaVersion: 1, snippets: [validRecord()] }
  const original = structuredClone(catalog)
  const usedAt = "2026-08-28T16:00:00.000Z"

  const result = SnippetCatalog.markSnippetUsed(catalog, ID_ONE.toUpperCase(), usedAt)

  assert.equal(result.ok, true)
  assert.deepEqual(catalog, original)
  assert.deepEqual(result.value.snippets[0], validRecord({ lastUsedAt: usedAt }))
  assert.equal(result.value.snippets[0].updatedAt, CREATED_AT)
  assert.equal(result.value.snippets[0].content, "support@example.com")
})

test("markSnippetUsed rejects missing snippets and invalid timestamps", () => {
  const catalog = { schemaVersion: 1, snippets: [validRecord()] }

  const missing = SnippetCatalog.markSnippetUsed(
    catalog,
    "123e4567-e89b-42d3-a456-426614174000",
    "2026-08-28T16:00:00.000Z"
  )
  const invalidTime = SnippetCatalog.markSnippetUsed(catalog, ID_ONE, "not-a-date")

  assert.deepEqual(missing, {
    ok: false,
    error: { code: "NOT_FOUND", message: "Snippet not found" },
  })
  assert.equal(invalidTime.ok, false)
  assert.equal(invalidTime.error.code, "VALIDATION_ERROR")
})

test("updateSnippet leaves updatedAt unchanged when editable values do not change", () => {
  const catalog = { schemaVersion: 1, snippets: [validRecord()] }

  const emptyResult = SnippetCatalog.updateSnippet(catalog, ID_ONE, {}, "2026-08-28T14:00:00.000Z")
  const sameValuesResult = SnippetCatalog.updateSnippet(
    catalog,
    ID_ONE,
    {
      title: "  Support email  ",
      content: "support@example.com",
      ignored: true,
    },
    "2026-08-28T14:00:00.000Z"
  )

  assert.equal(emptyResult.ok, true)
  assert.deepEqual(emptyResult.value, catalog)
  assert.equal(sameValuesResult.ok, true)
  assert.deepEqual(sameValuesResult.value, catalog)
})

test("updateSnippet supports partial changes", () => {
  const catalog = { schemaVersion: 1, snippets: [validRecord()] }

  const result = SnippetCatalog.updateSnippet(
    catalog,
    ID_ONE,
    { title: "New title" },
    "2026-08-28T14:00:00.000Z"
  )

  assert.equal(result.ok, true)
  assert.equal(result.value.snippets[0].title, "New title")
  assert.equal(result.value.snippets[0].content, "support@example.com")
})

test("updateSnippet rejects invalid changes without exposing content", () => {
  const catalog = { schemaVersion: 1, snippets: [validRecord()] }

  const result = SnippetCatalog.updateSnippet(
    catalog,
    ID_ONE,
    {
      content: "secret-invalid-whitespace\n".replace("secret-invalid-whitespace", "   "),
    },
    "2026-08-28T14:00:00.000Z"
  )

  assert.equal(result.ok, false)
  assert.equal(result.error.code, "VALIDATION_ERROR")
  assert.equal(result.error.message.includes("secret"), false)
})

test("deleteSnippet removes exactly one record without mutating the catalog", () => {
  const catalog = {
    schemaVersion: 1,
    snippets: [validRecord(), validRecord({ id: ID_TWO, title: "Second" })],
  }
  const original = structuredClone(catalog)

  const result = SnippetCatalog.deleteSnippet(catalog, ID_ONE)

  assert.equal(result.ok, true)
  assert.deepEqual(catalog, original)
  assert.deepEqual(result.value.snippets, [validRecord({ id: ID_TWO, title: "Second" })])
})

test("get, update, and delete return NOT_FOUND for an absent ID", () => {
  const catalog = { schemaVersion: 1, snippets: [validRecord()] }
  const missing = "123e4567-e89b-42d3-a456-426614174000"

  const results = [
    SnippetCatalog.getSnippet(catalog, missing),
    SnippetCatalog.updateSnippet(catalog, missing, { title: "Nope" }, CREATED_AT),
    SnippetCatalog.deleteSnippet(catalog, missing),
  ]

  for (const result of results) {
    assert.deepEqual(result, {
      ok: false,
      error: { code: "NOT_FOUND", message: "Snippet not found" },
    })
  }
})
