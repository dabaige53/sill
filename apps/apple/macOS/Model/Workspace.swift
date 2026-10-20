import Foundation
import Observation
import SillKit

/// The workspace the window draws. Observed properties are few and coarse:
/// `catalogVersion` changes only when cards are added, removed or rewritten;
/// card state lives in one `CardState` per card. Nothing here is a global busy switch.
@MainActor @Observable final class Workspace {
  enum Phase: Equatable {
    case connecting, signedOut, ready
    case unavailable(String)
  }
  /// Web `#toast`. An undoable notice stays 5.5s of unattended time, a plain one 3.2s; a
  /// persistent one (a failure or an unknown result) stays until closed.
  struct Notice: Equatable, Identifiable {
    let id = UUID()
    var text: String
    var persistent = false
    var undo: (@MainActor () -> Void)?
    static func == (a: Notice, b: Notice) -> Bool { a.id == b.id }
  }

  func toast(_ text: String, undo: (@MainActor () -> Void)? = nil) {
    notice = Notice(text: text, undo: undo)
  }

  private(set) var phase: Phase = .connecting
  private(set) var catalogVersion = 0
  private(set) var preferences = Preferences()
  var notice: Notice?

  @ObservationIgnored private(set) var models: [String: CardModel] = [:]
  @ObservationIgnored private(set) var order: [String] = []
  @ObservationIgnored private var states: [String: CardState] = [:]
  @ObservationIgnored private var baseline = SnapshotDiff.Baseline()
  @ObservationIgnored private(set) var revision = 0
  @ObservationIgnored private(set) var seconds: Double = 0
  @ObservationIgnored private(set) var storedPreferences: [String: JSONValue] = [:]
  @ObservationIgnored let queue = WriteQueue()
  @ObservationIgnored private(set) var backend: (any WorkspaceBackend)?
  @ObservationIgnored private var acceptChain: Task<Void, Never>?
  @ObservationIgnored private var generation = 0
  @ObservationIgnored let launch: LaunchOptions
  @ObservationIgnored lazy var recorder = ActivityRecorder(workspace: self)
  @ObservationIgnored var catalogChanged: (() -> Void)?

  init(launch: LaunchOptions = .current, autoload: Bool = true) {
    self.launch = launch
    if autoload { start() }
  }

  var isLocal: Bool { launch.dataDirectory != nil }

  // MARK: Lookup (never observed by the caller)

  func model(_ id: String) -> CardModel? { models[id] }

  func state(_ id: String) -> CardState {
    if let state = states[id] { return state }
    let state = CardState(id: id)
    states[id] = state
    return state
  }

  var cards: [CardModel] { order.compactMap { models[$0] } }

  // MARK: Loading

  func start() {
    if let directory = launch.dataDirectory {
      do {
        connect(try LocalBackend(directory: directory))
      } catch StoreError.workspaceInUse {
        phase = .unavailable(Copy.appleWorkspaceInUse)
      } catch {
        phase = .unavailable(Copy.appleReadError)
      }
    } else {
      // Cloud sign-in arrives with the account group.
      phase = .signedOut
    }
  }

  func connect(_ backend: any WorkspaceBackend) {
    generation += 1
    self.backend = backend
    queue.backend = backend
    queue.reset()
    refresh()
  }

  /// Read the workspace again. Used by ⌘R, the periodic check and after a conflict or unknown
  /// result. A quiet read reports nothing when it fails.
  func refresh(quiet: Bool = false, completion: ((Bool) -> Void)? = nil) {
    queue.read { [weak self] result in
      guard let self else { return }
      switch result {
      case .success(let snapshot):
        self.accept(snapshot) {
          if self.phase != .ready { self.phase = .ready }
          completion?(true)
        }
        Task { await self.checkPendingCloudWrite() }
      case .failure(let error):
        if self.phase == .connecting { self.phase = .unavailable(Copy.appleReadError) }
        // An ended session still signs out, even on a quiet read.
        if !quiet || Self.signedOut(error) { self.report(error) }
        completion?(false)
      case nil:
        completion?(false)
      }
    }
  }

