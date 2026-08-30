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
  property color border: Color.menu.border
  property color selectedBackground: Color.menu.selectedBackground
  property color selectedText: Color.menu.selectedText
  property string fontFamily: Style.font.menuFamily
  property int contentMargin: Style.spacing.panelPadding
  property int contentSpacing: Style.spacing.md
  property int headerHeight: Math.max(Style.space(34), Style.font.title + Style.spacing.controlPaddingY * 2)
  readonly property int rowHeight: Math.max(Style.space(50), Style.font.body + Style.font.caption + Style.spacing.rowPaddingX * 2)
  readonly property int visibleRowCount: Math.max(1, Math.floor(resultList.height / rowHeight))
  readonly property bool showHints: OverlayModel.usesSplitDetail(width, Style.space(520))
  readonly property string hints: OverlayModel.shortcutHints()
  readonly property var emptyCopy: OverlayModel.emptyStateCopy(root.searchStatus)
  readonly property bool showSearchField: OverlayModel.showsSearchField(root.searchStatus)

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
    spacing: root.contentSpacing

    Rectangle {
      width: parent.width
      height: root.showSearchField ? root.headerHeight : 0
      visible: root.showSearchField
      radius: Style.cornerRadius
      color: "transparent"
      clip: true

      Text {
        id: queryText
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
        Accessible.ignored: true
      }

      Rectangle {
        id: queryCaret
        width: Math.max(1, Style.normalBorderWidth)
        height: queryText.height
        color: root.foreground
        visible: root.keyboardActive
        anchors.verticalCenter: queryText.verticalCenter
        x: root.query ? Math.min(queryText.contentWidth, Math.max(0, queryText.width - width)) : 0
        onVisibleChanged: if (visible) opacity = 1

        SequentialAnimation on opacity {
          running: queryCaret.visible
          loops: Animation.Infinite
          NumberAnimation { to: 0; duration: 530 }
          NumberAnimation { to: 1; duration: 530 }
        }
      }
    }

    Item {
      width: parent.width
      height: parent.height
        - (root.showSearchField ? root.headerHeight + root.contentSpacing : 0)
        - (hintRow.visible ? parent.spacing + hintRow.height : 0)

      Item {
        id: resultsPane
        anchors.fill: parent
        visible: root.mode === "search" && root.results.length > 0
        Accessible.ignored: root.assistiveHidden

        Row {
          anchors.fill: parent
          spacing: 0

          Item {
            width: parent.width / 2
            height: parent.height
            clip: true

            ListView {
              id: resultList
              anchors.fill: parent
              anchors.rightMargin: root.contentMargin
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

                width: ListView.view.width
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

                Text {
                  anchors.fill: parent
                  anchors.leftMargin: Style.space(12)
                  anchors.rightMargin: Style.space(12)
                  anchors.topMargin: Style.space(8)
                  anchors.bottomMargin: Style.space(8)
                  text: OverlayModel.listItemText(resultRow.modelData)
                  textFormat: Text.PlainText
                  color: resultRow.hasCursor ? root.selectedText : root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.title
                  elide: Text.ElideRight
                  wrapMode: Text.NoWrap
                  verticalAlignment: Text.AlignVCenter
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
          }

          Item {
            id: detailPane
            width: parent.width / 2
            height: parent.height
            clip: true
            Accessible.role: Accessible.StaticText
            Accessible.name: root.selectedSnippet() ? root.selectedSnippet().title : "Snippet detail"
            Accessible.description: root.selectedSnippet() ? OverlayModel.previewText(root.selectedSnippet().content, 160) : ""
            Accessible.ignored: root.assistiveHidden

            Rectangle {
              anchors.left: parent.left
              anchors.top: parent.top
              anchors.bottom: parent.bottom
              width: Style.normalBorderWidth
              color: Util.alpha(root.border, 0.28)
            }

            Flickable {
              anchors.fill: parent
              anchors.leftMargin: root.contentMargin
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
                  text: root.selectedSnippet() ? root.selectedSnippet().content : ""
                  textFormat: Text.PlainText
                  color: root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.title
                  wrapMode: Text.Wrap
                }
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

          SnippetButton {
            label: "Retry"
            shortcut: "Enter"
            foreground: root.foreground
            onClicked: root.retryRequested()
          }

          SnippetButton {
            label: "Close"
            shortcut: "Escape"
            foreground: root.foreground
            onClicked: root.closeRequested()
          }
        }
      }

      Column {
        anchors.centerIn: parent
        spacing: Style.space(8)
        visible: root.mode === "search"
          && (root.searchStatus === "empty" || root.searchStatus === "no-results")
        Accessible.role: Accessible.StaticText
        Accessible.name: root.emptyCopy.heading
        Accessible.ignored: root.assistiveHidden

        Text {
          width: parent.width
          text: root.emptyCopy.heading
          textFormat: Text.PlainText
          color: root.foreground
          opacity: 0.7
          font.family: root.fontFamily
          font.pixelSize: Style.font.title
          horizontalAlignment: Text.AlignHCenter
        }

        Text {
          width: parent.width
          visible: text.length > 0
          text: root.emptyCopy.subtitle
          textFormat: Text.PlainText
          color: root.foreground
          opacity: 0.62
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
          horizontalAlignment: Text.AlignHCenter
        }

        SnippetButton {
          visible: root.searchStatus === "empty"
          anchors.horizontalCenter: parent.horizontalCenter
          label: "Create snippet"
          shortcut: "Ctrl+Shift+N"
          foreground: root.foreground
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
