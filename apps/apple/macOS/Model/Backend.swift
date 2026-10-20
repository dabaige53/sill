import Foundation
import SillKit

/// One workspace operation. The cloud sends a batch atomically; the local store takes one kind per write.
enum WorkspaceOperation: Sendable {
  case itemPatch(id: String, values: [String: JSONValue])
  case preferences([String: JSONValue])
  case reading(seconds: Int)
  /// `before` is `.null` for a new card and the stored card for a replacement.
  case upsert(card: JSONValue, before: JSONValue)
  case delete(id: String, before: JSONValue)

  var cloud: JSONValue {
    switch self {
    case .itemPatch(let id, let values):
      .object(["op": .string("item.patch"), "id": .string(id), "values": .object(values)])
    case .preferences(let values):
      .object(["op": .string("preferences.patch"), "values": .object(values)])
    case .reading(let seconds):
      .object(["op": .string("reading.add"), "seconds": .number(Double(seconds))])
    case .upsert(let card, let before):
      .object(["op": .string("card.upsert"), "card": card, "before": before])
    case .delete(let id, let before):
      .object(["op": .string("card.delete"), "id": .string(id), "before": before])
    }
  }
}

/// Reads and writes one workspace. Version checks and unknown-result handling stay in SillKit.
protocol WorkspaceBackend: Sendable {
  var isLocal: Bool { get }
  func read() async throws -> Snapshot
  func apply(_ operations: [WorkspaceOperation], expectedRevision: Int) async throws -> Snapshot
}

/// `--data-directory` or `~/Library/Application Support/Sill/`. The session holds the workspace lock.
final class LocalBackend: WorkspaceBackend {
  let session: WorkspaceSession
  var isLocal: Bool { true }

  init(directory: URL) throws { session = try WorkspaceSession(directory: directory) }

  var store: CardStore { session.store }

  func read() async throws -> Snapshot { try await store.read() }

  func apply(_ operations: [WorkspaceOperation], expectedRevision: Int) async throws -> Snapshot {
    var patches: [String: [String: JSONValue]] = [:]
    var deletions: [String] = []
    for operation in operations {
      switch operation {
      case .itemPatch(let id, let values):
        patches[id, default: [:]].merge(values) { $1 }
      case .delete(let id, _):
        deletions.append(id)
      case .preferences(let values) where operations.count == 1:
        return try await store.patchPreferences(.object(values), expectedRevision: expectedRevision)
      case .reading(let seconds) where operations.count == 1:
        return try await store.addReading(seconds: seconds, expectedRevision: expectedRevision)
      case .upsert(let card, _) where operations.count == 1:
        return try await store.upsert(Card(json: card), expectedRevision: expectedRevision)
      default:
        // The local store writes one kind of change atomically; mixed batches are not split.
        throw StoreError.invalidSnapshot
      }
    }
    if !patches.isEmpty, deletions.isEmpty {
      return try await store.patchItems(
        patches.mapValues(JSONValue.object), expectedRevision: expectedRevision)
    }
    if patches.isEmpty, deletions.count == 1 {
      return try await store.delete(id: deletions[0], expectedRevision: expectedRevision)
    }
    if patches.isEmpty, !deletions.isEmpty {
      return try await store.deleteMany(ids: Set(deletions), expectedRevision: expectedRevision)
    }
    throw StoreError.invalidSnapshot
  }
}

/// The signed-in cloud workspace. Login and session calls go to `cloud` directly.
final class CloudBackend: WorkspaceBackend {
  let cloud: CloudWorkspace
  var isLocal: Bool { false }

  init(cloud: CloudWorkspace) { self.cloud = cloud }

  func read() async throws -> Snapshot { try Snapshot(json: await cloud.read().json) }

  func apply(_ operations: [WorkspaceOperation], expectedRevision: Int) async throws -> Snapshot {
    let state = try await cloud.apply(
      operations: operations.map(\.cloud), expectedRevision: .number(Double(expectedRevision)))
    return try Snapshot(json: state.json)
  }
}
