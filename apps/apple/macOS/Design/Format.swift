import Foundation
import SillKit

/// Web `atoms/primitives.ts` time and length strings, with the same copy keys.
enum Format {
  private static let calendar: Calendar = {
    var calendar = Calendar(identifier: .gregorian)
    calendar.locale = Locale(identifier: "zh_CN")
    return calendar
  }()

  static func date(_ milliseconds: Double) -> Date {
    Date(timeIntervalSince1970: milliseconds / 1000)
  }
  static func milliseconds(_ date: Date = .now) -> Double { date.timeIntervalSince1970 * 1000 }

  /// 24-hour clock, e.g. 09:30.
  static func time(_ milliseconds: Double) -> String {
    let parts = calendar.dateComponents([.hour, .minute], from: date(milliseconds))
    return String(format: "%02d:%02d", parts.hour ?? 0, parts.minute ?? 0)
  }

  /// 10月20日 周二
  static func dateLabel(_ milliseconds: Double) -> String {
    let value = date(milliseconds)
    let parts = calendar.dateComponents([.month, .day, .weekday], from: value)
    let weekday = calendar.shortWeekdaySymbols[(parts.weekday ?? 1) - 1]
    return "\(parts.month ?? 0)\(Copy.text("web.primitives.1625179badc0"))\(parts.day ?? 0)"
      + "\(Copy.text("web.primitives.453e841e7da3"))\(weekday)"
  }

  /// A reminder's own time: the clock today, the date before it on any other day.
  static func reminderClock(_ at: Double, now: Double) -> String {
    calendar.isDate(date(at), inSameDayAs: date(now))
      ? time(at) : "\(dateLabel(at)) \(time(at))"
  }

  static func eventRelative(start: Double, end: Double, now: Double) -> String {
    let minutes = Int(ceil((start - now) / 60000))
    if minutes > 90 {
      return "\(Int((Double(minutes) / 60).rounded()))\(Copy.text("web.primitives.ec13a671ba0c"))"
    }
    if minutes > 0 { return "\(minutes)\(Copy.text("web.primitives.a63a9dc60e00"))" }
    // An ended event says nothing; the card fades instead.
    return now >= end ? "" : Copy.text("web.primitives.055da4d50c7e")
  }

  static func eventTimely(start: Double, end: Double, now: Double) -> Bool {
    start - now <= 15 * 60000 && now < end
  }

  static func duration(_ seconds: Int) -> String {
    let s = max(0, seconds)
    let h = s / 3600
    let m = (s % 3600) / 60
    let r = s % 60
    return h > 0 ? String(format: "%d:%02d:%02d", h, m, r) : String(format: "%d:%02d", m, r)
  }

  /// Publication date row (Medium-style): 10月1日, with the year when it is not this year.
  static func publication(_ value: String, now: Date = .now) -> String? {
    guard let parsed = parseDate(value) else { return nil }
    let sameYear = calendar.component(.year, from: parsed) == calendar.component(.year, from: now)
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "zh_CN")
    formatter.timeZone = value.count == 10 ? TimeZone(identifier: "UTC") : .current
    formatter.setLocalizedDateFormatFromTemplate(sameYear ? "MMMMd" : "yMMMMd")
    return formatter.string(from: parsed)
  }

  /// Web `cardDate`: ISO dates and offset timestamps only; offset-less times are ambiguous.
  static func parseDate(_ value: String) -> Date? {
    if value.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil {
      let formatter = ISO8601DateFormatter()
      formatter.formatOptions = [.withFullDate]
      return formatter.date(from: value)
    }
    guard
      value.range(
        of: #"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$"#,
        options: [.regularExpression, .caseInsensitive]) != nil
    else { return nil }
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = formatter.date(from: value) { return date }
    formatter.formatOptions = [.withInternetDateTime]
    return formatter.date(from: value)
  }

  static func fileSize(_ bytes: Int?) -> String {
    guard let bytes else { return "" }
    if bytes < 1024 { return "\(bytes) B" }
    if bytes < 1_048_576 { return String(format: "%.1f KB", Double(bytes) / 1024) }
    return String(format: "%.1f MB", Double(bytes) / 1_048_576)
  }
}
