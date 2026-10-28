import AppKit
import SillKit
import SwiftUI

/// A native scrolling/reuse boundary. Models, card drawing and intents remain in SwiftUI.
struct NativeFeed: NSViewRepresentable {
  let entries: [FeedEntry]
  let empty: Feed.Empty
  let shelfCount: Int
  let geometry: ColumnGeometry
  let cardContext: CardContext
  let catalogVersion: Int
  let topInset: CGFloat
  let workspaceOrigin: CGPoint
  let scroll: FeedScroll

  enum Row: Equatable {
    case entry(FeedEntry)
    case empty(Feed.Empty)
    case shelf(Int)
    var id: String {
      switch self {
      case .entry(let entry): "entry:" + entry.id
      case .empty: "empty"
      case .shelf: "shelf"
      }
    }
    var isEmpty: Bool { if case .empty = self { true } else { false } }
    var extraSpacing: CGFloat {
      if case .entry(let entry) = self, entry.isStack { AppleMetrics.stackLayoutExtra } else { 0 }
    }
  }

  func makeCoordinator() -> Coordinator { Coordinator(scroll: scroll) }

  func makeNSView(context: Context) -> NSScrollView {
    let view = NSScrollView()
    view.drawsBackground = false
    view.hasVerticalScroller = false
    view.hasHorizontalScroller = false
    view.verticalScrollElasticity = .none
    view.horizontalScrollElasticity = .none
    view.automaticallyAdjustsContentInsets = true
    context.coordinator.connect(view)
    return view
  }

  func updateNSView(_ view: NSScrollView, context: Context) {
    context.coordinator.update(
      self, environment: context.environment,
      animated: context.transaction.animation != nil && !context.transaction.disablesAnimations)
  }

  static func dismantleNSView(_ view: NSScrollView, coordinator: Coordinator) {
    coordinator.disconnect()
  }

  @MainActor
  final class Coordinator: NSObject, NSCollectionViewDataSource, NSGestureRecognizerDelegate {
    let collection = NSCollectionView()
    let layout = FeedCollectionLayout()
    let viewport = FeedViewportSpace()
    private let scroll: FeedScroll
    private var rows: [Row] = []
    private var environment: EnvironmentValues?
    private var cardContext: CardContext?
    private var catalogVersion: Int?
    private var observer: NSObjectProtocol?
    private var resignObserver: NSObjectProtocol?
    private var wheel: Any?
    private var pendingHeights: [String: CGFloat] = [:]
    private var heightUpdateQueued = false
    private var scrollUpdateQueued = false
    private var updating = false
    private var pulling = false
    private static let identifier = NSUserInterfaceItemIdentifier("feed-card")

    init(scroll: FeedScroll) { self.scroll = scroll }

