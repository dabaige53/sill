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
        "body": .array([.string("First\n\nstill first"), .string(""), .string("Last")]),
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
}
