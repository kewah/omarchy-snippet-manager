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
  property string searchStatus: ""
  property bool assistiveHidden: false
  property bool keyboardActive: false
  property string errorMessage: ""
  property color background: Color.menu.background
  property color foreground: Color.menu.text
  property color selectedBackground: Color.menu.selectedBackground
  property color selectedText: Color.menu.selectedText
  property string fontFamily: Style.font.menuFamily
  readonly property int rowHeight: Math.max(Style.space(58), Style.font.title + Style.font.caption + Style.spacing.rowPaddingX * 2)
  readonly property int visibleRowCount: Math.max(1, Math.floor(resultList.height / rowHeight))
  readonly property bool splitDetail: OverlayModel.usesSplitDetail(width, Style.space(560))
  readonly property bool showHints: OverlayModel.usesSplitDetail(width, Style.space(520))
  readonly property bool showDetail: splitDetail || height >= rowHeight * 2 + Style.space(120)
  readonly property string hints: OverlayModel.shortcutHints()

  signal rowSelected(int index)
  signal rowActivated(int index)
  signal createRequested()
  signal retryRequested()
  signal closeRequested()

  Accessible.ignored: root.assistiveHidden

  PointerMoveGate {
    id: pointerGate
    referenceItem: root
  }

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

  function disarmPointer() {
    pointerGate.reset()
  }

  onSelectedIdChanged: Qt.callLater(root.positionSelection)
  onQueryChanged: root.disarmPointer()
  onResultsChanged: {
    root.disarmPointer()
    Qt.callLater(root.positionSelection)
  }

  Column {
    anchors.fill: parent
    spacing: Style.spacing.md

    Item {
      width: parent.width
      height: Math.max(Style.space(38), Style.font.heading + Style.spacing.controlPaddingY * 2)

      Rectangle {
        anchors.left: parent.left
        anchors.top: parent.top
        anchors.bottom: parent.bottom
        width: Style.space(3)
        visible: root.keyboardActive
        color: root.foreground
        radius: Style.cornerRadius
      }

      Text {
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.leftMargin: root.keyboardActive ? Style.spacing.md : 0
        anchors.verticalCenter: parent.verticalCenter
        text: root.query || "Search snippets…"
        textFormat: Text.PlainText
        color: root.foreground
        opacity: root.query ? 1 : 0.58
        font.family: root.fontFamily
        font.pixelSize: Style.font.heading
        elide: Text.ElideRight
        Accessible.ignored: true
      }
    }

    Item {
      width: parent.width
      height: parent.height - parent.spacing - parent.children[0].height
        - (hintRow.visible ? parent.spacing + hintRow.height : 0)

      Item {
        id: resultsPane
        anchors.fill: parent
        visible: root.mode === "search" && root.results.length > 0
        Accessible.ignored: root.assistiveHidden

        ListView {
          id: resultList
          x: 0
          y: 0
          width: root.splitDetail && root.showDetail ? parent.width / 2 : parent.width
          height: root.splitDetail || !root.showDetail ? parent.height : Math.floor(parent.height * 0.48)
          model: root.results
          clip: true
          spacing: Style.space(4)
          boundsBehavior: Flickable.StopAtBounds
          Accessible.role: Accessible.List
          Accessible.name: "Snippet results"
          Accessible.ignored: root.assistiveHidden

          delegate: Rectangle {
            id: resultRow
            required property int index
            required property var modelData

            readonly property bool hasCursor: modelData.id === root.selectedId

            width: ListView.view.width - (root.splitDetail && root.showDetail ? Style.spacing.md : 0)
            height: root.rowHeight
            radius: Style.cornerRadius
            color: hasCursor ? root.selectedBackground : "transparent"
            Accessible.role: Accessible.ListItem
            Accessible.name: OverlayModel.resultAccessibleName(resultRow.modelData)
            Accessible.description: OverlayModel.previewText(resultRow.modelData.content, 100)
            Accessible.selectable: true
            Accessible.selected: resultRow.hasCursor
            Accessible.ignored: root.assistiveHidden
            Accessible.onPressAction: {
              root.rowSelected(resultRow.index)
              root.rowActivated(resultRow.index)
            }

            Rectangle {
              anchors.left: parent.left
              anchors.top: parent.top
              anchors.bottom: parent.bottom
              width: Style.space(3)
              visible: resultRow.hasCursor
              color: root.selectedText
              radius: Style.cornerRadius
            }

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
                text: OverlayModel.previewText(resultRow.modelData.content, 100)
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
              hoverEnabled: true
              cursorShape: Qt.PointingHandCursor
              onPositionChanged: function(mouse) {
                if (pointerGate.moved(resultRow, mouse)) root.rowSelected(resultRow.index)
              }
              onClicked: function(mouse) {
                root.rowSelected(resultRow.index)
                if (mouse.button === Qt.LeftButton) root.rowActivated(resultRow.index)
              }
            }
          }
        }

        Item {
          id: detailPane
          visible: root.showDetail
          x: root.splitDetail ? parent.width / 2 : 0
          y: root.splitDetail ? 0 : resultList.height
          width: root.splitDetail ? parent.width / 2 : parent.width
          height: root.splitDetail ? parent.height : parent.height - resultList.height
          clip: true
          Accessible.role: Accessible.StaticText
          Accessible.name: root.selectedSnippet() ? root.selectedSnippet().title : "Snippet detail"
          Accessible.description: root.selectedSnippet() ? OverlayModel.previewText(root.selectedSnippet().content, 160) : ""
          Accessible.ignored: root.assistiveHidden

          Rectangle {
            anchors.left: parent.left
            anchors.top: parent.top
            anchors.right: root.splitDetail ? undefined : parent.right
            anchors.bottom: root.splitDetail ? parent.bottom : undefined
            width: root.splitDetail ? Style.normalBorderWidth : parent.width
            height: root.splitDetail ? parent.height : Style.normalBorderWidth
            color: root.foreground
            opacity: 0.18
          }

          Flickable {
            anchors.fill: parent
            anchors.leftMargin: root.splitDetail ? Style.spacing.lg : 0
            anchors.topMargin: root.splitDetail ? 0 : Style.spacing.md
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
                text: root.selectedSnippet() ? root.selectedSnippet().content : ""
                textFormat: Text.PlainText
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.body
                wrapMode: Text.Wrap
              }
            }
          }
        }
      }

      Column {
        anchors.centerIn: parent
        spacing: Style.spacing.md
        visible: root.mode === "loading"
        Accessible.role: Accessible.StaticText
        Accessible.name: "Loading snippets…"
        Accessible.ignored: root.assistiveHidden

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
        Accessible.role: Accessible.StaticText
        Accessible.name: root.errorMessage
        Accessible.ignored: root.assistiveHidden

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
            Accessible.role: Accessible.Button
            Accessible.name: "Retry"
            Accessible.onPressAction: root.retryRequested()
            onClicked: root.retryRequested()
          }

          Button {
            text: "Close"
            bordered: true
            foreground: root.foreground
            Accessible.role: Accessible.Button
            Accessible.name: "Close"
            Accessible.onPressAction: root.closeRequested()
            onClicked: root.closeRequested()
          }
        }
      }

      Column {
        anchors.centerIn: parent
        spacing: Style.spacing.sm
        visible: root.mode === "search"
          && (root.searchStatus === "empty" || root.searchStatus === "no-results")
        Accessible.role: Accessible.StaticText
        Accessible.name: root.searchStatus === "empty" ? "No snippets yet" : "No matching snippets"
        Accessible.ignored: root.assistiveHidden

        Text {
          width: parent.width
          text: root.searchStatus === "empty" ? "No snippets yet" : "No matching snippets"
          textFormat: Text.PlainText
          color: root.foreground
          font.family: root.fontFamily
          font.pixelSize: Style.font.title
          horizontalAlignment: Text.AlignHCenter
        }

        Text {
          width: parent.width
          text: root.searchStatus === "empty" ? "Create a snippet to get started" : "Try a different search"
          textFormat: Text.PlainText
          color: root.foreground
          opacity: 0.62
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
          horizontalAlignment: Text.AlignHCenter
        }

        Button {
          visible: root.searchStatus === "empty"
          anchors.horizontalCenter: parent.horizontalCenter
          text: "Create snippet"
          bordered: true
          foreground: root.foreground
          Accessible.role: Accessible.Button
          Accessible.name: "Create snippet"
          Accessible.onPressAction: root.createRequested()
          onClicked: root.createRequested()
        }
      }
    }

    Text {
      id: hintRow
      width: parent.width
      text: root.hints
      textFormat: Text.PlainText
      visible: root.mode === "search" && root.showHints
      color: root.foreground
      opacity: 0.55
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
      elide: Text.ElideRight
      horizontalAlignment: Text.AlignRight
      Accessible.role: Accessible.StaticText
      Accessible.name: text
      Accessible.ignored: root.assistiveHidden
    }
  }
}
