import AppKit
import SillKit
import SwiftUI

/// The desktop window: the card area under a top bar drawn in the content (the title bar is
/// transparent, only the traffic lights remain), the AI box at the bottom, and the reading overlay
/// over everything. Opening a card adds the overlay; nothing under it lays out again.
struct DesktopView: View {
  @Environment(Workspace.self) private var workspace
  @Environment(Feed.self) private var feed
  @Environment(Selection.self) private var selection
  @Environment(Reader.self) private var reader
  @Environment(Chrome.self) private var chrome
  @Environment(Shell.self) private var shell
  @Environment(AIContext.self) private var ai
  @State private var scroll: FeedScroll?
  @State private var cardIntents = CardIntents()
  @State private var readerIntents = ReaderIntents()

  var body: some View {
    GeometryReader { proxy in
      let width = ColumnGeometry.feedWidth(window: proxy.size.width)
      let geometry = ColumnGeometry(width: width, preferences: workspace.preferences)
      let edge = (proxy.size.width - width) / 2 + geometry.inset
      ZStack(alignment: .top) {
        AppleColors.canvas.ignoresSafeArea()
        if let scroll {
          FeedView(
            geometry: geometry, scroll: scroll,
            topInset: AppleMetrics.topBarInset + AppleMetrics.space60 + AppleMetrics.space40)
        }
        if shell.menu.open {
          // A click anywhere else closes the tab menu.
          Color.clear.contentShape(Rectangle())
            .onTapGesture { shell.menu.close() }
            .accessibilityHidden(true)
        }
        TopBar(edge: edge, menu: shell.menu) { scrollToTop() }
        AIDock()
          .padding(.horizontal, AppleMetrics.railEdge)
          .modifier(Tuck(tucked: chrome.tucked, travel: AppleMetrics.motionRailTravel))
          .frame(maxHeight: .infinity, alignment: .bottom)
          .padding(.bottom, AppleMetrics.railEdge)
        Toast()
        ReaderOverlay()
      }
      .ignoresSafeArea(edges: .top)
    }
    .environment(\.cardIntents, cardIntents)
    .environment(\.readerIntents, readerIntents)
    .onAppear { connect() }
    .task { await poll() }
    .onChange(of: shell.searchFocused) { pinChrome() }
    .onChange(of: shell.menu.open) { pinChrome() }
    .onChange(of: workspace.preferences) { _, value in feed.preferencesChanged(value) }
    .onChange(of: workspace.catalogVersion) {
      selection.prune()
      reader.prune()
      ai.prune { workspace.model($0) != nil }
    }
    .onChange(of: reader.presented) { _, open in PointerRouter.shared.enabled = !open }
  }

  /// Changes made elsewhere (an external assistant, the CLI) arrive every 5s while the window is
  /// in front and nothing is waiting to be written.
  private func poll() async {
    while !Task.isCancelled {
      try? await Task.sleep(for: .seconds(5))
      if NSApp.isActive, workspace.queue.idle { workspace.refresh(quiet: true) }
    }
  }

  private func pinChrome() { chrome.pinned = shell.searchFocused || shell.menu.open }

  private func scrollToTop() {
    if feed.filtering { feed.clearFilter() }
    scroll?.scroll(to: 0, animated: true)
  }

  // MARK: Wiring

  private func connect() {
    if scroll == nil {
      let next = FeedScroll(chrome: chrome)
      next.nearEnd = { [weak feed] in feed?.loadMore() }
      scroll = next
    }
    let workspace = workspace
    let reader = reader
    let selection = selection
    cardIntents.open = { id in
      if selection.active {
        selection.toggle(id)
      } else {
        reader.open(id)
      }
    }
    cardIntents.select = { id in selection.toggle(id) }
    cardIntents.toggleTask = { id, task in workspace.toggleTask(id, task: task) }
    cardIntents.reminder = { id, action in workspace.changeReminder(id, action) }
    cardIntents.join = { id in
      if let url = workspace.model(id)?.meeting?.url { NSWorkspace.shared.open(url) }
    }
    cardIntents.openStack = { [weak feed] key in
      withAnimation(Motion.layout) { feed?.openStack(key) }
    }
    cardIntents.closeStack = { [weak feed] key in
      withAnimation(Motion.layout) { feed?.closeStack(key) }
    }
    readerIntents.perform = { kind, id in
      switch kind {
      case .bookmark: workspace.toggleBookmark(id)
      case .later: workspace.toggleLater(id)
      case .snooze: workspace.changeReminder(id, .snooze)
      case .restoreReminder: workspace.changeReminder(id, .restore)
      case .dismiss: workspace.changeReminder(id, .dismiss)
      case .open, .reply:
        if let url = workspace.model(id)?.url { NSWorkspace.shared.open(url) }
      case .join:
        if let url = workspace.model(id)?.meeting?.url { NSWorkspace.shared.open(url) }
      case .tag, .download:
        // Tags and note, and the calendar file, arrive with their own groups.
        break
      }
    }
    reader.onClosed = { origin in
      guard let origin, Keyboard.focusVisible else { return }
      workspace.state(origin).requestFocus()
    }
  }
}
