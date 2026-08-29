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
  property string readPurpose: "LOAD"
  property int readOperationId: 0
  property int readGeneration: 0
  property int viewGeneration: 0
  property string idOutput: ""
  property bool idExited: false
  property bool idStreamFinished: false
  property int idExitCode: 1
  property int idOperationId: 0
  property string writePayload: ""
  property int writeOperationId: 0
  property int operationSerial: 0

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
  property int cardWidth: OverlayModel.fittedSize(Style.space(875), panel.width - Style.gapsOut * 2)
  property int cardHeight: OverlayModel.fittedSize(Style.space(600), panel.height - Style.gapsOut * 2)

  signal transferRequested(var payload)

  function open(payloadJson) {
    root.viewGeneration += 1
    root.opened = true
    root.applyEvent({ type: "OPEN" })
    Qt.callLater(function() { keyCatcher.forceActiveFocus() })
  }

  function close() {
    root.viewGeneration += 1
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

  function nextOperationId() {
    root.operationSerial += 1
    return root.operationSerial
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
      else if (effect.type === "GENERATE_CREATE_ID") root.startIdGeneration(effect)
      else if (effect.type === "WRITE_STORE") root.startWrite(effect)
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
    root.readPurpose = effect.purpose || "LOAD"
    root.readOperationId = Number(effect.operationId) || 0
    root.readGeneration = root.viewGeneration
    readProc.command = command
    readProc.running = true
  }

  function finishReadIfReady() {
    if (!root.readExited || !root.readStreamFinished) return

    var generation = root.readGeneration
    var event = root.readPurpose === "RECONCILE"
      ? OverlayModel.reconcileReadEvent(root.readExitCode, root.readOutput, root.readOperationId, SnippetCatalog)
      : OverlayModel.storeReadEvent(root.readExitCode, root.readOutput, SnippetCatalog)
    root.readExited = false
    root.readStreamFinished = false
    root.readPurpose = "LOAD"
    root.readOperationId = 0
    root.readGeneration = 0
    if (root.opened && generation === root.viewGeneration) root.applyEvent(event)
  }

  function startIdGeneration(effect) {
    var command = OverlayModel.processCommand(effect, root.storePath)
    if (!command || idProc.running) {
      root.applyEvent({ type: "CREATE_ID_FAILED" })
      return
    }

    root.idOutput = ""
    root.idExited = false
    root.idStreamFinished = false
    root.idExitCode = 1
    root.idOperationId = Number(effect.operationId) || 0
    idProc.command = command
    idProc.running = true
  }

  function finishIdIfReady() {
    if (!root.idExited || !root.idStreamFinished) return

    var event = OverlayModel.createIdEvent(
      root.idExitCode,
      root.idOutput,
      new Date().toISOString(),
      root.idOperationId)
    root.idExited = false
    root.idStreamFinished = false
    if (root.opened) root.applyEvent(event)
  }

  function startWrite(effect) {
    var command = OverlayModel.processCommand(effect, root.storePath)
    if (!command || writeProc.running || typeof effect.payload !== "string") {
      root.applyEvent({ type: "WRITE_FAILED" })
      return
    }

    root.writePayload = effect.payload
    root.writeOperationId = Number(effect.operationId) || 0
    writeProc.stdinEnabled = true
    writeProc.command = command
    writeProc.running = true
  }

  function selectedTitle() {
    for (var i = 0; i < root.overlayState.results.length; i++) {
      if (root.overlayState.results[i].id === root.overlayState.targetId) {
        return root.overlayState.results[i].title
      }
    }
    return ""
  }

  function handleKey(event) {
    if (root.overlayState.mode === "delete-confirm") {
      if (event.key === Qt.Key_Escape) root.applyEvent({ type: "CANCEL_DELETE" })
      else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
        root.applyEvent({ type: "CONFIRM_DELETE", operationId: root.nextOperationId() })
      }
      else if (event.key === Qt.Key_Left || event.key === Qt.Key_Right
          || event.key === Qt.Key_Up || event.key === Qt.Key_Down
          || event.key === Qt.Key_Tab || event.key === Qt.Key_Backtab) {
        root.applyEvent({ type: "MOVE_CONFIRM" })
      } else return
      event.accepted = true
      return
    }

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
    } else if (event.key === Qt.Key_N && (event.modifiers & Qt.ControlModifier)) {
      if (event.modifiers & Qt.ShiftModifier) root.applyEvent({ type: "OPEN_CREATE" })
      else {
        root.applyEvent({ type: "MOVE_SELECTION", delta: 1 })
        searchView.disarmPointer()
      }
      event.accepted = true
    } else if (event.key === Qt.Key_P && (event.modifiers & Qt.ControlModifier)
        && !(event.modifiers & Qt.ShiftModifier)) {
      root.applyEvent({ type: "MOVE_SELECTION", delta: -1 })
      searchView.disarmPointer()
      event.accepted = true
    } else if (event.key === Qt.Key_E && (event.modifiers & Qt.ControlModifier)) {
      root.applyEvent({ type: "OPEN_EDIT" })
      event.accepted = true
    } else if (event.key === Qt.Key_X && (event.modifiers & Qt.ControlModifier)) {
      root.applyEvent({ type: "OPEN_DELETE" })
      event.accepted = true
    } else if (Util.editsFilter(event, root.overlayState.query)) {
      root.applyEvent({ type: "SET_QUERY", query: Util.editedFilter(event, root.overlayState.query) })
      event.accepted = true
    } else if (event.key === Qt.Key_Up) {
      root.applyEvent({ type: "MOVE_SELECTION", delta: -1 })
      searchView.disarmPointer()
      event.accepted = true
    } else if (event.key === Qt.Key_Down) {
      root.applyEvent({ type: "MOVE_SELECTION", delta: 1 })
      searchView.disarmPointer()
      event.accepted = true
    } else if (event.key === Qt.Key_PageUp) {
      root.applyEvent({ type: "PAGE_SELECTION", direction: -1, visibleCount: searchView.visibleRowCount })
      searchView.disarmPointer()
      event.accepted = true
    } else if (event.key === Qt.Key_PageDown) {
      root.applyEvent({ type: "PAGE_SELECTION", direction: 1, visibleCount: searchView.visibleRowCount })
      searchView.disarmPointer()
      event.accepted = true
    } else if (event.key === Qt.Key_Home) {
      root.applyEvent({ type: "SELECT_FIRST" })
      searchView.disarmPointer()
      event.accepted = true
    } else if (event.key === Qt.Key_End) {
      root.applyEvent({ type: "SELECT_LAST" })
      searchView.disarmPointer()
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

  Process {
    id: idProc

    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        root.idOutput = String(text || "")
        root.idStreamFinished = true
        root.finishIdIfReady()
      }
    }

    stderr: StdioCollector { waitForEnd: true }

    onExited: function(exitCode, exitStatus) {
      root.idExitCode = exitStatus === 0 ? exitCode : 1
      root.idExited = true
      root.finishIdIfReady()
    }
  }

  Process {
    id: writeProc
    stdinEnabled: true
    stdout: StdioCollector { waitForEnd: true }
    stderr: StdioCollector { waitForEnd: true }

    onStarted: {
      write(root.writePayload)
      root.writePayload = ""
      stdinEnabled = false
    }

    onExited: function(exitCode, exitStatus) {
      if (!root.opened) return
      var status = exitStatus === 0 ? exitCode : 6
      root.applyEvent(OverlayModel.storeWriteEvent(status, root.writeOperationId))
      root.writeOperationId = 0
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
        Accessible.role: Accessible.EditableText
        Accessible.searchEdit: true
        Accessible.name: "Search snippets"
        Accessible.description: root.overlayState.query || "Type to search snippets"
        Accessible.focusable: root.overlayState.mode === "search"
          || root.overlayState.mode === "loading"
          || root.overlayState.mode === "load-error"
        Accessible.focused: activeFocus && Accessible.focusable
        Accessible.ignored: root.overlayState.mode === "delete-confirm"
          || root.overlayState.mode === "create"
          || root.overlayState.mode === "edit"
      }

      SnippetSearchView {
        id: searchView
        anchors.fill: parent
        visible: root.overlayState.mode === "loading" || root.overlayState.mode === "search"
          || root.overlayState.mode === "load-error" || root.overlayState.mode === "delete-confirm"
        anchors.topMargin: card.contentTopInset
        anchors.rightMargin: card.contentRightInset
        anchors.bottomMargin: card.contentBottomInset
        anchors.leftMargin: card.contentLeftInset
        mode: root.overlayState.mode === "delete-confirm" ? "search" : root.overlayState.mode
        query: root.overlayState.query
        results: root.overlayState.results
        selectedId: root.overlayState.selectedId || ""
        searchStatus: OverlayModel.searchStatus(root.overlayState)
        assistiveHidden: root.overlayState.mode === "delete-confirm"
        keyboardActive: keyCatcher.activeFocus && (root.overlayState.mode === "search"
          || root.overlayState.mode === "loading"
          || root.overlayState.mode === "load-error")
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
        onCreateRequested: {
          root.applyEvent({ type: "OPEN_CREATE" })
          Qt.callLater(function() { keyCatcher.forceActiveFocus() })
        }
        onRetryRequested: {
          root.applyEvent({ type: "RETRY_LOAD" })
          Qt.callLater(function() { keyCatcher.forceActiveFocus() })
        }
        onCloseRequested: root.dismiss()
      }

      SnippetDeleteDialog {
        id: deleteDialog
        anchors.fill: parent
        z: 3
        visible: root.overlayState.mode === "delete-confirm"
        snippetTitle: root.selectedTitle()
        selectedAction: root.overlayState.confirmAction
        errorMessage: root.overlayState.errorMessage
        busy: root.overlayState.busy
        blocked: root.overlayState.reconcileStatus === "blocked"
        background: root.background
        foreground: root.foreground
        scrim: root.scrim
        selectedBackground: root.selectedBackground
        selectedText: root.selectedText
        onActionSelected: function(action) {
          if (action !== root.overlayState.confirmAction) root.applyEvent({ type: "MOVE_CONFIRM" })
          Qt.callLater(function() { keyCatcher.forceActiveFocus() })
        }
        onCancelRequested: {
          root.applyEvent({ type: "CANCEL_DELETE" })
          Qt.callLater(function() { keyCatcher.forceActiveFocus() })
        }
        onDeleteRequested: {
          if (root.overlayState.confirmAction !== "delete") root.applyEvent({ type: "MOVE_CONFIRM" })
          root.applyEvent({ type: "CONFIRM_DELETE", operationId: root.nextOperationId() })
        }
      }

      SnippetEditor {
        id: editor
        anchors.fill: parent
        anchors.topMargin: card.contentTopInset
        anchors.rightMargin: card.contentRightInset
        anchors.bottomMargin: card.contentBottomInset
        anchors.leftMargin: card.contentLeftInset
        visible: root.overlayState.mode === "create" || root.overlayState.mode === "edit"
        editorMode: root.overlayState.mode
        draft: root.overlayState.draft || ({ title: "", keywords: [], content: "" })
        fieldErrors: root.overlayState.fieldErrors || ({})
        focusField: root.overlayState.focusField
        errorMessage: root.overlayState.errorMessage
        busy: root.overlayState.busy
        blocked: root.overlayState.reconcileStatus === "blocked"
        foreground: root.foreground
        background: root.background
        onFieldChanged: function(field, value) {
          root.applyEvent({ type: "UPDATE_DRAFT", field: field, value: value })
        }
        onKeywordAdded: function(value) {
          root.applyEvent({ type: "ADD_KEYWORD", value: value })
        }
        onKeywordChanged: function(index, value) {
          root.applyEvent({ type: "UPDATE_KEYWORD", index: index, value: value })
        }
        onKeywordRemoved: function(index) {
          root.applyEvent({ type: "REMOVE_KEYWORD", index: index })
        }
        onSaveRequested: {
          if (root.overlayState.mode === "edit") {
            root.applyEvent({
            type: "SUBMIT_EDIT",
            now: new Date().toISOString(),
            operationId: root.nextOperationId()
          })
          } else {
            root.applyEvent({ type: "SUBMIT_CREATE", operationId: root.nextOperationId() })
          }
        }
        onCancelRequested: {
          root.applyEvent({ type: "CANCEL_EDITOR" })
          Qt.callLater(function() { keyCatcher.forceActiveFocus() })
        }
      }
    }
  }
}
