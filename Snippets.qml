import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import QtQuick
import qs.Commons
import qs.Ui
import "lib/SnippetCatalog.js" as SnippetCatalog
import "lib/SnippetOverlayModel.js" as OverlayModel
import "ui"

Item {
  id: root

  property var shell: null
  property var manifest: null
  property bool opened: false
  property var overlayState: OverlayModel.initialState()
  property string readOutput: ""
  property bool readExited: false
  property bool readStreamFinished: false
  property int readExitCode: 6

  readonly property string sourceDir: root.manifest && root.manifest.__sourceDir
    ? String(root.manifest.__sourceDir) : ""
  readonly property string storePath: Quickshell.env("SNIPPET_STORE_PATH")
    || (root.sourceDir ? root.sourceDir + "/bin/snippet-store" : "")

  property color background: Color.menu.background
  property color foreground: Color.menu.text
  property color border: Color.menu.border
  property var borderSpec: Border.surfaceSpec("menu", "border", border, Math.max(1, Style.space(2)))
  property color scrim: Color.menu.scrim
  property color selectedBackground: Color.menu.selectedBackground
  property color selectedText: Color.menu.selectedText
  readonly property int cornerRadius: Style.cornerRadius
  property int contentMargin: Style.spacing.panelPadding
  property int cardWidth: Math.min(Style.space(875), panel.width - Style.gapsOut * 2)
  property int cardHeight: Math.min(Style.space(600), panel.height - Style.gapsOut * 2)

  signal transferRequested(var payload)

  function open(payloadJson) {
    root.opened = true
    root.applyEvent({ type: "OPEN" })
    Qt.callLater(function() { keyCatcher.forceActiveFocus() })
  }

  function close() {
    root.opened = false
    root.overlayState = OverlayModel.initialState()
  }

  function dismiss() {
    root.close()
    if (root.shell && typeof root.shell.hide === "function") {
      root.shell.hide((root.manifest && root.manifest.id) || "snippets")
    }
  }

  function toggle() {
    if (root.opened) root.dismiss()
    else root.open("{}")
  }

  function applyEvent(event) {
    var result = OverlayModel.transition(root.overlayState, event, SnippetCatalog)
    root.overlayState = result.state
    root.executeEffects(result.effects)
  }

  function executeEffects(effects) {
    for (var i = 0; i < effects.length; i++) {
      var effect = effects[i]
      if (effect.type === "READ_STORE") root.startRead(effect)
      else if (effect.type === "DISMISS") root.dismiss()
      else if (effect.type === "DISPATCH_TRANSFER") root.transferRequested(effect.payload)
    }
  }

  function startRead(effect) {
    var command = OverlayModel.processCommand(effect, root.storePath)
    if (!command || readProc.running) {
      root.applyEvent({ type: "LOAD_FAILED", code: "IO_ERROR" })
      return
    }

    root.readOutput = ""
    root.readExited = false
    root.readStreamFinished = false
    root.readExitCode = 6
    readProc.command = command
    readProc.running = true
  }

  function finishReadIfReady() {
    if (!root.readExited || !root.readStreamFinished) return

    var event = OverlayModel.storeReadEvent(root.readExitCode, root.readOutput, SnippetCatalog)
    root.readExited = false
    root.readStreamFinished = false
    if (root.opened) root.applyEvent(event)
  }

  function handleKey(event) {
    if (root.overlayState.mode === "load-error") {
      if (event.key === Qt.Key_Escape) root.dismiss()
      else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) root.applyEvent({ type: "RETRY_LOAD" })
      else return
      event.accepted = true
      return
    }

    if (root.overlayState.mode === "loading") {
      if (event.key === Qt.Key_Escape) {
        root.dismiss()
        event.accepted = true
      }
      return
    }

    if (root.overlayState.mode !== "search") return

    if (event.key === Qt.Key_Escape) {
      root.applyEvent({ type: "ESCAPE" })
      event.accepted = true
    } else if (Util.editsFilter(event, root.overlayState.query)) {
      root.applyEvent({ type: "SET_QUERY", query: Util.editedFilter(event, root.overlayState.query) })
      event.accepted = true
    } else if (event.key === Qt.Key_Up) {
      root.applyEvent({ type: "MOVE_SELECTION", delta: -1 })
      event.accepted = true
    } else if (event.key === Qt.Key_Down) {
      root.applyEvent({ type: "MOVE_SELECTION", delta: 1 })
      event.accepted = true
    } else if (event.key === Qt.Key_PageUp) {
      root.applyEvent({ type: "PAGE_SELECTION", direction: -1, visibleCount: searchView.visibleRowCount })
      event.accepted = true
    } else if (event.key === Qt.Key_PageDown) {
      root.applyEvent({ type: "PAGE_SELECTION", direction: 1, visibleCount: searchView.visibleRowCount })
      event.accepted = true
    } else if (event.key === Qt.Key_Home) {
      root.applyEvent({ type: "SELECT_FIRST" })
      event.accepted = true
    } else if (event.key === Qt.Key_End) {
      root.applyEvent({ type: "SELECT_LAST" })
      event.accepted = true
    } else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
      var kind = (event.modifiers & Qt.ControlModifier) ? "COPY" : "PASTE"
      root.applyEvent({ type: "REQUEST_TRANSFER", kind: kind })
      event.accepted = true
    } else if (!(event.modifiers & (Qt.ControlModifier | Qt.AltModifier | Qt.MetaModifier))
        && event.text && event.text.length === 1
        && event.text.charCodeAt(0) >= 32 && event.text.charCodeAt(0) !== 127) {
      root.applyEvent({ type: "SET_QUERY", query: root.overlayState.query + event.text })
      event.accepted = true
    }
  }

  Process {
    id: readProc

    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        root.readOutput = String(text || "")
        root.readStreamFinished = true
        root.finishReadIfReady()
      }
    }

    stderr: StdioCollector { waitForEnd: true }

    onExited: function(exitCode, exitStatus) {
      root.readExitCode = exitStatus === 0 ? exitCode : 6
      root.readExited = true
      root.finishReadIfReady()
    }
  }

  PanelWindow {
    id: panel
    visible: root.opened
    anchors { top: true; bottom: true; left: true; right: true }
    color: "transparent"
    WlrLayershell.namespace: "omarchy-snippets"
    WlrLayershell.layer: WlrLayer.Overlay
    WlrLayershell.keyboardFocus: WlrKeyboardFocus.Exclusive
    exclusionMode: ExclusionMode.Ignore

    Rectangle {
      anchors.fill: parent
      color: root.scrim
    }

    MouseArea {
      anchors.fill: parent
      onClicked: root.dismiss()
    }

    BorderSurface {
      id: card
      width: root.cardWidth
      height: root.cardHeight
      radius: root.cornerRadius
      anchors.centerIn: parent
      color: root.background
      borderSpec: root.borderSpec
      padding: root.contentMargin

      MouseArea { anchors.fill: parent; onClicked: function(mouse) { mouse.accepted = true } }

      Item {
        id: keyCatcher
        anchors.fill: parent
        focus: true
        z: 2

        Keys.priority: Keys.BeforeItem
        Keys.onPressed: function(event) { root.handleKey(event) }
      }

      SnippetSearchView {
        id: searchView
        anchors.fill: parent
        anchors.topMargin: card.contentTopInset
        anchors.rightMargin: card.contentRightInset
        anchors.bottomMargin: card.contentBottomInset
        anchors.leftMargin: card.contentLeftInset
        mode: root.overlayState.mode
        query: root.overlayState.query
        results: root.overlayState.results
        selectedId: root.overlayState.selectedId || ""
        errorMessage: root.overlayState.errorMessage
        background: root.background
        foreground: root.foreground
        selectedBackground: root.selectedBackground
        selectedText: root.selectedText
        onRowSelected: function(index) {
          root.applyEvent({ type: "SELECT_INDEX", index: index })
          Qt.callLater(function() { keyCatcher.forceActiveFocus() })
        }
        onRowActivated: function(index) {
          root.applyEvent({ type: "SELECT_INDEX", index: index })
          root.applyEvent({ type: "REQUEST_TRANSFER", kind: "PASTE" })
        }
        onRetryRequested: root.applyEvent({ type: "RETRY_LOAD" })
        onCloseRequested: root.dismiss()
      }
    }
  }
}
