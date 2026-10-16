import Foundation

public enum JSONValue: Codable, Equatable, Sendable {
  case object([String: JSONValue])
  case array([JSONValue])
  case string(String)
  case number(Double)
  case bool(Bool)
  case null

  public init(from decoder: any Decoder) throws {
    let container = try decoder.singleValueContainer()
    if container.decodeNil() {
      self = .null
    } else if let value = try? container.decode(Bool.self) {
      self = .bool(value)
    } else if let value = try? container.decode(Double.self) {
      self = .number(value)
    } else if let value = try? container.decode(String.self) {
      self = .string(value)
    } else if let value = try? container.decode([JSONValue].self) {
      self = .array(value)
    } else {
      self = .object(try container.decode([String: JSONValue].self))
    }
  }

  public func encode(to encoder: any Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .object(let value): try container.encode(value)
    case .array(let value): try container.encode(value)
    case .string(let value): try container.encode(value)
    case .number(let value): try container.encode(value)
    case .bool(let value): try container.encode(value)
    case .null: try container.encodeNil()
    }
  }

  public subscript(_ key: String) -> JSONValue? {
    get { object?[key] }
    set {
      var value = object ?? [:]
      value[key] = newValue
      self = .object(value)
    }
  }

  public var object: [String: JSONValue]? {
    if case .object(let value) = self { value } else { nil }
  }
  public var array: [JSONValue]? { if case .array(let value) = self { value } else { nil } }
  public var string: String? { if case .string(let value) = self { value } else { nil } }
  public var number: Double? { if case .number(let value) = self { value } else { nil } }
  public var bool: Bool? { if case .bool(let value) = self { value } else { nil } }
  public var strings: [String]? { array?.compactMap(\.string) }
  public func encoded() throws -> Data { try JSONEncoder().encode(self) }
  public static func decode(_ data: Data) throws -> JSONValue {
    try JSONDecoder().decode(Self.self, from: data)
  }
}