  /// Snapshots are diffed off the main thread and applied in arrival order.
  func accept(_ snapshot: Snapshot, then: (() -> Void)? = nil) {
    let previous = acceptChain
    let token = generation
    acceptChain = Task { [weak self] in
      await previous?.value
      guard let self, token == self.generation else { return }
      guard snapshot.revision >= self.revision || self.order.isEmpty else {
        then?()
        return
      }
      let baseline = self.baseline
      let diff = await Task.detached(priority: .userInitiated) {
        SnapshotDiff.make(snapshot, against: baseline)
      }.value
      guard token == self.generation else { return }
      self.apply(diff)
      then?()
    }
  }

  private func apply(_ diff: SnapshotDiff) {
    revision = diff.revision
    seconds = diff.seconds
    for model in diff.models { models[model.id] = model }
    for id in diff.removed {
      models[id] = nil
      states[id] = nil
    }
    order = diff.order
    var items = baseline.items
    for (id, item) in diff.items {
      items[id] = .object(item)
      state(id).accept(item)
    }
    for id in diff.removed { items[id] = nil }
    baseline = .init(raw: diff.raw, items: items, order: diff.order)
    storedPreferences = diff.preferences
    let next = Preferences(diff.preferences)
    if next != preferences { preferences = next }
    if diff.catalogChanged {
      catalogVersion += 1
      catalogChanged?()
    }
  }

  // MARK: Writes

  /// Change one card's stored state. The card draws the new value at once and locks only its
  /// own controls until the store answers; a failure returns it to the stored value.
  /// `queued` lets an undo follow a write that is still in flight; it still locks the card.
  @discardableResult
  func change(
    _ id: String, _ values: [String: JSONValue], lock: Bool = true, queued: Bool = false,
    completion: ((Bool) -> Void)? = nil
  ) -> Bool {
    change([id: values], lock: lock, queued: queued, completion: completion)
  }

  @discardableResult
  func change(
    _ patches: [String: [String: JSONValue]], lock: Bool = true, queued: Bool = false,
    completion: ((Bool) -> Void)? = nil
  ) -> Bool {
    guard phase == .ready, !patches.isEmpty,
      patches.keys.allSatisfy({ models[$0] != nil && (queued || !(lock && state($0).isWriting)) })
    else { return false }
    let touched = patches.keys.map(state)
    for state in touched {
      if lock { state.beginWrite() }
      state.apply(patches[state.id]!)
    }
    let operations = patches.sorted { $0.key < $1.key }.map {
      WorkspaceOperation.itemPatch(id: $0.key, values: $0.value)
    }
    queue.write(operations) { [weak self] result in
      guard let self else { return }
      let finish = { (success: Bool) in
        for state in touched {
          if lock { state.endWrite() }
          if !success { state.revert() }
        }
        completion?(success)
      }
      switch result {
      case .success(let snapshot): self.accept(snapshot) { finish(true) }
      case .failure(let error):
        finish(false)
        self.report(error)
      case nil: finish(false)
      }
    }
    return true
  }

  /// Workspace-wide writes (preferences, new cards, deletions) lock only the control that asked.
  func write(_ operations: [WorkspaceOperation], completion: ((Bool) -> Void)? = nil) {
    guard phase == .ready else {
      completion?(false)
      return
    }
    queue.write(operations) { [weak self] result in
      guard let self else { return }
      switch result {
      case .success(let snapshot): self.accept(snapshot) { completion?(true) }
      case .failure(let error):
        completion?(false)
        self.report(error)
      case nil: completion?(false)
      }
    }
  }

  func setPreference(_ key: String, _ value: JSONValue, completion: ((Bool) -> Void)? = nil) {
    write([.preferences([key: value])], completion: completion)
  }

  // MARK: Card actions (Web `views/actions`)

  func toggleBookmark(_ id: String) { change(id, ["bookmarked": .bool(!state(id).bookmarked)]) }
  func toggleLater(_ id: String) { change(id, ["later": .bool(!state(id).later)]) }

  enum Flag { case bookmarked, later }

