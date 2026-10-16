import Foundation
import Testing

@testable import SillKit

struct UnknownWriteTests {
  private func temporary() throws -> URL {
    let url = FileManager.default.temporaryDirectory.appendingPathComponent(
      "sill-fault-" + UUID().uuidString)
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    return url
  }

  private var draft: Draft {
    Draft(
      id: "fault-note", title: "Synthetic note", body: "Synthetic body", revision: 0, original: nil)
  }

  @Test func committedWriteWithLostReceiptIsVerifiedExactlyOnce() async throws {
    let directory = try temporary()
    defer { try? FileManager.default.removeItem(at: directory) }
    let fault = FileFaultController(.lostReceipt)
    let store = try CardStore(directory: directory, fault: fault.inject)
    let saved = try await store.save(draft)
    #expect(saved.cards.first?.id == draft.id)
    #expect(saved.revision == 1)
    #expect(fault.counts.writes == 1)
    #expect(fault.counts.reads == 1)
    #expect(try store.drafts.restore() == nil)
    let restarted = try CardStore(directory: directory)
    #expect(try await restarted.read().cards.count == 1)
  }

  @Test func unavailableVerificationRetainsDraftAndDoesNotRetry() async throws {
    let directory = try temporary()
    defer { try? FileManager.default.removeItem(at: directory) }
    let fault = FileFaultController(.readUnavailable)
    let store = try CardStore(directory: directory, fault: fault.inject)
    await #expect(throws: StoreError.unknownWrite) { try await store.save(draft) }
    #expect(fault.counts.writes == 1)
    #expect(fault.counts.reads == 1)
    #expect(try store.drafts.restore()?.id == draft.id)
    let restarted = try CardStore(directory: directory)
    #expect(try await restarted.read().cards.count == 1)
  }

  @Test func concurrentChangeBeforeVerificationRetainsDraftAndNewerFile() async throws {
    let directory = try temporary()
    defer { try? FileManager.default.removeItem(at: directory) }
    let fault = FileFaultController(.changedBeforeVerification)
    let store = try CardStore(directory: directory, fault: fault.inject)
    await #expect(throws: StoreError.unknownWrite) { try await store.save(draft) }
    #expect(fault.counts.writes == 1)
    #expect(fault.counts.reads == 1)
    #expect(try store.drafts.restore()?.title == draft.title)
    let restarted = try CardStore(directory: directory)
    let snapshot = try await restarted.read()
    #expect(snapshot.cards.first?.title == "Concurrent edit")
    #expect(snapshot.revision == 2)
  }

  @Test func failureBeforeAtomicReplacementPreservesOriginalBytes() async throws {
    let directory = try temporary()
    defer { try? FileManager.default.removeItem(at: directory) }
    let file = directory.appendingPathComponent("cards.json")
    let bytes = try Snapshot.empty().json.encoded()
    try bytes.write(to: file)
    let fault = FileFaultController(.beforeWrite)
    let store = try CardStore(directory: directory, fault: fault.inject)
    await #expect(throws: StoreError.unavailable(5)) { try await store.save(draft) }
    #expect(fault.counts.writes == 1)
    #expect(fault.counts.reads == 0)
    #expect(try store.drafts.restore()?.title == draft.title)
    #expect(try Data(contentsOf: file) == bytes)
  }
}
