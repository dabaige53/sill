import Foundation
import Observation
import SillKit

/// Home tabs. On desktop a tab is a token in the search field; home filter and search share one state.
enum Scope: String, CaseIterable, Sendable {
  case all, unread, todo, later, saved

  var label: String {
    switch self {
    case .all: Copy.text("web.all")
    case .unread: Copy.text("web.unread")
    case .todo: Copy.text("web.home.todo")
    case .later: Copy.text("web.later")
    case .saved: Copy.text("web.bookmark")
    }
  }

  /// ⌘1–⌘5
  var shortcut: Character { Character(String((Scope.allCases.firstIndex(of: self) ?? 0) + 1)) }
}

enum FeedEntry: Identifiable, Equatable {
  case card(String)
  case stack(key: String, cards: [String])
  case openStack(key: String, cards: [String])

  var id: String {
    switch self {
    case .card(let id): id
    case .stack(let key, _), .openStack(let key, _): "stack:" + key
    }
  }
}

/// What the card area lists. Entries are recomputed when cards arrive, the scope or the query
/// changes, or the user refreshes. Reading, completing or bookmarking a card keeps the current
/// members, order, stacks and positions (web-interaction.md, 桌面阅读与操作细节).
@MainActor @Observable final class Feed {
  enum Empty: Equatable {
    case none, clean
    case noMatch(String)
    case filtered
  }

  private(set) var scope = Scope.all
  private(set) var query = ""
  private(set) var entries: [FeedEntry] = []
  private(set) var hasMore = false
  /// Cards put away, for the shelf row at the end of the desk.
  private(set) var shelfCount = 0
  private(set) var empty = Empty.none
  /// Increments when the entries are rebuilt for a new scope, so the card area can restore its place.
  private(set) var scopeVersion = 0

  @ObservationIgnored private unowned let workspace: Workspace
  @ObservationIgnored private(set) var now = Format.milliseconds()
  @ObservationIgnored private var pageLimit = Feed.page
  @ObservationIgnored private(set) var openStacks: Set<String> = []
  @ObservationIgnored private var stackPositions: [String: StackPosition] = [:]
  @ObservationIgnored var scrollOffsets: [Scope: CGFloat] = [:]
  /// The first screen has played its entrance; later cards arrive with the drop instead.
  @ObservationIgnored var entered = false
  @ObservationIgnored private var lastPreferences = Preferences()
  @ObservationIgnored private var order: [String: Int] = [:]

  static let page = 40

  init(workspace: Workspace) {
    self.workspace = workspace
    workspace.catalogChanged = { [weak self] in self?.rebuild() }
  }

  /// Card ids in feed order, for a shift-click range.
  var cardOrder: [String] {
    entries.flatMap { entry -> [String] in
      switch entry {
      case .card(let id): [id]
      case .stack(_, let cards), .openStack(_, let cards): cards
      }
    }
  }

  var filtering: Bool { scope != .all || !query.isEmpty }

  func stackPosition(_ key: String) -> StackPosition {
    if let position = stackPositions[key] { return position }
    let position = StackPosition()
    stackPositions[key] = position
    return position
  }

  // MARK: Intents

  @ObservationIgnored private var searchTask: Task<Void, Never>?
  @ObservationIgnored private var pendingQuery: String?

  /// Text editing is immediate; only the last result calculation survives rapid typing.
  func scheduleSearch(_ text: String) {
    searchTask?.cancel()
    pendingQuery = text
    searchTask = Task { [weak self] in
      do { try await Task.sleep(for: .milliseconds(Int(AppleMetrics.searchDelay))) } catch {
        return
      }
      guard let self else { return }
      self.search(text)
    }
  }

  func select(_ next: Scope) {
    let trace = PerformanceTrace.shared.begin(.selectScope)
    defer { PerformanceTrace.shared.end(trace) }
    guard next != scope else { return }
    searchTask?.cancel()
    if let pendingQuery { query = pendingQuery }
    pendingQuery = nil
    scope = next
    pageLimit = Feed.page
    scopeVersion += 1
    rebuild()
  }

  func search(_ text: String) {
    searchTask?.cancel()
    pendingQuery = nil
    let trace = PerformanceTrace.shared.begin(.search)
    defer { PerformanceTrace.shared.end(trace) }
    guard text != query else { return }
    query = text
    pageLimit = Feed.page
    rebuild()
  }