  /// Web `applySelectionAction`: every card gets the flag in one write; undo puts back each
  /// card's own value.
  func mark(_ ids: [String], _ flag: Flag) {
    let key = flag == .bookmarked ? "bookmarked" : "later"
    let kept = ids.filter { models[$0] != nil }
    var before: [String: [String: JSONValue]] = [:]
    for id in kept {
      before[id] = [key: .bool(flag == .bookmarked ? state(id).bookmarked : state(id).later)]
    }
    let after = Dictionary(uniqueKeysWithValues: kept.map { ($0, [key: JSONValue.bool(true)]) })
    guard change(after) else { return }
    let text =
      flag == .bookmarked
      ? Copy.text("web.app.96e7ee93f3ba") + "\(kept.count)"
        + Copy.text("web.common.cardCountSuffix")
      : "\(kept.count)" + Copy.text("web.app.34d0636b70c8")
    toast(text) { [weak self] in self?.change(before, queued: true) }
  }

  /// Web `restoreCard`: back on the desk, with an undo that puts it away again. `then` runs after
  /// the change and after an undo, so the feed can take the card in or out.
  func restore(_ id: String, then: @escaping @MainActor () -> Void) {
    let before: [String: JSONValue] = [
      "archived": .bool(true),
      "restoredAt": state(id).confirmed["restoredAt"] ?? .number(0),
    ]
    guard change(id, ["archived": .bool(false), "restoredAt": .number(Format.milliseconds())])
    else { return }
    then()
    toast(Copy.text("web.app.fff336942d9b")) { [weak self] in
      guard let self, self.change(id, before, queued: true) else { return }
      then()
    }
  }

  /// The stored tags and note an edit started from (AGENTS.md: keep an edit baseline).
  struct EditBaseline: Equatable {
    var tags: [String]
    var tagsEdited: Bool
    var note: String
  }

  func editBaseline(_ ids: [String]) -> [String: EditBaseline] {
    var result: [String: EditBaseline] = [:]
    for id in ids where models[id] != nil {
      let stored = state(id).confirmed
      result[id] = EditBaseline(
        tags: stored["tags"]?.strings ?? [], tagsEdited: stored["tagsEdited"]?.bool ?? false,
        note: stored["note"]?.string ?? "")
    }
    return result
  }

  enum EditResult { case saved, conflict, failed, busy }

  /// Web `saveNote`: every card gets the tags and `tagsEdited`; only the first gets the note.
  /// When a card's stored tags or note changed after the editor opened, nothing is written: the
  /// editor keeps its input and shows the conflict.
  func saveEdits(
    _ ids: [String], tags: [String], note: String, baseline: [String: EditBaseline],
    completion: @escaping @MainActor (EditResult) -> Void
  ) {
    let kept = ids.filter { models[$0] != nil }
    guard let first = kept.first else { return completion(.failed) }
    let current = editBaseline(kept)
    guard kept.allSatisfy({ current[$0] == baseline[$0] }) else {
      notice = Notice(text: Copy.appleConflict, persistent: false)
      return completion(.conflict)
    }
    var patches: [String: [String: JSONValue]] = [:]
    for id in kept {
      var values: [String: JSONValue] = [
        "tags": .array(tags.map(JSONValue.string)), "tagsEdited": .bool(true),
      ]
      if id == first { values["note"] = .string(String(note.prefix(4000))) }
      patches[id] = values
    }
    let started = change(patches) { [weak self] done in
      guard let self else { return }
      if done {
        self.toast(
          self.isLocal
            ? Copy.text("web.app.5fa0ce52b47e") : Copy.text("web.cloudentry.1bd91a7d0c53"))
      }
      completion(done ? .saved : .failed)
    }
    if !started { completion(.busy) }
  }

  /// Web `checkReminders`: reminders that are due and not yet shown.
  func dueReminders(now: Double = Format.milliseconds()) -> [String] {
    cards.filter { card in
      FeedPolicy.eligible(
        card, state: state(card.id), stored: baseline.items[card.id]?.object ?? [:], now: now)
    }.map(\.id)
  }

