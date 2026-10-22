import Foundation
import SillKit

/// Quick notes and links the person types (Web `services/capture.ts`). A first word that is an
/// http(s) link becomes an article from that site; anything else becomes a note.
enum Capture {
  static let limit = 4000

  /// The new card's stored JSON, or nil for empty text.
  static func card(from text: String, now: Double = Format.milliseconds()) -> JSONValue? {
    let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !value.isEmpty else { return nil }
    let first = value.split(whereSeparator: \.isWhitespace).first.map(String.init) ?? ""
    if let url = link(first) {
      let host = (url.host ?? "").replacingOccurrences(
        of: "^www\\.", with: "", options: .regularExpression)
      let rest = String(value.dropFirst(first.count)).trimmingCharacters(
        in: .whitespacesAndNewlines)
      let path = url.path.hasSuffix("/") ? String(url.path.dropLast()) : url.path
      return .object([
        "id": .string(id("web", url.absoluteString + stamp(now))),
        "type": .string("article"),
        "title": .string(clip(rest.isEmpty ? host + path : rest, 200)),
        "summary": .string(""),
        "sources": .array([.object(["name": .string(host), "kind": .string("web")])]),
        "url": .string(url.absoluteString),
        "tags": .array([]),
        "body": .string(rest),
        "time": .number(now),
      ])
    }
    let firstLine = value.components(separatedBy: "\n").first ?? value
    return .object([
      "id": .string(id("note", value + stamp(now))),
      "type": .string("note"),
      "title": .string(clip(firstLine, 60)),
      "summary": .string(clip(value, 300)),
      "sources": .array([
        .object(["name": .string(Copy.text("web.cards.e727b8cc2df0")), "kind": .string("capture")])
      ]),
      "tags": .array([]),
      "body": .string(String(value.prefix(500000))),
      "time": .number(now),
    ])
  }

  /// Web `dedupe`: the same link, or a note with the same title and body, is already there.
  static func duplicate(_ card: JSONValue, in cards: [CardModel]) -> Bool {
    if let url = card["url"]?.string {
      return cards.contains { $0.url?.absoluteString == url }
    }
    let title = card["title"]?.string
    let body = card["body"] ?? .string("")
    return cards.contains {
      $0.url == nil && $0.title == title && ($0.raw["body"] ?? .string("")) == body
    }
  }

  private static func link(_ text: String) -> URL? {
    guard let url = URL(string: text), let scheme = url.scheme?.lowercased(),
      scheme == "http" || scheme == "https", url.host?.isEmpty == false
    else { return nil }
    return url
  }

  /// Whitespace runs become one space; at most `limit` characters (Web `clip`).
  private static func clip(_ text: String, _ limit: Int) -> String {
    String(
      text.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
        .trimmingCharacters(in: .whitespaces).prefix(limit))
  }

  private static func stamp(_ now: Double) -> String { String(Int(now)) }

  /// FNV-1a over code points, base 36 (Web `Capture.id`).
  private static func id(_ prefix: String, _ text: String) -> String {
    var hash: UInt32 = 2_166_136_261
    for scalar in text.unicodeScalars {
      hash ^= scalar.value
      hash = hash &* 16_777_619
    }
    return prefix + "-" + String(hash, radix: 36)
  }
}
