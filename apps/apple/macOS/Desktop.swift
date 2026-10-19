import AppKit
import SillKit
import SwiftUI

struct Desktop: View {
  @EnvironmentObject var model: Workspace
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.controlActiveState) private var windowActivity
  @FocusState private var toastFocused: Bool
  @FocusState private var undoFocused: Bool
  @FocusState private var searchFocused: Bool
  @State private var pageLimit = 40
  @State private var homeTopRequest = 0
  @State private var searchLimit = 40
  @State private var railHidden = false
  @State private var lastOffset: CGFloat = 0
  @State private var downward: CGFloat = 0
  @State private var upward: CGFloat = 0
  @State private var revealTask: Task<Void, Never>?
  @State private var homeSelection: Set<String> = []
  @State private var searchSelection: Set<String> = []
  @State private var tagEditor = false
  @State private var tagText = ""
  @State private var tagIds: [String] = []
  @State private var tagRevision = 0
  @State private var tagSaving = false
  @State private var editingTags: [String] = []
  @State private var editingNote = ""
  @State private var bulkPending = false
  @State private var captureText = ""
  @State private var openStacks: Set<String> = []
  @State private var archivePresented = false
  @State private var pendingIds: Set<String> = []
  @State private var aiDropTargeted = false
  @FocusState private var aiTargetFocused: Bool
  @FocusState private var focusedCard: String?
  @State private var toastText = ""
  @State private var toastTask: Task<Void, Never>?
  @State private var toastLifetime = ToastLifetime(duration: .zero)
  @State private var toastHovered = false
  @State private var undoPatches: [String: JSONValue] = [:]
  @State private var undoRevision = 0
  @State private var pendingUndo: [String: JSONValue] = [:]
  @State private var pendingToast = ""
  @State private var detail = DetailPresentation()
  @Namespace private var navigation
  private var animated: Bool { !reduceMotion && model.preferences["reduceMotion"]?.bool != true }
  private var railConcealed: Bool { railHidden || model.settingsPresented }
  private var railAnimation: Animation {
    if !animated { return .linear(duration: AppleMetrics.motionReduced) }
    return railConcealed
      ? .timingCurve(0.23, 1, 0.32, 1, duration: AppleMetrics.motionRailHide)
      : .timingCurve(0.32, 0.72, 0, 1, duration: AppleMetrics.motionRailShow)
  }
  var body: some View {
    GeometryReader { geometry in
      ZStack(alignment: .bottom) {
        AppleColors.canvas.ignoresSafeArea()
        feed
          .opacity(model.page == "home" ? 1 : 0)
          .allowsHitTesting(model.page == "home")
          .accessibilityHidden(model.page != "home")
        if model.searchPresented { searchPage }
        if model.page == "ai" {
          aiPage.padding(
            .horizontal,
            max(AppleMetrics.railEdge, (geometry.size.width - AppleMetrics.aiWidth) / 2)
          )
          .padding(.top, AppleMetrics.space16).padding(
            .bottom, AppleMetrics.railEdge + AppleMetrics.railRow + AppleMetrics.space24
          )
          .frame(maxWidth: .infinity, maxHeight: .infinity).background(AppleColors.canvas)
        }
        LinearGradient(
          colors: [AppleColors.canvas, AppleColors.canvas.opacity(0)], startPoint: .bottom,
          endPoint: .top
        )
        .frame(height: AppleMetrics.railRow + AppleMetrics.space24).allowsHitTesting(false)
        .opacity(railConcealed ? 0 : 1)
        .animation(railAnimation, value: railConcealed)
        rail.padding(.bottom, AppleMetrics.railEdge)
          .opacity(railConcealed ? 0 : 1)
          .animation(railAnimation, value: railConcealed)
          .offset(y: railConcealed && animated ? AppleMetrics.motionRailTravel : 0)
          .animation(railAnimation, value: railConcealed)
          .allowsHitTesting(!railHidden && !model.settingsPresented)
          .accessibilityHidden(railHidden || model.settingsPresented)
        if model.settingsPresented {
          overlay { SettingsPanel(availableSize: geometry.size) }
        }
        if archivePresented {
          overlay {
            archivePanel.frame(
              width: min(AppleMetrics.aiWidth, geometry.size.width - AppleMetrics.space32))
          }
        }
        if model.capturePresented {
          overlay {
            VStack(spacing: 0) {
              HStack {
                Spacer()
                iconButton("x", "web.close") { model.capturePresented = false }
              }
              CaptureField(text: $captureText, showsNextEvent: true) { model.capture(captureText) }
                .padding(.horizontal, AppleMetrics.railEdge)
            }.padding(.top, AppleMetrics.space8).frame(
              width: min(AppleMetrics.editorWidth, geometry.size.width - AppleMetrics.space32)
            )
            .background(
              AppleColors.card, in: RoundedRectangle(cornerRadius: AppleMetrics.panelRadius))
          }
        }
        if tagEditor {
          overlay {
            metadataEditor.frame(
              width: min(AppleMetrics.editorWidth, geometry.size.width - AppleMetrics.space32))
          }
        }
        if let displayedID = detail.cardID {
          ZStack {
            AppleColors.dim.ignoresSafeArea().onTapGesture { model.selected = nil }
              .opacity(detail.visible ? 1 : 0)
            CardReader(availableSize: geometry.size, presentedID: displayedID).environmentObject(
              model
            )
            .opacity(detail.visible ? 1 : 0)
            .offset(
              y: animated && !detail.visible
                ? (model.selected == nil
                  ? AppleMetrics.motionDetailExitY : AppleMetrics.motionDetailEnterY) : 0)
          }
          .allowsHitTesting(model.selected != nil)
          .accessibilityHidden(model.selected == nil)
        }
        if !toastText.isEmpty {
          HStack(spacing: AppleMetrics.space16) {
            Text(toastText)
            if !undoPatches.isEmpty {
              Button(Copy.text("web.app.926a50b98ece")) {
                guard !model.busy else { return }
                model.batchPatch(undoPatches, expectedRevision: undoRevision)
                dismissToast()
              }.buttonStyle(.plain).foregroundStyle(AppleColors.accent).disabled(model.busy)
                .focused($undoFocused)
            }
          }.font(.system(size: AppleMetrics.font14)).padding(.horizontal, AppleMetrics.space18)
            .padding(.vertical, AppleMetrics.space12)
            .modifier(GlassSurface())
            .focusable(undoPatches.isEmpty).focused($toastFocused)
            .onHover { toastHovered = $0 }
            .frame(maxWidth: .infinity, alignment: .trailing).padding(
              .trailing, AppleMetrics.railEdge
            )
            .padding(.bottom, AppleMetrics.railEdge + AppleMetrics.railRow + AppleMetrics.space12)
        }
        if let error = model.error {
          VStack {
            HStack(spacing: AppleMetrics.space12) {
              Text(error).font(.system(size: AppleMetrics.font14)).textSelection(.enabled)
              Button(Copy.appleRetry) { model.refresh() }.disabled(model.loading)
              iconButton("x", "web.close") { model.error = nil }
            }.padding(AppleMetrics.space12).background(
              AppleColors.card, in: RoundedRectangle(cornerRadius: AppleMetrics.space12))
            Spacer()
          }
          .padding(AppleMetrics.space16)
        }
      }
    }
    .dropDestination(for: String.self) { values, _ in
      guard model.page == "home", model.selected == nil, !model.settingsPresented,
        !values.allSatisfy({ id in model.cards.contains { $0.id == id } })
      else { return false }
      let text = values.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
      guard !text.isEmpty else { return false }
      model.capture(text)
      return true
    }
    .background(NativeKeyboard(handle: handleKey).frame(width: 0, height: 0))
    .foregroundStyle(AppleColors.primary).tint(AppleColors.accent)
    .frame(minWidth: AppleMetrics.desktopMinWidth, minHeight: AppleMetrics.desktopMinHeight)
    .preferredColorScheme(
      model.preferences["theme"]?.string == "dark"
        ? .dark : model.preferences["theme"]?.string == "light" ? .light : nil
    )
    .onChange(of: model.cards.map(\.id)) { old, new in
      let additions = Set(new).subtracting(old)
      if !old.isEmpty && (model.scrollOffsets["home"] ?? 0) > AppleMetrics.space24 {
        pendingIds.formUnion(additions)
      }
      pendingIds.formIntersection(Set(new))
    }
    .onChange(of: model.page) { old, new in
      if old == "search" {
        searchSelection = model.selection
      } else if old == "home" {
        homeSelection = model.selection
      }
      model.selection = new == "search" ? searchSelection : new == "home" ? homeSelection : []
      showRail()
      lastOffset = model.scrollOffsets[new] ?? 0
    }
    .onChange(of: model.busy) {
      guard !model.busy else { return }
      if tagSaving {
        tagSaving = false
        if model.error == nil {
          tagEditor = false
          model.selection.removeAll()
        }
      }
      if bulkPending {
        bulkPending = false
        if model.error == nil {
          model.selection.removeAll()
          undoPatches = pendingUndo
          undoRevision = model.revision
          showToast(pendingToast, undo: true)
        }
      }
    }
    .onChange(of: model.capturePresented) {
      if !model.capturePresented && model.error == nil { captureText = "" }
    }
    .onChange(of: toastPaused) { updateToastTimer() }
    .onAppear {
      updateToastTimer()
      presentDetail(model.selected)
    }
    .onChange(of: model.selected) { _, id in presentDetail(id) }
    .onExitCommand { dismissTop() }
    .onDisappear {
      revealTask?.cancel()
      toastTask?.cancel()
      toastLifetime.pause(at: .now)
      detail.invalidate()
    }
  }
  private func presentDetail(_ id: String?) {
    let generation = detail.prepare(id)
    let duration =
      !animated
      ? AppleMetrics.motionReduced
      : (id == nil ? AppleMetrics.motionDetailClose : AppleMetrics.motionDetailOpen)
    if id != nil {
      // Mount at the entry position before starting the local presentation transaction.
      Task { @MainActor in
        await Task.yield()
        guard detail.generation == generation else { return }
        withAnimation(
          animated
            ? .timingCurve(0.23, 1, 0.32, 1, duration: duration) : .linear(duration: duration)
        ) {
          detail.visible = true
        }
      }
    } else {
      withAnimation(
        animated ? .timingCurve(0.23, 1, 0.32, 1, duration: duration) : .linear(duration: duration),
        completionCriteria: .removed
      ) {
        detail.visible = false
      } completion: {
        detail.finishClose(generation)
      }
    }
  }
  private var rail: some View {
    HStack(spacing: AppleMetrics.space8) {
      if model.page == "home" && !pendingIds.isEmpty
        && model.preferences["newHint"]?.string != "off"
      {
        Button {
          pendingIds.removeAll()
          homeTopRequest += 1
        } label: {
          HStack(spacing: AppleMetrics.space8) {
            NativeIcon(name: "up", size: AppleMetrics.space14)
            Text("\(pendingIds.count)" + Copy.text("web.app.b50caa663fcf"))
          }.font(.system(size: AppleMetrics.font14))
            .padding(.horizontal, AppleMetrics.space18).frame(height: AppleMetrics.railRow)
        }.buttonStyle(.plain).modifier(GlassSurface()).accessibilityLabel(
          Copy.text("web.app.3fa133e511d1"))
      }
      if !model.selection.isEmpty { selectionBar }
      HStack(spacing: 0) {
        nav("home", "home", "web.nav.home")
        nav("search", "search", "web.nav.search")
        nav("ai", "chat", "web.nav.aiLabel")
        nav("settings", "sill", "web.nav.settings")
      }.padding(AppleMetrics.railInset).modifier(GlassSurface())
    }
  }
  private var feed: some View {
    GeometryReader { geometry in
      ScrollViewReader { proxy in
        ScrollView {
          observation("home")
          if model.cards.isEmpty {
            welcome.padding(.top, AppleMetrics.space40)
          } else if homeCards.isEmpty {
            VStack(spacing: AppleMetrics.space24) {
              Text(Copy.text("web.app.a510cac879f0")).foregroundStyle(AppleColors.secondary)
              if !archivedCards.isEmpty { archiveEntry }
            }.padding(AppleMetrics.space40)
          } else {
            let configuration = grid(geometry.size.width - feedMargin(geometry.size.width) * 2)
            MasonryLayout(
              columns: configuration.count, spacing: configuration.gap,
              maximumColumnWidth: configuration.maximum
            ) {
              ForEach(Array(homeEntries.prefix(pageLimit))) { entry in
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
              if pageLimit >= homeEntries.count && archivedCards.count > 0 { archiveEntry }
            }.padding(.horizontal, feedMargin(geometry.size.width)).padding(
              .top, feedMargin(geometry.size.width))
          }
          Color.clear.frame(height: AppleMetrics.feedBottom).onAppear {
            if pageLimit < homeEntries.count { pageLimit += 40 }
          }
        }.scrollIndicators(.hidden)
          .onChange(of: homeTopRequest) {
            withAnimation(animated ? .easeOut : nil) { proxy.scrollTo("home-top", anchor: .top) }
          }
      }
    }
  }
  private var homeCards: [Card] {
    // Workspace supplies the same home sorting policy, independent of the search filters.
    model.homeCards.filter { !pendingIds.contains($0.id) }
  }
  private struct FeedEntry: Identifiable {
    let id: String
    let cards: [Card]
  }
  private var archivedCards: [Card] {
    model.cards.filter { model.items[$0.id]?["archived"]?.bool == true }
  }
  private var homeEntries: [FeedEntry] {
    guard model.preferences["stack"]?.bool != false else {
      return homeCards.map { FeedEntry(id: $0.id, cards: [$0]) }
    }
    let candidates = Dictionary(
      grouping: homeCards.filter { card in
        let kind = card.fields["sources"]?.array?.first?["kind"]?.string ?? "local"
        return ["article", "media"].contains(card.type) && !["agent", "capture"].contains(kind)
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
    for card in homeCards {
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
      "web.panels.b4c6c3eb0bce", "web.primitives.0cf8b14f4651", "web.panels.c56a5bb657de",
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
  private var archivePanel: some View {
    VStack(alignment: .leading, spacing: AppleMetrics.space16) {
      HStack {
        Text(Copy.text("web.templates.7b7e6e8bd4ba")).font(
          .system(size: AppleMetrics.space22, weight: .semibold))
        Spacer()
        iconButton("x", "web.close") { archivePresented = false }
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
                  model.selected = card.id
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
                Button(Copy.text("web.panels.561642967386")) {
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
    }.padding(AppleMetrics.railEdge).background(
      AppleColors.card, in: RoundedRectangle(cornerRadius: AppleMetrics.panelRadius))
  }
  private var welcome: some View {
    VStack(spacing: AppleMetrics.space16) {
      NativeIcon(name: "sill", size: AppleMetrics.space36 * 2)
      Text("Sill").font(.system(size: AppleMetrics.font36, weight: .semibold))
      Text(Copy.text("web.panels.3d7d3ac3581f")).font(.system(size: AppleMetrics.font17))
        .foregroundStyle(AppleColors.secondary)
      Button(Copy.text("web.panels.5a15649c2481")) { model.capturePresented = true }.buttonStyle(
        CardPillStyle(primary: true, solid: true)
      ).disabled(!model.ready)
    }.frame(maxWidth: .infinity).padding(AppleMetrics.space40)
  }
  private var searchPage: some View {
    GeometryReader { geometry in
      VStack(spacing: AppleMetrics.space12) {
        HStack(spacing: AppleMetrics.space8) {
          HStack(spacing: AppleMetrics.space10) {
            NativeIcon(name: "search", size: AppleMetrics.space18).foregroundStyle(
              AppleColors.secondary)
            TextField(Copy.text("web.panels.a76ee88e6c2e"), text: $model.query).textFieldStyle(
              .plain
            )
            .font(.system(size: AppleMetrics.font17)).focused($searchFocused)
            .onAppear { searchFocused = true }.onChange(of: model.searchFocusRequest) {
              searchFocused = true
            }
            if !model.query.isEmpty {
              iconButton("x", "web.panels.b6f00afa6537") { model.query = "" }
            }
          }.padding(.leading, AppleMetrics.space18).padding(.trailing, AppleMetrics.space10)
            .frame(height: AppleMetrics.searchPillHeight).background(
              AppleColors.card, in: Capsule())
        }
        VStack(spacing: AppleMetrics.space8) {
          searchFilterRow("web.search.filters.type") {
            ForEach(["all", "article", "mail", "note", "task", "event", "media"], id: \.self) {
              type in
              chip(
                Copy.text(
                  [
                    "all": "web.all", "article": "web.search.type.article",
                    "mail": "web.search.type.mail", "note": "web.note", "task": "web.task",
                    "event": "web.event", "media": "web.media",
                  ][type] ?? "web.all"), selected: model.typeFilter == type
              ) { model.typeFilter = type }
            }
          }
          searchFilterRow("web.search.filters.status") {
            ForEach(
              [
                (Copy.appleUnread, "web.unread"), (Copy.appleBookmarks, "web.bookmark"),
                (Copy.appleLater, "web.later"),
              ], id: \.0
            ) { value, key in
              chip(Copy.text(key), selected: model.filter == value) {
                model.filter = model.filter == value ? Copy.appleAll : value
              }
            }
          }
          let tags = Array(Set(model.cards.flatMap { model.tags($0) })).sorted()
          if !tags.isEmpty {
            searchFilterRow("web.search.filters.tag") {
              ForEach(tags, id: \.self) { tag in
                chip("#" + tag, selected: model.tagFilter == tag) {
                  model.tagFilter = model.tagFilter == tag ? "" : tag
                }
              }
            }
          }
        }.padding(.bottom, AppleMetrics.space4)
        ScrollViewReader { proxy in
          ScrollView {
            observation("search")
            let all = model.visible
            let desk = Array(
              all.filter { model.items[$0.id]?["archived"]?.bool != true }.prefix(searchLimit))
            let shelved = Array(
              all.filter { model.items[$0.id]?["archived"]?.bool == true }.prefix(
                max(0, searchLimit - desk.count)))
            if all.isEmpty {
              Text(Copy.text("web.panels.11a8f9879575") + model.query + "」").foregroundStyle(
                AppleColors.secondary
              ).padding(AppleMetrics.space24)
            } else {
              let ideal = grid(geometry.size.width - AppleMetrics.space40 * 2).ideal
              let columns = [
                GridItem(
                  .adaptive(minimum: min(ideal, geometry.size.width - AppleMetrics.space40 * 2)),
                  spacing: AppleMetrics.space24, alignment: .top)
              ]
              LazyVGrid(columns: columns, spacing: AppleMetrics.space24) {
                ForEach(desk) { card in tile(card) }
              }
              if !shelved.isEmpty {
                Text(Copy.text("web.search.shelvedGroup")).font(.system(size: AppleMetrics.font13))
                  .foregroundStyle(AppleColors.secondary)
                  .frame(maxWidth: .infinity, alignment: .leading).padding(
                    .top, AppleMetrics.space24)
                LazyVGrid(columns: columns, spacing: AppleMetrics.space24) {
                  ForEach(shelved) { card in tile(card) }
                }
              }
            }
            Color.clear.frame(height: AppleMetrics.feedBottom).onAppear {
              if searchLimit < model.visible.count { searchLimit += 40 }
            }
          }.scrollIndicators(.hidden)
            .onChange(of: model.query) { resetSearch(proxy) }
            .onChange(of: model.typeFilter) { resetSearch(proxy) }
            .onChange(of: model.filter) { resetSearch(proxy) }
            .onChange(of: model.tagFilter) { resetSearch(proxy) }
        }
      }.padding(.horizontal, AppleMetrics.space40).padding(.top, AppleMetrics.space16)
    }.background(AppleColors.canvas)
  }
  private func resetSearch(_ proxy: ScrollViewProxy) {
    searchLimit = 40
    model.scrollOffsets["search"] = 0
    proxy.scrollTo("search-top", anchor: .top)
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
  private func searchFilterRow<Content: View>(
    _ key: String, @ViewBuilder content: () -> Content
  ) -> some View {
    HStack(spacing: AppleMetrics.space8) {
      Text(Copy.text(key)).font(.system(size: AppleMetrics.font12))
        .foregroundStyle(AppleColors.secondary).frame(
          width: AppleMetrics.space28, alignment: .leading
        )
        .accessibilityHidden(true)
      ScrollView(.horizontal) {
        HStack(spacing: AppleMetrics.space8, content: content).padding(AppleMetrics.space4 / 2)
      }.scrollIndicators(.hidden).accessibilityElement(children: .contain)
        .accessibilityLabel(Copy.text(key))
    }
  }
  private func chip(_ label: String, selected: Bool, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Text(label).font(.system(size: AppleMetrics.font13)).padding(
        .horizontal, AppleMetrics.space12
      ).padding(.vertical, AppleMetrics.space8)
        .foregroundStyle(selected ? AppleColors.card : AppleColors.primary)
        .background(selected ? AppleColors.primary : AppleColors.card, in: Capsule())
    }
    .buttonStyle(.plain).accessibilityAddTraits(selected ? .isSelected : [])
  }
  private func nav(_ page: String, _ name: String, _ label: String) -> some View {
    Button {
      showRail()
      if page == "home" && model.page == "home" { homeTopRequest += 1 }
      model.presentNavigation(page)
    } label: {
      ZStack {
        if (model.settingsPresented ? "settings" : model.page) == page {
          if animated {
            Capsule().fill(AppleColors.primary.opacity(AppleMetrics.borderOpacity))
              .matchedGeometryEffect(id: "lens", in: navigation)
          } else {
            Capsule().fill(AppleColors.primary.opacity(AppleMetrics.borderOpacity))
              .transition(.opacity)
          }
        }
        NativeIcon(name: name, size: AppleMetrics.space22)
          .foregroundStyle(
            AppleColors.primary.opacity(
              (model.settingsPresented ? "settings" : model.page) == page
                ? 1 : 0.62))
      }.animation(
        animated
          ? .timingCurve(0.32, 0.72, 0, 1, duration: AppleMetrics.motionLens)
          : .linear(duration: AppleMetrics.motionReduced),
        value: model.settingsPresented ? "settings" : model.page
      )
      .frame(width: AppleMetrics.navTab, height: AppleMetrics.railRow - AppleMetrics.railInset * 2)
    }.buttonStyle(.plain).accessibilityLabel(Copy.text(label)).help(Copy.text(label))
  }
  private var selectionBar: some View {
    HStack(spacing: AppleMetrics.space8) {
      Text("\(model.selection.count)").font(.system(size: AppleMetrics.font14, design: .rounded))
        .monospacedDigit().padding(.leading, AppleMetrics.space12)
      iconButton("bookmark", "web.app.87aeb7040c82") { bulk("bookmarked") }
      iconButton("glasses", "web.app.d108c0a7e2c3") { bulk("later") }
      iconButton("tag", "web.app.b5816e5fd0be") { presentTags() }
      Rectangle().fill(AppleColors.primary.opacity(AppleMetrics.borderOpacity)).frame(
        width: 1, height: AppleMetrics.space24)
      iconButton("x", "web.app.74966e20df2e") { model.selection.removeAll() }
    }.padding(AppleMetrics.railInset).frame(height: AppleMetrics.railRow).modifier(GlassSurface())
      .overlay {
        Button {
          model.discussSelection()
        } label: {
          NativeIcon(name: "chat", size: AppleMetrics.space24).frame(
            maxWidth: .infinity, maxHeight: .infinity
          )
          .background(AppleColors.card, in: Capsule())
          .overlay(
            Capsule().strokeBorder(aiDropTargeted ? AppleColors.accent : .clear, lineWidth: 2)
          )
          .foregroundStyle(aiDropTargeted ? AppleColors.accent : AppleColors.primary)
        }.buttonStyle(.plain).accessibilityLabel(Copy.text("web.selection.aiOpen"))
          .focused($aiTargetFocused).opacity(aiDropTargeted || aiTargetFocused ? 1 : 0)
          .allowsHitTesting(aiDropTargeted || aiTargetFocused)
      }
      .dropDestination(for: String.self) { ids, _ in
        let valid = ids.filter { id in model.cards.contains { $0.id == id } }
        guard !valid.isEmpty else { return false }
        if !model.selection.isDisjoint(with: valid) {
          model.discussSelection()
        } else {
          model.aiCards = valid
          model.page = "ai"
        }
        aiDropTargeted = false
        return true
      } isTargeted: {
        aiDropTargeted = $0
        if $0 { showRail() }
      }
      .contextMenu {
        Button(Copy.text("web.selection.bookmark")) { bulk("bookmarked") }
        Button(Copy.text("web.selection.later")) { bulk("later") }
        Divider()
        Button(Copy.text("web.selection.tag")) { presentTags() }
        Divider()
        Button(Copy.text("web.selection.cancel")) {}
      }
  }
  private var metadataEditor: some View {
    VStack(alignment: .leading, spacing: AppleMetrics.space16) {
      HStack {
        Text(model.cards.first { $0.id == tagIds.first }?.title ?? "").font(
          .system(size: AppleMetrics.font15)
        ).foregroundStyle(AppleColors.secondary)
        Spacer()
        iconButton("x", "web.close") { tagEditor = false }
      }
      FlowLayout(spacing: AppleMetrics.space8) {
        ForEach(editingTags, id: \.self) { tag in
          HStack(spacing: AppleMetrics.space5) {
            Text(tag)
            Button {
              editingTags.removeAll { $0 == tag }
            } label: {
              NativeIcon(name: "x", size: AppleMetrics.font12)
            }
            .buttonStyle(.plain).accessibilityLabel(Copy.text("web.panels.0d1e7200becb") + tag)
          }.font(.system(size: AppleMetrics.font13)).padding(.horizontal, AppleMetrics.space10)
            .padding(.vertical, AppleMetrics.space8).background(AppleColors.surface, in: Capsule())
        }
      }
      TextField(Copy.text("web.panels.795cbff909c4"), text: $tagText).textFieldStyle(.plain)
        .accessibilityLabel(Copy.text("web.panels.7e2f159f6491")).onSubmit { appendTag() }
        .onChange(of: tagText) { if tagText.count > 30 { tagText = String(tagText.prefix(30)) } }
      FlowLayout(spacing: AppleMetrics.space8) {
        ForEach(tagSuggestions, id: \.self) { tag in
          chip(tag, selected: false) { if editingTags.count < 20 { editingTags.append(tag) } }
        }
      }
      TextField(Copy.text("web.panels.9cdbdc0a45a7"), text: $editingNote, axis: .vertical)
        .textFieldStyle(.plain).lineLimit(5...10)
        .accessibilityLabel(Copy.text("web.panels.daede9881787"))
        .padding(AppleMetrics.space12).background(
          AppleColors.surface, in: RoundedRectangle(cornerRadius: AppleMetrics.space12)
        )
        .onChange(of: editingNote) {
          if editingNote.count > 4000 { editingNote = String(editingNote.prefix(4000)) }
        }
      HStack(spacing: AppleMetrics.space8) {
        NativeIcon(name: "lock", size: AppleMetrics.font13)
        Text(Copy.text("web.panels.b7325aa77693")).font(.system(size: AppleMetrics.font13))
          .foregroundStyle(AppleColors.secondary)
        Spacer()
        Button(Copy.text("web.save")) {
          appendTag()
          var patches: [String: JSONValue] = [:]
          for (index, id) in tagIds.enumerated() {
            var values: [String: JSONValue] = [
              "tagsEdited": .bool(true), "tags": .array(editingTags.map(JSONValue.string)),
            ]
            if index == 0 { values["note"] = .string(editingNote) }
            patches[id] = .object(values)
          }
          tagSaving = true
          model.batchPatch(patches, expectedRevision: tagRevision)
        }.buttonStyle(CardPillStyle(primary: true, solid: true)).disabled(model.busy)
      }
    }.padding(AppleMetrics.railEdge).background(
      AppleColors.card, in: RoundedRectangle(cornerRadius: AppleMetrics.panelRadius))
  }
  private var tagSuggestions: [String] {
    let existing = model.cards.first { $0.id == tagIds.first }?.fields["tags"]?.strings ?? []
    var seen = Set(editingTags)
    return Array(
      (existing + [
        Copy.text("web.cards.bc62d1b6b936"), Copy.text("web.cards.ce9b12499c47"),
        Copy.text("web.cards.0e65f5e407c4"), Copy.text("web.cards.56c255e19858"), "AI",
        Copy.text("web.cards.15d208d1b4c9"),
      ]).filter { seen.insert($0).inserted }.prefix(6))
  }
  private func appendTag() {
    let value = tagText.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(
      of: "^#", with: "", options: .regularExpression)
    guard !value.isEmpty else { return }
    guard editingTags.count < 20 else {
      model.error = Copy.text("web.app.1859bc867672")
      return
    }
    if !editingTags.contains(value) { editingTags.append(String(value.prefix(30))) }
    tagText = ""
  }
  private func presentTags() {
    tagIds = model.cards.filter { model.selection.contains($0.id) }.map(\.id)
    tagRevision = model.revision
    let first = model.cards.first { $0.id == tagIds.first }
    editingTags = first.map { model.tags($0) } ?? []
    editingNote = tagIds.first.flatMap { model.items[$0]?["note"]?.string } ?? ""
    tagText = ""
    tagEditor = true
  }
  private func bulk(_ key: String) {
    let ids = Array(model.selection)
    let value = true
    guard !model.busy else { return }
    pendingUndo = Dictionary(
      uniqueKeysWithValues: ids.map {
        ($0, JSONValue.object([key: model.items[$0]?[key] ?? .bool(false)]))
      })
    pendingToast =
      key == "bookmarked"
      ? Copy.text("web.app.96e7ee93f3ba") + "\(ids.count)" + Copy.text("web.panels.e9e0fdc242b4")
      : key == "later" ? "\(ids.count)" + Copy.text("web.app.34d0636b70c8") : ""
    bulkPending = true
    model.patch(ids, values: [key: .bool(value)])
  }
  private var aiPage: some View {
    VStack(alignment: .leading, spacing: AppleMetrics.space16) {
      Text(Copy.text("web.ai.title")).font(.system(size: AppleMetrics.space20, weight: .semibold))
      ScrollView {
        VStack(spacing: AppleMetrics.space12) {
          ForEach(model.aiCards.compactMap { id in model.cards.first { $0.id == id } }) { card in
            VStack(alignment: .leading, spacing: AppleMetrics.space8) {
              Text(card.title).font(.system(size: AppleMetrics.font17, weight: .semibold))
              let excerpt = String((card.summary.isEmpty ? card.body : card.summary).prefix(180))
              if !excerpt.isEmpty {
                Text(excerpt).font(.system(size: AppleMetrics.font15)).foregroundStyle(
                  AppleColors.secondary)
              }
            }.padding(AppleMetrics.cardPadding).frame(maxWidth: .infinity, alignment: .leading)
              .background(
                AppleColors.card, in: RoundedRectangle(cornerRadius: AppleMetrics.cardRadius)
              )
              .overlay(
                RoundedRectangle(cornerRadius: AppleMetrics.cardRadius).strokeBorder(
                  AppleColors.primary.opacity(AppleMetrics.borderOpacity)))
          }
        }
      }.frame(maxHeight: .infinity)
        .accessibilityLabel(Copy.text("web.ai.context"))
      HStack(alignment: .bottom, spacing: AppleMetrics.space8) {
        TextField(Copy.text("web.ai.placeholder"), text: $model.aiDraft, axis: .vertical)
          .textFieldStyle(.plain).lineLimit(3...8)
          .accessibilityLabel(Copy.text("web.ai.composer"))
          .onChange(of: model.aiDraft) {
            if model.aiDraft.count > 4000 { model.aiDraft = String(model.aiDraft.prefix(4000)) }
          }
        iconButton("send", "web.ai.sendUnavailable") {}.disabled(true)
      }.padding(AppleMetrics.space12).background(
        AppleColors.surface, in: RoundedRectangle(cornerRadius: AppleMetrics.space12))
    }.frame(maxWidth: .infinity, maxHeight: .infinity)
      .dropDestination(for: String.self) { ids, _ in
        for id in ids
        where model.cards.contains(where: { $0.id == id }) && !model.aiCards.contains(id) {
          model.aiCards.append(id)
        }
        return true
      }
  }
  private func iconButton(_ name: String, _ label: String, action: @escaping () -> Void)
    -> some View
  {
    Button(action: action) {
      NativeIcon(name: name, size: AppleMetrics.space20).frame(
        width: AppleMetrics.hitTarget, height: AppleMetrics.hitTarget)
    }
    .buttonStyle(.plain).accessibilityLabel(Copy.text(label)).help(Copy.text(label))
  }
  private func overlay<Content: View>(@ViewBuilder content: () -> Content) -> some View {
    ZStack {
      AppleColors.dim.ignoresSafeArea().onTapGesture { dismissTop() }
      content().shadow(
        color: AppleColors.shadow.opacity(0.18), radius: AppleMetrics.space40,
        y: AppleMetrics.space24)
    }.frame(maxWidth: .infinity, maxHeight: .infinity)
  }
  private func dismissTop() {
    if tagEditor {
      tagEditor = false
    } else if model.selected != nil {
      model.selected = nil
    } else if archivePresented {
      archivePresented = false
    } else if model.capturePresented {
      model.capturePresented = false
    } else if model.settingsPresented {
      model.settingsPresented = false
    } else if !model.selection.isEmpty {
      model.selection.removeAll()
    } else {
      model.page = "home"
    }
  }
  private func observation(_ page: String) -> some View {
    Color.clear.frame(height: 0).id(page + "-top")
      .background(
        ScrollObservation(initialOffset: model.scrollOffsets[page] ?? 0) { offset, bottom, user in
          model.scrollOffsets[page] = offset
          guard model.page == page, user else { return }
          let delta = offset - lastOffset
          lastOffset = offset
          revealTask?.cancel()
          if offset <= AppleMetrics.space24 || bottom {
            showRail()
            return
          }
          if delta > 0 {
            downward += delta
            upward = 0
            if downward > AppleMetrics.chromeHideTravel { railHidden = true }
          } else if delta < 0 {
            upward -= delta
            downward = 0
            if upward > AppleMetrics.chromeShowTravel { showRail() }
          }
          if railHidden {
            revealTask = Task {
              try? await Task.sleep(for: .seconds(AppleMetrics.chromeRest))
              if !Task.isCancelled { showRail() }
            }
          }
        })
  }
  private func showRail() {
    railHidden = false
    downward = 0
    upward = 0
    revealTask?.cancel()
  }
  private var toastPaused: Bool {
    windowActivity == .inactive || toastHovered || toastFocused || undoFocused
  }
  private func showToast(_ text: String, undo: Bool = false) {
    toastTask?.cancel()
    toastText = text
    if !undo { undoPatches = [:] }
    toastLifetime = ToastLifetime(duration: .seconds(undo ? 5.5 : 3.2))
    updateToastTimer()
  }
  private func dismissToast() {
    toastTask?.cancel()
    toastTask = nil
    toastText = ""
    undoPatches = [:]
    toastLifetime = ToastLifetime(duration: .zero)
  }
  private func updateToastTimer() {
    toastTask?.cancel()
    toastTask = nil
    toastLifetime.pause(at: .now)
    guard !toastText.isEmpty, !toastPaused else { return }
    toastLifetime.resume(at: .now)
    let remaining = toastLifetime.remaining
    toastTask = Task {
      do { try await Task.sleep(for: remaining) } catch { return }
      guard !Task.isCancelled else { return }
      dismissToast()
    }
  }
  private func handleKey(_ event: NSEvent, _ typing: Bool) -> Bool {
    let key = event.charactersIgnoringModifiers?.lowercased() ?? ""
    let command = event.modifierFlags.contains(.command) || event.modifierFlags.contains(.control)
    if event.keyCode == 48 {
      showRail()
      return false
    }
    if command && key == "k" {
      model.presentNavigation("search")
      model.searchFocusRequest += 1
      return true
    }
    if event.keyCode == 53 {
      dismissTop()
      return true
    }
    if command && event.keyCode == 36 && model.capturePresented {
      if !captureText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        model.capture(captureText)
      }
      return true
    }
    if model.searchPresented && searchFocused && event.keyCode == 36 {
      model.selected = model.visible.first?.id
      return true
    }
    guard !typing else { return false }
    if command && key == "v" && model.page == "home" && model.selected == nil
      && !model.settingsPresented && !model.capturePresented,
      let text = NSPasteboard.general.string(forType: .string),
      !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    {
      model.capture(text)
      return true
    }
    if command && key == "a" && !model.settingsPresented && !model.capturePresented
      && model.selected == nil && model.page != "ai"
    {
      model.selection = Set((model.searchPresented ? model.visible : homeCards).map(\.id))
      return true
    }
    if !command && !event.modifierFlags.contains(.option) && !model.settingsPresented
      && !model.capturePresented && model.selected == nil && model.page == "home"
      && model.preferences["singleKeyShortcuts"]?.bool != false
    {
      switch key {
      case "n":
        model.capturePresented = true
        return true
      case "r":
        model.refresh()
        return true
      case "t":
        homeTopRequest += 1
        return true
      default: break
      }
    }
    if event.keyCode == 36 || event.keyCode == 49, let focusedCard, model.selected == nil {
      model.selected = focusedCard
      return true
    }
    return false
  }
  private func feedMargin(_ width: CGFloat) -> CGFloat {
    width <= 650
      ? AppleMetrics.space16 : width <= 1000 ? AppleMetrics.space24 : AppleMetrics.space40
  }
  private func grid(_ width: CGFloat) -> (
    count: Int, gap: CGFloat, maximum: CGFloat, ideal: CGFloat
  ) {
    let density = model.preferences["density"]?.string ?? "standard"
    let minimum =
      density == "compact"
      ? AppleMetrics.compactMinWidth
      : density == "roomy" ? AppleMetrics.roomyMinWidth : AppleMetrics.cardMinWidth
    let ideal =
      density == "compact"
      ? AppleMetrics.compactIdealWidth
      : density == "roomy" ? AppleMetrics.roomyIdealWidth : AppleMetrics.cardIdealWidth
    let maximum =
      density == "compact"
      ? AppleMetrics.compactMaxWidth
      : density == "roomy" ? AppleMetrics.roomyMaxWidth : AppleMetrics.cardMaxWidth
    let gap =
      width < minimum * 2 + AppleMetrics.space24
      ? AppleMetrics.space16 : width < 1000 ? AppleMetrics.space20 : AppleMetrics.space24
    let fits = max(1, Int((width + gap) / (minimum + gap)))
    return (
      max(1, min(5, fits, max(min(2, fits), Int((width + gap) / (ideal + gap))))),
      gap, maximum, ideal
    )
  }
}

/// Counts only the time for which a visible toast is available for reading.
struct ToastLifetime {
  private(set) var remaining: Duration
  private var started: ContinuousClock.Instant?

  init(duration: Duration) { remaining = duration }

  mutating func pause(at now: ContinuousClock.Instant) {
    guard let started else { return }
    remaining = max(.zero, remaining - started.duration(to: now))
    self.started = nil
  }

  mutating func resume(at now: ContinuousClock.Instant) {
    guard started == nil else { return }
    started = now
  }
}

/// Presentation identity outlives selection only while the reader fades out.
struct DetailPresentation {
  private(set) var cardID: String?
  var visible = false
  private(set) var generation = 0

  mutating func prepare(_ id: String?) -> Int {
    generation += 1
    if let id {
      if cardID == nil { visible = false }
      cardID = id
    }
    return generation
  }

  mutating func finishClose(_ closingGeneration: Int) {
    guard generation == closingGeneration, !visible else { return }
    cardID = nil
  }

  mutating func invalidate() { generation += 1 }
}

@MainActor extension Workspace {
  /// Navigation commits immediately; the lens animation never schedules a later page change.
  func presentNavigation(_ destination: String) {
    settingsPresented = destination == "settings"
    if destination != "settings" { page = destination }
  }
}