  /// Web `showNew`: the due reminders come back to the desk and count as shown.
  func showReminders(_ ids: [String], then: @escaping @MainActor () -> Void) {
    let now = Format.milliseconds()
    var patches: [String: [String: JSONValue]] = [:]
    for id in ids {
      guard let card = models[id] else { continue }
      patches[id] = [
        "snoozedUntil": .number(0),
        "lastReminderKey": .string(FeedPolicy.key(card)),
        "lastNotifiedAt": .number(now),
      ]
    }
    // `then` runs once the stored keys are back, so the hint counts again from them.
    change(patches) { _ in then() }
  }

  func toggleRead(_ id: String) { setRead(id, !state(id).read) }

  func setRead(_ id: String, _ read: Bool) {
    change(
      id,
      [
        "read": .bool(read), "seen": .bool(read), "progress": .number(read ? 1 : 0),
        "readAt": .number(read ? Format.milliseconds() : 0),
      ])
  }

  /// Returns the task ids done before the change, for undo.
  @discardableResult
  func toggleTask(_ id: String, task: String) -> [String]? {
    guard let card = models[id] else { return nil }
    let before = state(id).tasks(of: card).filter(\.done).map(\.id)
    let after = before.contains(task) ? before.filter { $0 != task } : before + [task]
    let changed = change(id, ["taskDone": .array(after.map(JSONValue.string))])
    // Web: finishing the last task offers an undo that returns every check as it was.
    if changed, !card.tasks.isEmpty, Set(after).isSuperset(of: card.tasks.map(\.id)) {
      toast(Copy.text("web.app.58d2aeefaa41")) { [weak self] in
        self?.change(id, ["taskDone": .array(before.map(JSONValue.string))], queued: true)
      }
    }
    return changed ? before : nil
  }

  func setTasks(_ id: String, done: [String]) {
    change(id, ["taskDone": .array(done.map(JSONValue.string))])
  }

  enum ReminderAction { case complete, restore, snooze, dismiss }

  /// Sill-only reminder state; the source time is never changed (Web `changeReminder`).
  @discardableResult
  func changeReminder(_ id: String, _ action: ReminderAction) -> [String: JSONValue]? {
    guard let card = models[id], card.kind.remindable else { return nil }
    let now = Format.milliseconds()
    let state = state(id)
    let stored = baseline.items[id]?.object ?? [:]
    let before: [String: JSONValue] = [
      "snoozedUntil": .number(state.snoozedUntil), "dismissed": .bool(state.dismissed),
      "reminderDone": .bool(state.reminderDone),
      "lastReminderKey": stored["lastReminderKey"] ?? .null,
      "lastNotifiedAt": stored["lastNotifiedAt"] ?? .null,
    ]
    let values: [String: JSONValue] =
      switch action {
      case .snooze:
        [
          "snoozedUntil": .number(now + 600_000), "dismissed": .bool(false),
          "reminderDone": .bool(false),
        ]
      case .dismiss: ["dismissed": .bool(true), "snoozedUntil": .number(0)]
      case .complete: ["reminderDone": .bool(true), "snoozedUntil": .number(0)]
      case .restore:
        [
          "snoozedUntil": .number(0), "dismissed": .bool(false), "reminderDone": .bool(false),
          "lastReminderKey": .string(FeedPolicy.key(card, state: state)),
          "lastNotifiedAt": .number(now),
        ]
      }
    guard change(id, values) else { return nil }
    let text =
      switch action {
      case .snooze: Copy.text("web.app.8b61908123ce")
      case .dismiss: Copy.text("web.app.c9bb70bcaaa3")
      case .complete: Copy.text("web.app.4203e358dee2")
      case .restore: Copy.text("web.app.480719186cc8")
      }
    toast(text) { [weak self] in self?.change(id, before, queued: true) }
    return before
  }

  // MARK: Workspace actions (settings, capture)

  enum CaptureResult { case saved, empty, duplicate, sent }

