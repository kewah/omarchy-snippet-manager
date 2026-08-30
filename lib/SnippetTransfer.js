function failure() {
  return {
    ok: false,
    error: {
      code: "INVALID_TRANSFER",
      message: "Transfer request was invalid",
    },
  }
}

function transferPlan(payload) {
  if (!payload || (payload.kind !== "PASTE" && payload.kind !== "COPY")) return failure()

  var snippet = payload.snippet
  if (!snippet || typeof snippet.content !== "string") return failure()

  return {
    ok: true,
    value: {
      argv: [payload.kind === "COPY" ? "copy" : "paste"],
      stdin: snippet.content,
    },
  }
}

function toastCommand(code) {
  var message
  if (code === "INVALID_TRANSFER") message = "Transfer request was invalid"
  else if (code === "SPAWN_FAILED" || code === "TRANSFER_FAILED")
    message = "Unable to transfer snippet"
  else return null
  return ["omarchy-notification-send", message]
}

function helperCommand(helperPath, plan) {
  if (!plan || typeof plan.stdin !== "string") return null
  if (!Array.isArray(plan.argv) || plan.argv.length !== 1) return null
  if (plan.argv[0] !== "paste" && plan.argv[0] !== "copy") return null
  if (typeof helperPath !== "string" || !helperPath) return null
  return [helperPath, plan.argv[0]]
}

if (typeof module !== "undefined") {
  module.exports = {
    transferPlan: transferPlan,
    helperCommand: helperCommand,
    toastCommand: toastCommand,
  }
}
