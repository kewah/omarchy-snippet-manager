const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const OverlayModel = require("../../lib/SnippetOverlayModel.js")

const ROOT = path.join(__dirname, "../..")
const SEARCH_VIEW = fs.readFileSync(path.join(ROOT, "ui/SnippetSearchView.qml"), "utf8")
const EDITOR = fs.readFileSync(path.join(ROOT, "ui/SnippetEditor.qml"), "utf8")

test("empty catalog copy keeps the heading and omits the get-started subtitle", () => {
  const copy = OverlayModel.emptyStateCopy("empty")

  assert.equal(copy.heading, "No snippets yet")
  assert.equal(copy.subtitle, "")
  assert.equal(String(copy.subtitle).toLowerCase().includes("get started"), false)
})

test("no-results copy keeps a search hint without a create prompt", () => {
  const copy = OverlayModel.emptyStateCopy("no-results")

  assert.equal(copy.heading, "No matching snippets")
  assert.equal(copy.subtitle, "Try a different search")
})

test("listItemText is the title only", () => {
  assert.equal(OverlayModel.listItemText({ title: "Test", content: "Foo\nBar" }), "Test")
  assert.equal(OverlayModel.listItemText({ title: "Test", content: "Foo" }).includes("Foo"), false)
  assert.equal(OverlayModel.listItemText(null), "")
})

test("button labels include the overlay shortcut spelling", () => {
  assert.equal(OverlayModel.createButtonLabel(), "Create snippet [Ctrl+Shift+N]")
  assert.equal(OverlayModel.saveButtonLabel(false), "Save [Ctrl+S]")
  assert.equal(OverlayModel.saveButtonLabel(true), "Saving… [Ctrl+S]")
  assert.equal(OverlayModel.cancelButtonLabel(), "Cancel [Escape]")
})

test("editorShortcutHints is empty because shortcuts live on the buttons", () => {
  assert.equal(OverlayModel.editorShortcutHints(), "")
})

test("search view hides the search field only in the true empty catalog state", () => {
  assert.match(SEARCH_VIEW, /OverlayModel\.showsSearchField/)
  assert.match(SEARCH_VIEW, /visible:\s*root\.showSearchField/)
})

test("search view binds empty-state copy and the create shortcut label", () => {
  assert.match(SEARCH_VIEW, /OverlayModel\.emptyStateCopy/)
  assert.match(SEARCH_VIEW, /label:\s*"Create snippet"/)
  assert.match(SEARCH_VIEW, /shortcut:\s*"Ctrl\+Shift\+N"/)
  assert.equal(SEARCH_VIEW.includes("Create a snippet to get started"), false)
  assert.equal(SEARCH_VIEW.toLowerCase().includes("get started"), false)
})

test("search view list rows bind title-only text", () => {
  assert.match(SEARCH_VIEW, /OverlayModel\.listItemText/)
  assert.equal(
    /text:\s*OverlayModel\.previewText\(resultRow\.modelData\.content/.test(SEARCH_VIEW),
    false
  )
})

test("search view preview pane shows content only", () => {
  assert.equal(
    /text:\s*root\.selectedSnippet\(\) \? root\.selectedSnippet\(\)\.title/.test(SEARCH_VIEW),
    false
  )
  assert.match(
    SEARCH_VIEW,
    /text:\s*root\.selectedSnippet\(\) \? root\.selectedSnippet\(\)\.content/
  )
})

test("create and edit view buttons carry shortcuts and drop the footer hint", () => {
  assert.match(EDITOR, /label:\s*root\.busy \? "Saving…" : "Save"/)
  assert.match(EDITOR, /shortcut:\s*"Ctrl\+S"/)
  assert.match(EDITOR, /label:\s*"Cancel"/)
  assert.match(EDITOR, /shortcut:\s*"Escape"/)
  assert.equal(EDITOR.includes("Ctrl+S Save"), false)
  assert.equal(EDITOR.includes("Escape Cancel"), false)
  assert.equal(EDITOR.includes("OverlayModel.editorShortcutHints"), false)
})
