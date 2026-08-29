import QtQuick
import qs.Commons
import qs.Ui
import "../lib/SnippetOverlayModel.js" as OverlayModel

Item {
  id: root

  property string mode: "loading"
  property string query: ""
  property var results: []
  property string selectedId: ""
  property string errorMessage: ""
  property color background: Color.menu.background
  property color foreground: Color.menu.text
  property color selectedBackground: Color.menu.selectedBackground
  property color selectedText: Color.menu.selectedText
  property string fontFamily: Style.font.menuFamily
  readonly property int rowHeight: Math.max(Style.space(58), Style.font.title + Style.font.caption + Style.spacing.rowPaddingX * 2)
  readonly property int visibleRowCount: Math.max(1, Math.floor(resultList.height / rowHeight))

  signal rowSelected(int index)
  signal rowActivated(int index)
  signal retryRequested()
  signal closeRequested()

  function selectedIndex() {
    for (var i = 0; i < root.results.length; i++) {
      if (root.results[i].id === root.selectedId) return i
    }
    return -1
  }

  function selectedSnippet() {
    var index = root.selectedIndex()
    return index >= 0 ? root.results[index] : null
  }

  function positionSelection() {
    var index = root.selectedIndex()
    if (index >= 0) resultList.positionViewAtIndex(index, ListView.Contain)
  }

  onSelectedIdChanged: Qt.callLater(root.positionSelection)
  onResultsChanged: Qt.callLater(root.positionSelection)

  Column {
    anchors.fill: parent
    spacing: Style.spacing.md

    Item {
      width: parent.width
      height: Math.max(Style.space(38), Style.font.heading + Style.spacing.controlPaddingY * 2)

      Text {
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
        text: root.query || "Search snippets…"
        textFormat: Text.PlainText
        color: root.foreground
        opacity: root.query ? 1 : 0.58
        font.family: root.fontFamily
        font.pixelSize: Style.font.heading
        elide: Text.ElideRight
      }
    }

    Item {
      width: parent.width
      height: parent.height - parent.spacing - parent.children[0].height

      Row {
        anchors.fill: parent
        visible: root.mode === "search" && root.results.length > 0

        ListView {
          id: resultList
          width: parent.width / 2
          height: parent.height
          model: root.results
          clip: true
          spacing: Style.space(4)
          boundsBehavior: Flickable.StopAtBounds

          delegate: Rectangle {
            id: resultRow
            required property int index
            required property var modelData

            readonly property bool hasCursor: modelData.id === root.selectedId

            width: ListView.view.width - Style.spacing.md
            height: root.rowHeight
            radius: Style.cornerRadius
            color: hasCursor ? root.selectedBackground : "transparent"

            Column {
              anchors.fill: parent
              anchors.leftMargin: Style.spacing.md
              anchors.rightMargin: Style.spacing.md
              anchors.topMargin: Style.spacing.sm
              anchors.bottomMargin: Style.spacing.sm
              spacing: Style.space(2)

              Text {
                width: parent.width
                text: resultRow.modelData.title
                textFormat: Text.PlainText
                color: resultRow.hasCursor ? root.selectedText : root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.title
                elide: Text.ElideRight
              }

              Text {
                width: parent.width
                text: OverlayModel.previewText(
                  (resultRow.modelData.keywords.length > 0 ? resultRow.modelData.keywords.join(" · ") + " — " : "")
                    + resultRow.modelData.content,
                  100)
                textFormat: Text.PlainText
                color: resultRow.hasCursor ? root.selectedText : root.foreground
                opacity: 0.65
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                elide: Text.ElideRight
              }
            }

            MouseArea {
              anchors.fill: parent
              cursorShape: Qt.PointingHandCursor
              onClicked: function(mouse) {
                root.rowSelected(resultRow.index)
                if (mouse.button === Qt.LeftButton) root.rowActivated(resultRow.index)
              }
            }
          }
        }

        Item {
          width: parent.width / 2
          height: parent.height
          clip: true

          Rectangle {
            anchors.left: parent.left
            anchors.top: parent.top
            anchors.bottom: parent.bottom
            width: Style.normalBorderWidth
            color: root.foreground
            opacity: 0.18
          }

          Flickable {
            anchors.fill: parent
            anchors.leftMargin: Style.spacing.lg
            contentWidth: width
            contentHeight: detailColumn.implicitHeight
            clip: true
            boundsBehavior: Flickable.StopAtBounds

            Column {
              id: detailColumn
              width: parent.width
              spacing: Style.spacing.md

              Text {
                width: parent.width
                text: root.selectedSnippet() ? root.selectedSnippet().title : ""
                textFormat: Text.PlainText
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.heading
                wrapMode: Text.Wrap
              }

              Text {
                width: parent.width
                text: root.selectedSnippet() ? root.selectedSnippet().keywords.join(" · ") : ""
                textFormat: Text.PlainText
                visible: text.length > 0
                color: root.foreground
                opacity: 0.6
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                wrapMode: Text.Wrap
              }

              Text {
                width: parent.width
                text: root.selectedSnippet() ? root.selectedSnippet().content : ""
                textFormat: Text.PlainText
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.body
                wrapMode: Text.WrapAnywhere
              }
            }
          }
        }
      }

      Column {
        anchors.centerIn: parent
        spacing: Style.spacing.md
        visible: root.mode === "loading"

        Text {
          width: parent.width
          text: "Loading snippets…"
          textFormat: Text.PlainText
          color: root.foreground
          font.family: root.fontFamily
          font.pixelSize: Style.font.title
          horizontalAlignment: Text.AlignHCenter
        }
      }

      Column {
        anchors.centerIn: parent
        spacing: Style.spacing.md
        visible: root.mode === "load-error"

        Text {
          width: Math.min(implicitWidth, root.width - Style.spacing.xl * 2)
          text: root.errorMessage
          textFormat: Text.PlainText
          color: root.foreground
          font.family: root.fontFamily
          font.pixelSize: Style.font.title
          horizontalAlignment: Text.AlignHCenter
          wrapMode: Text.Wrap
        }

        Row {
          anchors.horizontalCenter: parent.horizontalCenter
          spacing: Style.spacing.sm

          Button {
            text: "Retry"
            bordered: true
            foreground: root.foreground
            onClicked: root.retryRequested()
          }

          Button {
            text: "Close"
            bordered: true
            foreground: root.foreground
            onClicked: root.closeRequested()
          }
        }
      }

      Column {
        anchors.centerIn: parent
        spacing: Style.spacing.sm
        visible: root.mode === "search" && root.results.length === 0

        Text {
          width: parent.width
          text: root.query ? "No matching snippets" : "No snippets yet"
          textFormat: Text.PlainText
          color: root.foreground
          font.family: root.fontFamily
          font.pixelSize: Style.font.title
          horizontalAlignment: Text.AlignHCenter
        }

        Text {
          width: parent.width
          text: root.query ? "Try a different search" : "Press Ctrl+N to create one"
          textFormat: Text.PlainText
          color: root.foreground
          opacity: 0.62
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
          horizontalAlignment: Text.AlignHCenter
        }
      }
    }
  }
}
