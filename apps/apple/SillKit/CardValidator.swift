import Foundation

public enum CardValidator {
  // The bundled contract is immutable. Decode it once instead of once per loaded card.
  private static let schema = Result { try JSONValue.decode(Data(ContractSchema.json.utf8)) }

  public static func validate(_ value: JSONValue) throws {
    let schema = try Self.schema.get()
    try validate(value, schema: schema, root: schema, path: "card")
    guard let card = value.object, let type = card["type"]?.string else {
      throw CardValidationError("card")
    }
    try validateExplicitFields(card, type: type)
    try validateRichFields(card, type: type)
    try validateIDs(value)
    for image in card["images"]?.array?.compactMap(\.string) ?? [] {
      if ["architecture", "coast", "mountain", "botanical"].contains(image) { continue }
      guard image.hasPrefix("https://"), let url = URL(string: image),
        let host = url.host, !host.isEmpty, url.user == nil, url.password == nil,
        !image.contains(where: { $0.isWhitespace })
      else { throw CardValidationError("card.images") }
    }

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
      guard !(card["images"]?.array ?? []).isEmpty || card["media"]?.string == "podcast" else {
        throw CardValidationError("card.media.images")
      }
    case "photo":
      guard !(card["images"]?.array ?? []).isEmpty else {
        throw CardValidationError("card.images")
      }
    case "file":
      guard !(card["files"]?.array ?? []).isEmpty else {
        throw CardValidationError("card.files")
      }
    default: break
    }
  }

  private static func validateExplicitFields(_ card: [String: JSONValue], type: String) throws {
    let restricted: [String: [String]] = [
      "authors": ["article", "note", "mail", "media", "digest", "suggestion", "file"],
      "project": ["task", "reminder"], "people": ["event"], "form": ["note"],
    ]
    for (field, types) in restricted where card[field] != nil && !types.contains(type) {
      throw CardValidationError("card." + field)
    }
    if let value = card["publishedAt"] {
      guard let text = value.string, validDate(text, dateOnly: true) else {
        throw CardValidationError("card.publishedAt")
      }
    }
    for file in card["files"]?.array ?? [] {
      if let date = file["modifiedAt"] {
        guard let text = date.string, validDate(text, dateOnly: true) else {
          throw CardValidationError("card.files.modifiedAt")
        }
      }
    }
    var trimmed = (card["authors"]?.array ?? []).compactMap { $0["name"]?.string }
    trimmed += (card["files"]?.array ?? []).compactMap { $0["name"]?.string }
    trimmed += [card["project"]?["name"]?.string].compactMap { $0 }
    if trimmed.contains(where: { $0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }) {
      throw CardValidationError("card.emptyMetadata")
    }
  }

  static func validDate(_ text: String, dateOnly: Bool) -> Bool {
    let day = String(text.prefix(10))
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    formatter.dateFormat = "yyyy-MM-dd"
    formatter.isLenient = false
    guard let date = formatter.date(from: day), formatter.string(from: date) == day else {
      return false
    }
    if text.count == 10 { return dateOnly }
    guard
      text.range(
        of:
          #"^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$"#,
        options: .regularExpression) != nil
    else { return false }
    let iso = ISO8601DateFormatter()
    if text.contains(".") { iso.formatOptions.insert(.withFractionalSeconds) }
    let precise = text.replacingOccurrences(
      of: #"T(\d{2}:\d{2})(Z|[+-]\d{2}:\d{2})$"#,
      with: "T$1:00$2", options: .regularExpression)
    return iso.date(from: precise) != nil
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
    case "null":
      guard value == .null else { throw CardValidationError(path) }
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
