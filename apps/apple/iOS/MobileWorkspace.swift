import Foundation
import Observation
import SillKit

/// The native client uses the same authenticated workspace and guarded operations as the Web.
@MainActor @Observable final class MobileWorkspace {
  private(set) var cards: [MobileCard] = []
  private(set) var owner: String?
  private(set) var busy = false {
    didSet {
      if !busy {
        let waiting = activityWaiters
        activityWaiters = []
        for waiter in waiting { waiter.resume() }
      }
    }
  }
  private(set) var started = false
  private(set) var sessionChecked = false
  private(set) var needsPasswordSetup = false
  private(set) var unresolvedWrite = false
  private(set) var preferences: [String: JSONValue] = [:]
  private(set) var revision = 0
  var error: String?
  @ObservationIgnored private let cloud: CloudWorkspace
  @ObservationIgnored private var snapshot: Snapshot?
  @ObservationIgnored private var activityWaiters: [CheckedContinuation<Void, Never>] = []

  init(cloud: CloudWorkspace = CloudWorkspace()) { self.cloud = cloud }

  var backupRequest: BackupRequest? {
    guard let owner, !needsPasswordSetup, !unresolvedWrite else { return nil }
    let cloud = cloud
    return { path, method, body in
      try await cloud.backupRequest(path, method: method, body: body, expectedOwner: owner)
    }
  }

  func start() async {
    guard !started, !busy else { return }
    busy = true
    defer {
      busy = false
      started = true
    }
    do {
      if let state = try await cloud.restoreSession() { try accept(state) }
      sessionChecked = true
    } catch { report(error) }
  }

  func login(email: String, password: String) async {
    guard owner == nil, begin() else { return }
    defer {
      busy = false
      started = true
    }
    do {
      try accept(
        await cloud.login(
          email: email.trimmingCharacters(in: .whitespacesAndNewlines), password: password))
    } catch { report(error) }
  }

  func setPassword(_ password: String) async {
    guard needsPasswordSetup, begin() else { return }
    defer { busy = false }
    do { try accept(await cloud.setPassword(password: password)) } catch { report(error) }
  }

  func logout() async {
    guard begin() else { return }
    defer { busy = false }
    do {
      try await cloud.logout()
      reset()
    } catch CloudWorkspaceError.unknownWrite {
      unresolvedWrite = true
      error = Copy.appleUnknownWrite
    } catch CloudWorkspaceError.service("busy", 409) {
      error = Copy.text("login.processing")
    } catch {
      // CloudWorkspace clears the local keychain even when remote revocation is unavailable.
      reset()
      report(error)
    }
  }

  func refresh() async {
    guard !busy else { return }
    busy = true
    error = nil
    defer { busy = false }
    do {
      if owner == nil {
        if let state = try await cloud.restoreSession() { try accept(state) }
        sessionChecked = true
      } else {
        try accept(await cloud.read())
      }
      unresolvedWrite = await cloud.pendingWriteKey != nil
      if unresolvedWrite { error = Copy.appleUnknownWrite }
    } catch { report(error) }
  }

  /// Explicit confirmation only. After session expiry the person must verify in another client.
  func acknowledgeUnknownWrite() async {
    guard !busy, unresolvedWrite else { return }
    busy = true
    defer { busy = false }
    do {
      if owner != nil { try accept(await cloud.read()) }
      try await cloud.discardPendingWrite()
      unresolvedWrite = false
      error = nil
    } catch { report(error) }
  }

  func card(_ id: String) -> MobileCard? { cards.first { $0.id == id } }

  func dueReminders(now: Double = Date().timeIntervalSince1970 * 1000) -> [MobileCard] {
    cards.filter { MobileReminderPolicy.eligible($0, now: now) }
  }

  @discardableResult
  func acknowledgeReminders(_ baselines: [MobileCard]) async -> Bool {
    guard !baselines.isEmpty,
      baselines.allSatisfy({ baseline in
        guard baseline.owner == owner, let current = card(baseline.id) else { return false }
        return current.raw == baseline.raw && current.item == baseline.item
      })
    else {
      error = Copy.appleConflict
      return false
    }
    let now = Date().timeIntervalSince1970 * 1000
    return await write(
      baselines.map { card in
        Self.itemPatch(
          id: card.id,
          values: [
            "snoozedUntil": .number(0),
            "lastReminderKey": .string(MobileReminderPolicy.key(card, snoozedUntil: 0)),
            "lastNotifiedAt": .number(now),
          ])
      })
  }