  func clearFilter() {
    searchTask?.cancel()
    pendingQuery = nil
    query = ""
    if scope != .all {
      scope = .all
      scopeVersion += 1
    }
    rebuild()
  }

  func loadMore() {
    guard hasMore else { return }
    pageLimit += Feed.page
    rebuild(keepClock: true)
  }

  func openStack(_ key: String) {
    openStacks.insert(key)
    rebuild(keepClock: true)
  }

  func closeStack(_ key: String) {
    openStacks.remove(key)
    rebuild(keepClock: true)
  }

  /// Apply membership changes; only an explicit refresh also replaces the order.
  func refreshMembership(reorder: Bool = false) {
    if reorder { order.removeAll() }
    rebuild()
  }

  func preferencesChanged(_ preferences: Preferences) {
    defer { lastPreferences = preferences }
    if preferences.feedSort != lastPreferences.feedSort
      || preferences.stack != lastPreferences.stack
    {
      refreshMembership(reorder: preferences.feedSort != lastPreferences.feedSort)
    }
  }

  // MARK: Building

  private func rebuild(keepClock: Bool = false) {
    let trace = PerformanceTrace.shared.begin(.feedRebuild)
    defer {
      PerformanceTrace.shared.end(
        trace,
        values: [
          "card_count": Double(workspace.cards.count), "visible_count": Double(entries.count),
        ])
    }
    if !keepClock { now = Format.milliseconds() }
    let state = workspace.state
    let text = query.trimmingCharacters(in: .whitespaces).lowercased()
    let shelved = workspace.cards.reduce(0) { $0 + (state($1.id).archived ? 1 : 0) }
    if shelved != shelfCount { shelfCount = shelved }
    // Saves, pagination and catalog updates keep existing cards in their current order.
    let ranked = FeedPolicy.sort(
      workspace.cards, mode: workspace.preferences.feedSort, state: state, now: now)
    for card in ranked where order[card.id] == nil { order[card.id] = order.count }
    let cards = workspace.cards.filter { card in
      let s = state(card.id)
      // Searching reaches archived cards; browsing shows only the desk.
      if text.isEmpty, s.archived { return false }
      switch scope {
      case .all: break
      case .unread: if s.read { return false }
      case .todo: if card.kind != .task && card.kind != .reminder { return false }
      case .later: if !s.later { return false }
      case .saved: if !s.bookmarked { return false }
      }
      return text.isEmpty || matches(card, state: s, text: text)
    }.sorted { order[$0.id, default: 0] < order[$1.id, default: 0] }

    if cards.isEmpty {
      set(entries: [], more: false)
      let next: Empty = !filtering ? .clean : query.isEmpty ? .filtered : .noMatch(query)
      if empty != next { empty = next }
      return
    }
    if empty != .none { empty = .none }

    let stacks =
      workspace.preferences.stack && !filtering
      ? FeedPolicy.stacks(cards, state: state) : [:]
    var stackOf: [String: String] = [:]
    for (key, list) in stacks { for card in list { stackOf[card.id] = key } }
    var result: [FeedEntry] = []
    var placed: Set<String> = []
    for card in cards {
      guard let key = stackOf[card.id] else {
        result.append(.card(card.id))
        continue
      }
      guard placed.insert(key).inserted else { continue }
      let ids = stacks[key]!.map(\.id)
      result.append(
        openStacks.contains(key) ? .openStack(key: key, cards: ids) : .stack(key: key, cards: ids))
    }
    let more = result.count > pageLimit
    set(entries: more ? Array(result.prefix(pageLimit)) : result, more: more)
  }

  private func set(entries next: [FeedEntry], more: Bool) {
    if next != entries { entries = next }
    if more != hasMore { hasMore = more }
  }

  private func matches(_ card: CardModel, state: CardState, text: String) -> Bool {
    // Web `matches`: title, summary, source, note, body and tags as one text.
    card.searchText.contains(text)
      || ([card.searchText, state.note.lowercased()] + state.tags(of: card).map { $0.lowercased() })
        .joined(separator: " ").contains(text)
  }
}

/// Which card of a stack is on top. One object per stack, so flipping redraws only that stack.
@MainActor @Observable final class StackPosition {
  var index = 0
}
