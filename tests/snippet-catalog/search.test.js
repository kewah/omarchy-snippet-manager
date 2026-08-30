const test = require("node:test")
const assert = require("node:assert/strict")
const { performance } = require("node:perf_hooks")

const SnippetCatalog = require("../../lib/SnippetCatalog.js")

const CREATED_AT = "2026-08-28T12:00:00.000Z"

function record(index, overrides = {}) {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    title: `Snippet ${index}`,
    keywords: [],
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

test("searchSnippets requires every query token to match across searchable fields", () => {
  const source = catalog([
    record(1, {
      title: "Support reply",
      keywords: ["customer"],
      content: "Hello there",
    }),
    record(2, {
      title: "Support reply",
      keywords: ["internal"],
      content: "Escalate only",
    }),
    record(3, {
      title: "Greeting",
      keywords: ["customer"],
      content: "Hello there",
    }),
  ])

  const result = SnippetCatalog.searchSnippets(source, "support customer hello")

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
      keywords: ["CAFÉ"],
      content: "À bientôt",
    }),
  ])

  const result = SnippetCatalog.searchSnippets(source, "  RÉSUMÉ\t café  ")

  assert.equal(result.ok, true)
  assert.deepEqual(
    result.value.map((snippet) => snippet.id),
    [record(1).id]
  )
})

test("searchSnippets ranks title matches above keywords above content", () => {
  const source = catalog([
    record(1, { title: "Alpha", content: "target" }),
    record(2, { title: "Alpha", keywords: ["target"] }),
    record(3, { title: "Target title" }),
  ])

  const result = SnippetCatalog.searchSnippets(source, "target")

  assert.equal(result.ok, true)
  assert.deepEqual(
    result.value.map((snippet) => snippet.id),
    [record(3).id, record(2).id, record(1).id]
  )
})

test("searchSnippets counts only the highest-weight field for each token", () => {
  const source = catalog([
    record(1, {
      title: "Target zebra",
      keywords: ["target"],
      content: "target",
    }),
    record(2, { title: "Target alpha" }),
  ])

  const result = SnippetCatalog.searchSnippets(source, "target")

  assert.equal(result.ok, true)
  assert.deepEqual(
    result.value.map((snippet) => snippet.id),
    [record(2).id, record(1).id]
  )
})

test("searchSnippets breaks score ties by case-insensitive title then stable ID", () => {
  const source = catalog([
    record(3, { title: "beta target" }),
    record(2, { title: "Alpha target" }),
    record(1, { title: "alpha target" }),
  ])

  const result = SnippetCatalog.searchSnippets(source, "target")

  assert.equal(result.ok, true)
  assert.deepEqual(
    result.value.map((snippet) => snippet.id),
    [record(1).id, record(2).id, record(3).id]
  )
})

test("searchSnippets tie-breaks equal titles by exact stored ID", () => {
  const lowercaseId = "00000000-0000-4000-8000-00000000000a"
  const uppercaseId = "00000000-0000-4000-8000-00000000000B"
  const source = catalog([
    record(1, { id: lowercaseId, title: "Same" }),
    record(2, { id: uppercaseId, title: "Same" }),
  ])

  const result = SnippetCatalog.searchSnippets(source, "")

  assert.equal(result.ok, true)
  assert.deepEqual(
    result.value.map((snippet) => snippet.id),
    [uppercaseId, lowercaseId]
  )
})

test("searchSnippets returns an empty query sorted by title and stable ID", () => {
  const source = catalog([
    record(3, { title: "Zulu" }),
    record(2, { title: "alpha" }),
    record(1, { title: "Alpha" }),
  ])

  const result = SnippetCatalog.searchSnippets(source, "   ")

  assert.equal(result.ok, true)
  assert.deepEqual(
    result.value.map((snippet) => snippet.id),
    [record(1).id, record(2).id, record(3).id]
  )
})

test("searchSnippets returns detached records and does not mutate the catalog", () => {
  const source = catalog([record(1, { title: "Target" })])
  const original = structuredClone(source)

  const result = SnippetCatalog.searchSnippets(source, "target")

  assert.equal(result.ok, true)
  assert.deepEqual(source, original)
  assert.notEqual(result.value[0], source.snippets[0])
  assert.notEqual(result.value[0].keywords, source.snippets[0].keywords)
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
      keywords: index % 10 === 0 ? ["support", "customer"] : ["general"],
      content: `Hello customer, this is multiline response ${index}.\nRegards.`,
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
