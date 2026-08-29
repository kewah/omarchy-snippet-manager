import QtQuick
import QtQuick.Controls as QQC
import qs.Commons
import qs.Ui

Item {
  id: root

  property string editorMode: "create"
  property var draft: ({ title: "", keywords: [], content: "" })
  property var fieldErrors: ({})
  property string focusField: ""
  property string errorMessage: ""
  property bool busy: false
  property bool blocked: false
  readonly property bool editable: !root.busy && !root.blocked
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
    if (!root.editable || !keywordInput.text.trim()) return
    root.keywordAdded(keywordInput.text)
    keywordInput.text = ""
    keywordInput.forceActiveFocus()
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
    clip: true
    boundsBehavior: Flickable.StopAtBounds

    Column {
      id: form
      width: parent.width
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

      Item {
        width: parent.width
        height: titleField.height

        Rectangle {
          anchors.left: parent.left
          anchors.top: parent.top
          anchors.bottom: parent.bottom
          width: Style.space(3)
          visible: titleField.activeFocus
          color: root.foreground
          radius: Style.cornerRadius
        }

        TextField {
          id: titleField
          anchors.left: parent.left
          anchors.right: parent.right
          anchors.leftMargin: titleField.activeFocus ? Style.spacing.sm : 0
          text: root.draft ? root.draft.title : ""
          placeholderText: "Snippet title"
          enabled: root.editable
          foreground: root.foreground
          font.family: root.fontFamily
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
              width: Math.max(1, parent.width - removeButton.width - parent.spacing)
              text: keywordRow.modelData
              enabled: root.editable
              foreground: root.foreground
              font.family: root.fontFamily
              activeFocusOnTab: true
              Accessible.role: Accessible.EditableText
              Accessible.name: "Keyword " + (keywordRow.index + 1)
              onTextEdited: root.keywordChanged(keywordRow.index, text)
            }

            Button {
              id: removeButton
              text: "Remove"
              focusable: true
              bordered: true
              enabled: root.editable
              foreground: root.foreground
              Accessible.role: Accessible.Button
              Accessible.name: "Remove keyword " + (keywordRow.index + 1)
              Accessible.onPressAction: root.keywordRemoved(keywordRow.index)
              onClicked: root.keywordRemoved(keywordRow.index)
            }
          }
        }

        Row {
          width: parent.width
          spacing: Style.spacing.sm

          TextField {
            id: keywordInput
            width: Math.max(1, parent.width - addKeywordButton.width - parent.spacing)
            placeholderText: "Add a keyword"
            enabled: root.editable
            foreground: root.foreground
            font.family: root.fontFamily
            activeFocusOnTab: true
            Accessible.role: Accessible.EditableText
            Accessible.name: "Add keyword"
            onAccepted: root.addKeyword()
          }

          Button {
            id: addKeywordButton
            text: "Add"
            focusable: true
            bordered: true
            enabled: root.editable && keywordInput.text.trim().length > 0
            foreground: root.foreground
            Accessible.role: Accessible.Button
            Accessible.name: "Add keyword"
            Accessible.onPressAction: root.addKeyword()
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

      Item {
        width: parent.width
        height: contentArea.height

        Rectangle {
          anchors.left: parent.left
          anchors.top: parent.top
          anchors.bottom: parent.bottom
          width: Style.space(3)
          visible: contentArea.activeFocus
          color: root.foreground
          radius: Style.cornerRadius
        }

        QQC.TextArea {
          id: contentArea
          anchors.left: parent.left
          anchors.right: parent.right
          anchors.leftMargin: contentArea.activeFocus ? Style.spacing.sm : 0
          height: Math.max(Style.space(180), implicitHeight)
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

      Flow {
        width: parent.width
        spacing: Style.spacing.sm

        Button {
          text: root.busy ? "Saving…" : "Save"
          focusable: true
          bordered: true
          enabled: root.editable
          hasCursor: activeFocus
          foreground: root.foreground
          Accessible.role: Accessible.Button
          Accessible.name: root.busy ? "Saving" : "Save"
          Accessible.onPressAction: root.saveRequested()
          onClicked: root.saveRequested()
        }

        Button {
          text: "Cancel"
          focusable: true
          bordered: true
          enabled: !root.busy
          hasCursor: activeFocus
          foreground: root.foreground
          Accessible.role: Accessible.Button
          Accessible.name: "Cancel"
          Accessible.onPressAction: root.cancelRequested()
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