  func filtered(scope: String = "all", query: String = "", type: String? = nil) -> [MobileCard] {
    let selected = cards.filter { card in
      if scope == "archive" {
        guard card.archived else { return false }
      } else if scope != "search", card.archived {
        return false
      }
      switch scope {
      case "bookmarks": if !card.bookmarked { return false }
      case "later": if !card.later { return false }
      case "tasks": if !["task", "event", "reminder"].contains(card.type) { return false }
      case "unread": if card.read || card.completed { return false }
      default: break
      }
      return (type == nil || type == card.type) && card.matches(query)
    }
    let sort =
      preferences["floatTimely"]?.bool == false
      ? "time" : preferences["sort"]?.string ?? "priority"
    let now = Date().timeIntervalSince1970 * 1000
    return selected.enumerated().sorted { lhs, rhs in
      let a = lhs.element
      let b = rhs.element
      let aLess = a.item["lessLike"]?.bool ?? false
      let bLess = b.item["lessLike"]?.bool ?? false
      if aLess != bLess { return !aLess }
      if sort == "unread", a.read != b.read { return !a.read }
      if sort == "time", a.time != b.time { return a.time > b.time }
      if sort == "priority" {
        let x = Self.score(a, now: now)
        let y = Self.score(b, now: now)
        if x != y { return x > y }
      }
      return lhs.offset < rhs.offset
    }.map(\.element)
  }

  @discardableResult
  func toggle(_ card: MobileCard, field: String) async -> Bool {
    guard ["read", "bookmarked", "later", "archived", "reminderDone"].contains(field) else {
      return false
    }
    let value: Bool
    switch field {
    case "read": value = !card.read
    case "bookmarked": value = !card.bookmarked
    case "later": value = !card.later
    case "archived": value = !card.archived
    default: value = !card.reminderDone
    }
    var values: [String: JSONValue] = [field: .bool(value)]
    if field == "read" {
      values["readAt"] = .number(value ? Date().timeIntervalSince1970 * 1000 : 0)
      if value { values["progress"] = .number(1) }
    }
    if field == "reminderDone" {
      values["done"] = .bool(value)
      values["snoozedUntil"] = .number(0)
      values["dismissed"] = .bool(false)
    }
    if field == "archived", !value {
      values["restoredAt"] = .number(Date().timeIntervalSince1970 * 1000)
    }
    return await patch(card, values: values)
  }

  @discardableResult
  func toggleTask(_ card: MobileCard, taskID: String) async -> Bool {
    guard card.type == "task", card.tasks.contains(where: { $0.id == taskID }) else { return false }
    let done = card.tasks.filter { $0.id == taskID ? !$0.done : $0.done }.map(\.id)
    return await patch(
      card,
      values: [
        "taskDone": .array(done.map(JSONValue.string)),
        "done": .bool(done.count == card.tasks.count),
      ])
  }

  @discardableResult
  func patch(_ baseline: MobileCard, values: [String: JSONValue]) async -> Bool {
    guard baseline.owner == owner, let current = card(baseline.id), current.raw == baseline.raw,
      current.item == baseline.item
    else {
      error = Copy.appleConflict
      return false
    }
    return await write([Self.itemPatch(id: baseline.id, values: values)])
  }

  @discardableResult
  func batch(ids: Set<String>, field: String, value: Bool) async -> Bool {
    guard ["bookmarked", "later", "archived", "read"].contains(field), !ids.isEmpty else {
      return false
    }
    let selected = cards.filter { ids.contains($0.id) }
    guard selected.count == ids.count else {
      error = Copy.appleConflict
      return false
    }
    var values: [String: JSONValue] = [field: .bool(value)]
    if field == "read" {
      values["readAt"] = .number(value ? Date().timeIntervalSince1970 * 1000 : 0)
      if value { values["progress"] = .number(1) }
    }
    if field == "archived", !value {
      values["restoredAt"] = .number(Date().timeIntervalSince1970 * 1000)
    }
    return await write(selected.map { Self.itemPatch(id: $0.id, values: values) })
  }

  @discardableResult
  func saveAnnotations(_ baseline: MobileCard, tags: [String], note: String) async -> Bool {
    await saveBatchAnnotations(baselines: [baseline], tags: tags, note: note)
  }

