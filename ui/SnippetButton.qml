import QtQuick
import qs.Commons
import qs.Ui
import "../lib/SnippetOverlayModel.js" as OverlayModel

Button {
  id: root

  required property string label
  required property string shortcut

  readonly property string caption: OverlayModel.labeledShortcut(root.label, root.shortcut)

  text: root.caption
  bordered: true
  foreground: Color.menu.text
  fontFamily: Style.font.menuFamily
  Accessible.role: Accessible.Button
  Accessible.name: root.caption
  Accessible.onPressAction: root.clicked()
}
