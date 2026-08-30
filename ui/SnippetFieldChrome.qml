import QtQuick
import qs.Commons
import qs.Ui

// Field chrome lives outside TextField / TextArea. Those controls clip their
// own background (TextArea is a Flickable), so a BorderSurface background
// loses its left edge. Unfocused fields stay fill-only.
BorderSurface {
  id: root

  property bool focused: false
  property bool hovered: false
  property color foreground: Color.menu.text
  readonly property int chromePad: Math.max(1, Style.focusBorderWidth)

  color: Style.controlFill(root.focused, root.hovered, root.foreground, Color.accent)
  borderSpec: root.focused ? Border.flat(root.foreground, root.chromePad) : Border.none()
  radius: Style.cornerRadius
}
