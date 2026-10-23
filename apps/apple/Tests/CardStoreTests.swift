import Darwin
import Foundation
import Testing

@testable import SillKit

struct CardStoreTests {
  private func temporary() throws -> URL {
    let url = FileManager.default.temporaryDirectory.appendingPathComponent(
      "sill-store-" + UUID().uuidString)
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    return url
  }

  private func card(_ title: String = "Synthetic") throws -> Card {
    try Card(
      json: .object([
        "id": .string("note"), "type": .string("note"), "title": .string(title),
        "body": .string("First\n\nstill first\n\nLast"),
        "extra": .object(["nested": .bool(true)]),
      ]))
  }

  private var probe: URL {
    URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
      .appendingPathComponent(".build/debug/SillStoreProbe")
  }

  @Test func readsLegacyWithoutWritingAndPreservesSnapshot() async throws {
    let directory = try temporary()
    defer { try? FileManager.default.removeItem(at: directory) }
    let file = directory.appendingPathComponent("cards.json")
    var json = try Snapshot.empty().json
    var state = json["state"]!
    var original = try card().raw
    original["source"] = .string("Legacy")
    original["kind"] = .string("ai")
    state["cards"] = .array([original])
    state["futureState"] = .array([.number(1)])
    json["state"] = state
    json["futureRoot"] = .bool(true)
    let bytes = try json.encoded()
    try bytes.write(to: file)
    let store = try CardStore(directory: directory)
    let loaded = try await store.read()
    #expect(loaded.cards.first?.source == "Legacy")
    #expect(try Data(contentsOf: file) == bytes)
    let changed = try await store.toggle(id: "note", key: "bookmarked", expectedRevision: 0)
    #expect(changed.json["futureRoot"] == .bool(true))
    #expect(changed.json["state"]?["futureState"] == .array([.number(1)]))
    #expect(changed.items["note"]?["bookmarked"] == .bool(true))
  }

