const test = require("node:test")
const assert = require("node:assert/strict")
const { performance } = require("node:perf_hooks")

const SnippetCatalog = require("../../lib/SnippetCatalog.js")

const CREATED_AT = "2026-08-28T12:00:00.000Z"

function record(index, overrides = {}) {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    title: `Snippet ${index}`,
    content: `Content ${index}`,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  }
}

function catalog(snippets) {
  return { schemaVersion: 1, snippets }
}

test("searchSnippets rejects non-string queries except null and undefined", () => {
  const source = catalog([record(1)])

  const objectQuery = SnippetCatalog.searchSnippets(source, { text: "target" })
  const nullQuery = SnippetCatalog.searchSnippets(source, null)
  const undefinedQuery = SnippetCatalog.searchSnippets(source, undefined)

  assert.equal(objectQuery.ok, false)
  assert.equal(objectQuery.error.code, "VALIDATION_ERROR")
  assert.equal(nullQuery.ok, true)
  assert.equal(undefinedQuery.ok, true)
})

test("searchSnippets requires every query token to match across title and content", () => {
  const source = catalog([
    record(1, {
      title: "Support reply",
      content: "Hello there",
    }),
    record(2, {
      title: "Support reply",
      content: "Escalate only",
    }),
    record(3, {
      title: "Greeting",
      content: "Hello there",
    }),
  ])

  const result = SnippetCatalog.searchSnippets(source, "support hello")

  assert.equal(result.ok, true)
  assert.deepEqual(
    result.value.map((snippet) => snippet.id),
    [record(1).id]
  )
})

test("searchSnippets is case-insensitive and tokenizes runs of whitespace", () => {
  const source = catalog([
    record(1, {
      title: "Résumé Reply",
      content: "CAFÉ à bientôt",
    }),
  ])

  const result = SnippetCatalog.searchSnippets(source, "  RÉSUMÉ\t café  ")

  assert.equal(result.ok, true)
  assert.deepEqual(
    result.value.map((snippet) => snippet.id),
    [record(1).id]
  )
})

test("searchSnippets orders used snippets by lastUsedAt descending", () => {
  const source = catalog([
    record(1, { lastUsedAt: "2026-08-28T12:00:00.000Z" }),
    record(2, { lastUsedAt: "2026-08-28T14:00:00.000Z" }),
    record(3, { lastUsedAt: "2026-08-28T13:00:00.000Z" }),
  ])

  const result = SnippetCatalog.searchSnippets(source, "")

  assert.equal(result.ok, true)
  assert.deepEqual(
    result.value.map((snippet) => snippet.id),
    [record(2).id, record(3).id, record(1).id]
  )
})

test("searchSnippets keeps unused snippets after used ones in catalog order", () => {
  const source = catalog([
    record(1),
    record(2, { lastUsedAt: "2026-08-28T12:00:00.000Z" }),
    record(3),
    record(4, { lastUsedAt: "2026-08-28T13:00:00.000Z" }),
  ])

  const result = SnippetCatalog.searchSnippets(source, "")

  assert.equal(result.ok, true)
  assert.deepEqual(
    result.value.map((snippet) => snippet.id),
    [record(4).id, record(2).id, record(1).id, record(3).id]
  )
})

test("searchSnippets breaks lastUsedAt ties with catalog order", () => {
  const usedAt = "2026-08-28T12:00:00.000Z"
  const source = catalog([
    record(3, { lastUsedAt: usedAt }),
    record(1, { lastUsedAt: usedAt }),
    record(2, { lastUsedAt: usedAt }),
  ])

  const result = SnippetCatalog.searchSnippets(source, "")

  assert.equal(result.ok, true)
  assert.deepEqual(
    result.value.map((snippet) => snippet.id),
    [record(3).id, record(1).id, record(2).id]
  )
})

test("searchSnippets applies last-used order to filtered matches", () => {
  const source = catalog([
    record(1, { title: "Alpha", content: "target", lastUsedAt: "2026-08-28T12:00:00.000Z" }),
    record(2, { title: "Target title" }),
    record(3, { title: "Other" }),
  ])

  const result = SnippetCatalog.searchSnippets(source, "target")

  assert.equal(result.ok, true)
  assert.deepEqual(
    result.value.map((snippet) => snippet.id),
    [record(1).id, record(2).id]
  )
})

test("searchSnippets returns an empty query in catalog order when nothing has been used", () => {
  const source = catalog([
    record(3, { title: "Zulu" }),
    record(2, { title: "alpha" }),
    record(1, { title: "Alpha" }),
  ])

  const result = SnippetCatalog.searchSnippets(source, "   ")

  assert.equal(result.ok, true)
  assert.deepEqual(
    result.value.map((snippet) => snippet.id),
    [record(3).id, record(2).id, record(1).id]
  )
})

test("searchSnippets returns detached records and does not mutate the catalog", () => {
  const source = catalog([record(1, { title: "Target" })])
  const original = structuredClone(source)

  const result = SnippetCatalog.searchSnippets(source, "target")

  assert.equal(result.ok, true)
  assert.deepEqual(source, original)
  assert.notEqual(result.value[0], source.snippets[0])
})

test("searchSnippets rejects an invalid catalog", () => {
  const result = SnippetCatalog.searchSnippets({ schemaVersion: 1, snippets: "invalid" }, "query")

  assert.equal(result.ok, false)
  assert.equal(result.error.code, "INVALID_CATALOG")
})

test("searchSnippets completes a representative 499-record query within 50 ms", () => {
  const snippets = Array.from({ length: 499 }, (_, index) =>
    record(index, {
      title: `Reusable response ${index}`,
      content: `${index % 10 === 0 ? "Support" : "General"} customer response ${index}.\nRegards.`,
    })
  )
  const source = catalog(snippets)

  const startedAt = performance.now()
  const result = SnippetCatalog.searchSnippets(source, "support customer response")
  const elapsed = performance.now() - startedAt

  assert.equal(result.ok, true)
  assert.equal(result.value.length, 50)
  assert.ok(elapsed < 50, `Expected search under 50 ms, received ${elapsed.toFixed(2)} ms`)
})
