import Foundation

public actor CardStore {
  public nonisolated let directory: URL
  public nonisolated let drafts: DraftStore
  private let file: URL
  private let lock: URL
  private let fault: FileFault?

  public init(directory: URL, fault: FileFault? = nil) throws {
    self.directory = directory
    self.file = directory.appendingPathComponent("cards.json")
    self.lock = directory.appendingPathComponent("cards.json.lock")
    self.drafts = DraftStore(directory: directory)
    self.fault = fault
    try FileManager.default.createDirectory(
      at: directory, withIntermediateDirectories: true,
      attributes: [.posixPermissions: 0o700])
  }

  public func read() throws -> Snapshot {
    try FileLock.withLock(at: lock) { try readUnlocked() }
  }

  public func upsert(_ card: Card, expectedRevision: Int) throws -> Snapshot {
    try update(expectedRevision: expectedRevision) { state in
      var cards = state["cards"]?.array ?? []
      let raw = try card.raw
      if let index = cards.firstIndex(where: { $0["id"]?.string == card.id }) {
        cards[index] = raw
      } else {
        cards.insert(raw, at: 0)
      }
      state["cards"] = .array(cards)
    }
  }

  public func delete(id: String, expectedRevision: Int) throws -> Snapshot {
    try update(expectedRevision: expectedRevision) { state in
      state["cards"] = .array((state["cards"]?.array ?? []).filter { $0["id"]?.string != id })
      var items = state["items"]?.object ?? [:]
      items[id] = nil
      state["items"] = .object(items)
    }
  }

  public func toggle(id: String, key: String, expectedRevision: Int) throws -> Snapshot {
    guard ["bookmarked", "later", "read"].contains(key) else { throw StoreError.invalidSnapshot }
    return try update(expectedRevision: expectedRevision) { state in
      guard state["cards"]?.array?.contains(where: { $0["id"]?.string == id }) == true else {
        throw StoreError.invalidSnapshot
      }
      var items = state["items"]?.object ?? [:]
      var item = items[id] ?? .object([:])
      item[key] = .bool(!(item[key]?.bool ?? false))
      items[id] = item
      state["items"] = .object(items)
    }
  }

  public func save(_ draft: Draft) throws -> Snapshot {
    try drafts.persist(draft)
    let card = try draft.submittedCard()
    do {
      let snapshot = try upsert(card, expectedRevision: draft.revision)
      try drafts.discard()
      return snapshot
    } catch StoreError.unknownWrite {
      if let snapshot = try? read(),
        let stored = snapshot.cards.first(where: { $0.id == card.id }),
        try stored.raw == card.raw
      {
        try drafts.discard()
        return snapshot
      }
      throw StoreError.unknownWrite
    }
  }

  private func update(expectedRevision: Int, mutate: (inout JSONValue) throws -> Void) throws
    -> Snapshot
  {
    try FileLock.withLock(at: lock) {
      let current = try readUnlocked()
      guard current.revision == expectedRevision else { throw StoreError.conflict }
      var json = current.json
      var state = json["state"]!
      try mutate(&state)
      json["state"] = state
      json["revision"] = .number(Double(current.revision + 1))
      let next = try Snapshot(json: json)
      try AtomicFile.write(next.json.encoded(), to: file, fault: fault)
      return next
    }
  }

  private func readUnlocked() throws -> Snapshot {
    try fault?(.beforeRead, file)
    guard FileManager.default.fileExists(atPath: file.path) else { return try Snapshot.empty() }
    return try Snapshot(json: JSONValue.decode(Data(contentsOf: file)))
  }
}