    func connect(_ view: NSScrollView) {
      viewport.view = view
      scroll.scrollView = view
      collection.collectionViewLayout = layout
      collection.dataSource = self
      collection.backgroundColors = [.clear]
      collection.isSelectable = false
      collection.register(FeedCollectionItem.self, forItemWithIdentifier: Self.identifier)
      collection.autoresizingMask = [.width]
      collection.frame = view.bounds
      view.documentView = collection
      view.contentView.postsBoundsChangedNotifications = true
      observer = NotificationCenter.default.addObserver(
        forName: NSView.boundsDidChangeNotification, object: view.contentView, queue: .main
      ) { [weak self] _ in
        MainActor.assumeIsolated { self?.scheduleScrollUpdate() }
      }
      wheel = NSEvent.addLocalMonitorForEvents(matching: .scrollWheel) { [weak self] event in
        nonisolated(unsafe) let event = event
        return MainActor.assumeIsolated { self?.scroll.receive(event) == true } ? nil : event
      }
      let pan = NSPanGestureRecognizer(target: self, action: #selector(pull(_:)))
      pan.delegate = self
      collection.addGestureRecognizer(pan)
      resignObserver = NotificationCenter.default.addObserver(
        forName: NSWindow.didResignKeyNotification, object: nil, queue: .main
      ) { [weak self] _ in
        MainActor.assumeIsolated {
          guard let self, self.pulling else { return }
          self.pulling = false
          self.scroll.refresh.release(cancelled: true)
        }
      }
    }

    func update(_ feed: NativeFeed, environment: EnvironmentValues, animated: Bool) {
      updating = true
      defer { updating = false }
      self.environment = environment
      viewport.origin = feed.workspaceOrigin
      var next: [Row] = feed.empty == .none ? feed.entries.map(Row.entry) : [.empty(feed.empty)]
      if feed.shelfCount > 0 { next.append(.shelf(feed.shelfCount)) }
      let widthChanged = layout.geometry.columnWidth != feed.geometry.columnWidth
      let resized = layout.geometry != feed.geometry
      let changedContext = cardContext != feed.cardContext || catalogVersion != feed.catalogVersion
      let changedRows = rows != next
      let changedInset = layout.topInset != feed.topInset
      let anchor = visibleAnchor()
      let previous = rows
      let appended = next.count >= previous.count && Array(next.prefix(previous.count)) == previous
      rows = next
      cardContext = feed.cardContext
      catalogVersion = feed.catalogVersion
      layout.geometry = feed.geometry
      layout.topInset = feed.topInset
      layout.rows = next
      if resized || (changedRows && !appended) {
        layout.assignments.removeAll(keepingCapacity: true)
      }
      if widthChanged {
        layout.heights.removeAll(keepingCapacity: true)
        pendingHeights.removeAll(keepingCapacity: true)
      } else if changedRows {
        let old = Dictionary(uniqueKeysWithValues: previous.map { ($0.id, $0) })
        let current = Dictionary(uniqueKeysWithValues: next.map { ($0.id, $0) })
        layout.heights = layout.heights.filter { id, _ in
          current[id] != nil && old[id] == current[id]
        }
      }
      guard resized || changedContext || changedRows || changedInset else { return }
      layout.invalidateLayout()
      layout.prepare()
      if changedRows {
        // Appending a page must not destroy or animate the cards already on screen.
        if !previous.isEmpty, next.count > previous.count,
          Array(next.prefix(previous.count)) == previous
        {
          let added = Set((previous.count..<next.count).map { IndexPath(item: $0, section: 0) })
          NSAnimationContext.runAnimationGroup { context in
            context.duration = 0
            collection.insertItems(at: added)
          }
        } else if previous.isEmpty || next.isEmpty {
          collection.reloadData()
        } else {
          // Let AppKit move existing items instead of recreating the entire visible page.
          let changes = next.map(\.id).difference(from: previous.map(\.id)).inferringMoves()
          NSAnimationContext.runAnimationGroup { context in
            context.duration = animated ? AppleMetrics.motionLayout : 0
            context.timingFunction = CAMediaTimingFunction(
              controlPoints: Float(AppleMetrics.easeX1), Float(AppleMetrics.easeY1),
              Float(AppleMetrics.easeX2), Float(AppleMetrics.easeY2))
            collection.performBatchUpdates {
              for change in changes {
                switch change {
                case .remove(let from, _, let to):
                  let start = IndexPath(item: from, section: 0)
                  if let to {
                    collection.moveItem(at: start, to: IndexPath(item: to, section: 0))
                  } else {
                    collection.deleteItems(at: [start])
                  }
                case .insert(let to, _, let from):
                  if from == nil { collection.insertItems(at: [IndexPath(item: to, section: 0)]) }
                }
              }
            }
          }
        }
      }
      if resized || changedContext || changedRows {
        let old = Dictionary(uniqueKeysWithValues: previous.map { ($0.id, $0) })
        for item in collection.visibleItems() {
          guard let path = collection.indexPath(for: item), rows.indices.contains(path.item),
            let item = item as? FeedCollectionItem
          else { continue }
          let row = rows[path.item]
          if resized || changedContext || old[row.id] != row { configure(item, row: row) }
        }
      }
      collection.layoutSubtreeIfNeeded()
      restore(anchor)
      scheduleScrollUpdate()
    }

    func collectionView(_ collectionView: NSCollectionView, numberOfItemsInSection section: Int)
      -> Int
    {
      rows.count
    }

    func collectionView(
      _ collectionView: NSCollectionView, itemForRepresentedObjectAt indexPath: IndexPath
    ) -> NSCollectionViewItem {
      let item = collectionView.makeItem(withIdentifier: Self.identifier, for: indexPath)
      if let item = item as? FeedCollectionItem { configure(item, row: rows[indexPath.item]) }
      return item
    }

    private func configure(_ item: FeedCollectionItem, row: Row) {
      guard let environment, let cardContext else { return }
      item.space.viewport = viewport
      let width = row.isEmpty ? layout.geometry.width : layout.geometry.columnWidth
      item.configure(
        row: row, context: cardContext, width: width, environment: environment
      ) { [weak self] height in self?.measured(height, id: row.id) }
    }

    private func measured(_ height: CGFloat, id: String) {
      guard height.isFinite, height > 0, rows.contains(where: { $0.id == id }) else { return }
      let height = ceil(height)
      guard layout.heights[id] != height else { return }
      pendingHeights[id] = height
      guard !heightUpdateQueued else { return }
      heightUpdateQueued = true
      DispatchQueue.main.async { [weak self] in
        guard let self else { return }
        self.heightUpdateQueued = false
        let anchor = self.visibleAnchor()
        self.layout.heights.merge(self.pendingHeights) { _, new in new }
        self.pendingHeights.removeAll(keepingCapacity: true)
        self.layout.invalidateLayout()
        self.layout.prepare()
        self.collection.layoutSubtreeIfNeeded()
        self.restore(anchor)
        self.scheduleScrollUpdate()
      }
    }

    private func visibleAnchor() -> (id: String, distance: CGFloat)? {
      guard let view = viewport.view, scroll.offset > 0 else { return nil }
      let visible = view.contentView.bounds
      guard
        let item = layout.layoutAttributesForElements(in: visible)
          .min(by: { $0.frame.minY < $1.frame.minY }), let path = item.indexPath,
        rows.indices.contains(path.item)
      else { return nil }
      return (rows[path.item].id, item.frame.minY - visible.minY)
    }

    private func restore(_ anchor: (id: String, distance: CGFloat)?) {
      guard let anchor, let index = rows.firstIndex(where: { $0.id == anchor.id }),
        let view = viewport.view,
        let item = layout.layoutAttributesForItem(at: IndexPath(item: index, section: 0))
      else { return }
      let clip = view.contentView
      let maximum = max(
        -clip.contentInsets.top, layout.collectionViewContentSize.height - clip.bounds.height)
      let y = min(maximum, max(-clip.contentInsets.top, item.frame.minY - anchor.distance))
      if abs(y - clip.bounds.minY) > 0.5 {
        clip.scroll(to: NSPoint(x: 0, y: y))
        view.reflectScrolledClipView(clip)
      }
    }

    private func scheduleScrollUpdate() {
      guard !scrollUpdateQueued else { return }
      scrollUpdateQueued = true
      DispatchQueue.main.async { [weak self] in
        guard let self else { return }
        self.scrollUpdateQueued = false
        guard !self.updating, let view = self.viewport.view else { return }
        self.scroll.scrolled(
          offset: view.contentView.bounds.minY, top: view.contentView.contentInsets.top,
          visible: view.contentView.bounds.height,
          content: self.layout.collectionViewContentSize.height)
      }
    }

    func gestureRecognizerShouldBegin(_ gestureRecognizer: NSGestureRecognizer) -> Bool {
      guard let pan = gestureRecognizer as? NSPanGestureRecognizer else { return true }
      let delta = pan.translation(in: collection)
      let point = pan.location(in: collection)
      let start = CGPoint(x: point.x - delta.x, y: point.y - delta.y)
      return scroll.refreshAllowed() && scroll.offset <= 0 && delta.y > abs(delta.x)
        && collection.indexPathForItem(at: start) == nil
    }

    @objc private func pull(_ pan: NSPanGestureRecognizer) {
      switch pan.state {
      case .began, .changed:
        pulling = true
        guard scroll.refreshAllowed(), scroll.offset <= 0 else {
          scroll.refresh.release(cancelled: true)
          pulling = false
          return
        }
        scroll.chrome.show()
        scroll.refresh.drag(max(0, pan.translation(in: collection).y))
      case .ended, .cancelled, .failed:
        if pulling {
          scroll.refresh.release(cancelled: pan.state != .ended || !scroll.refreshAllowed())
        }
        pulling = false
      default: break
      }
    }

    func disconnect() {
      if let observer { NotificationCenter.default.removeObserver(observer) }
      if let resignObserver { NotificationCenter.default.removeObserver(resignObserver) }
      if let wheel { NSEvent.removeMonitor(wheel) }
      observer = nil
      resignObserver = nil
      wheel = nil
      scroll.refresh.cancel()
      if scroll.scrollView === viewport.view { scroll.scrollView = nil }
      viewport.view = nil
      collection.dataSource = nil
    }
  }
}

@MainActor private final class FeedCollectionItem: NSCollectionViewItem {
  let space = FeedCellSpace()
  private var host: NSHostingView<AnyView>?

