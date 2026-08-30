import QtQuick
import QtQuick.Controls as QQC
import qs.Commons
import qs.Ui

Item {
  id: root

  property string editorMode: "create"
  property var draft: ({ title: "", content: "" })
  property var fieldErrors: ({})
  property string focusField: ""
  property string errorMessage: ""
  property bool busy: false
  property bool blocked: false
  readonly property bool editable: !root.busy && !root.blocked
  property color foreground: Color.menu.text
  property color background: Color.menu.background
  property string fontFamily: Style.font.menuFamily
  readonly property int fieldChromeInset: Math.max(1, Style.focusBorderWidth)

  signal fieldChanged(string field, string value)
  signal saveRequested()
  signal cancelRequested()

  function focusRequestedField() {
    if (!root.visible) return
    if (root.focusField === "content") contentArea.forceActiveFocus()
    else titleField.forceActiveFocus()
  }

  onVisibleChanged: if (visible) Qt.callLater(root.focusRequestedField)
  onFocusFieldChanged: if (visible && focusField) Qt.callLater(root.focusRequestedField)

  Shortcut {
    sequence: "Ctrl+S"
    enabled: root.visible && root.editable
    onActivated: root.saveRequested()
  }

  Shortcut {
    sequence: "Escape"
    enabled: root.visible && !root.busy
    onActivated: root.cancelRequested()
  }

  Flickable {
    anchors.fill: parent
    contentWidth: width
    contentHeight: form.implicitHeight
    clip: false
    boundsBehavior: Flickable.StopAtBounds

    Column {
      id: form
      x: root.fieldChromeInset
      width: parent.width - root.fieldChromeInset * 2
      spacing: Style.spacing.md

      Text {
        width: parent.width
        text: root.editorMode === "edit" ? "Edit snippet" : "Create snippet"
        textFormat: Text.PlainText
        color: root.foreground
        font.family: root.fontFamily
        font.pixelSize: Style.font.heading
        Accessible.role: Accessible.StaticText
        Accessible.name: text
      }

      Text {
        width: parent.width
        text: "Title"
        textFormat: Text.PlainText
        color: root.foreground
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
      }

      SnippetFieldChrome {
        id: titleChrome
        width: parent.width
        implicitHeight: titleField.implicitHeight + chromePad * 2
        height: implicitHeight
        focused: titleField.activeFocus
        hovered: titleField.hovered
        foreground: root.foreground

        TextField {
          id: titleField
          anchors.fill: parent
          anchors.margins: titleChrome.chromePad
          text: root.draft ? root.draft.title : ""
          placeholderText: "Snippet title"
          enabled: root.editable
          foreground: root.foreground
          font.family: root.fontFamily
          background: Item {}
          cursorDelegate: Rectangle {
            width: Math.max(1, Style.normalBorderWidth)
            color: root.foreground
            visible: titleField.cursorVisible
          }
          activeFocusOnTab: true
          Accessible.role: Accessible.EditableText
          Accessible.name: "Title"
          Accessible.description: root.fieldErrors.title || ""
          onTextEdited: root.fieldChanged("title", text)
        }
      }

      Text {
        width: parent.width
        visible: text.length > 0
        text: root.fieldErrors.title || ""
        textFormat: Text.PlainText
        color: Color.urgent
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        wrapMode: Text.Wrap
      }

      Text {
        width: parent.width
        text: "Content"
        textFormat: Text.PlainText
        color: root.foreground
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
      }

      SnippetFieldChrome {
        id: contentChrome
        width: parent.width
        implicitHeight: Math.max(Style.space(180), contentArea.implicitHeight) + chromePad * 2
        height: implicitHeight
        focused: contentArea.activeFocus
        hovered: contentArea.hovered
        foreground: root.foreground

        QQC.TextArea {
          id: contentArea
          anchors.fill: parent
          anchors.margins: contentChrome.chromePad
          text: root.draft ? root.draft.content : ""
          placeholderText: "Snippet content"
          enabled: root.editable
          activeFocusOnTab: true
          Accessible.role: Accessible.EditableText
          Accessible.name: "Content"
          Accessible.description: root.fieldErrors.content || ""
          Accessible.multiLine: true
          wrapMode: TextEdit.Wrap
          color: root.foreground
          selectionColor: Style.selectionFillFor(root.foreground, Color.accent)
          selectedTextColor: root.foreground
          background: Item {}
          cursorDelegate: Rectangle {
            width: Math.max(1, Style.normalBorderWidth)
            color: root.foreground
            visible: contentArea.cursorVisible
          }
          font.family: root.fontFamily
          font.pixelSize: Style.font.body
          leftPadding: Style.spacing.controlPaddingX
          rightPadding: Style.spacing.controlPaddingX
          topPadding: Style.spacing.inputPaddingY
          bottomPadding: Style.spacing.inputPaddingY
          onTextChanged: if (activeFocus) root.fieldChanged("content", text)
        }
      }

      Text {
        width: parent.width
        visible: text.length > 0
        text: root.fieldErrors.content || ""
        textFormat: Text.PlainText
        color: Color.urgent
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        wrapMode: Text.Wrap
      }

      Text {
        width: parent.width
        visible: text.length > 0
        text: root.fieldErrors.form || root.errorMessage || ""
        textFormat: Text.PlainText
        color: Color.urgent
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        wrapMode: Text.Wrap
      }

      Item {
        width: parent.width
        height: editorActions.height

        Row {
          id: editorActions
          anchors.right: parent.right
          spacing: Style.spacing.sm

          SnippetButton {
            label: root.busy ? "Saving…" : "Save"
            shortcut: "Ctrl+S"
            focusable: true
            enabled: root.editable
            hasCursor: activeFocus
            foreground: root.foreground
            onClicked: root.saveRequested()
          }

          SnippetButton {
            label: "Cancel"
            shortcut: "Escape"
            focusable: true
            enabled: !root.busy
            hasCursor: activeFocus
            foreground: root.foreground
            onClicked: root.cancelRequested()
          }
        }
      }
    }
  }
}
