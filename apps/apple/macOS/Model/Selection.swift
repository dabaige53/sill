import Observation

/// Multi-select. Each card draws its own `selected` flag; the feed observes only whether a
/// selection exists, which changes when the first card is added or the last one removed.
@MainActor @Observable final class Selection {
  private(set) var active = false
  /// Shown in the selection bar.
  private(set) var count = 0
  @ObservationIgnored private(set) var ids: [String] = []
  /// Where a shift-click range starts (Web `selectAnchor`).
  @ObservationIgnored private var anchor: String?
  @ObservationIgnored private unowned let workspace: Workspace

  init(workspace: Workspace) { self.workspace = workspace }

  func contains(_ id: String) -> Bool { ids.contains(id) }

  /// Web `select`: shift extends from the anchor over the cards in feed order; `add` only adds;
  /// otherwise the card toggles. The card becomes the new anchor.
  func select(_ id: String, range: Bool = false, add: Bool = false, order: [String] = []) {
    if range, let anchor, let from = order.firstIndex(of: anchor), let to = order.firstIndex(of: id)
    {
      let span = order[min(from, to)...max(from, to)]
      set(ids + span.filter { !ids.contains($0) })
    } else if add || !ids.contains(id) {
      if !ids.contains(id) { set(ids + [id]) }
    } else {
      set(ids.filter { $0 != id })
    }
    anchor = id
  }

  func toggle(_ id: String) {
    if let index = ids.firstIndex(of: id) {
      ids.remove(at: index)
      workspace.state(id).selected = false
    } else {
      ids.append(id)
      workspace.state(id).selected = true
    }
    sync()
  }

  func set(_ next: [String]) {
    for id in ids where !next.contains(id) { workspace.state(id).selected = false }
    for id in next where !ids.contains(id) { workspace.state(id).selected = true }
    ids = next
    sync()
  }

  func clear() { set([]) }

  /// Drop cards that no longer exist.
  func prune() { set(ids.filter { workspace.model($0) != nil }) }

  private func sync() {
    if count != ids.count { count = ids.count }
    if active != !ids.isEmpty { active = !ids.isEmpty }
  }
}
