import Foundation
import Testing

@testable import SillKit

struct CardTests {
  @Test func remotePhotosRoundTripAndRejectInsecureImages() throws {
    let image = "https://images.example.org/photo.jpg?size=800"
    let value: JSONValue = .object([
      "id": .string("remote-photo"), "type": .string("photo"), "title": .string("Photo"),
      "images": .array([.string(image), .string("coast")]),
    ])
    let card = try Card(json: value)
    #expect(try card.raw == value)
    for invalid in ["http://example.org/a", "https://user:pass@example.org/a", "https://"] {
      var changed = value
      changed["images"] = .array([.string(invalid)])
      #expect(throws: (any Error).self) { try Card(json: changed) }
    }
  }

  private var root: URL {
    URL(fileURLWithPath: #filePath).deletingLastPathComponent()
      .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
  }

  @Test func editingDraftReplacesBody() throws {
    let original: JSONValue = .object([
      "id": .string("draft"), "type": .string("note"), "title": .string("Draft"),
      "body": .string("Old text"), "tags": .array([.string("kept")]),
    ])
    let draft = Draft(
      id: "draft", title: "Draft", body: "## Replacement",
      revision: 1, original: try original.encoded())
    #expect(try draft.submittedCard().body == "## Replacement")
    #expect(try draft.submittedCard().raw["tags"] == original["tags"])
    #expect(!draft.isDirty || draft.body != "Old text")
  }

  private func fixtureCases(_ kind: String) throws -> [JSONValue] {
    try ["fixtures.json", "media-fixtures.json"].flatMap { name in
      let fixtures = try JSONValue.decode(
        Data(contentsOf: root.appendingPathComponent("contracts/" + name)))
      return try #require(fixtures[kind]?.array)
    }
  }

  @Test func allValidFixturesRoundTrip() throws {
    for fixture in try fixtureCases("valid") {
      let json = try #require(fixture["card"])
      let card = try Card(json: json)
      #expect(
        try JSONValue.decode(JSONEncoder().encode(card)) == json, "\(fixture["name"]?.string ?? "")"
      )
    }
  }

  @Test func allInvalidFixturesAreRejected() throws {
    for fixture in try fixtureCases("invalid") {
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
      ("form", .string("future")), ("form", .string("compact")), ("images", .array([])),
      ("images", .array([.string("future")])), ("future", .bool(true)),
      ("tags", .array([.number(1)])),
      ("body", .string(String(repeating: "x", count: 500001))), ("body", .array([.string("A")])),
      ("url", .string("https://")), ("url", .string("https://host with spaces")),
      ("sources", .array([.object(["name": .string(""), "kind": .string("local")])])),
      ("why", .object(["reason": .string("Removed")])),
      ("sender", .string("Removed")), ("image", .string("coast")),
      ("location", .string(String(repeating: "x", count: 301))),
      ("meeting", .object(["name": .string("Call"), "url": .string("https://")])),
      ("media", .string("audio")), ("duration", .number(1.5)), ("duration", .number(86401)),
      ("files", .array([.object(["name": .string("")])])),
      ("photos", .array([.string("coast")])), ("attachment", .string("Removed")),
      ("tasks", .array([.object(["id": .string("prototype"), "text": .string("Task")])])),
      (
        "tasks",
        .array([.object(["id": .string("a"), "text": .string("Task"), "done": .bool(true)])])
      ),
      ("start", .number(-1)), ("end", .number(8.64e15 + 1)), ("due", .null),
      ("time", .number(-1)), ("people", .array([.string("Not an event")])),
      ("related", .array([.string("__proto__")])), ("priority", .number(11)),
    ]
    for (field, invalid) in cases {
      var card = base
      card[field] = invalid
      #expect(throws: (any Error).self, "\(field)") { try Card(json: card) }
    }
  }

  @Test func explicitFieldsRejectRemovedAndInvalidSemantics() throws {
    let base: JSONValue = .object([
      "id": .string("explicit"), "type": .string("article"), "title": .string("Explicit"),
      "body": .string("Body"), "authors": .array([.object(["name": .string("Writer")])]),
    ])
    _ = try Card(json: base)
    for text in ["2026-02-30", "2026-10-20T12:00:00", "2026-10-20T25:00:00Z"] {
      var json = base
      json["publishedAt"] = .string(text)
      #expect(throws: (any Error).self) { try Card(json: json) }
    }
    for text in [
      "2024-02-29", "2026-10-20T12:00+08:00", "2026-10-20T12:00:00+08:00",
      "2026-10-20T12:00:00.123Z",
    ] {
      var json = base
      json["publishedAt"] = .string(text)
      _ = try Card(json: json)
    }
    for (key, value) in [
      ("meta", JSONValue.string("old")), ("bodyCoverage", .string("full")),
      ("readingEstimate", .object(["seconds": .number(60)])),
      ("publisher", .object(["name": .string("Removed")])), ("section", .string("Removed")),
      ("authors", .array([.object(["name": .string(" ")])])),
      ("project", .object(["name": .string("Wrong type")])), ("form", .string("quote")),
    ] {
      var json = base
      json[key] = value
      #expect(throws: (any Error).self, "\(key)") { try Card(json: json) }
    }
    for key in ["meta", "time"] {
      let json: JSONValue = .object([
        "id": .string("file"), "title": .string("File"),
        "type": .string("file"),
        "files": .array([.object(["name": .string("a"), key: .string("old")])]),
      ])
      #expect(throws: (any Error).self) { try Card(json: json) }
    }
  }

  @Test func cloudCardsLoadWithoutServerFields() throws {
    let card: JSONValue = .object([
      "id": .string("cloud"), "type": .string("note"), "title": .string("Cloud"),
      "body": .string(""), "revision": .number(2), "state": .object([:]),
      "created_at": .string("2026-10-28T00:00:00.000000Z"),
      "updated_at": .string("2026-10-28T00:00:00.000000Z"), "deleted": .bool(false),
    ])
    let snapshot = try Snapshot(
      json: .object([
        "revision": .number(2),
        "state": .object([
          "cards": .array([card]), "items": .object([:]), "seconds": .number(0),
          "preferences": .object([:]),
        ]),
      ]))
    let raw = try #require(try snapshot.cards.first?.raw)
    #expect(raw["revision"] == nil)
    #expect(raw["state"] == nil)
    #expect(raw["title"]?.string == "Cloud")
  }
}
