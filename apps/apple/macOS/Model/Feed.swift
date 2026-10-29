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

/// # status conditions (Web `searchStatuses`): typed after #, shown as accent tokens.
enum Mark: String, CaseIterable, Sendable {
  case unread, saved, later

  var label: String {
    switch self {
    case .unread: Copy.text("web.unread")
    case .saved: Copy.text("web.bookmark")
    case .later: Copy.text("web.later")
    }
  }

  /// The tab that already means this status; the # list leaves it out.
  var scope: Scope {
    switch self {
    case .unread: .unread
    case .saved: .saved
    case .later: .later
    }
  }
}

/// One row of the # list.
struct HashOption: Hashable {
  enum Value: Hashable {
    case mark(Mark)
    case tag(String)
    case card(String, String, String)
  }
  let value: Value
  var label: String {
    switch value {
    case .mark(let mark): mark.label
    case .tag(let tag): "#" + tag
    case .card(_, let title, _): title
    }
  }
  var group: String {
    switch value {
    case .card: "card"
    case .mark: "status"
    case .tag: "tag"
    }
  }

  var icon: String {
    switch value {
    case .card(_, _, let icon): icon
    case .tag: "tag"
    case .mark(let mark): mark == .saved ? "bookmark" : mark == .later ? "glasses" : "circle"
    }
  }

}

/// A type chip under the top bar (Web `searchTypes`).
struct SearchKind: Hashable {
  let kind: CardKind
  let label: String

  static let all: [SearchKind] = [
    SearchKind(kind: .article, label: Copy.text("web.search.type.article")),
    SearchKind(kind: .mail, label: Copy.text("web.search.type.mail")),
    SearchKind(kind: .note, label: Copy.text("web.note")),
    SearchKind(kind: .task, label: Copy.text("web.task")),
    SearchKind(kind: .event, label: Copy.text("web.event")),
    SearchKind(kind: .media, label: Copy.text("web.media")),
  ]
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

