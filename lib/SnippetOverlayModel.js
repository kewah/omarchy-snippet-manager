function initialState() {
  return { mode: "closed" }
}

function openedState() {
  return { mode: "loading" }
}

if (typeof module !== "undefined") {
  module.exports = {
    initialState: initialState,
    openedState: openedState
  }
}
