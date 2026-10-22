import Foundation

public struct Card: Codable, Identifiable, Sendable {
  public let value: Components.Schemas.Card
  private let encodedFields: JSONValue
  public var id: String { value.id }
  public var title: String { value.title }
  public var type: String { value._type }
  public var body: String { value.body ?? "" }
  public var summary: String { value.summary ?? "" }
  public var source: String {
    value.sources?.map(\.name).joined(separator: " · ") ?? ""
  }
  // Cards are immutable; encode once when loading, not for every field in every render.
  public var raw: JSONValue { get throws { encodedFields } }

  public init(json: JSONValue, normalize: Bool = false) throws {
    let normalized = normalize ? Self.normalize(json) : json
    try CardValidator.validate(normalized)
    value = try JSONDecoder().decode(Components.Schemas.Card.self, from: normalized.encoded())
    encodedFields = try JSONValue.decode(JSONEncoder().encode(value))
  }

  public init(from decoder: any Decoder) throws {
    let json = try JSONValue(from: decoder)
    try self.init(json: json)
  }

  public func encode(to encoder: any Encoder) throws { try value.encode(to: encoder) }

  /// Legacy body arrays and points become one Markdown body (ADR 0063, Web `normalizeCard`).
  static func markdownBody(_ input: JSONValue) -> JSONValue {
    var card = input
    let blank = { (text: String) in text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    let paragraphs = card["body"]?.array.map {
      $0.compactMap(\.string).filter { !blank($0) }.joined(separator: "\n\n")
    }
    let points = (card["points"]?.array ?? []).compactMap(\.string).enumerated()
      .map { "\($0.offset + 1). \($0.element)" }.joined(separator: "\n")
    if paragraphs != nil || !points.isEmpty {
      let body = [points, paragraphs ?? card["body"]?.string ?? ""].filter { !blank($0) }
        .joined(separator: "\n\n")
      card["body"] = body.isEmpty ? nil : .string(body)
    }
    card["points"] = nil
    return card
  }

  public static func normalize(_ original: JSONValue) -> JSONValue {
    let input = markdownBody(original)
    if input["sources"] != nil, input["sources"]?.array == nil { return input }
    var card = input
    var sources = (card["sources"]?.array ?? []).map { source in
      var result = source
      if source["kind"]?.string == "ai" { result["kind"] = .string("agent") }
      return result
    }
    let type = card["type"]?.string
    let kind = card["kind"]?.string
    let normalizedKind = kind == "ai" ? "agent" : kind ?? "local"
    if let source = card["source"]?.string, !source.isEmpty, type != "mail" {
      if !sources.contains(where: {
        $0["name"]?.string == source && $0["kind"]?.string == normalizedKind
      }) {
        sources.append(.object(["name": .string(source), "kind": .string(normalizedKind)]))
      }
    } else if type == "mail", card["sender"] == nil, let source = card["source"]?.string {
      card["sender"] = .string(source)
    }
    if sources.isEmpty, let kind {
      sources.append(
        .object([
          "name": .string(
            kind == "ai" ? Copy.appleAgentSource : type == "mail" ? Copy.appleMailSource : kind),
          "kind": .string(normalizedKind),
        ]))
    }
    if !sources.isEmpty || card["sources"] != nil { card["sources"] = .array(sources) }
    card["source"] = nil
    card["kind"] = nil
    return card
  }
}
