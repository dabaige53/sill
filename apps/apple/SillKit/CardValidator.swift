import Foundation

public enum CardValidator {
  public static func validate(_ value: JSONValue) throws {
    let schema = try JSONValue.decode(Data(ContractSchema.json.utf8))
    try validate(value, schema: schema, root: schema, path: "card")
    guard let card = value.object, let type = card["type"]?.string else {
      throw CardValidationError("card")
    }
    try validateIDs(value)
    for url in [card["url"]?.string, card["meeting"]?["url"]?.string].compactMap({ $0 }) {
      guard let parsed = URL(string: url), ["http", "https"].contains(parsed.scheme ?? ""),
        let host = parsed.host, !host.isEmpty,
        !host.contains(where: { $0.isWhitespace })
      else {
        throw CardValidationError("card.url")
      }
    }
    switch type {
    case "event":
      guard let start = card["start"]?.number, start > 0,
        let end = card["end"]?.number, end > start
      else {
        throw CardValidationError("card.event.range")
      }
    case "task":
      let tasks = card["tasks"]?.array ?? []
      let ids = tasks.compactMap { $0["id"]?.string }
      guard !tasks.isEmpty, Set(ids).count == tasks.count else {
        throw CardValidationError("card.tasks.ids")
      }
    case "media":
      guard card["image"] != nil || card["media"]?.string == "podcast" else {
        throw CardValidationError("card.media.image")
      }
    case "photo":
      guard card["image"] != nil || !(card["photos"]?.array ?? []).isEmpty else {
        throw CardValidationError("card.photos")
      }
    case "file":
      guard !(card["files"]?.array ?? []).isEmpty else {
        throw CardValidationError("card.files")
      }
    default: break
    }
  }

  private static func validateIDs(_ value: JSONValue) throws {
    if let object = value.object {
      for (key, child) in object {
        if key == "id", let id = child.string,
          ["__proto__", "constructor", "prototype"].contains(id)
        {
          throw CardValidationError("card.id")
        }
      }
      if let related = object["related"]?.strings,
        related.contains(where: { ["__proto__", "constructor", "prototype"].contains($0) })
      {
        throw CardValidationError("card.related")
      }
      for task in object["tasks"]?.array ?? [] { try validateIDs(task) }
    }
  }

  private static func validate(_ value: JSONValue, schema: JSONValue, root: JSONValue, path: String)
    throws
  {
    if let reference = schema["$ref"]?.string {
      var resolved = root
      for segment in reference.dropFirst(2).components(separatedBy: "/") {
        guard let next = resolved[segment] else { throw CardValidationError(path) }
        resolved = next
      }
      try validate(value, schema: resolved, root: root, path: path)
      return
    }
    if let alternatives = schema["anyOf"]?.array {
      guard
        alternatives.contains(where: {
          (try? validate(value, schema: $0, root: root, path: path)) != nil
        })
      else {
        throw CardValidationError(path)
      }
    }
    if let allowed = schema["enum"]?.array, !allowed.contains(value) {
      throw CardValidationError(path)
    }
    switch schema["type"]?.string {
    case "object":
      guard let object = value.object else { throw CardValidationError(path) }
      for key in schema["required"]?.strings ?? [] {
        guard object[key] != nil else { throw CardValidationError(path + "." + key) }
      }
      let properties = schema["properties"]?.object ?? [:]
      for (key, child) in object {
        if let property = properties[key] {
          try validate(child, schema: property, root: root, path: path + "." + key)
        } else if schema["additionalProperties"] == .bool(false) {
          throw CardValidationError(path + "." + key)
        }
      }
    case "array":
      guard let values = value.array else { throw CardValidationError(path) }
      try bounds(
        Double(values.count), minimum: schema["minItems"]?.number,
        maximum: schema["maxItems"]?.number, path: path)
      if let itemSchema = schema["items"] {
        for child in values { try validate(child, schema: itemSchema, root: root, path: path) }
      }
    case "string":
      guard let text = value.string else { throw CardValidationError(path) }
      try bounds(
        Double(text.utf16.count), minimum: schema["minLength"]?.number,
        maximum: schema["maxLength"]?.number, path: path)
      if let pattern = schema["pattern"]?.string,
        text.range(of: pattern, options: .regularExpression) == nil
      {
        throw CardValidationError(path)
      }
      if schema["format"]?.string == "uri" {
        guard let url = URL(string: text), let scheme = url.scheme,
          ["http", "https"].contains(scheme), let host = url.host, !host.isEmpty
        else {
          throw CardValidationError(path)
        }
      }
    case "number", "integer":
      guard let number = value.number, number.isFinite else { throw CardValidationError(path) }
      if schema["type"]?.string == "integer", number.rounded() != number {
        throw CardValidationError(path)
      }
      try bounds(
        number, minimum: schema["minimum"]?.number,
        maximum: schema["maximum"]?.number, path: path)
    case "boolean":
      guard value.bool != nil else { throw CardValidationError(path) }
    default: break
    }
  }

  private static func bounds(_ value: Double, minimum: Double?, maximum: Double?, path: String)
    throws
  {
    if let minimum, value < minimum { throw CardValidationError(path) }
    if let maximum, value > maximum { throw CardValidationError(path) }
  }
}
