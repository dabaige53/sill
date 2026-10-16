import Foundation

public struct Draft: Identifiable, Codable, Sendable {
  public var id: String
  public var title: String
  public var body: String
  public var revision: Int
  public var original: Data?

  public init(id: String, title: String, body: String, revision: Int, original: Data?) {
    self.id = id
    self.title = title
    self.body = body
    self.revision = revision
    self.original = original
  }

  public func submittedCard() throws -> Card {
    var json =
      try original.map(JSONValue.decode)
      ?? .object([
        "id": .string(id), "type": .string("note"), "summary": .string(""),
        "tags": .array([]), "form": .string("standard"),
        "time": .number(Date().timeIntervalSince1970 * 1000),
        "sources": .array([
          .object(["name": .string(Copy.appleLocalSource), "kind": .string("local")])
        ]),
      ])
    json["title"] = .string(title)
    if json["body"]?.strings?.joined(separator: "\n\n") != body {
      json["body"] = .array(body.components(separatedBy: "\n\n").map(JSONValue.string))
    }
    return try Card(json: json, normalize: true)
  }

  public var isDirty: Bool {
    let json = original.flatMap { try? JSONValue.decode($0) }
    return title != (json?["title"]?.string ?? "")
      || body != (json?["body"]?.strings ?? []).joined(separator: "\n\n")
  }
}
