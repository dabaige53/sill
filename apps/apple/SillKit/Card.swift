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

  public init(json: JSONValue) throws {
    try CardValidator.validate(json)
    value = try JSONDecoder().decode(Components.Schemas.Card.self, from: json.encoded())
    encodedFields = try JSONValue.decode(JSONEncoder().encode(value))
  }

  public init(from decoder: any Decoder) throws {
    let json = try JSONValue(from: decoder)
    try self.init(json: json)
  }

  public func encode(to encoder: any Encoder) throws { try value.encode(to: encoder) }
}
