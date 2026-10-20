import AppKit
import SillKit
import SwiftUI

extension Desktop {
  var feed: some View {
    GeometryReader { geometry in
      let entries = homeEntries
      let archiveCount = archivedCards.count
      ScrollViewReader { proxy in
        ScrollView {
          observation("home")
          if !pendingIds.isEmpty {
            Button {
              pendingIds.removeAll()
              resetFeed()
            } label: {
              Label(
                "\(pendingIds.count)" + Copy.text("web.app.b50caa663fcf"), systemImage: "arrow.up")
            }.buttonStyle(.plain).font(.system(size: AppleMetrics.font13))
              .padding(AppleMetrics.space10).modifier(GlassSurface())
          }
          if model.cards.isEmpty {
            welcome.padding(.top, AppleMetrics.space40)
          } else if entries.isEmpty {
            VStack(spacing: AppleMetrics.space24) {
              Text(Copy.text("web.app.a510cac879f0")).foregroundStyle(AppleColors.secondary)
              if archiveCount > 0 { archiveEntry }
            }.padding(AppleMetrics.space40)
          } else {
            let configuration = grid(geometry.size.width - feedMargin(geometry.size.width) * 2)
            MasonryLayout(
              columns: configuration.count, spacing: configuration.gap,
              maximumColumnWidth: configuration.maximum
            ) {
              ForEach(Array(entries.prefix(pageLimit))) { entry in
                if entry.cards.count > 1 {
                  NativeStack(
                    cards: entry.cards, expanded: openStacks.contains(entry.id),
                    toggle: {
                      if openStacks.contains(entry.id) {
                        openStacks.remove(entry.id)
                      } else {
                        openStacks.insert(entry.id)
                      }
                    }, open: open)
                } else if let card = entry.cards.first {
                  tile(card)
                }
              }
              if !model.searchPresented && pageLimit >= entries.count && archiveCount > 0 {
                archiveEntry
              }
            }.padding(.horizontal, feedMargin(geometry.size.width)).padding(
              .top, AppleMetrics.space16)
          }
          Color.clear.frame(height: AppleMetrics.feedBottom)
        }.scrollIndicators(.automatic)
          .onChange(of: entries.count, initial: true) { _, count in chrome.feedEntryCount = count }
          .clipped()
          .onAppear {
            if feedOrder.isEmpty { feedOrder = model.visible.map(\.id) }
            captureStacks()
          }
          .onChange(of: model.cards.map(\.id)) { _, _ in
            let ids = Set(feedOrder)
            feedOrder += model.visible.map(\.id).filter { !ids.contains($0) }
            captureStacks()
          }
          .onChange(of: homeTopRequest) {
            withAnimation(homeTopImmediate || reduceMotion ? nil : .easeOut) {
              proxy.scrollTo("home-top", anchor: .top)
            }
          }
      }
    }
  }
  @ToolbarContentBuilder var nativeToolbar: some ToolbarContent {
    @Bindable var workspace = model
    ToolbarItem(placement: .navigation) {
      Menu {
        Picker(Copy.text("web.home.filterMenu"), selection: $workspace.feedScope) {
          ForEach(FeedScope.tabs) { scope in Text(scope.label).tag(scope) }
        }.pickerStyle(.inline)
        Divider()
        Button(Copy.appleNewNote) { model.capturePresented = true }
      } label: {
        Text(model.feedScope.label)
      }.help(Copy.text("web.home.filterMenu"))
    }
    ToolbarItemGroup(placement: .primaryAction) {
      Button(Copy.appleNewNote, systemImage: "square.and.pencil") { model.edit() }
        .disabled(!model.ready || model.busy || model.capturePresented || model.readerPresented)
        .help(Copy.appleNewNote)
      SettingsLink {
        Label(Copy.text("web.nav.settings"), systemImage: "person.crop.circle")
      }.help(Copy.text("web.nav.settings"))
    }
  }
  var homeCards: [Card] {
    let candidates = model.visible.filter { !pendingIds.contains($0.id) }
    let byID = Dictionary(uniqueKeysWithValues: candidates.map { ($0.id, $0) })
    let held = feedOrder.compactMap { byID[$0] }
    let known = Set(feedOrder)
    return held + candidates.filter { !known.contains($0.id) }
  }
  func resetFeed() {
    feedOrder = model.visible.map(\.id)
    captureStacks()
    model.selection.removeAll()
    pageLimit = 40
    openStacks.removeAll()
    requestHomeTop(immediate: true)
  }
  private struct FeedEntry: Identifiable {
    let id: String
    let cards: [Card]
  }
  private var archivedCards: [Card] {
    model.cards.filter { model.items[$0.id]?["archived"]?.bool == true }
  }
  private var homeEntries: [FeedEntry] {
    let ordered = homeCards
    guard !model.searchPresented, model.preferences["stack"]?.bool != false else {
      return ordered.map { FeedEntry(id: $0.id, cards: [$0]) }
    }
    let cards = Dictionary(uniqueKeysWithValues: ordered.map { ($0.id, $0) })
    var groupByCard: [String: String] = [:]
    for (group, ids) in stackGroups {
      for id in ids { groupByCard[id] = group }
    }
    var included = Set<String>()
    return ordered.compactMap { card in
      if let group = groupByCard[card.id] {
        guard included.insert(group).inserted else { return nil }
        return FeedEntry(id: group, cards: (stackGroups[group] ?? []).compactMap { cards[$0] })
      }
      return FeedEntry(id: card.id, cards: [card])
    }
  }
  private func captureStacks() {
    stackGroups = Dictionary(
      uniqueKeysWithValues: calculatedEntries.filter { $0.cards.count > 1 }
        .map { ($0.id, $0.cards.map(\.id)) })
  }
  private var calculatedEntries: [FeedEntry] {
    let ordered = homeCards
    guard !model.searchPresented, model.preferences["stack"]?.bool != false else {
      return ordered.map { FeedEntry(id: $0.id, cards: [$0]) }
    }
    let candidates = Dictionary(
      grouping: ordered.filter { card in
        let kind = card.fields["sources"]?.array?.first?["kind"]?.string ?? "local"
        return !card.source.isEmpty && ["article", "media"].contains(card.type)
          && !["agent", "capture"].contains(kind)
      }
    ) { card in
      (card.fields["sources"]?.array?.first?["kind"]?.string ?? "local") + ":" + card.source
    }
    var stacks: [String: [Card]] = [:]
    for (key, cards) in candidates {
      let sorted = cards.sorted {
        ($0.fields["time"]?.number ?? 0) > ($1.fields["time"]?.number ?? 0)
      }
      let recent = sorted.filter {
        (sorted.first?.fields["time"]?.number ?? 0) - ($0.fields["time"]?.number ?? 0) <= 3_600_000
          && model.items[$0.id]?["read"]?.bool != true
      }
      if recent.count > 5 { stacks[key] = recent }
    }
    var included: Set<String> = []
    var result: [FeedEntry] = []
    for card in ordered {
      let key =
        (card.fields["sources"]?.array?.first?["kind"]?.string ?? "local") + ":" + card.source
      if let cards = stacks[key], cards.contains(where: { $0.id == card.id }) {
        if included.insert(key).inserted { result.append(FeedEntry(id: key, cards: cards)) }
      } else {
        result.append(FeedEntry(id: card.id, cards: [card]))
      }
    }
    return result
  }
  private var archiveEntry: some View {
    Button {
      archivePresented = true
    } label: {
      HStack(spacing: AppleMetrics.space10) {
        NativeIcon(name: "ring", size: AppleMetrics.space16)
        Text(Copy.text("web.templates.7b7e6e8bd4ba")).fontWeight(.medium)
        Text(Copy.text("web.templates.08ae1ab86ff2")).foregroundStyle(AppleColors.secondary)
        Spacer()
        Text("\(archivedCards.count)").monospacedDigit()
      }.font(.system(size: AppleMetrics.font13)).padding(AppleMetrics.space16)
    }.buttonStyle(.plain)
  }
  private func archiveTime(_ card: Card) -> Double {
    model.items[card.id]?["readAt"]?.number ?? card.fields["time"]?.number ?? 0
  }
  private var archiveGroups: [(label: String, cards: [Card])] {
    let keys = [
      "web.archive.thisWeek", "web.primitives.0cf8b14f4651", "web.archive.earlier",
    ]
    let sorted = archivedCards.sorted {
      ($0.fields["time"]?.number ?? 0) > ($1.fields["time"]?.number ?? 0)
    }
    return keys.enumerated().compactMap { index, key in
      let cards = sorted.filter { card in
        let age = Date.now.timeIntervalSince1970 - archiveTime(card) / 1000
        return (age < 7 * 86_400 ? 0 : age < 14 * 86_400 ? 1 : 2) == index
      }
      return cards.isEmpty ? nil : (key, cards)
    }
  }
  private func archiveIcon(_ type: String) -> String {
    [
      "article": "book", "mail": "mail", "note": "note", "task": "check-circle",
      "event": "calendar", "media": "video", "file": "file", "reminder": "bell",
      "digest": "sparkle",
    ][type] ?? "note"
  }
  var archivePanel: some View {
    VStack(alignment: .leading, spacing: AppleMetrics.space16) {
      HStack {
        Text(Copy.text("web.templates.7b7e6e8bd4ba")).font(
          .system(size: AppleMetrics.space22, weight: .semibold))
        Spacer()
        Button(Copy.text("web.close")) { archivePresented = false }.keyboardShortcut(.cancelAction)
      }
      ScrollView {
        VStack(spacing: 0) {
          ForEach(archiveGroups, id: \.label) { group in
            Text(Copy.text(group.label)).font(.system(size: AppleMetrics.font13)).foregroundStyle(
              AppleColors.secondary
            )
            .frame(maxWidth: .infinity, alignment: .leading).padding(
              .vertical, AppleMetrics.space12)
            ForEach(group.cards) { card in
              HStack(spacing: AppleMetrics.space12) {
                NativeIcon(name: archiveIcon(card.type), size: AppleMetrics.space16)
                  .foregroundStyle(AppleColors.secondary)
                Button {
                  archiveSelection = card.id
                  archivePresented = false
                } label: {
                  VStack(alignment: .leading, spacing: AppleMetrics.space5) {
                    Text(card.title).fontWeight(.medium)
                    Text(card.source).font(.system(size: AppleMetrics.font13)).foregroundStyle(
                      AppleColors.secondary)
                  }.frame(maxWidth: .infinity, alignment: .leading)
                }.buttonStyle(.plain)
                Text(
                  Date(timeIntervalSince1970: archiveTime(card) / 1000),
                  format: .dateTime.month(.defaultDigits).day()
                )
                .font(.system(size: AppleMetrics.font13, design: .rounded)).foregroundStyle(
                  AppleColors.secondary)
                Button(Copy.text("web.archive.restoreToDesk")) {
                  model.patch(
                    [card.id],
                    values: [
                      "archived": .bool(false),
                      "restoredAt": .number(Date.now.timeIntervalSince1970 * 1000),
                    ])
                }.buttonStyle(.plain).foregroundStyle(AppleColors.accent)
              }.padding(.vertical, AppleMetrics.space12)
              Divider()
            }
          }
        }
      }.frame(maxHeight: AppleMetrics.settingsHeight)
    }.padding(AppleMetrics.railEdge)
  }
  private var welcome: some View {
    VStack(spacing: AppleMetrics.space16) {
      NativeIcon(name: "sill", size: AppleMetrics.space36 * 2)
      Text("Sill").font(.system(size: AppleMetrics.font36, weight: .semibold))
      Text(Copy.text("web.welcome.tagline")).font(.system(size: AppleMetrics.font17))
        .foregroundStyle(AppleColors.secondary)
      Button(Copy.text("web.capture.title")) { model.capturePresented = true }.buttonStyle(
        .borderedProminent
      ).disabled(!model.ready)
    }.frame(maxWidth: .infinity).padding(AppleMetrics.space40)
  }
  private func tile(_ card: Card) -> some View {
    CardTile(card: card, open: { open(card) })
      .simultaneousGesture(
        TapGesture().onEnded {
          if NSEvent.modifierFlags.contains(.command) { toggleSelection(card.id) }
        }
      )
      .focusable().focused($focusedCard, equals: card.id)
      .contextMenu { CardActions(card: card) }
      .draggable(card.id)
  }
  private func open(_ card: Card) {
    if NSEvent.modifierFlags.contains(.command) { return }
    if !model.selection.isEmpty { toggleSelection(card.id) } else { model.selected = card.id }
  }
  private func toggleSelection(_ id: String) {
    if model.selection.contains(id) {
      model.selection.remove(id)
    } else {
      model.selection.insert(id)
    }
  }
}

/// SwiftUI creates and hosts the platform search field in the window toolbar.
struct WorkspaceSearch: ViewModifier {
  @Binding var query: String
  let focus: FocusState<Bool>.Binding
  func body(content: Content) -> some View {
    if #available(macOS 15.0, *) {
      content.searchable(
        text: $query, placement: .toolbar,
        prompt: Text(Copy.text("web.home.searchPlaceholder"))
      )
      .searchFocused(focus)
    } else {
      content.toolbar {
        ToolbarItem(placement: .automatic) {
          TextField(Copy.text("web.home.searchPlaceholder"), text: $query)
            .textFieldStyle(.roundedBorder).focused(focus).frame(width: 280)
        }
      }
    }
  }
}
