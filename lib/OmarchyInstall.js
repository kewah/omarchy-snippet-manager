var TOGGLE_COMMAND = "omarchy-shell shell toggle kewah.snippet-manager"
var BIND_LINE =
  'o.bind("SUPER + CTRL + M", "Snippets", "omarchy-shell shell toggle kewah.snippet-manager")'

function menuFailure() {
  return {
    ok: false,
    error: { code: "INVALID_MENU", message: "Menu file was invalid" },
  }
}

function bindFailure() {
  return {
    ok: false,
    error: { code: "INVALID_BIND", message: "Bind file was invalid" },
  }
}

function hasMenuKey(text) {
  return /"trigger\.snippets"\s*:/.test(text)
}

function menuRowBlock() {
  return [
    '  "trigger.snippets": {',
    '    "icon": "",',
    '    "label": "Snippets",',
    '    "action": "' + TOGGLE_COMMAND + '"',
    "  }",
  ].join("\n")
}

function newMenuFile() {
  return "{\n" + menuRowBlock() + "\n}\n"
}

function lastSignificantChar(text) {
  var lines = text.split("\n")
  var i
  for (i = lines.length - 1; i >= 0; i--) {
    var line = lines[i].trim()
    if (!line || line.indexOf("//") === 0) continue
    return line.charAt(line.length - 1)
  }
  return ""
}

function needsTrailingComma(text) {
  var ch = lastSignificantChar(text)
  return ch !== "" && ch !== "{" && ch !== ","
}

function mergeMenu(text) {
  if (typeof text !== "string") return menuFailure()
  if (hasMenuKey(text)) {
    return { ok: true, value: { text: text, changed: false } }
  }
  if (text.trim() === "") {
    return { ok: true, value: { text: newMenuFile(), changed: true } }
  }

  var lastBrace = text.lastIndexOf("}")
  if (lastBrace === -1) return menuFailure()

  var before = text.slice(0, lastBrace).replace(/\s+$/, "")
  var after = text.slice(lastBrace)
  var comma = needsTrailingComma(before) ? "," : ""
  return {
    ok: true,
    value: {
      text: before + comma + "\n" + menuRowBlock() + "\n" + after.replace(/^\s*/, ""),
      changed: true,
    },
  }
}

function mergeBind(text) {
  if (typeof text !== "string") return bindFailure()
  if (text.indexOf(BIND_LINE) !== -1) {
    return { ok: true, value: { text: text, changed: false } }
  }
  var prefix = text === "" || text.endsWith("\n") ? text : text + "\n"
  return { ok: true, value: { text: prefix + BIND_LINE + "\n", changed: true } }
}

if (typeof module !== "undefined") {
  module.exports = {
    mergeMenu: mergeMenu,
    mergeBind: mergeBind,
    TOGGLE_COMMAND: TOGGLE_COMMAND,
    BIND_LINE: BIND_LINE,
  }
}

if (typeof require !== "undefined" && require.main === module) {
  var mode = process.argv[2]
  var chunks = []
  process.stdin.setEncoding("utf8")
  process.stdin.on("data", function (chunk) {
    chunks.push(chunk)
  })
  process.stdin.on("end", function () {
    var result
    if (mode === "merge-menu") result = mergeMenu(chunks.join(""))
    else if (mode === "merge-bind") result = mergeBind(chunks.join(""))
    else
      result = {
        ok: false,
        error: { code: "INVALID_MODE", message: "Unknown merge mode" },
      }
    if (!result.ok) {
      process.stderr.write("snippet-install: " + result.error.message + "\n")
      process.exit(1)
    }
    process.stdout.write(result.value.text)
  })
}