  /// A note or link the person typed. Only the control that asked waits for the store.
  @discardableResult
  func capture(_ text: String, completion: ((Bool) -> Void)? = nil) -> CaptureResult {
    guard let json = Capture.card(from: String(text.prefix(Capture.limit))) else { return .empty }
    if Capture.duplicate(json, in: cards) {
      notice = Notice(text: Copy.text("web.app.17ebeb500554"))
      return .duplicate
    }
    do {
      let card = try Card(json: json)
      let raw = try card.raw
      write([.upsert(card: raw, before: .null)]) { [weak self] done in
        if done {
          self?.toast(Copy.text("web.app.4f060a8371c3")) { [weak self] in
            guard let self else { return }
            self.write([.delete(id: card.id, before: self.baseline.raw[card.id] ?? raw)])
          }
        }
        completion?(done)
      }
      return .sent
    } catch {
      report(error)
      return .empty
    }
  }

  /// Everything stored, in the Web export shape (`app`, `exportedAt` and the state).
  func exportState() -> JSONValue {
    .object([
      "app": .string("Sill"),
      "exportedAt": .string(ISO8601DateFormatter().string(from: .now)),
      "cards": .array(order.compactMap { baseline.raw[$0] }),
      "items": .object(baseline.items),
      "seconds": .number(seconds),
      "preferences": .object(storedPreferences),
    ])
  }

  /// Deletes every card and its stored state in one write, checked against the read revision.
  func clearAll(completion: ((Bool) -> Void)? = nil) {
    let operations = order.compactMap { id in
      baseline.raw[id].map { WorkspaceOperation.delete(id: id, before: $0) }
    }
    guard !operations.isEmpty else {
      completion?(true)
      return
    }
    write(operations, completion: completion)
  }

  // MARK: Failures

  func report(_ failure: any Error) {
    let text: String
    var persistent = false
    switch failure {
    case CloudWorkspaceError.unauthenticated:
      text = Copy.text("login.unauthenticated")
      signOutLocally()
    case CloudWorkspaceError.unknownWrite, StoreError.unknownWrite:
      text = Copy.appleUnknownWrite
      persistent = true
      verify()
    case CloudWorkspaceError.service(let code, let status):
      switch status {
      case 409:
        text = Copy.appleConflict
        verify()
      case 403: text = Copy.text("login.forbidden")
      case 429: text = Copy.text("login.rateLimited")
      default:
        text = Copy.text(
          code == "invalid_request" ? "web.agent.invalidRequest" : "login.unavailable")
      }
    case CloudWorkspaceError.sessionStorage: text = Copy.appleSessionError
    case StoreError.conflict:
      text = Copy.appleConflict
      verify()
    case StoreError.workspaceInUse: text = Copy.appleWorkspaceInUse
    case is CardValidationError: text = Copy.appleInvalidCard
    default: text = Copy.appleWriteError
    }
    notice = Notice(text: text, persistent: persistent)
  }

  private static func signedOut(_ error: any Error) -> Bool {
    if case CloudWorkspaceError.unauthenticated = error { return true }
    return false
  }

  /// A conflict or unknown result is checked by reading, never by sending the write again.
  private func verify() { refresh() }

  private func checkPendingCloudWrite() async {
    guard let cloud = (backend as? CloudBackend)?.cloud else { return }
    if await cloud.pendingWriteKey != nil {
      notice = Notice(text: Copy.appleUnknownWrite, persistent: true)
    } else if notice?.text == Copy.appleUnknownWrite {
      notice = nil
    }
  }

  func signOutLocally() {
    generation += 1
    queue.reset()
    models = [:]
    order = []
    states = [:]
    baseline = .init()
    revision = 0
    catalogVersion += 1
    phase = .signedOut
  }
}

/// Launch arguments. `--data-directory <absolute path>` opens an independent local workspace.
struct LaunchOptions: Sendable {
  var dataDirectory: URL?

  static let current = LaunchOptions(arguments: ProcessInfo.processInfo.arguments)

  init(dataDirectory: URL?) { self.dataDirectory = dataDirectory }

  init(arguments: [String]) {
    if let index = arguments.firstIndex(of: "--data-directory"),
      arguments.indices.contains(index + 1),
      arguments[index + 1].hasPrefix("/")
    {
      dataDirectory =
        URL(fileURLWithPath: arguments[index + 1], isDirectory: true).standardizedFileURL
    }
  }
}