  @Test func crudConflictAndRestart() async throws {
    let directory = try temporary()
    defer { try? FileManager.default.removeItem(at: directory) }
    let first = try CardStore(directory: directory)
    let second = try CardStore(directory: directory)
    let snapshot = try await first.upsert(card(), expectedRevision: 0)
    #expect(snapshot.revision == 1)
    do {
      _ = try await second.upsert(card("Must not overwrite"), expectedRevision: 0)
      Issue.record("Expected conflict")
    } catch { #expect(error as? StoreError == .conflict) }
    let restarted = try CardStore(directory: directory)
    let unchanged = try await restarted.read()
    #expect(unchanged.cards.first?.title == "Synthetic")
    let updated = try await restarted.upsert(card("Edited"), expectedRevision: 1)
    #expect(updated.cards.first?.title == "Edited")
    let deleted = try await restarted.delete(id: "note", expectedRevision: 2)
    #expect(deleted.revision == 3)
    #expect(deleted.cards.isEmpty)
  }

  @Test func bulkDeleteRejectsStaleOrMissingCardsWithoutPartialChanges() async throws {
    let directory = try temporary()
    defer { try? FileManager.default.removeItem(at: directory) }
    let store = try CardStore(directory: directory)
    _ = try await store.upsert(card(), expectedRevision: 0)
    _ = try await store.toggle(id: "note", key: "bookmarked", expectedRevision: 1)
    do {
      _ = try await store.deleteMany(ids: ["note"], expectedRevision: 1)
      Issue.record("Expected stale revision conflict")
    } catch { #expect(error as? StoreError == .conflict) }
    do {
      _ = try await store.deleteMany(ids: ["note", "missing"], expectedRevision: 2)
      Issue.record("Expected missing-card rejection")
    } catch { #expect(error as? StoreError == .invalidSnapshot) }
    let unchanged = try await store.read()
    #expect(unchanged.cards.count == 1)
    #expect(unchanged.items["note"]?["bookmarked"] == .bool(true))
    let deleted = try await store.deleteMany(ids: ["note"], expectedRevision: 2)
    #expect(deleted.revision == 3)
    #expect(deleted.cards.isEmpty)
    #expect(deleted.items["note"] == nil)
  }

  @Test func concurrentInstancesOnlyOneExpectedRevisionWins() async throws {
    let directory = try temporary()
    defer { try? FileManager.default.removeItem(at: directory) }
    let first = try CardStore(directory: directory)
    let second = try CardStore(directory: directory)
    let value = try card()
    let results = await withTaskGroup(of: Bool.self) { group in
      for store in [first, second] {
        group.addTask { (try? await store.upsert(value, expectedRevision: 0)) != nil }
      }
      var results: [Bool] = []
      for await result in group { results.append(result) }
      return results
    }
    #expect(results.filter { $0 }.count == 1)
    #expect(try await first.read().revision == 1)
  }

  @Test func crossProcessConflictAndCrashReleasesKernelLock() async throws {
    let directory = try temporary()
    defer { try? FileManager.default.removeItem(at: directory) }
    let holder = Process()
    let output = Pipe()
    holder.executableURL = probe
    holder.arguments = ["hold", directory.path]
    holder.standardOutput = output
    try holder.run()
    defer {
      if holder.isRunning {
        holder.terminate()
        holder.waitUntilExit()
      }
    }
    #expect(String(data: output.fileHandleForReading.availableData, encoding: .utf8) == "locked\n")
    kill(holder.processIdentifier, SIGKILL)
    holder.waitUntilExit()
    let writer = Process()
    writer.executableURL = probe
    writer.arguments = ["write", directory.path, "0"]
    try writer.run()
    writer.waitUntilExit()
    #expect(writer.terminationStatus == 0)
    let stale = Process()
    stale.executableURL = probe
    stale.arguments = ["write", directory.path, "0"]
    try stale.run()
    stale.waitUntilExit()
    #expect(stale.terminationStatus == 4)
    let store = try CardStore(directory: directory)
    #expect(try await store.read().revision == 1)
  }

  @Test func desktopSessionIsExclusiveAndCrashReleasesIt() throws {
    let directory = try temporary()
    defer { try? FileManager.default.removeItem(at: directory) }
    let holder = Process()
    let output = Pipe()
    holder.executableURL = probe
    holder.arguments = ["session", directory.path]
    holder.standardOutput = output
    try holder.run()
    defer {
      if holder.isRunning {
        holder.terminate()
        holder.waitUntilExit()
      }
    }
    #expect(String(data: output.fileHandleForReading.availableData, encoding: .utf8) == "locked\n")
    #expect(throws: StoreError.workspaceInUse) { try WorkspaceSession(directory: directory) }
    kill(holder.processIdentifier, SIGKILL)
    holder.waitUntilExit()
    let restarted = try WorkspaceSession(directory: directory)
    withExtendedLifetime(restarted) {
      #expect(
        FileManager.default.fileExists(
          atPath: directory.appendingPathComponent("workspace.lock").path))
    }
  }

  @Test func malformedFileIsNotOverwritten() async throws {
    let directory = try temporary()
    defer { try? FileManager.default.removeItem(at: directory) }
    let file = directory.appendingPathComponent("cards.json")
    let bytes = Data("{invalid".utf8)
    try bytes.write(to: file)
    let store = try CardStore(directory: directory)
    await #expect(throws: (any Error).self) { try await store.upsert(card(), expectedRevision: 0) }
    #expect(try Data(contentsOf: file) == bytes)
  }

  @Test func draftRestorationQueueAndOriginalParagraphs() async throws {
    let directory = try temporary()
    defer { try? FileManager.default.removeItem(at: directory) }
    let store = try CardStore(directory: directory)
    let value = try card()
    _ = try await store.upsert(value, expectedRevision: 0)
    var draft = Draft(
      id: value.id, title: value.title, body: value.body, revision: 1,
      original: try JSONEncoder().encode(value))
    for index in 0..<30 {
      draft.title = "Queued \(index)"
      store.drafts.enqueue(draft) { Issue.record("Draft write failed") }
    }
    let restored = try store.drafts.restore()
    #expect(restored?.title == "Queued 29")
    #expect(restored?.isDirty == true)
    let saved = try await store.save(try #require(restored))
    #expect(try saved.cards.first?.raw["body"] == value.raw["body"])
    #expect(try saved.cards.first?.raw["extra"] == value.raw["extra"])
    #expect(try store.drafts.restore() == nil)
    store.drafts.enqueue(draft) { Issue.record("Draft write failed") }
    try store.drafts.discard()
    #expect(try store.drafts.restore() == nil)
  }

  @Test func conflictingDraftIsRetained() async throws {
    let directory = try temporary()
    defer { try? FileManager.default.removeItem(at: directory) }
    let store = try CardStore(directory: directory)
    let original = try card()
    _ = try await store.upsert(original, expectedRevision: 0)
    let draft = Draft(
      id: original.id, title: "Draft title", body: original.body, revision: 0,
      original: try JSONEncoder().encode(original))
    await #expect(throws: StoreError.conflict) { try await store.save(draft) }
    #expect(try store.drafts.restore()?.title == draft.title)
    #expect(try await store.read().cards.first?.title == original.title)
  }
  @Test func patchesAreAtomicAndPreserveUnrelatedFields() async throws {
    let directory = try temporary()
    defer { try? FileManager.default.removeItem(at: directory) }
    let store = try CardStore(directory: directory)
    _ = try await store.upsert(card(), expectedRevision: 0)
    let changed = try await store.patchItems(
      [
        "note": .object([
          "archived": .bool(true), "note": .string("Retained"),
          "future": .object(["enabled": .bool(true)]),
        ])
      ], expectedRevision: 1)
    #expect(changed.items["note"]?["archived"] == .bool(true))
    await #expect(throws: StoreError.invalidSnapshot) {
      try await store.patchItems(
        [
          "note": .object(["note": .string("Must roll back")]),
          "missing": .object(["read": .bool(true)]),
        ], expectedRevision: 2)
    }
    await #expect(throws: StoreError.conflict) {
      try await store.patchItems(["note": .object(["read": .bool(true)])], expectedRevision: 1)
    }
    let unchanged = try await store.read()
    #expect(unchanged.revision == 2)
    #expect(unchanged.items["note"]?["note"] == .string("Retained"))
    #expect(unchanged.items["note"]?["future"] == .object(["enabled": .bool(true)]))
  }

  @Test func preferencesReadingAndValidation() async throws {
    let directory = try temporary()
    defer { try? FileManager.default.removeItem(at: directory) }
    let store = try CardStore(directory: directory)
    let preferences = try await store.patchPreferences(
      .object([
        "sort": .string("time"), "theme": .string("dark"), "cardTextSize": .string("large"),
        "cardPadding": .string("roomy"),
      ]), expectedRevision: 0)
    #expect(preferences.json["state"]?["preferences"]?["sort"] == .string("time"))
    await #expect(throws: StoreError.invalidSnapshot) {
      try await store.patchPreferences(
        .object(["density": .string("invalid")]), expectedRevision: 1)
    }
    #expect(preferences.json["state"]?["preferences"]?["cardTextSize"] == .string("large"))
    await #expect(throws: StoreError.invalidSnapshot) {
      try await store.patchPreferences(
        .object(["readerTextSize": .string("huge")]), expectedRevision: 1)
    }
    let reading = try await store.addReading(seconds: 60, expectedRevision: 1)
    #expect(reading.json["state"]?["seconds"] == .number(60))
    await #expect(throws: StoreError.conflict) {
      try await store.addReading(seconds: 60, expectedRevision: 1)
    }
    await #expect(throws: StoreError.invalidSnapshot) {
      try await store.addReading(seconds: 86401, expectedRevision: 2)
    }
  }

  @Test func unknownWriteIsReconciledBeforeReturningAndReadingIsNotRepeated() async throws {
    let directory = try temporary()
    defer { try? FileManager.default.removeItem(at: directory) }
    let store = try CardStore(directory: directory) { phase, _ in
      if phase == .afterRename { throw StoreError.unavailable(EIO) }
    }
    let result = try await store.addReading(seconds: 40, expectedRevision: 0)
    #expect(result.revision == 1)
    #expect(result.json["state"]?["seconds"] == .number(40))
    #expect(try await store.read().json == result.json)
  }

  @Test func taskPatchRejectsUnknownTasksAndInvalidValues() async throws {
    let directory = try temporary()
    defer { try? FileManager.default.removeItem(at: directory) }
    let store = try CardStore(directory: directory)
    _ = try await store.upsert(card(), expectedRevision: 0)
    let invalidValues: [JSONValue] = [
      .object(["taskDone": .array([.string("missing")])]),
      .object(["archived": .string("true")]),
      .object(["snoozedUntil": .number(-1)]),
      .object(["tags": .array([.number(1)])]),
    ]
    for values in invalidValues {
      await #expect(throws: StoreError.invalidSnapshot) {
        try await store.patchItems(["note": values], expectedRevision: 1)
      }
    }
    #expect(try await store.read().revision == 1)
  }
  @Test func unknownWriteRemainsUnknownWhenReadbackFails() async throws {
    let directory = try temporary()
    defer { try? FileManager.default.removeItem(at: directory) }
    let store = try CardStore(directory: directory) { phase, url in
      if phase == .afterRename
        || (phase == .beforeRead && FileManager.default.fileExists(atPath: url.path))
      {
        throw StoreError.unavailable(EIO)
      }
    }
    await #expect(throws: StoreError.unknownWrite) {
      try await store.addReading(seconds: 40, expectedRevision: 0)
    }
    let recovered = try CardStore(directory: directory)
    let snapshot = try await recovered.read()
    #expect(snapshot.revision == 1)
    #expect(snapshot.json["state"]?["seconds"] == .number(40))
  }
  @Test func taskCompletionAndReminderStatesUseWebFields() async throws {
    let directory = try temporary()
    defer { try? FileManager.default.removeItem(at: directory) }
    let store = try CardStore(directory: directory)
    let task = try Card(
      json: .object([
        "id": .string("tasks"), "type": .string("task"), "title": .string("Tasks"),
        "tasks": .array([
          .object([
            "id": .string("step"), "text": .string("Synthetic task"), "done": .bool(false),
          ])
        ]),
      ]))
    _ = try await store.upsert(task, expectedRevision: 0)
    let saved = try await store.patchItems(
      [
        "tasks": .object([
          "taskDone": .array([.string("step")]), "reminderDone": .bool(true),
          "dismissed": .bool(false), "snoozedUntil": .number(0),
          "bookmarked": .bool(true), "later": .bool(true), "read": .bool(true),
          "tags": .array([.string("Synthetic")]), "tagsEdited": .bool(true),
        ])
      ], expectedRevision: 1)
    #expect(saved.items["tasks"]?["taskDone"] == .array([.string("step")]))
    #expect(try saved.cards.first?.raw["tasks"]?.array?.first?["done"] == .bool(false))
  }
}
