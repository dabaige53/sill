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

  public func deleteMany(ids: Set<String>, expectedRevision: Int) throws -> Snapshot {
    try update(expectedRevision: expectedRevision) { state in
      let cards = state["cards"]?.array ?? []
      guard ids.isSubset(of: Set(cards.compactMap { $0["id"]?.string })) else {
        throw StoreError.invalidSnapshot
      }
      state["cards"] = .array(cards.filter { !ids.contains($0["id"]?.string ?? "") })
      var items = state["items"]?.object ?? [:]
      for id in ids { items[id] = nil }
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

  public func patchItems(_ patches: [String: JSONValue], expectedRevision: Int) throws -> Snapshot {
    guard !patches.isEmpty, patches.count <= 500 else { throw StoreError.invalidSnapshot }
    return try update(expectedRevision: expectedRevision) { state in
      var items = state["items"]?.object ?? [:]
      for (id, values) in patches {
        guard let card = state["cards"]?.array?.first(where: { $0["id"]?.string == id }),
          let fields = values.object
        else { throw StoreError.invalidSnapshot }
        try Self.validateItem(fields)
        if let done = fields["taskDone"]?.strings {
          let ids = Set((card["tasks"]?.array ?? []).compactMap { $0["id"]?.string })
          guard done.allSatisfy(ids.contains) else { throw StoreError.invalidSnapshot }
        }
        var item = items[id] ?? .object([:])
        for (key, value) in fields { item[key] = value }
        items[id] = item
      }
      state["items"] = .object(items)
    }
  }

  public func patchPreferences(_ values: JSONValue, expectedRevision: Int) throws -> Snapshot {
    guard let fields = values.object else { throw StoreError.invalidSnapshot }
    let choices = [
      "sort": ["priority", "unread", "time"], "archiveAfter": ["3d", "7d", "never"],
      "newHint": ["away", "off"], "theme": ["system", "light", "dark"],
      "density": ["compact", "standard", "roomy"],
    ]
    let booleans = [
      "singleKeyShortcuts", "reduceTransparency", "stack", "fadeRead",
      "floatTimely", "collapseOnFinish", "reduceMotion", "aiLocal", "onboarded",
    ]
    for (key, value) in fields {
      if let allowed = choices[key] {
        guard let string = value.string, allowed.contains(string) else {
          throw StoreError.invalidSnapshot
        }
      } else if booleans.contains(key), value.bool == nil {
        throw StoreError.invalidSnapshot
      }
    }
    return try update(expectedRevision: expectedRevision) { state in
      var preferences = state["preferences"]!
      for (key, value) in fields { preferences[key] = value }
      state["preferences"] = preferences
    }
  }

  public func addReading(seconds: Int, expectedRevision: Int) throws -> Snapshot {
    guard (0...86400).contains(seconds) else { throw StoreError.invalidSnapshot }
    return try update(expectedRevision: expectedRevision) { state in
      state["seconds"] = .number(min(1e7, (state["seconds"]?.number ?? 0) + Double(seconds)))
    }
  }

  private static func validateItem(_ fields: [String: JSONValue]) throws {
    let booleans = [
      "seen", "read", "archived", "bookmarked", "later", "tagsEdited",
      "dismissed", "reminderDone",
    ]
    let timestamps = ["addedAt", "snoozedUntil", "lastNotifiedAt", "readAt", "restoredAt"]
    for (key, value) in fields {
      if booleans.contains(key) {
        guard value.bool != nil else { throw StoreError.invalidSnapshot }
      } else if timestamps.contains(key) || key == "progress" {
        let maximum = key == "progress" ? 1 : 8.64e15
        guard let number = value.number, number.isFinite, number >= 0, number <= maximum else {
          throw StoreError.invalidSnapshot
        }
      } else if key == "note" || key == "lastReminderKey" {
        guard let string = value.string,
          string.utf16.count <= (key == "note" ? 4000 : 200)
        else { throw StoreError.invalidSnapshot }
      } else if key == "tags" || key == "taskDone" {
        guard let array = value.array, array.count <= (key == "tags" ? 20 : 100),
          array.allSatisfy({ element in
            guard let string = element.string else { return false }
            if key == "tags" { return string.utf16.count <= 30 }
            return string.range(of: "^[a-zA-Z0-9_-]{1,100}$", options: .regularExpression) != nil
              && !["__proto__", "constructor", "prototype"].contains(string)
          })
        else { throw StoreError.invalidSnapshot }
      }
    }
  }

  public func save(_ draft: Draft) throws -> Snapshot {
    try drafts.persist(draft)
    let card = try draft.submittedCard()
    let snapshot = try upsert(card, expectedRevision: draft.revision)
    try drafts.discard()
    return snapshot
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
      if next.json["state"] == current.json["state"] { return current }
      do {
        try AtomicFile.write(next.json.encoded(), to: file, fault: fault)
      } catch StoreError.unknownWrite {
        // Reconcile under the same lock; never repeat a possibly committed mutation.
        guard let stored = try? readUnlocked(), stored.json == next.json else {
          throw StoreError.unknownWrite
        }
        return stored
      }
      return next
    }
  }

  private func readUnlocked() throws -> Snapshot {
    try fault?(.beforeRead, file)
    guard FileManager.default.fileExists(atPath: file.path) else { return try Snapshot.empty() }
    return try Snapshot(json: JSONValue.decode(Data(contentsOf: file)))
  }
}
