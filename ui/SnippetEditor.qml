import QtQuick
import QtQuick.Controls as QQC
import qs.Commons
import qs.Ui

Item {
  id: root

  property var draft: ({ title: "", keywords: [], content: "" })
  property var fieldErrors: ({})
  property string focusField: ""
  property string errorMessage: ""
  property bool busy: false
  property color foreground: Color.menu.text
  property color background: Color.menu.background
  property string fontFamily: Style.font.menuFamily

  signal fieldChanged(string field, string value)
  signal keywordAdded(string value)
  signal keywordChanged(int index, string value)
  signal keywordRemoved(int index)
  signal saveRequested()
  signal cancelRequested()

  function focusRequestedField() {
    if (!root.visible) return
    if (root.focusField === "content") contentArea.forceActiveFocus()
    else if (root.focusField === "keywords") keywordInput.forceActiveFocus()
    else titleField.forceActiveFocus()
  }

  function addKeyword() {
    if (root.busy || !keywordInput.text.trim()) return
    root.keywordAdded(keywordInput.text)
    keywordInput.text = ""
    keywordInput.forceActiveFocus()
  }

  onVisibleChanged: if (visible) Qt.callLater(root.focusRequestedField)
  onFocusFieldChanged: if (visible && focusField) Qt.callLater(root.focusRequestedField)

  Shortcut {
    sequence: "Ctrl+S"
    enabled: root.visible && !root.busy
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
    clip: true
    boundsBehavior: Flickable.StopAtBounds

    Column {
      id: form
      width: parent.width
      spacing: Style.spacing.md

      Text {
        width: parent.width
        text: "Create snippet"
        textFormat: Text.PlainText
        color: root.foreground
        font.family: root.fontFamily
        font.pixelSize: Style.font.heading
      }

      Text {
        width: parent.width
        text: "Title"
        textFormat: Text.PlainText
        color: root.foreground
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
      }

      TextField {
        id: titleField
        width: parent.width
        text: root.draft ? root.draft.title : ""
        placeholderText: "Snippet title"
        enabled: !root.busy
        foreground: root.foreground
        font.family: root.fontFamily
        activeFocusOnTab: true
        onTextEdited: root.fieldChanged("title", text)
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
        text: "Keywords"
        textFormat: Text.PlainText
        color: root.foreground
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
      }

      Column {
        width: parent.width
        spacing: Style.spacing.sm

        Repeater {
          model: root.draft ? root.draft.keywords : []

          delegate: Row {
            id: keywordRow
            required property int index
            required property string modelData

            width: parent.width
            spacing: Style.spacing.sm

            TextField {
              width: parent.width - removeButton.width - parent.spacing
              text: keywordRow.modelData
              enabled: !root.busy
              foreground: root.foreground
              font.family: root.fontFamily
              activeFocusOnTab: true
              onTextEdited: root.keywordChanged(keywordRow.index, text)
            }

            Button {
              id: removeButton
              text: "Remove"
              focusable: true
              bordered: true
              enabled: !root.busy
              foreground: root.foreground
              onClicked: root.keywordRemoved(keywordRow.index)
            }
          }
        }

        Row {
          width: parent.width
          spacing: Style.spacing.sm

          TextField {
            id: keywordInput
            width: parent.width - addKeywordButton.width - parent.spacing
            placeholderText: "Add a keyword"
            enabled: !root.busy
            foreground: root.foreground
            font.family: root.fontFamily
            activeFocusOnTab: true
            onAccepted: root.addKeyword()
          }

          Button {
            id: addKeywordButton
            text: "Add"
            focusable: true
            bordered: true
            enabled: !root.busy && keywordInput.text.trim().length > 0
            foreground: root.foreground
            onClicked: root.addKeyword()
          }
        }
      }

      Text {
        width: parent.width
        visible: text.length > 0
        text: root.fieldErrors.keywords || ""
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

      QQC.TextArea {
        id: contentArea
        width: parent.width
        height: Math.max(Style.space(180), implicitHeight)
        text: root.draft ? root.draft.content : ""
        placeholderText: "Snippet content"
        enabled: !root.busy
        activeFocusOnTab: true
        wrapMode: TextEdit.WrapAnywhere
        color: root.foreground
        selectionColor: Style.selectionFillFor(root.foreground, Color.accent)
        selectedTextColor: root.foreground
        font.family: root.fontFamily
        font.pixelSize: Style.font.body
        leftPadding: Style.spacing.controlPaddingX
        rightPadding: Style.spacing.controlPaddingX
        topPadding: Style.spacing.inputPaddingY
        bottomPadding: Style.spacing.inputPaddingY
        background: BorderSurface {
          color: Style.controlFill(contentArea.activeFocus, contentArea.hovered, root.foreground, Color.accent)
          borderSpec: Border.controlSpec(contentArea.activeFocus ? "focus" : (contentArea.hovered ? "hover-cursor" : "normal"), root.foreground, Color.accent)
          radius: Style.cornerRadius
        }
        onTextChanged: if (activeFocus) root.fieldChanged("content", text)
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

      Row {
        anchors.right: parent.right
        spacing: Style.spacing.sm

        Button {
          text: root.busy ? "Saving…" : "Save"
          focusable: true
          bordered: true
          enabled: !root.busy
          foreground: root.foreground
          onClicked: root.saveRequested()
        }

        Button {
          text: "Cancel"
          focusable: true
          bordered: true
          enabled: !root.busy
          foreground: root.foreground
          onClicked: root.cancelRequested()
        }
      }

      Text {
        width: parent.width
        text: "Ctrl+S Save  ·  Escape Cancel"
        textFormat: Text.PlainText
        color: root.foreground
        opacity: 0.55
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        horizontalAlignment: Text.AlignRight
      }
    }
  }
}