  override func loadView() {
    let host = NSHostingView(rootView: AnyView(EmptyView()))
    host.sizingOptions = []
    host.safeAreaRegions = []
    self.host = host
    space.host = host
    view = host
  }

  func configure(
    row: NativeFeed.Row, context: CardContext, width: CGFloat, environment: EnvironmentValues,
    measured: @escaping (CGFloat) -> Void
  ) {
    _ = view
    host?.rootView = AnyView(
      FeedCollectionContent(row: row, context: context)
        .frame(width: width)
        .fixedSize(horizontal: false, vertical: true)
        .onGeometryChange(for: CGSize.self) {
          $0.size
        } action: {
          measured($0.height)
        }
        .frame(maxHeight: .infinity, alignment: .top)
        .id(row.id)
        .environment(\.self, environment)
        .environment(\.feedCellSpace, space))
  }

  override func prepareForReuse() {
    super.prepareForReuse()
    host?.rootView = AnyView(EmptyView())
  }
}

private struct FeedCollectionContent: View {
  let row: NativeFeed.Row
  let context: CardContext
  var body: some View {
    switch row {
    case .entry(let entry): FeedEntryView(entry: entry, context: context)
    case .empty(let empty): EmptyFeed(empty: empty)
    case .shelf(let count): ShelfEntry(count: count)
    }
  }
}
