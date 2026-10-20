import SwiftUI

/// Product action names map to the system symbol set on macOS.
struct NativeIcon: View {
  let name: String
  var size: CGFloat = 20
  var body: some View {
    if name == "sill", let icon = NSImage(named: NSImage.applicationIconName) {
      Image(nsImage: icon).resizable().scaledToFit()
        .frame(width: size, height: size).accessibilityHidden(true)
    } else {
      Image(systemName: Self.symbol(for: name)).font(.system(size: size))
        .symbolRenderingMode(.hierarchical)
        .frame(width: size, height: size).accessibilityHidden(true)
    }
  }
  static func symbol(for name: String) -> String { symbols[name] ?? "doc" }
  private static let symbols: [String: String] = [
    "book": "book", "mail": "envelope", "note": "note.text", "check-circle": "checkmark.circle",
    "calendar": "calendar", "bell": "bell", "bell-off": "bell.slash", "video": "play.rectangle",
    "chart": "chart.bar", "sparkle": "sparkles", "sparkles": "sparkles", "image": "photo",
    "folder": "folder", "file": "doc", "rss": "dot.radiowaves.up.forward", "globe": "globe",
    "chat": "bubble.left", "mic": "mic", "target": "scope", "pull": "arrow.triangle.branch",
    "bookmark": "bookmark", "tag": "tag", "glasses": "eyeglasses", "later": "eyeglasses",
    "reply": "arrowshape.turn.up.left", "open": "arrow.up.right.square", "join": "video",
    "snooze": "bell.badge", "download": "arrow.down.circle", "dismiss": "bell.slash",
    "x": "xmark", "check": "checkmark", "plus": "plus", "more": "ellipsis",
    "up": "arrow.up", "down": "arrow.down", "arrow": "arrow.up.right",
    "back": "chevron.left", "chevron": "chevron.right", "chevron-down": "chevron.down",
    "expand": "arrow.up.left.and.arrow.down.right",
    "collapse": "arrow.down.right.and.arrow.up.left",
    "undo": "arrow.uturn.backward", "clock": "clock", "ring": "archivebox",
    "archive": "archivebox", "lock": "lock", "pin": "mappin.and.ellipse", "at": "person.2",
    "link": "link", "search": "magnifyingglass", "refresh": "arrow.clockwise",
    "play": "play", "pause": "pause", "copy": "doc.on.doc", "settings": "gearshape",
    "sun": "sun.max", "moon": "moon", "trash": "trash", "share": "square.and.arrow.up",
    "headphones": "headphones", "external": "arrow.up.right.square",
    "reply-all": "arrowshape.turn.up.left.2",
  ]
}
