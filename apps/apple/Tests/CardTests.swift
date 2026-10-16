import Foundation
import Testing

@testable import SillKit

struct CardTests {
  private var root: URL {
    URL(fileURLWithPath: #filePath).deletingLastPathComponent()
      .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
  }

  @Test func allValidFixturesRoundTrip() throws {
    let fixtures = try JSONValue.decode(
      Data(contentsOf: root.appendingPathComponent("contracts/fixtures.json")))
    for fixture in try #require(fixtures["valid"]?.array) {
      let json = try #require(fixture["card"])
      let card = try Card(json: json)
      #expect(
        try JSONValue.decode(JSONEncoder().encode(card)) == json, "\(fixture["name"]?.string ?? "")"
      )
    }
  }

  @Test func allInvalidFixturesAreRejected() throws {
    let fixtures = try JSONValue.decode(
      Data(contentsOf: root.appendingPathComponent("contracts/fixtures.json")))
    for fixture in try #require(fixtures["invalid"]?.array) {
      let json = try #require(fixture["card"])
      #expect(throws: (any Error).self, "\(fixture["name"]?.string ?? "")") { try Card(json: json) }
    }
  }

  @Test func fullFieldBoundsAndTypesAreChecked() throws {
    let base: JSONValue = .object([
      "id": .string("bounds"), "type": .string("note"), "title": .string("Bounds"),
    ])
    let cases: [(String, JSONValue)] = [
      ("id", .string("constructor")), ("title", .string(String(repeating: "x", count: 1001))),
      ("summary", .string(String(repeating: "x", count: 10001))), ("meta", .number(1)),
      ("form", .string("future")), ("image", .string("future")),
      ("tags", .array([.number(1)])),
      ("body", .array([.string(String(repeating: "x", count: 50001))])),
      ("url", .string("https://")), ("url", .string("https://host with spaces")),
      ("sources", .array([.object(["name": .string(""), "kind": .string("local")])])),
      ("points", .array([.string("")])), ("why", .object(["reason": .string("")])),
      ("sender", .string(String(repeating: "x", count: 101))),
      ("location", .string(String(repeating: "x", count: 301))),
      ("meeting", .object(["name": .string("Call"), "url": .string("https://")])),
      ("media", .string("audio")), ("duration", .number(1.5)), ("duration", .number(86401)),
      ("files", .array([.object(["name": .string("")])])),
      ("photos", .array([.string("future")])), ("attachment", .number(0)),
      ("tasks", .array([.object(["id": .string("prototype"), "text": .string("Task")])])),
      ("start", .number(-1)), ("end", .number(8.64e15 + 1)), ("due", .null),
      ("time", .number(-1)), ("people", .array([.bool(false)])),
      ("related", .array([.string("__proto__")])), ("priority", .number(11)),
    ]
    for (field, invalid) in cases {
      var card = base
      card[field] = invalid
      #expect(throws: (any Error).self, "\(field)") { try Card(json: card) }
    }
  }

  @Test func migrationPreservesUnknownTypesAndFields() throws {
    let json: JSONValue = .object([
      "id": .string("old"), "type": .string("insight"), "title": .string("Legacy"),
      "source": .string("Legacy agent"), "kind": .string("ai"),
      "extra": .object(["future": .array([.null, .bool(true)])]),
    ])
    let card = try Card(json: json, normalize: true)
    let raw = try card.raw
    #expect(card.type == "insight")
    #expect(raw["source"] == nil)
    #expect(raw["kind"] == nil)
    #expect(raw["sources"]?.array?.first?["kind"]?.string == "agent")
    #expect(raw["extra"] == json["extra"])
    var mail = json
    mail["type"] = .string("mail")
    let migrated = try Card(json: mail, normalize: true).raw
    #expect(migrated["sender"]?.string == "Legacy agent")
  }
}
