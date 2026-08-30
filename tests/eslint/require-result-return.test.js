const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { Linter } = require("eslint")

const rule = require("../../eslint-rules/require-result-return.js")

const MESSAGE = "must return { ok: true, value } or { ok: false, error: { code, message } }"

const linter = new Linter({ configType: "flat" })

function lint(code, options) {
  const ruleEntry = options ? ["error", options] : "error"
  return linter.verify(code, {
    languageOptions: {
      ecmaVersion: 5,
      sourceType: "script",
      globals: {
        module: "readonly",
        exports: "writable",
      },
    },
    plugins: {
      local: {
        rules: {
          "require-result-return": rule,
        },
      },
    },
    rules: {
      "local/require-result-return": ruleEntry,
    },
  })
}

function messages(code, options) {
  return lint(code, options).map(function (item) {
    return item.message
  })
}

function messageFor(name) {
  return name + "() " + MESSAGE
}

const VALID_CATALOG = `
function success(value) {
  return { ok: true, value: value }
}
function failure(code, message) {
  return { ok: false, error: { code: code, message: message } }
}
function normalizeCatalog(value) {
  if (!value) return failure("INVALID_CATALOG", "Invalid snippet catalog")
  return success(value)
}
function parseCatalog(raw) {
  var normalized = normalizeCatalog(raw)
  if (!normalized.ok) return normalized
  return success(normalized.value)
}
if (typeof module !== "undefined") {
  module.exports = { parseCatalog: parseCatalog }
}
`

test("accepts success/failure helpers and Result identifiers", () => {
  assert.deepEqual(messages(VALID_CATALOG), [])
})

test("accepts Result helper defined after the exported API", () => {
  assert.deepEqual(
    messages(`
function parseCatalog(raw) {
  return helper(raw)
}
function helper(raw) {
  return { ok: true, value: raw }
}
if (typeof module !== "undefined") {
  module.exports = { parseCatalog: parseCatalog }
}
`),
    []
  )
})

test("accepts inline ok true/false object returns", () => {
  assert.deepEqual(
    messages(`
function mergeMenu(text) {
  if (!text) {
    return {
      ok: false,
      error: { code: "INVALID_MENU", message: "Menu file was invalid" },
    }
  }
  return { ok: true, value: text }
}
if (typeof module !== "undefined") {
  module.exports = { mergeMenu: mergeMenu }
}
`),
    []
  )
})

test("skips non-function exports and unlisted helpers", () => {
  assert.deepEqual(
    messages(
      `
function transferPlan(payload) {
  return { ok: true, value: payload }
}
function helperCommand() {
  return null
}
var BIND_LINE = "bind"
if (typeof module !== "undefined") {
  module.exports = {
    transferPlan: transferPlan,
    helperCommand: helperCommand,
    BIND_LINE: BIND_LINE,
  }
}
`,
      { functions: ["transferPlan"] }
    ),
    []
  )
})

test("rejects returning a plain payload", () => {
  assert.deepEqual(
    messages(`
function parseCatalog(raw) {
  return raw
}
if (typeof module !== "undefined") {
  module.exports = { parseCatalog: parseCatalog }
}
`),
    [messageFor("parseCatalog")]
  )
})

test("rejects ok true without value", () => {
  assert.deepEqual(
    messages(`
function parseCatalog() {
  return { ok: true }
}
if (typeof module !== "undefined") {
  module.exports = { parseCatalog: parseCatalog }
}
`),
    [messageFor("parseCatalog")]
  )
})

test("rejects ok false without error.code and error.message", () => {
  assert.deepEqual(
    messages(`
function parseCatalog() {
  return { ok: false, error: { code: "INVALID_JSON" } }
}
if (typeof module !== "undefined") {
  module.exports = { parseCatalog: parseCatalog }
}
`),
    [messageFor("parseCatalog")]
  )
})

test("rejects OverlayModel-style { state, effects } when listed", () => {
  assert.deepEqual(
    messages(`
function transition(state) {
  return { state: state, effects: [] }
}
if (typeof module !== "undefined") {
  module.exports = { transition: transition }
}
`),
    [messageFor("transition")]
  )
})

test("reports each bad return in a listed API", () => {
  assert.deepEqual(
    messages(`
function parseCatalog(raw) {
  if (!raw) return null
  return { snippets: [] }
}
if (typeof module !== "undefined") {
  module.exports = { parseCatalog: parseCatalog }
}
`),
    [messageFor("parseCatalog"), messageFor("parseCatalog")]
  )
})

test("reports a configured function that is missing", () => {
  assert.deepEqual(
    messages("function helperCommand() { return null }", {
      functions: ["transferPlan"],
    }),
    ["expected Result API function transferPlan"]
  )
})

test("accepts lib/SnippetCatalog.js", () => {
  const code = fs.readFileSync(path.join(__dirname, "../../lib/SnippetCatalog.js"), "utf8")
  assert.deepEqual(messages(code), [])
})

test("accepts lib/SnippetTransfer.js transferPlan", () => {
  const code = fs.readFileSync(path.join(__dirname, "../../lib/SnippetTransfer.js"), "utf8")
  assert.deepEqual(messages(code, { functions: ["transferPlan"] }), [])
})

test("accepts lib/OmarchyInstall.js exported functions", () => {
  const code = fs.readFileSync(path.join(__dirname, "../../lib/OmarchyInstall.js"), "utf8")
  assert.deepEqual(messages(code), [])
})

test("rejects OverlayModel if the rule were applied to all exports", () => {
  const code = fs.readFileSync(path.join(__dirname, "../../lib/SnippetOverlayModel.js"), "utf8")
  assert.ok(messages(code).length > 0)
})
