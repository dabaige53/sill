import AppKit
import SillKit
import SwiftUI

/// The desktop window: the card area under a top bar drawn in the content (the title bar is
/// transparent, only the traffic lights remain), the AI box at the bottom, and the reading overlay
/// over everything. Opening a card adds the overlay; nothing under it lays out again.
struct DesktopView: View {
  @Environment(DesktopInteraction.self) private var interaction
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
  @Environment(NewContent.self) private var newContent
  @State private var scroll: FeedScroll?
  @State private var cardIntents = CardIntents()
  @State private var readerIntents = ReaderIntents()
  @State private var selectionIntents = SelectionIntents()
  /// The AI box comes back only after the selection bar has left.
  @State private var dockShown = true
  @State private var escape: Any?
  @State private var keys: Any?
  @State private var pointer: Any?

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
            topInset: feedTopInset
          )
          .modifier(FeedTopBar(header: TopBar(edge: edge, menu: shell.menu) { scrollToTop() }))
        }
        if shell.menu.open {
          // A click anywhere else closes the tab menu.
          Color.clear.contentShape(Rectangle())
            .onTapGesture { shell.menu.close() }
            .padding(.top, (AppleMetrics.topBarInset / 2) + AppleMetrics.space64)
            .accessibilityHidden(true)
        }
        if #available(macOS 26.0, *) {
          // The feed owns the native scroll-edge bar.
        } else {
          TopBar(edge: edge, menu: shell.menu) { scrollToTop() }
        }
        if let scroll {
          FeedRefreshIndicator(refresh: scroll.refresh)
            .padding(
              .top,
              (AppleMetrics.topBarInset / 2) + (AppleMetrics.space64 - AppleMetrics.hitTarget) / 2)
        }
        ZStack(alignment: .bottom) {
          AIDock(window: proxy.size)
            .opacity(dockVisible ? 1 : 0)
            .allowsHitTesting(dockVisible)
          if barShown {
            SelectionBar(intents: selectionIntents)
              .transition(.opacity.combined(with: .offset(y: AppleMetrics.motionBarTravel)))
          }
        }
        .animation(Motion.menuOpen, value: selection.active)
        .padding(.horizontal, AppleMetrics.railEdge)
        // An open card owns the desktop: the AI box steps aside with the top bar.
        // The full view stays under an open card; the one line and the panel step aside.
        .modifier(RailTuck(carrying: carrying, held: ai.height == .full))
        .frame(maxHeight: .infinity, alignment: .bottom)
        // The full view sits in the middle: half of `aiFullInset` above and below.
        .padding(.bottom, ai.height == .full ? AppleMetrics.aiFullInset / 2 : AppleMetrics.railEdge)
        // The pile shrinks away when it is let go, onto the AI box or anywhere else.
        ZStack {
          if carrying {
            DragPile(cardWidth: geometry.columnWidth)
              .transition(.opacity.combined(with: .scale(scale: AppleMetrics.motionMenuScale)))
          }
        }
        .animation(Motion.fast, value: carrying)
        NewHint { showNew() }
        // Keep the dropdown in the window layer: its rows extend below the top bar.
        ScopeMenu(menu: shell.menu)
          .padding(.leading, max(0, shell.menu.anchor - AppleMetrics.space6))
          .padding(
            .top,
            (AppleMetrics.topBarInset / 2) + (AppleMetrics.space64 + AppleMetrics.hitTarget) / 2
              + AppleMetrics.space8
          )
          .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        // The # list hangs under the search field in the window layer, over the cards.
        HashList()
          .padding(.leading, shell.searchFrame.minX)
          .padding(.top, shell.searchFrame.maxY + AppleMetrics.space8)
          .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        ReaderOverlay()
        PanelOverlay()
        // Over an open detail too (Web moves `#toast` into the dialog).
        Toast(hidden: drag.active)
      }
      .ignoresSafeArea(edges: .top)
    }
    .coordinateSpace(name: "card-workspace")
    .onGeometryChange(for: CGSize.self) {
      $0.size
    } action: {
      reader.viewport = CGRect(origin: .zero, size: $0)
    }
    .environment(
      \.openURL,
      OpenURLAction { url in
        _ = ExternalLink.open(url, workspace: workspace)
        return .handled
      }
    )
    .environment(\.cardIntents, cardIntents)
    // The feed, the card's transition face and the detail all list the same related cards.
    .environment(\.relatedCards, { [workspace] id in workspace.model(id) })
    .environment(\.readerIntents, readerIntents)
    .onAppear { connect() }
    .onDisappear {
      if let escape { NSEvent.removeMonitor(escape) }
      if let keys { NSEvent.removeMonitor(keys) }
      if let pointer { NSEvent.removeMonitor(pointer) }
      escape = nil
      keys = nil
      pointer = nil
    }
    .task { await poll() }
    .task { await tick() }
    .onChange(of: shell.searchFocused) { _, focused in
      if focused {
        shell.menu.close()
        menu.close()
      }
      pinChrome()
    }
    .onChange(of: interaction.layer) { _, layer in
      PointerRouter.shared.enabled = layer == .home || layer == .drag
      if layer != .home { scroll?.refresh.cancel() }
    }
    .onChange(of: shell.menu.open) { _, open in
      if open { shell.blurSearch() }
      pinChrome()
    }
    .onChange(of: drag.active) { pinChrome() }
    .onChange(of: ai.height) { pinChrome() }
    // Selecting folds the AI panel so the bar can take the rail; carrying a card does not.
    .onChange(of: selection.active) { _, active in
      if active, !drag.active { ai.event(.select) }
    }
    .task(id: barShown) {
      if barShown {
        dockShown = false
      } else if carrying {
        dockShown = true
      } else {
        do { try await Task.sleep(for: .seconds(AppleMetrics.motionMenuClose)) } catch { return }
        guard !Task.isCancelled else { return }
        dockShown = true
      }
    }
    .onChange(of: workspace.preferences) { _, value in feed.preferencesChanged(value) }
    .onChange(of: workspace.catalogVersion) {
      selection.prune()
      reader.prune()
      ai.prune { workspace.model($0) != nil }
      #if DEBUG
        if AIPreview.enabled, ai.sessions.isEmpty, !workspace.cards.isEmpty {
          ai.load(AIPreview.sessions(workspace.cards))
        }
      #endif
    }
    .onChange(of: reader.presented) { _, open in
      if open {
        // An open card folds the AI panel to one line; the full view stays under the card.
        ai.event(.detail)
        menu.close()
        shell.menu.close()
      }
    }
    .onChange(of: panels.kind) { _, kind in
      if kind != nil {
        menu.close()
        shell.menu.close()
      }
    }
  }

  private var feedTopInset: CGFloat {
    let gap = AppleMetrics.topBarInset / 2
    if #available(macOS 26.0, *) { return gap }
    // The overlaid bar grows by the type chip row while there is text.
    let kinds = TopBar.showsKinds(feed) ? AppleMetrics.space32 + AppleMetrics.space2 : 0
    return gap + AppleMetrics.space64 + kinds + gap
  }

  /// Changes made elsewhere (an external assistant, the CLI) arrive every 5s while the window is
  /// in front and nothing is waiting to be written.
  private func poll() async {
    while !Task.isCancelled {
      try? await Task.sleep(for: .seconds(5))
      if NSApp.isActive, workspace.queue.idle { workspace.refresh(quiet: true) }
    }
  }

  /// Web `tick`: due reminders are checked every second.
  private func tick() async {
    while !Task.isCancelled {
      newContent.check(workspace)
      try? await Task.sleep(for: .seconds(1))
    }
  }

  /// Web `showNew`: back to the top, the due reminders return to the desk.
  private func showNew() {
    guard !drag.active, !newContent.reminders.isEmpty else { return }
    let ids = newContent.reminders
    scroll?.scroll(to: 0, animated: false)
    workspace.showReminders(ids) { [feed, newContent, workspace] in
      feed.refreshMembership()
      newContent.check(workspace)
    }
    AccessibilityNotification.Announcement(
      Copy.text("web.app.fa2c54768fda") + "0" + Copy.text("web.app.f9c6ab19b7d4") + "\(ids.count)"
        + Copy.text("web.app.904aa82438d8")
    ).post()
  }

  private func pinChrome() {
    chrome.pinned = shell.searchFocused || shell.menu.open || drag.active || ai.height != .line
  }

  /// A pile is under the pointer. Holding a card to select it is not carrying yet.
  private var carrying: Bool { drag.active && drag.moved }

  /// The selection bar replaces the AI box while cards are selected, except while carrying them.
  private var barShown: Bool { selection.active && !carrying }

  /// The AI box leaves in the same frame the bar arrives; it returns once the bar has gone.
  private var dockVisible: Bool { carrying || (!barShown && dockShown) }

  private func scrollToTop() {
    if feed.filtering { feed.clearFilter() }
    scroll?.scroll(to: 0, animated: true)
  }

  // MARK: Wiring

  /// Esc, nearest first: a carried pile drops back, then an open card menu closes, then the
  /// selection ends. The reader and the search field handle their own Esc.
  private func installEscape() {
    guard escape == nil else { return }
    let menu = menu
    let selection = selection
    let shell = shell
    let workspace = workspace
    let interaction = interaction
    let ai = ai
    escape = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { event in
      guard event.keyCode == 53, event.window === NSApp.mainWindow,
        event.window?.attachedSheet == nil
      else { return event }
      let typing = event.window?.firstResponder is NSText
      let handled = MainActor.assumeIsolated {
        let menuOrigin = menu.id
        if interaction.dismiss() {
          if let menuOrigin { workspace.state(menuOrigin).requestFocus() }
          return true
        }
        guard !shell.searchFocused else { return false }
        if ai.escape() { return true }
        if selection.active, !typing {
          selection.clear()
        } else {
          return false
        }
        return true
      }
      return handled ? nil : event
    }
  }

  /// Web `key` and `paste` on the desk, only when nothing takes typing and no panel or reader is
  /// open. With single-key shortcuts on: N a quick note, R refresh, T back to the top. ⌘V keeps
  /// the pasted line or link as a card.
  private func installKeys() {
    guard keys == nil else { return }
    let workspace = workspace
    let feed = feed
    let panels = panels
    let shell = shell
    let interaction = interaction
    let chrome = chrome
    // Read when T is pressed: the feed's scroll is created in `connect`.
    let view = self
    keys = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { event in
      guard event.window === NSApp.mainWindow, event.window?.attachedSheet == nil else {
        return event
      }
      let typing = event.window?.firstResponder is NSText
      let flags = event.modifierFlags.intersection([.command, .control, .option])
      let key = event.charactersIgnoringModifiers?.lowercased() ?? ""
      let handled = MainActor.assumeIsolated {
        guard !typing, interaction.layer == .home, !shell.searchFocused else {
          return false
        }
        if flags == .command, key == "v" {
          guard let text = NSPasteboard.general.string(forType: .string),
            !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
          else { return false }
          workspace.capture(text)
          return true
        }
        guard flags.isEmpty, workspace.preferences.singleKeyShortcuts else { return false }
        switch key {
        case "n": panels.open(.capture)
        case "r": workspace.refresh { done in if done { feed.refreshMembership(reorder: true) } }
        case "t":
          chrome.show()
          view.scroll?.scroll(to: 0, animated: true)
        default: return false
        }
        return true
      }
      return handled ? nil : event
    }
  }

  /// Web blur: a click anywhere outside the focused search field or AI box ends its focus. The
  /// click still reaches what it landed on; the query, the token and the draft stay.
  private func installPointer() {
    guard pointer == nil else { return }
    let shell = shell
    let ai = ai
    let drag = drag
    pointer = NSEvent.addLocalMonitorForEvents(
      matching: [.leftMouseDown, .rightMouseDown, .otherMouseDown]
    ) { event in
      guard let window = event.window, window === NSApp.mainWindow,
        let height = window.contentView?.bounds.height
      else { return event }
      let point = CGPoint(x: event.locationInWindow.x, y: height - event.locationInWindow.y)
      MainActor.assumeIsolated {
        if shell.searchFocused, !shell.searchFrame.contains(point), !shell.hashFrame.contains(point)
        {
          shell.blurSearch()
        }
        // `drag.target` is the AI box's frame, kept by the box itself.
        if ai.focused, !drag.target.contains(point) { ai.blur() }
        // A click on the feed folds the panel back to one line; the full view stays.
        if ai.height == .panel, !drag.active, !drag.target.contains(point) { ai.event(.outside) }
      }
      return event
    }
  }

  private func connect() {
    reader.onShown = { [chrome] shown in chrome.yield(to: shown) }
    if scroll == nil {
      let next = FeedScroll(chrome: chrome)
      next.nearEnd = { [weak feed] in feed?.loadMore() }
      next.refreshAllowed = { [weak interaction] in interaction?.canScrollFeed == true }
      next.refresh.request = { [weak workspace, weak feed] done in
        guard let workspace else {
          done(false)
          return
        }
        workspace.refresh(quiet: true) { success in
          if success { feed?.refreshMembership(reorder: true) }
          done(success)
        }
      }
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
    let ai = ai
    cardIntents.select = { [weak feed] id, range in
      guard ai.height != .full else { return }
      selection.select(id, range: range, order: feed?.cardOrder ?? [])
    }
    let drag = drag
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
    let panels = panels
    cardIntents.edit = { ids in if !ids.isEmpty { panels.open(.editor(ids)) } }
    cardIntents.menu = { id, point in menu.toggle(id, at: point) }
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
    installKeys()
    installPointer()
    cardIntents.toggleTask = { id, task in workspace.toggleTask(id, task: task) }
    // Web `changeReminder`: the card leaves the selection and an open detail closes first.
    let reminder: @MainActor (String, Workspace.ReminderAction) -> Void = { id, action in
      if selection.contains(id) { selection.toggle(id) }
      if reader.presented { reader.closeAll() }
      workspace.changeReminder(id, action)
    }
    cardIntents.reminder = reminder
    cardIntents.join = { id in
      if let url = workspace.model(id)?.meeting?.url {
        ExternalLink.open(url, workspace: workspace)
      }
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
        guard let card = workspace.model(id), let url = card.url else { return }
        // Web `external`: an opened mail counts as read.
        if ExternalLink.open(url, workspace: workspace), card.kind == .mail,
          !workspace.state(id).read
        {
          workspace.setRead(id, true)
        }
      case .join:
        if let url = workspace.model(id)?.meeting?.url {
          ExternalLink.open(url, workspace: workspace)
        }
      case .tag: panels.open(.editor([id]))
      case .download:
        if let card = workspace.model(id) { CalendarFile.save(card, workspace: workspace) }
      }
    }
    reader.onClosed = { origin in
      guard let origin, Keyboard.focusVisible else { return }
      workspace.state(origin).requestFocus()
    }
  }
}

/// Reserve the header safe area; TopBar owns the material and reveal animation.
private struct FeedTopBar: ViewModifier {
  let header: TopBar
  @ViewBuilder func body(content: Content) -> some View {
    if #available(macOS 26.0, *) {
      content
        .safeAreaBar(edge: .top, spacing: 0) { header }
        // TopBar owns the native material and its fade; avoid a separate system edge.
        .scrollEdgeEffectHidden(true, for: .top)
    } else {
      content
    }
  }
}
