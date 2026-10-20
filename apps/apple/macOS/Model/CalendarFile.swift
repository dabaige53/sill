import AppKit
import SillKit
import UniformTypeIdentifiers

/// Web `downloadCalendar`: one event as `sill.ics`. Text values are escaped and lines end in
/// CRLF, as the iCalendar format requires.
@MainActor enum CalendarFile {
  static func text(_ card: CardModel, now: Date = .now) -> String? {
    guard card.kind == .event, let start = card.start, let end = card.end else { return nil }
    var lines = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Sill//Local//ZH", "BEGIN:VEVENT",
      "UID:\(card.id)@sill.local", "DTSTAMP:\(stamp(now))", "DTSTART:\(stamp(Format.date(start)))",
      "DTEND:\(stamp(Format.date(end)))", "SUMMARY:\(escape(card.title))",
    ]
    if let location = card.location, !location.isEmpty {
      lines.append("LOCATION:\(escape(location))")
    }
    lines += ["END:VEVENT", "END:VCALENDAR"]
    return lines.joined(separator: "\r\n") + "\r\n"
  }

  /// Asks where to save, like a browser download.
  static func save(_ card: CardModel, workspace: Workspace) {
    guard let text = text(card) else { return }
    let panel = NSSavePanel()
    panel.nameFieldStringValue = "sill.ics"
    panel.allowedContentTypes = [UTType(filenameExtension: "ics") ?? .data]
    panel.begin { response in
      guard response == .OK, let url = panel.url else { return }
      MainActor.assumeIsolated {
        do {
          try Data(text.utf8).write(to: url, options: .atomic)
        } catch {
          workspace.notice = .init(text: Copy.appleExportError)
        }
      }
    }
  }

  /// `20261020T083000Z`.
  static func stamp(_ date: Date) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withYear, .withMonth, .withDay, .withTime, .withTimeZone]
    formatter.timeZone = TimeZone(identifier: "UTC")
    return formatter.string(from: date)
  }

  static func escape(_ text: String) -> String {
    text.replacingOccurrences(of: "\\", with: "\\\\")
      .replacingOccurrences(of: ";", with: "\\;")
      .replacingOccurrences(of: ",", with: "\\,")
      .replacingOccurrences(of: "\r\n", with: "\\n")
      .replacingOccurrences(of: "\n", with: "\\n")
  }
}