  /// Expanded stacks keep their view identity, but must not retain their expanded height
  /// after collapsing. Ordinary card state changes still keep the existing height floor.
  var measurementID: String {
    if case .openStack = self { return id + ":expanded" }
    return id
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
  /// The type chip; nil is 全部. It only applies while there is text.
  private(set) var kind: CardKind?
  /// # conditions, beside the tab token.
  private(set) var mark: Mark?
  private(set) var tag: String?
  /// Types that still have results with the current text, whatever the chip.
  private(set) var kinds: Set<CardKind> = []
  private(set) var entries: [FeedEntry] = []
  private(set) var hasMore = false
  private(set) var animateChanges = false
  @ObservationIgnored var requestRefresh: () -> Void = {}
  /// Cards put away, for the shelf row at the end of the desk.
  private(set) var shelfCount = 0
  private(set) var empty = Empty.none
  struct ScrollRequest: Equatable {
    let id: Int
    let offset: CGFloat
  }

  /// Applied by the scroll view after the new entries have been laid out.
  private(set) var scrollRequest: ScrollRequest?

  @ObservationIgnored private unowned let workspace: Workspace
  @ObservationIgnored private(set) var now = Format.milliseconds()
  @ObservationIgnored private var pageLimit = Feed.page
  @ObservationIgnored private(set) var openStacks: Set<String> = []
  @ObservationIgnored private var stackPositions: [String: StackPosition] = [:]
  private struct Position {
    let offset: CGFloat
    let limit: Int
  }
  @ObservationIgnored private var positions: [Scope: Position] = [:]
  @ObservationIgnored private var scrollOffset: CGFloat = 0
  @ObservationIgnored private var scrollSequence = 0
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

  var filtering: Bool {
    scope != .all || !query.isEmpty || kind != nil || mark != nil || tag != nil
  }

  /// Text to match, without a trailing # fragment still being typed (Web `searchText`).
  static func searchText(_ query: String) -> String {
    guard let range = query.range(of: #"(^|\s)#\S*$"#, options: .regularExpression) else {
      return query.trimmingCharacters(in: .whitespaces)
    }
    return query.replacingCharacters(in: range, with: "").trimmingCharacters(in: .whitespaces)
  }

  /// The # fragment at the end of the text, or nil when none is being typed (Web `searchHash`).
  static func hashFragment(_ query: String) -> String? {
    guard let range = query.range(of: #"(^|\s)#\S*$"#, options: .regularExpression) else {
      return nil
    }
    let match = query[range]
    return String(match[match.index(after: match.firstIndex(of: "#")!)...])
  }

  /// # options for a fragment: statuses first, then existing tags, minus the ones in use.
  func hashOptions(_ fragment: String) -> [HashOption] {
    let needle = fragment.lowercased()
    let fits = { (label: String) in needle.isEmpty || label.lowercased().contains(needle) }
    let marks = Mark.allCases.filter { $0 != mark && $0.scope != scope && fits($0.label) }
    var seen: Set<String> = []
    var tags: [String] = []
    for card in workspace.cards {
      for name in workspace.state(card.id).tags(of: card) where seen.insert(name).inserted {
        if name != tag, fits(name) { tags.append(name) }
      }
    }
    return marks.map { HashOption(value: .mark($0)) } + tags.map { HashOption(value: .tag($0)) }
  }

  func suggestions(_ text: String) -> [HashOption] {
    if let fragment = Self.hashFragment(text) {
      var options = hashOptions(fragment)
      if let mark, mark.scope != scope,
        fragment.isEmpty || mark.label.localizedCaseInsensitiveContains(fragment)
      {
        options.insert(HashOption(value: .mark(mark)), at: 0)
      }
      if let tag, fragment.isEmpty || tag.localizedCaseInsensitiveContains(fragment) {
        options.append(HashOption(value: .tag(tag)))
      }
      return options
    }
    return cardOrder.prefix(8).compactMap { id in
      workspace.model(id).map { HashOption(value: .card(id, $0.title, $0.kind.icon)) }
    }
  }

  func selected(_ option: HashOption) -> Bool {
    switch option.value {
    case .mark(let value): mark == value
    case .tag(let value): tag == value
    case .card: false
    }
  }

  func suggestionKind(_ option: HashOption) -> String? {
    guard case .card(let id, _, _) = option.value else { return nil }
    return workspace.model(id)?.kind.label
  }

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
  @discardableResult func scheduleSearch(_ text: String) -> Task<Void, Never> {
    searchTask?.cancel()
    pendingQuery = text
    let task = Task { [weak self] in
      do { try await Task.sleep(for: .milliseconds(Int(AppleMetrics.searchDelay))) } catch {
        return
      }
      guard !Task.isCancelled, let self else { return }
      self.search(text)
    }
    searchTask = task
    return task
  }

  func select(_ next: Scope) {
    let trace = PerformanceTrace.shared.begin(.selectScope)
    defer { PerformanceTrace.shared.end(trace) }
    guard next != scope else { return }
    positions[scope] = Position(offset: scrollOffset, limit: pageLimit)
    searchTask?.cancel()
    if let pendingQuery { query = pendingQuery }
    pendingQuery = nil
    scope = next
    if mark?.scope == next { mark = nil }
    let saved = positions[next]
    pageLimit = saved?.limit ?? Feed.page
    requestScroll(to: saved?.offset ?? 0)
    rebuild()
  }

  func search(_ text: String) {
    searchTask?.cancel()
    pendingQuery = nil
    let trace = PerformanceTrace.shared.begin(.search)
    defer { PerformanceTrace.shared.end(trace) }
    guard text != query else { return }
    query = text
    // The chip row leaves with the text; a hidden chip never keeps filtering.
    if Feed.searchText(text).isEmpty { kind = nil }
    applyFilter()
  }

  func selectKind(_ next: CardKind?) {
    guard next != kind else { return }
    kind = next
    applyFilter()
  }

  /// A picked # option becomes a token; returns the text without the typed fragment.
  @discardableResult func pick(_ option: HashOption, in text: String) -> String {
    switch option.value {
    case .mark(let next): mark = next.scope == scope ? nil : next
    case .tag(let next): tag = next
    case .card: return text
    }
    let rest =
      text.range(of: #"(^|\s)#\S*$"#, options: .regularExpression).map {
        String(text[..<$0.lowerBound])
      } ?? text
    searchTask?.cancel()
    pendingQuery = nil
    query = rest.trimmingCharacters(in: .whitespaces)
    applyFilter()
    return query
  }

  func removeMark() {
    guard mark != nil else { return }
    mark = nil
    applyFilter()
  }

  func removeTag() {
    guard tag != nil else { return }
    tag = nil
    applyFilter()
  }

  /// Esc with only tokens left: the # conditions and the tab go at once.
  func clearTokens() {
    mark = nil
    tag = nil
    scope = .all
    applyFilter()
  }

  func clearFilter() {
    searchTask?.cancel()
    pendingQuery = nil
    query = ""
    kind = nil
    mark = nil
    tag = nil
    scope = .all
    applyFilter()
  }

  /// Returning to the top keeps the user's scope, query and conditions intact.
  func scrollToTop() { requestScroll(to: 0) }

  func recordScroll(_ offset: CGFloat) {
    // Shrinking the old document can send bounds changes before the new scope is laid out.
    guard scrollRequest == nil else { return }
    scrollOffset = max(0, offset)
  }

  func restoredScroll(_ request: ScrollRequest, at offset: CGFloat) {
    guard scrollRequest == request else { return }
    scrollOffset = max(0, offset)
    scrollRequest = nil
  }

  private func requestScroll(to offset: CGFloat) {
    scrollSequence += 1
    scrollOffset = offset
    scrollRequest = ScrollRequest(id: scrollSequence, offset: offset)
  }

  private func applyFilter() {
    pageLimit = Feed.page
    requestScroll(to: 0)
    rebuild()
  }

  func loadMore() {
    guard hasMore else { return }
    pageLimit += Feed.page
    rebuild(keepClock: true, animate: false)
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

  private func rebuild(keepClock: Bool = false, animate: Bool = true) {
    animateChanges = animate && entered
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
    let text = Feed.searchText(query).lowercased()
    let shelved = workspace.cards.reduce(0) { $0 + (state($1.id).archived ? 1 : 0) }
    if shelved != shelfCount { shelfCount = shelved }
    // Saves, pagination and catalog updates keep existing cards in their current order.
    let ranked = FeedPolicy.sort(
      workspace.cards, mode: workspace.preferences.feedSort, state: state, now: now)
    for card in ranked where order[card.id] == nil { order[card.id] = order.count }
    let matched = workspace.cards.filter { card in
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
      switch mark {
      case nil: break
      case .unread: if s.read { return false }
      case .saved: if !s.bookmarked { return false }
      case .later: if !s.later { return false }
      }
      if let tag, !s.tags(of: card).contains(tag) { return false }
      return text.isEmpty || matches(card, state: s, text: text)
    }
    // Chips list the types that have results with this text, whatever chip is picked.
    let found = text.isEmpty ? [] : Set(matched.map(\.kind))
    if found != kinds { kinds = found }
    let cards = matched.filter { kind == nil || $0.kind == kind }
      .sorted { order[$0.id, default: 0] < order[$1.id, default: 0] }

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