  /// Tags replace the selected cards' tags; the note belongs only to the first card.
  /// Every editor baseline is checked before sending a single atomic operation batch.
  @discardableResult
  func saveBatchAnnotations(baselines: [MobileCard], tags: [String], note: String) async -> Bool {
    guard !baselines.isEmpty,
      Set(baselines.map(\.id)).count == baselines.count,
      baselines.allSatisfy({ baseline in
        guard baseline.owner == owner, let current = card(baseline.id) else { return false }
        return current.tags == baseline.tags && current.note == baseline.note
          && current.item["tagsEdited"] == baseline.item["tagsEdited"]
      })
    else {
      error = Copy.appleConflict
      return false
    }
    var seen = Set<String>()
    let cleanTags = tags.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty && seen.insert($0).inserted }
    guard cleanTags.count <= 20, cleanTags.allSatisfy({ $0.count <= 30 }), note.count <= 4000 else {
      error = Copy.appleInvalidCard
      return false
    }
    return await write(
      baselines.enumerated().map { index, card in
        var values: [String: JSONValue] = [
          "tags": .array(cleanTags.map(JSONValue.string)), "tagsEdited": .bool(true),
        ]
        if index == 0 { values["note"] = .string(note) }
        return Self.itemPatch(id: card.id, values: values)
      })
  }

  @discardableResult
  func capture(_ text: String) async -> Bool {
    let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !value.isEmpty, value.count <= 4000 else { return false }
    let first = value.split(whereSeparator: \.isWhitespace).first.map(String.init) ?? ""
    let link = MobileCard.safeURL(first)
    let rest = String(value.dropFirst(first.count)).trimmingCharacters(in: .whitespacesAndNewlines)
    let title =
      link == nil
      ? String((value.components(separatedBy: "\n").first ?? value).prefix(60))
      : String((rest.isEmpty ? (link?.host ?? first) + (link?.path ?? "") : rest).prefix(200))
    let body = link == nil ? value : rest
    if cards.contains(where: {
      if let link { return $0.url == link }
      return $0.type == "note" && $0.title == title && $0.body == body
    }) {
      return true
    }
    var raw: JSONValue = .object([
      "id": .string("capture-" + UUID().uuidString.lowercased()),
      "type": .string(link == nil ? "note" : "article"), "title": .string(title),
      "body": .string(body), "summary": .string(link == nil ? String(value.prefix(300)) : ""),
      "time": .number(Date().timeIntervalSince1970 * 1000), "tags": .array([]),
      "sources": .array([
        .object([
          "name": .string(link?.host ?? Copy.text("web.cards.e727b8cc2df0")),
          "kind": .string(link == nil ? "capture" : "web"),
        ])
      ]),
    ])
    raw["url"] = link.map { .string($0.absoluteString) }
    do { _ = try Card(json: raw) } catch {
      self.error = Copy.appleInvalidCard
      return false
    }
    return await write([.object(["op": .string("card.upsert"), "card": raw, "before": .null])])
  }

  @discardableResult
  func updatePreferences(_ values: [String: JSONValue]) async -> Bool {
    await write([.object(["op": .string("preferences.patch"), "values": .object(values)])])
  }

  @discardableResult
  func recordReading(_ card: MobileCard, seconds: Int, progress: Double) async -> Bool {
    // Background activity waits for an in-flight operation, then uses its confirmed revision.
    // This never retries an ambiguous write and cannot transfer activity across accounts.
    while busy && !Task.isCancelled {
      await withCheckedContinuation { activityWaiters.append($0) }
    }
    guard !Task.isCancelled, !unresolvedWrite, card.owner == owner,
      let current = self.card(card.id), progress.isFinite
    else {
      return false
    }
    let progress = max(current.progress, min(1, max(0, progress)))
    var values: [String: JSONValue] = [
      "seen": .bool(true), "progress": .number(progress),
    ]
    if progress >= 1,
      ["article", "mail", "note", "media", "suggestion", "photo"].contains(card.type)
    {
      values["read"] = .bool(true)
      if !current.read { values["readAt"] = .number(Date().timeIntervalSince1970 * 1000) }
    }
    var operations = [Self.itemPatch(id: card.id, values: values)]
    if seconds > 0 {
      operations.append(
        .object([
          "op": .string("reading.add"), "seconds": .number(Double(min(86400, seconds))),
        ]))
    }
    return await write(operations)
  }

  @discardableResult
  func recordPlayback(_ baseline: MobileCard, position: Double, ended: Bool) async -> Bool {
    guard position.isFinite else { return false }
    while busy && !Task.isCancelled {
      await withCheckedContinuation { activityWaiters.append($0) }
    }
    guard !Task.isCancelled, !unresolvedWrite, baseline.owner == owner,
      let current = card(baseline.id), current.raw == baseline.raw
    else { return false }
    var values: [String: JSONValue] = ["playbackPosition": .number(max(0, position))]
    if ended {
      values["read"] = .bool(true)
      values["progress"] = .number(1)
      if !current.read { values["readAt"] = .number(Date().timeIntervalSince1970 * 1000) }
    }
    return await write([Self.itemPatch(id: baseline.id, values: values)])
  }

  func exportData() throws -> Data {
    guard let snapshot, owner != nil else { throw CloudWorkspaceError.unauthenticated }
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    return try encoder.encode(snapshot.json)
  }

  /// The confirmation dialog must keep the revision that was shown when it opened.
  @discardableResult
  func clearAll(expectedRevision: Int) async -> Bool {
    guard expectedRevision == revision else {
      error = Copy.appleConflict
      return false
    }
    guard !cards.isEmpty else { return true }
    return await write(
      cards.map {
        .object(["op": .string("card.delete"), "id": .string($0.id), "before": $0.raw])
      })
  }

  private func write(_ operations: [JSONValue]) async -> Bool {
    guard owner != nil, !needsPasswordSetup, begin() else { return false }
    let baseline = revision
    defer { busy = false }
    do {
      try accept(
        await cloud.apply(
          operations: operations, expectedRevision: .number(Double(baseline))))
      return true
    } catch {
      unresolvedWrite = await cloud.pendingWriteKey != nil
      report(error)
      return false
    }
  }

  private func begin() -> Bool {
    guard !busy else {
      error = Copy.text("login.processing")
      return false
    }
    guard !unresolvedWrite else {
      error = Copy.appleUnknownWrite
      return false
    }
    busy = true
    error = nil
    return true
  }

  private func accept(_ state: CloudWorkspaceState) throws {
    let snapshot = try Snapshot(json: state.json)
    let cards = try snapshot.cards.map {
      try MobileCard(card: $0, item: snapshot.items[$0.id] ?? .object([:]), owner: state.owner)
    }
    self.snapshot = snapshot
    self.cards = cards
    owner = state.owner
    sessionChecked = true
    revision = snapshot.revision
    preferences = snapshot.json["state"]?["preferences"]?.object ?? [:]
    needsPasswordSetup = state.needsPasswordSetup
  }

  private func reset(preservingUnknown: Bool = false) {
    sessionChecked = true
    owner = nil
    snapshot = nil
    cards = []
    preferences = [:]
    revision = 0
    needsPasswordSetup = false
    if !preservingUnknown { unresolvedWrite = false }
  }

  private func report(_ failure: any Error) {
    switch failure {
    case CloudWorkspaceError.unauthenticated:
      reset(preservingUnknown: true)
      error = Copy.text("login.unauthenticated")
    case CloudWorkspaceError.service(_, 403):
      reset(preservingUnknown: true)
      error = Copy.text("login.forbidden")
    case CloudWorkspaceError.service(_, 409): error = Copy.appleConflict
    case CloudWorkspaceError.unknownWrite:
      unresolvedWrite = true
      error = Copy.appleUnknownWrite
    case CloudWorkspaceError.sessionStorage: error = Copy.appleSessionError
    case CloudWorkspaceError.service(let code, let status):
      error = Copy.text(
        status == 429
          ? "login.rateLimited"
          : code == "logout_unconfirmed" ? "auth.logoutUnconfirmed" : "login.unavailable")
    default: error = Copy.text("login.network")
    }
  }

  private static func itemPatch(id: String, values: [String: JSONValue]) -> JSONValue {
    .object(["op": .string("item.patch"), "id": .string(id), "values": .object(values)])
  }

  private static func score(_ card: MobileCard, now: Double) -> Double {
    if card.dismissed || card.completed { return -1 }
    let snooze = card.item["snoozedUntil"]?.number ?? 0
    let trigger: Double?
    if snooze > 0 {
      trigger = snooze
    } else if card.type == "event" {
      trigger = card.start.map { $0 - 15 * 60000 }
    } else if card.type == "task" {
      trigger = card.due.map { $0 - 30 * 60000 }
    } else if card.type == "reminder" {
      trigger = card.due
    } else {
      trigger = nil
    }
    let ended = card.type == "event" && (card.end ?? .infinity) <= now
    let urgent = trigger.map { $0 <= now && !ended } ?? false
    let start = card.type == "event" ? card.start : trigger
    let soon =
      start.map {
        $0 > now && $0 - now <= (card.type == "event" ? 30 : 15) * 60000
      } ?? false
    return (urgent ? 100 : soon ? 50 : 0) + max(0, min(10, card.priority))
  }
}
