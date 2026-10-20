import Observation

/// Multi-select. Each card draws its own `selected` flag; the feed observes only whether a
/// selection exists, which changes when the first card is added or the last one removed.
@MainActor @Observable final class Selection {
  private(set) var active = false
  /// Shown in the selection bar.
  private(set) var count = 0
  @ObservationIgnored private(set) var ids: [String] = []
  @ObservationIgnored private unowned let workspace: Workspace

  init(workspace: Workspace) { self.workspace = workspace }

  func contains(_ id: String) -> Bool { ids.contains(id) }

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
