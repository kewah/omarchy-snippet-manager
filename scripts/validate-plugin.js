#!/usr/bin/env node

const { spawnSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const ROOT = path.join(__dirname, "..")
const SKIP = new Set([".git", "node_modules"])
const ENTRIES = [
  "manifest.json",
  "Snippets.qml",
  "ui",
  "bin",
  "contrib",
  "lib",
  "scripts",
  "tests",
  "eslint-rules",
]

function copyPath(from, to) {
  const stat = fs.lstatSync(from)

  if (stat.isSymbolicLink()) {
    fs.symlinkSync(fs.readlinkSync(from), to)
    return
  }

  if (stat.isDirectory()) {
    copyTree(from, to)
    return
  }

  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.copyFileSync(from, to)
}

function copyTree(src, dest) {
  fs.mkdirSync(dest, { recursive: true })

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue
    copyPath(path.join(src, entry.name), path.join(dest, entry.name))
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "snippet-plugin-"))

try {
  for (const name of ENTRIES) {
    const from = path.join(ROOT, name)
    if (!fs.lstatSync(from, { throwIfNoEntry: false })) continue
    copyPath(from, path.join(tmp, name))
  }
  const result = spawnSync("omarchy", ["plugin", "validate", tmp], {
    encoding: "utf8",
  })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  process.exit(result.status === null ? 1 : result.status)
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}
