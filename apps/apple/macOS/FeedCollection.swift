import SillKit
import SwiftUI

struct FeedEntry: Identifiable {
  let id: String
  let cards: [Card]
}

struct FeedCollection<Content: View>: View {
  let entries: [FeedEntry]
  let pageLimit: Int
  let viewportHeight: CGFloat
  let columns: Int
  let spacing: CGFloat
  let maximumWidth: CGFloat
  var settled: () -> Void = {}
  @ViewBuilder let content: (FeedEntry) -> Content
  @Environment(Workspace.self) private var model
  @State private var displayed: [FeedEntry] = []
  @State private var exiting: Set<String> = []
  @State private var additions: Set<String> = []
  @State private var initialIDs: Set<String> = []
  @State private var initialized = false
  @State private var lastLimit = 0
  @State private var generation = 0
  private var visible: [FeedEntry] {
    let latest = Dictionary(uniqueKeysWithValues: entries.prefix(pageLimit).map { ($0.id, $0) })
    return displayed.map { latest[$0.id] ?? $0 }
  }
  var body: some View {
    MasonryLayout(columns: columns, spacing: spacing, maximumColumnWidth: maximumWidth) {
      ForEach(Array(visible.enumerated()), id: \.element.id) { index, entry in
        content(entry)
          .modifier(
            FeedEntrance(
              initial: initialIDs.contains(entry.id) && !additions.contains(entry.id),
              added: additions.contains(entry.id),
              index: index, viewportHeight: viewportHeight,
              animate: initialIDs.contains(entry.id) || additions.contains(entry.id))
          )
          .opacity(exiting.contains(entry.id) ? 0 : 1)
          .allowsHitTesting(!exiting.contains(entry.id))
          .accessibilityHidden(exiting.contains(entry.id))
          .modifier(MasonryMotion(frozen: entry.cards.contains { $0.id == model.cardMenuID }))
          .zIndex(
            entry.cards.contains { $0.id == model.cardMenuID || $0.id == model.activeDeckID }
              ? 1 : 0)
      }
    }
    .onChange(of: entries.prefix(pageLimit).map(\.id), initial: true) { _, _ in reconcile() }
    .onChange(of: model.feedScope) { reconcile() }
  }
  private func reconcile() {
    let next = Array(entries.prefix(pageLimit))
    let nextIDs = Set(next.map(\.id))
    let oldIDs = Set(displayed.map(\.id))
    let removed = oldIDs.subtracting(nextIDs)
    let inserted = nextIDs.subtracting(oldIDs)
    generation += 1
    let current = generation
    if !initialized {
      initialIDs = nextIDs
      displayed = next
      initialized = !next.isEmpty
      // Keep the first batch marked until its entrance views have mounted.
      if initialized {
        Task { @MainActor in
          await Task.yield()
          if generation == current {
            lastLimit = pageLimit
            settled()
          }
        }
      } else {
        settled()
      }
      return
    }
    if pageLimit <= lastLimit { additions.formUnion(inserted) }
    lastLimit = pageLimit
    var retained = displayed
    for (index, entry) in next.enumerated() where inserted.contains(entry.id) {
      retained.insert(entry, at: min(index, retained.count))
    }
    displayed = retained
    withAnimation(NativeMotion.ease(AppleMetrics.motionFast), completionCriteria: .removed) {
      exiting = removed
    } completion: {
      guard current == generation else { return }
      displayed = Array(entries.prefix(pageLimit))
      exiting.removeAll()
      additions.formIntersection(Set(displayed.map(\.id)))
      settled()
    }
  }
}

private struct FeedEntrance: ViewModifier {
  let initial: Bool
  let added: Bool
  let index: Int
  let viewportHeight: CGFloat
  let animate: Bool
  @State private var visible = false
  @State private var frame = CGRect.zero
  func body(content: Content) -> some View {
    content.opacity(visible ? 1 : 0)
      .offset(
        y: visible ? 0 : added ? -AppleMetrics.motionDetailEnterY : AppleMetrics.motionDetailEnterY
      )
      .onGeometryChange(for: CGRect.self) {
        $0.frame(in: .named("feed-viewport"))
      } action: {
        frame = $0
      }
      .task {
        await Task.yield()
        guard !Task.isCancelled, !visible else { return }
        let inFirstScreen = frame.minY < viewportHeight && frame.maxY > 0
        let delay =
          initial && index < Int(AppleMetrics.motionFirstCount)
          ? Double(index) * AppleMetrics.motionStagger : 0
        withAnimation(
          animate && (added || inFirstScreen)
            ? NativeMotion.ease(AppleMetrics.motionLayout).delay(delay) : nil
        ) { visible = true }
      }
  }
}
