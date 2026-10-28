import Foundation
import Observation
import SillKit

/// One card's personal state. Each card owns one instance, so a change redraws only that card.
/// Assignments happen only when a value really changes; Observation fires on every set.
/// Background records (`seen`, reading position) are not observed and never cause a redraw.
@MainActor @Observable final class CardState {
  let id: String
  private(set) var read = false
  private(set) var bookmarked = false
  private(set) var later = false
  private(set) var archived = false
  private(set) var dismissed = false
  private(set) var reminderDone = false
  private(set) var snoozedUntil: Double = 0
  /// Explicit task completion; nil keeps each task's own `done`.
  private(set) var taskDone: [String]?
  /// Shown on the card head. Reading updates `liveProgress`; this follows when the reader closes.
  private(set) var progress: Double = 0
  private(set) var playbackPosition: Double = 0
  private(set) var note = ""
  private(set) var personalTags: [String] = []
  private(set) var tagsEdited = false
  /// Interface only, never stored: part of the current multi-selection.
  var selected = false
  /// Incremented to move keyboard focus back to this card (after the reader closes).
  private(set) var focusRequest = 0
  func requestFocus() { focusRequest += 1 }
  /// Interface only: this card's more menu is open (Web `.tools-open`).
  var menuOpen = false
  /// Foreground writes in flight for this card. Only this card's controls lock while it is above 0.
  private(set) var writing = 0

  @ObservationIgnored private(set) var seen = false
  @ObservationIgnored private(set) var lessLike = false
  @ObservationIgnored var liveProgress: Double = 0
  /// The last stored item, so a failed optimistic change can return to it.
  @ObservationIgnored private(set) var confirmed: [String: JSONValue] = CardState.defaults
  /// While set, `read` keeps its drawn value until the reader's confirmation finishes.
  @ObservationIgnored private var heldRead: Bool?
  @ObservationIgnored private var taskOrder: [String] = []

  func previewTasks(of card: CardModel) -> [CardModel.TaskItem] {
    let tasks = tasks(of: card)
    let ids = Set(tasks.map(\.id))
    taskOrder.removeAll { !ids.contains($0) }
    for task in tasks.filter({ !$0.done }) + tasks.filter(\.done)
    where !taskOrder.contains(task.id) { taskOrder.append(task.id) }
    let byID = Dictionary(uniqueKeysWithValues: tasks.map { ($0.id, $0) })
    return taskOrder.prefix(3).compactMap { byID[$0] }
  }

  init(id: String) { self.id = id }

  var isWriting: Bool { writing > 0 }

  func beginWrite() { writing += 1 }

  /// When the last write ends, the card draws what the store holds.
  func endWrite() {
    writing = max(0, writing - 1)
    if writing == 0 { apply(confirmed) }
  }

  /// Stored item from a snapshot. Unchanged values are not assigned. While this card's own write
  /// is in flight, an older snapshot must not flicker its optimistic value back.
  func accept(_ item: [String: JSONValue]) {
    confirmed = Self.defaults.merging(item) { $1 }
    if writing == 0 { apply(confirmed) }
  }

  /// Web `Store.item` defaults; a missing stored key means the default, not "keep the old value".
  private static let defaults: [String: JSONValue] = [
    "read": .bool(false), "bookmarked": .bool(false), "later": .bool(false),
    "archived": .bool(false), "dismissed": .bool(false), "reminderDone": .bool(false),
    "snoozedUntil": .number(0), "taskDone": .null, "playbackPosition": .number(0),
    "progress": .number(0), "note": .string(""),
    "tags": .array([]), "tagsEdited": .bool(false), "seen": .bool(false), "lessLike": .bool(false),
  ]

  /// Optimistic local values for a pending write.
  func apply(_ values: [String: JSONValue]) {
    if let value = values["read"]?.bool {
      if heldRead != nil { heldRead = value } else { set(\.read, value) }
    }
    if let value = values["bookmarked"]?.bool { set(\.bookmarked, value) }
    if let value = values["later"]?.bool { set(\.later, value) }
    if let value = values["archived"]?.bool { set(\.archived, value) }
    if let value = values["dismissed"]?.bool { set(\.dismissed, value) }
    if let value = values["reminderDone"]?.bool { set(\.reminderDone, value) }
    if let value = values["snoozedUntil"]?.number { set(\.snoozedUntil, value) }
    if values.keys.contains("taskDone") { set(\.taskDone, values["taskDone"]?.strings) }
    if let value = values["note"]?.string { set(\.note, value) }
    if let value = values["tags"]?.strings { set(\.personalTags, value) }
    if let value = values["tagsEdited"]?.bool { set(\.tagsEdited, value) }
    if let value = values["playbackPosition"]?.number { set(\.playbackPosition, value) }
    if let value = values["progress"]?.number {
      liveProgress = heldRead == nil ? value : max(liveProgress, value)
      // Reading position follows the stored value only when nothing is being read right now.
      if heldRead == nil { set(\.progress, value) }
    }
    if let value = values["seen"]?.bool { seen = value }
    if let value = values["lessLike"]?.bool { lessLike = value }
  }

  /// Return to the stored item after a failed write.
  func revert() { apply(confirmed) }

  /// Keep the drawn read color while the reader shows its own confirmation.
  func holdReadAppearance() { if heldRead == nil { heldRead = read } }

  /// Draw the held read state and reading position now (after the reader has closed).
  func releaseReadAppearance() {
    guard let value = heldRead else { return }
    heldRead = nil
    set(\.read, value)
    set(\.progress, max(progress, liveProgress))
  }

  func markSeenLocally() { seen = true }

  /// Read as stored or sent, including a value still held back from drawing.
  var effectiveRead: Bool { heldRead ?? read }

  // MARK: Derived

  func tasks(of card: CardModel) -> [CardModel.TaskItem] {
    guard let done = taskDone else { return card.tasks }
    return card.tasks.map { .init(id: $0.id, text: $0.text, done: done.contains($0.id)) }
  }

  /// Personal tags replace the card's tags once edited; otherwise both show (Web `Store.tags`).
  func tags(of card: CardModel) -> [String] {
    tagsEdited ? personalTags : Array(NSOrderedSet(array: card.tags + personalTags)) as! [String]
  }

  func completed(_ card: CardModel) -> Bool {
    if reminderDone { return true }
    let tasks = tasks(of: card)
    return card.kind == .task && !tasks.isEmpty && tasks.allSatisfy(\.done)
  }

  private func set<Value: Equatable>(
    _ path: ReferenceWritableKeyPath<CardState, Value>, _ value: Value
  ) {
    if self[keyPath: path] != value { self[keyPath: path] = value }
  }
}
