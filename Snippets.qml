import Quickshell
import QtQuick
import qs.Commons
import qs.Ui
import "lib/SnippetOverlayModel.js" as OverlayModel

Item {
  id: root

  property var shell: null
  property var manifest: null
  property bool opened: false
  property var overlayState: OverlayModel.initialState()

  function open(payloadJson) {
    root.overlayState = OverlayModel.openedState()
    root.opened = true
  }

  function close() {
    root.opened = false
    root.overlayState = OverlayModel.initialState()
  }

  function toggle() {
    if (root.opened) root.close()
    else root.open("{}")
  }
}
