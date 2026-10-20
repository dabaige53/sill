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
  @Environment(CardDrag.self) private var drag
  @Environment(CardMenu.self) private var menu
  @Environment(Panels.self) private var panels
  @State private var scroll: FeedScroll?
  @State private var cardIntents = CardIntents()
  @State private var readerIntents = ReaderIntents()
  @State private var selectionIntents = SelectionIntents()
  /// The AI box comes back only after the selection bar has left.
  @State private var dockShown = true
  @State private var escape: Any?

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
        ZStack(alignment: .bottom) {
          AIDock()
            .opacity(dockShown || drag.active ? 1 : 0)
            .allowsHitTesting(dockShown || drag.active)
          if barShown {
            SelectionBar(intents: selectionIntents)
              .transition(.opacity.combined(with: .offset(y: AppleMetrics.motionBarTravel)))
          }
        }
        .animation(Motion.menuOpen, value: selection.active)
        .padding(.horizontal, AppleMetrics.railEdge)
        .modifier(
          Tuck(tucked: chrome.tucked && !drag.active, travel: AppleMetrics.motionRailTravel)
        )
        .frame(maxHeight: .infinity, alignment: .bottom)
        .padding(.bottom, AppleMetrics.railEdge)
        if drag.active, drag.moved {
          DragPile(cardWidth: geometry.columnWidth)
        }
        ReaderOverlay()
        PanelOverlay()
        // Over an open detail too (Web moves `#toast` into the dialog).
        Toast(hidden: drag.active)
      }
      .ignoresSafeArea(edges: .top)
    }
    .environment(\.cardIntents, cardIntents)
    .environment(\.readerIntents, readerIntents)
    .onAppear { connect() }
    .task { await poll() }
    .onChange(of: shell.searchFocused) { pinChrome() }
    .onChange(of: shell.menu.open) { pinChrome() }
    .onChange(of: drag.active) { pinChrome() }
    .onChange(of: barShown) { _, shown in
      if shown {
        dockShown = false
      } else if drag.active {
        dockShown = true
      } else {
        Task {
          try? await Task.sleep(for: .seconds(AppleMetrics.motionMenuOpen))
          if !barShown { dockShown = true }
        }
      }
    }
    .onChange(of: workspace.preferences) { _, value in feed.preferencesChanged(value) }
    .onChange(of: workspace.catalogVersion) {
      selection.prune()
      reader.prune()
      ai.prune { workspace.model($0) != nil }
    }
    .onChange(of: reader.presented) { _, open in
      PointerRouter.shared.enabled = !open && panels.kind == nil
      if open { menu.close() }
    }
    .onChange(of: panels.kind) { _, kind in
      PointerRouter.shared.enabled = kind == nil && !reader.presented
      if kind != nil { menu.close() }
    }
  }

  /// Changes made elsewhere (an external assistant, the CLI) arrive every 5s while the window is
  /// in front and nothing is waiting to be written.
  private func poll() async {
    while !Task.isCancelled {
      try? await Task.sleep(for: .seconds(5))
      if NSApp.isActive, workspace.queue.idle { workspace.refresh(quiet: true) }
    }
  }

  private func pinChrome() {
    chrome.pinned = shell.searchFocused || shell.menu.open || drag.active
  }

  /// The selection bar replaces the AI box while cards are selected, except while carrying them.
  private var barShown: Bool { selection.active && !drag.active }

  private func scrollToTop() {
    if feed.filtering { feed.clearFilter() }
    scroll?.scroll(to: 0, animated: true)
  }

  // MARK: Wiring

  /// Esc, nearest first: a carried pile drops back, then an open card menu closes, then the
  /// selection ends. The reader and the search field handle their own Esc.
  private func installEscape() {
    guard escape == nil else { return }
    let drag = drag
    let menu = menu
    let selection = selection
    let reader = reader
    let shell = shell
    let panels = panels
    let workspace = workspace
    escape = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { event in
      guard event.keyCode == 53 else { return event }
      let typing = event.window?.firstResponder is NSText
      let handled = MainActor.assumeIsolated {
        guard !reader.presented, panels.kind == nil, !shell.searchFocused else { return false }
        if drag.active {
          drag.cancel()
        } else if let id = menu.id {
          menu.close()
          workspace.state(id).requestFocus()
        } else if selection.active, !typing {
          selection.clear()
        } else {
          return false
        }
        return true
      }
      return handled ? nil : event
    }
  }

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
    cardIntents.select = { [weak feed] id, range in
      selection.select(id, range: range, order: feed?.cardOrder ?? [])
    }
    let drag = drag
    let ai = ai
    cardIntents.carry = CardCarry(
      begin: { id, point in
        selection.select(id, add: true)
        drag.begin(selection.ids, at: point)
      },
      move: { point in drag.move(to: point) },
      end: { point in
        guard let ids = drag.end(at: point) else { return }
        ai.add(ids)
        selection.clear()
      })
    let menu = menu
    cardIntents.menu = { id in menu.toggle(id) }
    cardIntents.bookmark = { id in workspace.toggleBookmark(id) }
    cardIntents.later = { id in workspace.toggleLater(id) }
    cardIntents.toggleRead = { id in workspace.toggleRead(id) }
    selectionIntents.bookmark = {
      workspace.mark(selection.ids, .bookmarked)
      selection.clear()
    }
    selectionIntents.later = {
      workspace.mark(selection.ids, .later)
      selection.clear()
    }
    selectionIntents.tag = {
      let ids = selection.ids
      selection.clear()
      cardIntents.edit(ids)
    }
    selectionIntents.toAI = {
      ai.add(selection.ids)
      selection.clear()
      // The bar leaves first (180ms); the AI box takes focus once it is back.
      Task {
        try? await Task.sleep(for: .milliseconds(200))
        ai.requestFocus()
      }
    }
    selectionIntents.cancel = { selection.clear() }
    installEscape()
    cardIntents.toggleTask = { id, task in workspace.toggleTask(id, task: task) }
    // Web `changeReminder`: the card leaves the selection and an open detail closes first.
    let reminder: @MainActor (String, Workspace.ReminderAction) -> Void = { id, action in
      if selection.contains(id) { selection.toggle(id) }
      if reader.presented { reader.closeAll() }
      workspace.changeReminder(id, action)
    }
    cardIntents.reminder = reminder
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
      case .snooze: reminder(id, .snooze)
      case .restoreReminder: reminder(id, .restore)
      case .dismiss: reminder(id, .dismiss)
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
