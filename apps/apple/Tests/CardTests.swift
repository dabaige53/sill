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
      ("body", .string(String(repeating: "x", count: 500001))), ("body", .array([.string("A")])),
      ("url", .string("https://")), ("url", .string("https://host with spaces")),
      ("sources", .array([.object(["name": .string(""), "kind": .string("local")])])),
      ("why", .object(["reason": .string("")])),
      ("sender", .string(String(repeating: "x", count: 301))),
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

  @Test func explicitFieldsRejectDeprecatedAndInvalidSemantics() throws {
    let base: JSONValue = .object([
      "id": .string("explicit"), "type": .string("article"), "title": .string("Explicit"),
      "body": .string("Body"), "bodyCoverage": .string("full"),
      "readingEstimate": .object([
        "seconds": .number(61), "origin": .string("calculated"),
        "scope": .string("full"), "method": .string("editor estimate"),
      ]),
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
      ("meta", JSONValue.string("old")), ("bodyCoverage", .string("excerpt")),
      ("bodyCoverage", .string("none")), ("body", .string(" ")),
      ("project", .object(["name": .string("Wrong type")])),
    ] {
      var json = base
      json[key] = value
      #expect(throws: (any Error).self) { try Card(json: json) }
    }
    var cleared = base
    cleared["readingEstimate"] = .null
    _ = try Card(json: cleared)
    for key in ["meta", "time"] {
      let json: JSONValue = .object([
        "id": .string("file"), "title": .string("File"),
        "type": .string("file"),
        "files": .array([.object(["name": .string("a"), key: .string("old")])]),
      ])
      #expect(throws: (any Error).self) { try Card(json: json) }
    }
  }

  @Test func eventTimeZoneRequiresIANAIdentifier() throws {
    let base: JSONValue = .object([
      "id": .string("zone"), "type": .string("event"), "title": .string("Event"),
      "start": .number(1000), "end": .number(2000),
    ])
    for zone in ["+03:00", "GMT+0300", "UTC+3"] {
      var json = base
      json["timeZone"] = .string(zone)
      #expect(throws: (any Error).self) { try Card(json: json) }
    }
    for zone in ["Asia/Shanghai", "asia/shanghai", "US/Eastern", "Etc/GMT+3", "UTC", "GMT"] {
      var json = base
      json["timeZone"] = .string(zone)
      _ = try Card(json: json)
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

  @Test func sharedLegacyMigrationFixturesPreserveJSON() throws {
    let fixtures = try JSONValue.decode(
      Data(contentsOf: root.appendingPathComponent("contracts/migration-fixtures.json")))
    for fixture in try #require(fixtures["cases"]?.array) {
      let input = try #require(fixture["input"])
      let expected = try #require(fixture["expected"])
      let name = fixture["name"]?.string ?? ""
      #expect(Card.normalize(input) == expected, "\(name)")
      let card = try Card(json: input, normalize: true)
      #expect(try card.raw == expected, "\(name)")
      #expect(try JSONValue.decode(JSONEncoder().encode(card)) == expected, "\(name)")
    }
  }

  @Test func sharedLegacyFilesReadWithoutRewritingAndSaveUnknownFields() async throws {
    let fixtures = try JSONValue.decode(
      Data(contentsOf: root.appendingPathComponent("contracts/migration-fixtures.json")))
    for fixture in try #require(fixtures["cases"]?.array) {
      let directory = FileManager.default.temporaryDirectory
        .appendingPathComponent("sill-migration-" + UUID().uuidString)
      defer { try? FileManager.default.removeItem(at: directory) }
      try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
      let input = try #require(fixture["input"])
      var expected = try #require(fixture["expected"])
      let file = directory.appendingPathComponent("cards.json")
      let snapshot: JSONValue = .object([
        "revision": .number(3),
        "state": .object([
          "cards": .array([input]), "items": .object([:]), "seconds": .number(0),
          "preferences": .object([:]),
        ]),
      ])
      let encoder = JSONEncoder()
      encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
      let original = try encoder.encode(snapshot)
      try original.write(to: file)
      let store = try CardStore(directory: directory)
      let loaded = try await store.read()
      #expect(try Data(contentsOf: file) == original)
      let card = try #require(loaded.cards.first)
      #expect(try card.raw == expected)
      expected["title"] = .string(card.title + " edited")
      _ = try await store.upsert(Card(json: expected), expectedRevision: 3)
      let restarted = try CardStore(directory: directory)
      let saved = try await restarted.read()
      #expect(try saved.cards.first?.raw == expected)
    }
  }
}
