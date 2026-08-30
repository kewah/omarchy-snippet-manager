const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const Install = require("../../lib/OmarchyInstall.js")

const TOGGLE_COMMAND = "omarchy-shell shell toggle kewah.snippet-manager"
const BIND_LINE =
  'o.bind("SUPER + CTRL + M", "Snippets", "omarchy-shell shell toggle kewah.snippet-manager")'
const QUICKLINKS_ACTION = "omarchy-launch-browser 'https://github.com/kewah?tab=repositories'"

const MENU_WITH_QUICKLINKS = `{
  // Extend the Quickshell Omarchy menu with JSONC.
  "quicklinks": {
    "icon": "󰞧",
    "label": "Quicklinks",
    "aliases": ["links", "bookmarks"]
  },
  "quicklinks.github": {
    "icon": "",
    "label": "GitHub",
    "action": "${QUICKLINKS_ACTION}"
  },
}
`

const MENU_WITHOUT_TRAILING_COMMA = `{
  "quicklinks": {"label": "Quicklinks"}
}
`

const BIND_WITH_PERSONAL = `-- personal overrides
o.bind("SUPER + SHIFT + R", "SSH", "alacritty -e ssh your-server")
`

test("mergeMenu inserts trigger.snippets without dropping Quicklinks or comments", () => {
  const result = Install.mergeMenu(MENU_WITH_QUICKLINKS)
  assert.equal(result.ok, true)
  assert.equal(result.value.changed, true)
  assert.equal(result.value.text.includes("quicklinks.github"), true)
  assert.equal(result.value.text.includes(QUICKLINKS_ACTION), true)
  assert.equal(result.value.text.includes("Extend the Quickshell Omarchy menu"), true)
  assert.equal(result.value.text.includes('"trigger.snippets"'), true)
  assert.equal(result.value.text.includes(TOGGLE_COMMAND), true)
  assert.equal(result.value.text.includes('"aliases"'), true)
  assert.equal(/"trigger\.snippets"[\s\S]*"aliases"/.test(result.value.text), false)
})

test("mergeMenu is a no-op when trigger.snippets already exists", () => {
  const first = Install.mergeMenu(MENU_WITH_QUICKLINKS)
  const second = Install.mergeMenu(first.value.text)
  assert.equal(second.ok, true)
  assert.equal(second.value.changed, false)
  assert.equal(second.value.text, first.value.text)
  assert.equal((second.value.text.match(/"trigger\.snippets"/g) || []).length, 1)
})

test("mergeMenu adds a comma when the last entry has none", () => {
  const result = Install.mergeMenu(MENU_WITHOUT_TRAILING_COMMA)
  assert.equal(result.ok, true)
  assert.equal(result.value.text.includes("quicklinks"), true)
  JSON.parse(stripLineComments(result.value.text))
})

test("mergeMenu creates a snippets-only object from empty input", () => {
  const result = Install.mergeMenu("")
  assert.equal(result.ok, true)
  const parsed = JSON.parse(result.value.text)
  assert.equal(parsed["trigger.snippets"].action, TOGGLE_COMMAND)
  assert.equal(parsed["trigger.snippets"].label, "Snippets")
  assert.equal(Object.hasOwn(parsed["trigger.snippets"], "aliases"), false)
})

test("mergeMenu fails closed on text with no object close", () => {
  const result = Install.mergeMenu("not-jsonc")
  assert.equal(result.ok, false)
  assert.equal(result.error.code, "INVALID_MENU")
  assert.equal(result.error.message.includes("not-jsonc"), false)
})

test("mergeBind appends the snippets chord without rewriting other binds", () => {
  const result = Install.mergeBind(BIND_WITH_PERSONAL)
  assert.equal(result.ok, true)
  assert.equal(result.value.changed, true)
  assert.equal(result.value.text.includes('o.bind("SUPER + SHIFT + R", "SSH"'), true)
  assert.equal(result.value.text.includes(BIND_LINE), true)
  assert.equal(result.value.text.includes("hl.unbind"), false)
})

test("mergeBind is a no-op when the exact snippets bind already exists", () => {
  const first = Install.mergeBind(BIND_WITH_PERSONAL)
  const second = Install.mergeBind(first.value.text)
  assert.equal(second.ok, true)
  assert.equal(second.value.changed, false)
  assert.equal(second.value.text, first.value.text)
  assert.equal(second.value.text.split(BIND_LINE).length - 1, 1)
})

test("mergeBind never inserts stock unbinds", () => {
  const source = fs.readFileSync(path.join(__dirname, "../../lib/OmarchyInstall.js"), "utf8")
  assert.equal(source.includes('hl.unbind("SUPER + X")'), false)
  assert.equal(source.includes('hl.unbind("SUPER + CTRL + X")'), false)
  assert.equal(source.includes('hl.unbind("SUPER + SHIFT + X")'), false)
})

test("merge constants match the shipped bind and menu fragments", () => {
  const menu = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../../contrib/omarchy-menu-snippets.jsonc"), "utf8")
  )
  const bind = fs.readFileSync(path.join(__dirname, "../../contrib/bindings-snippets.lua"), "utf8")
  assert.equal(Install.TOGGLE_COMMAND, menu["trigger.snippets"].action)
  assert.equal(Install.BIND_LINE, bind.trim())
})

function stripLineComments(text) {
  return text.replace(/^\s*\/\/.*$/gm, "")
}
