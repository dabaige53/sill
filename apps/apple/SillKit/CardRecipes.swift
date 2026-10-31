import Foundation

/// One entry of a card recipe (design-system/recipes.json, ADR 0086): a block with options,
/// a layout group of entries, or a composite that renders the whole surface.
public indirect enum RecipeEntry: Equatable, Sendable {
  case block(String, [String: JSONValue])
  case group(String, [RecipeEntry])
  case composite(String)

  init(_ value: JSONValue) {
    if let name = value.string {
      self = .block(name, [:])
    } else if let object = value.object, let name = object["block"]?.string {
      self = .block(name, object)
    } else if let object = value.object, let name = object["group"]?.string {
      self = .group(name, (object["blocks"]?.array ?? []).map(RecipeEntry.init))
    } else {
      self = .composite(value.object?["composite"]?.string ?? "")
    }
  }

  public var name: String {
    switch self {
    case .block(let name, _), .group(let name, _), .composite(let name): name
    }
  }
  public func string(_ key: String) -> String? {
    if case .block(_, let options) = self { options[key]?.string } else { nil }
  }
  public func number(_ key: String) -> Int? {
    if case .block(_, let options) = self { options[key]?.number.map { Int($0) } } else { nil }
  }
  public func flag(_ key: String) -> Bool? {
    if case .block(_, let options) = self { options[key]?.bool } else { nil }
  }
  public func strings(_ key: String) -> [String]? {
    if case .block(_, let options) = self { options[key]?.strings } else { nil }
  }
}

/// The detail surface: head blocks inside the header, then body blocks; or one composite.
public struct DetailRecipe: Equatable, Sendable {
  public let head: [RecipeEntry]
  public let body: [RecipeEntry]
  public let composite: String?
  public let ruled: Bool
  public let reader: Bool
  public let end: Bool
}

public enum CardRecipes {
  public static let summaryCharacters: Int = {
    let root = try? JSONValue.decode(Data(CardRecipeData.json.utf8))
    return Int(root?["content"]?["summaryCharacters"]?.number ?? 120)
  }()

  public static func faceSummary(_ text: String) -> String {
    let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
    let characters = value.unicodeScalars
    return characters.count > summaryCharacters
      ? String(String.UnicodeScalarView(characters.prefix(summaryCharacters - 1))) + "…" : value
  }
  private static let types: [String: JSONValue] = {
    let root = try? JSONValue.decode(Data(CardRecipeData.json.utf8))
    return root?.object?["types"]?.object ?? [:]
  }()

  /// A recipe part may name another recipe to reuse its card face or detail.
  private static func part(_ key: String, _ name: String) -> JSONValue? {
    var value = types[key]?.object?[name]
    for _ in 0..<4 {
      guard let next = value?.string else { break }
      value = types[next]?.object?[name]
    }
    return value
  }

  public static func has(_ key: String) -> Bool { types[key] != nil }

  public static func card(_ key: String) -> [RecipeEntry] {
    (part(key, "card")?.array ?? part("default", "card")?.array ?? []).map(RecipeEntry.init)
  }

  public static func detail(_ key: String) -> DetailRecipe {
    let object = part(key, "detail")?.object ?? part("default", "detail")?.object ?? [:]
    return DetailRecipe(
      head: (object["head"]?.array ?? []).map(RecipeEntry.init),
      body: (object["body"]?.array ?? []).map(RecipeEntry.init),
      composite: object["composite"]?.string,
      ruled: object["ruled"]?.bool ?? false,
      reader: object["reader"]?.bool ?? false,
      end: object["end"]?.bool ?? false)
  }

  /// The full-screen reader uses the type's detail when it supports reading, else the default.
  public static func reader(_ key: String) -> DetailRecipe {
    let detail = detail(key)
    return detail.reader ? detail : Self.detail("default")
  }
}
