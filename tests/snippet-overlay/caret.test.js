const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const ROOT = path.join(__dirname, "../..")
const SEARCH_VIEW = fs.readFileSync(path.join(ROOT, "ui/SnippetSearchView.qml"), "utf8")
const EDITOR = fs.readFileSync(path.join(ROOT, "ui/SnippetEditor.qml"), "utf8")
const FIELD_CHROME = fs.readFileSync(path.join(ROOT, "ui/SnippetFieldChrome.qml"), "utf8")
const SNIPPETS = fs.readFileSync(path.join(ROOT, "Snippets.qml"), "utf8")

test("search header paints a caret with the menu text color while keys are armed", () => {
  assert.match(SEARCH_VIEW, /property bool keyboardActive/)
  assert.match(
    SEARCH_VIEW,
    /id:\s*queryCaret[\s\S]*?color:\s*root\.foreground[\s\S]*?visible:\s*root\.keyboardActive/
  )
  assert.match(SNIPPETS, /keyboardActive:\s*root\.searchKeysArmed/)
})

test("editor title and content fields share focus-only four-sided chrome", () => {
  assert.match(FIELD_CHROME, /Border\.flat\(root\.foreground/)
  assert.match(FIELD_CHROME, /Border\.none\(\)/)
  assert.equal(EDITOR.includes("fieldBorderSpec"), false)
  assert.equal(EDITOR.includes("Border.surfaceSpec"), false)
  assert.equal(EDITOR.includes("anchors.leftMargin: titleField.activeFocus"), false)
  assert.equal(EDITOR.includes("anchors.leftMargin: contentArea.activeFocus"), false)
  assert.match(EDITOR, /SnippetFieldChrome[\s\S]*?id:\s*titleField/)
  assert.match(EDITOR, /SnippetFieldChrome[\s\S]*?id:\s*contentArea/)
  assert.match(EDITOR, /id:\s*titleField[\s\S]*?background:\s*Item/)
  assert.match(EDITOR, /id:\s*contentArea[\s\S]*?background:\s*Item/)
})

test("editor title and content fields paint a caret with the menu text color", () => {
  assert.match(
    EDITOR,
    /id:\s*titleField[\s\S]*?cursorDelegate:\s*Rectangle\s*\{[^}]*color:\s*root\.foreground[\s\S]*?visible:\s*titleField\.cursorVisible/
  )
  assert.match(
    EDITOR,
    /id:\s*contentArea[\s\S]*?cursorDelegate:\s*Rectangle\s*\{[^}]*color:\s*root\.foreground[\s\S]*?visible:\s*contentArea\.cursorVisible/
  )
})
