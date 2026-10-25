#if os(iOS)
  import SillKit
  import SwiftUI

  struct MobileFeed: View {
    let workspace: MobileWorkspace
    let state: MobileFeedState
    let chrome: MobileChromeState
    let refresh: MobileRefresh
    @Binding var scope: String
    @Binding var selected: Set<String>
    let active: Bool
    let blocked: Bool
    let topRequest: Int
    let topInset: CGFloat
    let open: (String) -> Void
    let capture: () -> Void
    @State private var proxy = MobileScrollProxy()
    @State private var restoring = false
    @State private var installed = false
    @State private var suppressOpen: [String: Date] = [:]

    var body: some View {
      feedScroll
        .scrollDismissesKeyboard(.interactively)
        .onAppear {
          if !installed {
            rebuild()
            installed = true
          }
          restore()
        }
        .onChange(of: scope) { _, _ in
          rebuild()
          restore()
        }
        .onChange(of: topRequest) { _, _ in
          proxy.scroll(to: 0, animated: true)
          chrome.show()
        }
        .onChange(of: workspace.revision) { _, _ in
          withAnimation(MobileMotion.layout) {
            state.synchronize(
              catalog: workspace.cards, eligible: workspace.filtered(scope: scope),
              deferNewCards: !active || blocked || !selected.isEmpty
                || scope == "archive" || !workspace.dueReminders().isEmpty
                || (state.offsets[scope] ?? 0) >= AppleMetrics.space40
                || workspace.preferences["newHint"]?.string == "off")
          }
        }
        .onChange(of: workspace.preferences["sort"]) { _, _ in rebuild(preservingPending: true) }
        .onChange(of: workspace.preferences["stack"]) { _, _ in rebuild(preservingPending: true) }
        .onChange(of: workspace.preferences["floatTimely"]) { _, _ in
          rebuild(preservingPending: true)
        }
        .onChange(of: refresh.retry) { _, _ in
          Task { await refresh.run(proxy: proxy, action: reload) }
        }
        .onChange(of: blocked) { _, blocked in
          if blocked {
            refresh.cancel()
            proxy.stop()
          }
        }
        .onChange(of: active) { _, active in if active { restore() } else { refresh.cancel() } }
    }

    private var feedScroll: some View {
      GeometryReader { geometry in
        ScrollView { feedContent(width: geometry.size.width) }
      }
    }

    private func feedContent(width: CGFloat) -> some View {
      LazyVStack(spacing: gap) {
        LazyVGrid(columns: columns(width: width), spacing: gap) {
          ForEach(state.visible) { entry in entryRow(entry) }
        }
        if state.hasMore {
          Color.clear.frame(height: AppleMetrics.space4).onAppear { state.nextPage() }
        }
        if state.entries.isEmpty { MobileEmpty(capture: capture) }
        Button(Copy.text(scope == "archive" ? "web.nav.home" : "mobile.archive")) {
          scope = scope == "archive" ? "all" : "archive"
        }
        .foregroundStyle(AppleColors.secondary).padding(AppleMetrics.space24)
      }
      .padding(.horizontal, AppleMetrics.space16)
      .padding(.top, topInset + AppleMetrics.space8)
      .padding(.bottom, AppleMetrics.feedBottom)
      .frame(maxWidth: AppleMetrics.feedMax)
      .frame(maxWidth: .infinity)
      .background(MobileScrollObserver(proxy: proxy, onChange: measured, onPan: pan))
    }

    private func entryRow(_ entry: MobileFeedState.Entry) -> some View {
      MobileFeedEntrance(state: state, id: entry.id) { entryContent(entry) }
        .transition(
          .asymmetric(
            insertion: .offset(y: -AppleMetrics.space10).combined(with: .opacity),
            removal: .opacity)
        )
        .modifier(MobileCardMenuElevation())
    }

    @ViewBuilder private func entryContent(_ entry: MobileFeedState.Entry) -> some View {
      if entry.stacked && !state.expanded.contains(entry.id) {
        collapsedStack(entry)
      } else {
        expandedStack(entry)
      }
    }

    private func collapsedStack(_ entry: MobileFeedState.Entry) -> MobileStack {
      let position = Binding<Int>(
        get: { state.stackPositions[entry.id] ?? 0 },
        set: { state.stackPositions[entry.id] = $0 })
      return MobileStack(
        workspace: workspace, entry: entry, position: position,
        selected: $selected, open: open,
        expand: {
          withAnimation(MobileMotion.layout) { _ = state.expanded.insert(entry.id) }
        })
    }

    private func expandedStack(_ entry: MobileFeedState.Entry) -> some View {
      VStack(spacing: AppleMetrics.space10) {
        if entry.stacked { stackHeading(entry) }
        ForEach(entry.cards, id: \.self) { id in cardRow(id) }
      }
    }

    private func stackHeading(_ entry: MobileFeedState.Entry) -> some View {
      HStack {
        Text(workspace.card(entry.cards.first ?? "")?.sourceName ?? "")
        Spacer()
        Button(Copy.text("apple.hideSearch")) {
          withAnimation(MobileMotion.layout) { _ = state.expanded.remove(entry.id) }
        }
      }
      .font(.system(size: AppleMetrics.font13)).foregroundStyle(AppleColors.secondary)
      .frame(minHeight: AppleMetrics.stackOpenHeadHeight)
    }

    @ViewBuilder private func cardRow(_ id: String) -> some View {
      if let card = workspace.card(id) {
        if card.archived {
          MobileArchiveRow(workspace: workspace, card: card, open: open)
        } else {
          tile(card)
        }
      }
    }

    private var gap: CGFloat {
      AppleMetrics.space12
        * (workspace.preferences["cardSpacing"]?.string == "compact"
          ? AppleMetrics.layoutSpaceCompact
          : workspace.preferences["cardSpacing"]?.string == "roomy"
            ? AppleMetrics.layoutSpaceRoomy : 1)
    }

    private func columns(width: CGFloat) -> [GridItem] {
      guard width > AppleMetrics.readerWidth else { return [GridItem(.flexible())] }
      let density = workspace.preferences["density"]?.string
      let minimum =
        density == "compact"
        ? AppleMetrics.compactMinWidth
        : density == "roomy" ? AppleMetrics.roomyMinWidth : AppleMetrics.cardMinWidth
      return [GridItem(.adaptive(minimum: minimum), spacing: gap, alignment: .top)]
    }

    private func tile(_ card: MobileCard) -> some View {
      MobileCardTile(
        workspace: workspace, card: card, selected: selected.contains(card.id),
        onSelect: { select(card.id) }, openRelated: open
      ) {
        if let until = suppressOpen[card.id], until > .now { return }
        if selected.isEmpty { open(card.id) } else { select(card.id) }
      }
      .simultaneousGesture(
        LongPressGesture(minimumDuration: AppleMetrics.holdToSelect).onEnded { _ in
          suppressOpen[card.id] = Date().addingTimeInterval(AppleMetrics.holdToSelect)
          select(card.id)
        })
    }
    private func select(_ id: String) {
      if selected.contains(id) { selected.remove(id) } else { selected.insert(id) }
      chrome.show()
    }
    private func rebuild(preservingPending: Bool = false) {
      state.rebuild(
        scope: scope, cards: workspace.filtered(scope: scope), catalog: workspace.cards,
        stack: workspace.preferences["stack"]?.bool ?? true, preservingPending: preservingPending)
    }
    private func restore() {
      restoring = true
      let offset = state.offsets[scope] ?? 0
      Task { @MainActor in
        await Task.yield()
        proxy.scroll(to: offset)
        chrome.sync(offset)
        restoring = false
      }
    }
    private func measured(_ metrics: MobileScrollMetrics) {
      guard active, !blocked, !restoring else { return }
      state.offsets[scope] = max(0, metrics.offset)
      refresh.measured(metrics)
      chrome.scrolled(metrics)
    }
    private func pan(_ sample: MobilePanSample) {
      refresh.pan(
        sample, enabled: active && !blocked && selected.isEmpty && !workspace.busy,
        proxy: proxy, action: reload)
    }
    private func reload() async -> Bool {
      guard active, !blocked, !workspace.busy else { return false }
      let owner = workspace.owner
      await workspace.refresh()
      guard owner == workspace.owner, workspace.error == nil else { return false }
      withAnimation(MobileMotion.layout) { rebuild() }
      return true
    }
  }

  private struct MobileFeedEntrance<Content: View>: View {
    let state: MobileFeedState
    let id: String
    @ViewBuilder let content: () -> Content
    @State private var appeared = false
    @State private var entry = MobileFeedState.Entrance.none
    private var planned: MobileFeedState.Entrance { state.entrances[id] ?? .none }

    var body: some View {
      content()
        .opacity(appeared || planned == .none ? 1 : 0)
        .offset(
          y: appeared || planned == .none
            ? 0 : planned == .added ? -AppleMetrics.space10 : AppleMetrics.space10
        )
        .task {
          entry = state.entrance(id)
          guard entry != .none else {
            appeared = true
            return
          }
          let animation: Animation
          if case .initial(let index) = entry {
            animation = MobileMotion.cardEntry(index: index)
          } else {
            animation = MobileMotion.base
          }
          await Task.yield()
          withAnimation(animation) { appeared = true }
        }
    }
  }
#endif
