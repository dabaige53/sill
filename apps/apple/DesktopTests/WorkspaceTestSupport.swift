import Foundation
import Observation
import Testing

@testable import Sill
@testable import SillKit

/// Synthetic workspace in memory. Writes check the revision like the real stores.
actor FakeBackend: WorkspaceBackend {
  nonisolated var isLocal: Bool { true }
  private(set) var revision = 1
  private var cards: [JSONValue]
  private var items: [String: JSONValue] = [:]
  private var seconds: Double = 0
  private var preferences: [String: JSONValue] = [:]
  private(set) var writes = 0
  private(set) var reads = 0
  private var failNext: (any Error)?
  private var delay: Duration = .zero

  init(ids: [String], extra: [JSONValue] = []) {
    cards =
      ids.map {
        .object([
          "id": .string($0), "type": .string("article"), "title": .string("Synthetic " + $0),
          "body": .string("One\n\nTwo"), "time": .number(1),
        ])
      } + extra
  }

  func failNextWrite(_ error: any Error) { failNext = error }
  func slowWrites(_ value: Duration) { delay = value }

  /// A change made elsewhere: the revision moves without this window knowing.
  func externalChange(_ id: String, _ values: [String: JSONValue]) {
    merge(id, values)
    revision += 1
  }

  func read() async throws -> Snapshot {
    reads += 1
    return try snapshot()
  }

  func apply(_ operations: [WorkspaceOperation], expectedRevision: Int) async throws -> Snapshot {
    writes += 1
    if delay != .zero { try await Task.sleep(for: delay) }
    if let error = failNext {
      failNext = nil
      throw error
    }
    guard expectedRevision == revision else { throw StoreError.conflict }
    for operation in operations {
      switch operation {
      case .itemPatch(let id, let values): merge(id, values)
      case .reading(let amount): seconds += Double(amount)
      case .upsert(let card, _):
        if let index = cards.firstIndex(where: { $0["id"] == card["id"] }) {
          cards[index] = card
        } else {
          cards.append(card)
        }
      case .delete(let id, _):
        cards.removeAll { $0["id"]?.string == id }
        items[id] = nil
      case .preferences(let values): preferences.merge(values) { $1 }
      }
    }
    revision += 1
    return try snapshot()
  }

  func merge(_ id: String, _ values: [String: JSONValue]) {
    var item = items[id]?.object ?? [:]
    item.merge(values) { $1 }
    items[id] = .object(item)
  }

  func snapshot() throws -> Snapshot {
    try Snapshot(
      json: .object([
        "revision": .number(Double(revision)),
        "state": .object([
          "cards": .array(cards), "items": .object(items), "preferences": .object(preferences),
          "seconds": .number(seconds),
        ]),
      ]))
  }
}

@MainActor func until(_ condition: () -> Bool) async {
  for _ in 0..<400 where !condition() { try? await Task.sleep(for: .milliseconds(5)) }
}

/// True when reading `read` inside `track` registers a change after `act`.
final class Flag: @unchecked Sendable { var value = false }

@MainActor func watch(_ track: @escaping () -> Void) -> Flag {
  let flag = Flag()
  withObservationTracking(track) { flag.value = true }
  return flag
}

/// Runs `act` and tells whether anything `track` read changed.
@MainActor func redraws(_ act: () -> Void, watching track: @escaping () -> Void) -> Bool {
  let flag = watch(track)
  act()
  return flag.value
}

let syntheticMail: JSONValue = .object([
  "id": .string("m"), "type": .string("mail"), "title": .string("Synthetic mail"),
  "time": .number(1), "tags": .array([.string("Work")]),
])

let syntheticTask: JSONValue = .object([
  "id": .string("task"), "type": .string("task"), "title": .string("Synthetic task"),
  "time": .number(1),
  "tasks": .array([
    .object(["id": .string("t1"), "text": .string("One")]),
    .object(["id": .string("t2"), "text": .string("Two")]),
  ]),
])

let syntheticReminder: JSONValue = .object([
  "id": .string("reminder"), "type": .string("reminder"), "title": .string("Synthetic reminder"),
  "time": .number(1), "due": .number(2),
])

@MainActor func ready(
  _ ids: [String] = ["a", "b", "c"], extra: [JSONValue] = []
) async -> (Workspace, FakeBackend) {
  let backend = FakeBackend(ids: ids, extra: extra)
  let workspace = Workspace(launch: LaunchOptions(dataDirectory: nil), autoload: false)
  workspace.connect(backend)
  await until { workspace.phase == .ready }
  return (workspace, backend)
}

@MainActor final class Box<Value> {
  var value: Value?
}
