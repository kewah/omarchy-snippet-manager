import QtQuick
import qs.Commons
import qs.Ui
import "../lib/SnippetOverlayModel.js" as OverlayModel

Item {
  id: root

  property string snippetTitle: ""
  property string selectedAction: "cancel"
  property string errorMessage: ""
  property bool busy: false
  property bool blocked: false
  property color background: Color.menu.background
  property color foreground: Color.menu.text
  property color scrim: Color.menu.scrim
  property color selectedBackground: Color.menu.selectedBackground
  property color selectedText: Color.menu.selectedText
  property var borderSpec: Border.surfaceSpec("menu", "border", Color.menu.border, Math.max(1, Style.space(2)))
  property bool pointerMoved: false

  signal cancelRequested()
  signal deleteRequested()
  signal actionSelected(string action)

  function notePointer(item, position) {
    if (!item || !position) return
    if (pointerGate.moved(item, { x: position.x, y: position.y })) root.pointerMoved = true
  }

  PointerMoveGate {
    id: pointerGate
    referenceItem: confirmCard
  }

  onVisibleChanged: {
    root.pointerMoved = false
    pointerGate.reset()
  }

  Accessible.role: Accessible.Dialog
  Accessible.name: "Delete snippet?"
  Accessible.description: "Delete “" + root.snippetTitle + "”? This cannot be undone."
  Accessible.focused: visible

  MouseArea {
    anchors.fill: parent
    hoverEnabled: true
    onPositionChanged: function(mouse) {
      if (pointerGate.moved(this, mouse)) root.pointerMoved = true
    }
    onClicked: root.cancelRequested()
  }

  HoverHandler {
    enabled: root.visible
    onPointChanged: root.notePointer(root, point.position)
  }

  BorderSurface {
    id: confirmCard
    width: OverlayModel.fittedSize(Style.space(430), parent.width - Style.spacing.xl * 2)
    height: OverlayModel.fittedSize(
      confirmFlick.contentHeight + Style.spacing.panelPadding * 2,
      parent.height - Style.spacing.xl * 2)
    anchors.centerIn: parent
    color: root.background
    borderSpec: root.borderSpec
    radius: Style.cornerRadius
    padding: Style.spacing.panelPadding

    MouseArea {
      anchors.fill: parent
      hoverEnabled: true
      onClicked: function(mouse) { mouse.accepted = true }
      onPositionChanged: function(mouse) {
        if (pointerGate.moved(this, mouse)) root.pointerMoved = true
      }
    }

    Flickable {
      id: confirmFlick
      anchors.fill: parent
      anchors.topMargin: parent.contentTopInset
      anchors.rightMargin: parent.contentRightInset
      anchors.bottomMargin: parent.contentBottomInset
      anchors.leftMargin: parent.contentLeftInset
      contentWidth: width
      contentHeight: confirmContent.implicitHeight
      clip: true
      boundsBehavior: Flickable.StopAtBounds

      Column {
        id: confirmContent
        width: parent.width
        spacing: Style.spacing.lg

        Text {
          width: parent.width
          text: "Delete snippet?"
          textFormat: Text.PlainText
          color: root.foreground
          font.family: Style.font.menuFamily
          font.pixelSize: Style.font.heading
          wrapMode: Text.Wrap
          horizontalAlignment: Text.AlignHCenter
        }

        Text {
          width: parent.width
          text: "Delete “" + root.snippetTitle + "”? This cannot be undone."
          textFormat: Text.PlainText
          color: root.foreground
          font.family: Style.font.menuFamily
          font.pixelSize: Style.font.body
          horizontalAlignment: Text.AlignHCenter
          wrapMode: Text.Wrap
        }

        Text {
          width: parent.width
          visible: text.length > 0
          text: root.errorMessage
          textFormat: Text.PlainText
          color: Color.urgent
          font.family: Style.font.menuFamily
          font.pixelSize: Style.font.caption
          horizontalAlignment: Text.AlignHCenter
          wrapMode: Text.Wrap
        }

        Flow {
          width: parent.width
          spacing: Style.spacing.sm

          Item {
            width: cancelButton.width + Style.space(3)
            height: cancelButton.height

            Rectangle {
              anchors.left: parent.left
              anchors.top: parent.top
              anchors.bottom: parent.bottom
              width: Style.space(3)
              visible: root.selectedAction === "cancel"
              color: root.selectedText
              radius: Style.cornerRadius
            }

            Button {
              id: cancelButton
              x: Style.space(3)
              text: "Cancel"
              focusable: false
              bordered: true
              enabled: !root.busy
              hasCursor: root.selectedAction === "cancel"
              foreground: root.selectedAction === "cancel" ? root.selectedText : root.foreground
              background: root.selectedAction === "cancel" ? root.selectedBackground : "transparent"
              Accessible.role: Accessible.Button
              Accessible.name: "Cancel"
              Accessible.onPressAction: root.cancelRequested()
              onClicked: root.cancelRequested()
              onHovered: function(isHovered) {
                if (!isHovered) {
                  root.pointerMoved = true
                  return
                }
                if (root.pointerMoved) root.actionSelected("cancel")
              }

              HoverHandler {
                onPointChanged: root.notePointer(cancelButton, point.position)
              }
            }
          }

          Item {
            width: deleteButton.width + Style.space(3)
            height: deleteButton.height

            Rectangle {
              anchors.left: parent.left
              anchors.top: parent.top
              anchors.bottom: parent.bottom
              width: Style.space(3)
              visible: root.selectedAction === "delete"
              color: root.selectedText
              radius: Style.cornerRadius
            }

            Button {
              id: deleteButton
              x: Style.space(3)
              text: root.busy ? "Deleting…" : "Delete"
              focusable: false
              bordered: true
              enabled: !root.busy && !root.blocked
              hasCursor: root.selectedAction === "delete"
              foreground: root.selectedAction === "delete" ? root.selectedText : root.foreground
              background: root.selectedAction === "delete" ? root.selectedBackground : "transparent"
              Accessible.role: Accessible.Button
              Accessible.name: root.busy ? "Deleting…" : "Delete"
              Accessible.onPressAction: root.deleteRequested()
              onClicked: root.deleteRequested()
              onHovered: function(isHovered) {
                if (!isHovered) {
                  root.pointerMoved = true
                  return
                }
                if (root.pointerMoved) root.actionSelected("delete")
              }

              HoverHandler {
                onPointChanged: root.notePointer(deleteButton, point.position)
              }
            }
          }
        }

        Text {
          width: parent.width
          text: "Arrow keys or Tab to choose  ·  Enter confirm  ·  Escape cancel"
          textFormat: Text.PlainText
          color: root.foreground
          opacity: 0.55
          font.family: Style.font.menuFamily
          font.pixelSize: Style.font.caption
          horizontalAlignment: Text.AlignHCenter
          wrapMode: Text.Wrap
        }
      }
    }
  }
}
