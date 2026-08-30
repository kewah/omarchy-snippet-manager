const test = require("node:test")
const assert = require("node:assert/strict")
const { Linter } = require("eslint")

const rule = require("../../eslint-rules/require-qml-dual-export.js")

const MESSAGE =
  'lib/*.js must assign named module.exports inside if (typeof module !== "undefined")'

const linter = new Linter({ configType: "flat" })

function lint(code) {
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
          "require-qml-dual-export": rule,
        },
      },
    },
    rules: {
      "local/require-qml-dual-export": "error",
    },
  })
}

function messages(code) {
  return lint(code).map(function (item) {
    return item.message
  })
}

test("accepts named module.exports inside typeof module guard", () => {
  assert.deepEqual(
    messages(`
function foo() {}
if (typeof module !== "undefined") {
  module.exports = {
    foo: foo,
  }
}
`),
    []
  )
})

test("accepts reversed comparison and !=", () => {
  assert.deepEqual(
    messages(`
function foo() {}
function bar() {}
if ("undefined" != typeof module) {
  module.exports = { foo: foo, bar: bar }
}
`),
    []
  )
})

test("rejects files with no dual-load wrapper", () => {
  assert.deepEqual(messages("function foo() {}"), [MESSAGE])
})

test("rejects module.exports without the typeof module guard", () => {
  assert.deepEqual(
    messages(`
function foo() {}
module.exports = { foo: foo }
`),
    [MESSAGE]
  )
})

test("rejects default-style module.exports = someFn", () => {
  assert.deepEqual(
    messages(`
function foo() {}
if (typeof module !== "undefined") {
  module.exports = foo
}
`),
    [MESSAGE]
  )
})

test("rejects exports.foo assignments without named module.exports object", () => {
  assert.deepEqual(
    messages(`
function foo() {}
if (typeof module !== "undefined") {
  exports.foo = foo
}
`),
    [MESSAGE]
  )
})

test("rejects module.exports.foo without an object assignment", () => {
  assert.deepEqual(
    messages(`
function foo() {}
if (typeof module !== "undefined") {
  module.exports.foo = foo
}
`),
    [MESSAGE]
  )
})

test("rejects empty or default-only export objects", () => {
  assert.deepEqual(
    messages(`
function foo() {}
if (typeof module !== "undefined") {
  module.exports = {}
}
`),
    [MESSAGE]
  )
  assert.deepEqual(
    messages(`
function foo() {}
if (typeof module !== "undefined") {
  module.exports = { default: foo }
}
`),
    [MESSAGE]
  )
})
