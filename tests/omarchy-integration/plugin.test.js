const test = require("node:test")
const assert = require("node:assert/strict")
const { spawnSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

const ROOT = path.join(__dirname, "../..")
const MANIFEST_PATH = path.join(ROOT, "manifest.json")
const PLUGIN_ID = "kewah.snippet-manager"
const TOGGLE_COMMAND = "omarchy-shell shell toggle kewah.snippet-manager"
const BIND_LINE =
  'o.bind("SUPER + CTRL + M", "Snippets", "omarchy-shell shell toggle kewah.snippet-manager")'
const MENU_FRAGMENT_PATH = path.join(ROOT, "contrib/omarchy-menu-snippets.jsonc")
const BIND_FRAGMENT_PATH = path.join(ROOT, "contrib/bindings-snippets.lua")
const STOLEN_UNBINDS = [
  'hl.unbind("SUPER + X")',
  'hl.unbind("SUPER + CTRL + X")',
  'hl.unbind("SUPER + SHIFT + X")',
]

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"))
}

function fileSymlinks(dir) {
  const found = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules") continue
    const full = path.join(dir, entry.name)
    if (entry.isSymbolicLink()) {
      found.push(full)
      continue
    }
    if (entry.isDirectory()) {
      found.push(...fileSymlinks(full))
    }
  }
  return found
}

test("manifest.json declares the locked overlay plugin contract", () => {
  const manifest = readJson(MANIFEST_PATH)

  assert.equal(manifest.schemaVersion, 1)
  assert.equal(typeof manifest.schemaVersion, "number")
  assert.equal(manifest.id, PLUGIN_ID)
  assert.equal(manifest.id.startsWith("omarchy."), false)
  assert.match(manifest.id, /^[A-Za-z0-9][A-Za-z0-9._-]*$/)
  assert.equal(manifest.id.includes(".."), false)
  assert.equal(manifest.name, "Snippets")
  assert.equal(manifest.version, "1.0.0")
  assert.equal(manifest.author, "kewah")
  assert.deepEqual(manifest.kinds, ["overlay"])
  assert.equal(manifest.keepLoaded, true)
  assert.deepEqual(manifest.entryPoints, { overlay: "Snippets.qml" })
  assert.equal(fs.existsSync(path.join(ROOT, "Snippets.qml")), true)
})

test("omarchy plugin validate accepts the plugin tree without node_modules", () => {
  const result = spawnSync("node", [path.join(ROOT, "scripts/validate-plugin.js")], {
    encoding: "utf8",
  })
  assert.equal(result.status, 0, result.stderr || result.stdout)
})

test("plugin tree contains no file or directory symlinks", () => {
  assert.deepEqual(fileSymlinks(ROOT), [])
})

test("menu fragment is trigger.snippets with the native toggle action and no aliases", () => {
  const fragment = JSON.parse(fs.readFileSync(MENU_FRAGMENT_PATH, "utf8"))
  assert.deepEqual(Object.keys(fragment), ["trigger.snippets"])
  const row = fragment["trigger.snippets"]
  assert.equal(row.icon, "")
  assert.equal(row.label, "Snippets")
  assert.equal(row.action, TOGGLE_COMMAND)
  assert.equal(Object.hasOwn(row, "aliases"), false)
})

test("bind fragment is SUPER + CTRL + M with the same toggle command and no unbind", () => {
  const fragment = fs.readFileSync(BIND_FRAGMENT_PATH, "utf8")
  assert.equal(fragment.trim(), BIND_LINE)
  assert.equal(fragment.includes(TOGGLE_COMMAND), true)
  assert.equal(fragment.includes(PLUGIN_ID), true)
  for (const stolen of STOLEN_UNBINDS) {
    assert.equal(fragment.includes(stolen), false)
  }
  assert.equal(fragment.includes("hl.unbind"), false)
})

test("installed overlay resolves helpers from sourceDir without harness env vars", () => {
  const source = fs.readFileSync(path.join(ROOT, "Snippets.qml"), "utf8")
  assert.equal(source.includes('Quickshell.env("SNIPPET_STORE_PATH")'), true)
  assert.equal(source.includes('Quickshell.env("SNIPPET_TRANSFER_PATH")'), true)
  assert.equal(source.includes('root.sourceDir + "/bin/snippet-store"'), true)
  assert.equal(source.includes('root.sourceDir + "/bin/snippet-transfer"'), true)
  assert.equal(fs.existsSync(path.join(ROOT, "bin/snippet-store")), true)
  assert.equal(fs.existsSync(path.join(ROOT, "bin/snippet-transfer")), true)
})

test("install helper documents local enable and native toggle", () => {
  const result = spawnSync("bash", [path.join(ROOT, "bin/snippet-install"), "--help"], {
    encoding: "utf8",
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.includes("omarchy plugin enable kewah.snippet-manager"), true)
  assert.equal(result.stdout.includes("npm run validate"), true)
  assert.equal(result.stdout.includes("omarchy-shell shell rescanPlugins"), true)
  assert.equal(result.stdout.includes("directory symlink"), true)
  assert.equal(result.stdout.includes("/usr/share/omarchy"), true)
  assert.equal(result.stdout.includes("hyprctl"), false)
  assert.equal(result.stdout.includes("qs -p"), false)
})
