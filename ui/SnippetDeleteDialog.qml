import QtQuick
import qs.Commons
import qs.Ui

Item {
  id: root

  property string snippetTitle: ""
  property string selectedAction: "cancel"
  property string errorMessage: ""
  property bool busy: false
  property color background: Color.menu.background
  property color foreground: Color.menu.text
  property color scrim: Color.menu.scrim
  property color selectedBackground: Color.menu.selectedBackground
  property color selectedText: Color.menu.selectedText
  property var borderSpec: Border.surfaceSpec("menu", "border", Color.menu.border, Math.max(1, Style.space(2)))

  signal cancelRequested()
  signal deleteRequested()
  signal actionSelected(string action)

  Rectangle {
    anchors.fill: parent
    color: root.scrim
  }

  BorderSurface {
    width: Math.min(Style.space(430), parent.width - Style.spacing.xl * 2)
    height: confirmContent.implicitHeight + Style.spacing.panelPadding * 2
    anchors.centerIn: parent
    color: root.background
    borderSpec: root.borderSpec
    radius: Style.cornerRadius
    padding: Style.spacing.panelPadding

    Column {
      id: confirmContent
      anchors.fill: parent
      anchors.topMargin: parent.contentTopInset
      anchors.rightMargin: parent.contentRightInset
      anchors.bottomMargin: parent.contentBottomInset
      anchors.leftMargin: parent.contentLeftInset
      spacing: Style.spacing.lg

      Text {
        width: parent.width
        text: "Delete snippet?"
        textFormat: Text.PlainText
        color: root.foreground
        font.family: Style.font.menuFamily
        font.pixelSize: Style.font.heading
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

      Row {
        anchors.horizontalCenter: parent.horizontalCenter
        spacing: Style.spacing.sm

        Button {
          text: "Cancel"
          focusable: false
          bordered: true
          enabled: !root.busy
          hasCursor: root.selectedAction === "cancel"
          foreground: root.selectedAction === "cancel" ? root.selectedText : root.foreground
          background: root.selectedAction === "cancel" ? root.selectedBackground : "transparent"
          onClicked: root.cancelRequested()
          onHovered: function(isHovered) { if (isHovered) root.actionSelected("cancel") }
        }

        Button {
          text: root.busy ? "Deleting…" : "Delete"
          focusable: false
          bordered: true
          enabled: !root.busy
          hasCursor: root.selectedAction === "delete"
          foreground: root.selectedAction === "delete" ? root.selectedText : root.foreground
          background: root.selectedAction === "delete" ? root.selectedBackground : "transparent"
          onClicked: root.deleteRequested()
          onHovered: function(isHovered) { if (isHovered) root.actionSelected("delete") }
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
