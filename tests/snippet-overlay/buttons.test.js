const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const OverlayModel = require("../../lib/SnippetOverlayModel.js")

const ROOT = path.join(__dirname, "../..")
const BUTTON = fs.readFileSync(path.join(ROOT, "ui/SnippetButton.qml"), "utf8")
const SEARCH_VIEW = fs.readFileSync(path.join(ROOT, "ui/SnippetSearchView.qml"), "utf8")
const EDITOR = fs.readFileSync(path.join(ROOT, "ui/SnippetEditor.qml"), "utf8")
const DELETE = fs.readFileSync(path.join(ROOT, "ui/SnippetDeleteDialog.qml"), "utf8")
const SNIPPETS = fs.readFileSync(path.join(ROOT, "Snippets.qml"), "utf8")

const OVERLAY_VIEWS = [
  { name: "Snippets.qml", source: SNIPPETS },
  { name: "ui/SnippetSearchView.qml", source: SEARCH_VIEW },
  { name: "ui/SnippetEditor.qml", source: EDITOR },
  { name: "ui/SnippetDeleteDialog.qml", source: DELETE },
]

function snippetButtonBlocks(source) {
  const blocks = []
  const pattern = /SnippetButton\s*\{/g
  let match
  while ((match = pattern.exec(source))) {
    let depth = 0
    let end = match.index
    for (let i = match.index; i < source.length; i++) {
      if (source[i] === "{") depth += 1
      else if (source[i] === "}") {
        depth -= 1
        if (depth === 0) {
          end = i + 1
          break
        }
      }
    }
    blocks.push(source.slice(match.index, end))
  }
  return blocks
}

test("labeledShortcut formats every button as Label [Shortcut]", () => {
  assert.equal(OverlayModel.labeledShortcut("Cancel", "Escape"), "Cancel [Escape]")
  assert.equal(OverlayModel.labeledShortcut("Delete", "Enter"), "Delete [Enter]")
  assert.equal(
    OverlayModel.labeledShortcut("Create snippet", "Ctrl+Shift+N"),
    "Create snippet [Ctrl+Shift+N]"
  )
})

test("SnippetButton requires label and shortcut and composes them", () => {
  assert.match(BUTTON, /required property string label/)
  assert.match(BUTTON, /required property string shortcut/)
  assert.match(BUTTON, /OverlayModel\.labeledShortcut/)
  assert.equal(/\bButton \{/.test(BUTTON), true)
})

test("overlay views use SnippetButton for every action and never kit Button", () => {
  for (const view of OVERLAY_VIEWS) {
    assert.equal(/\bButton \{/.test(view.source), false, view.name + " still uses Button")
  }

  const blocks = snippetButtonBlocks(SEARCH_VIEW)
    .concat(snippetButtonBlocks(EDITOR))
    .concat(snippetButtonBlocks(DELETE))
  assert.equal(blocks.length >= 7, true)

  for (const block of blocks) {
    assert.match(block, /\blabel:/)
    assert.match(block, /\bshortcut:/)
  }
})

test("delete dialog buttons include shortcuts and drop the footer legend", () => {
  assert.match(DELETE, /label:\s*"Cancel"/)
  assert.match(DELETE, /shortcut:\s*"Escape"/)
  assert.match(DELETE, /shortcut:\s*"Enter"/)
  assert.match(DELETE, /label:\s*root\.busy \? "Deleting…" : "Delete"/)
  assert.equal(DELETE.includes("Arrow keys or Tab to choose"), false)
  assert.equal(DELETE.includes("Enter confirm"), false)
  assert.equal(DELETE.includes("Escape cancel"), false)
})

test("delete dialog copy is the snippet title and a one-line warning", () => {
  const copy = OverlayModel.deleteDialogCopy("Toto")

  assert.equal(copy.heading, "Delete Toto?")
  assert.equal(copy.subtitle, "This cannot be undone")
  assert.equal(copy.heading.includes("snippet?"), false)
  assert.equal(copy.subtitle.includes("Delete "), false)
  assert.match(DELETE, /OverlayModel\.deleteDialogCopy/)
  assert.equal(DELETE.includes("Delete snippet?"), false)
  assert.equal(DELETE.includes("This cannot be undone."), false)
})

test("editor and delete action rows sit on the right", () => {
  assert.match(EDITOR, /anchors\.right:\s*parent\.right/)
  assert.match(DELETE, /anchors\.right:\s*parent\.right/)
})
