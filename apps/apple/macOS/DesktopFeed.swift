import AppKit
import SillKit
import SwiftUI

extension Desktop {
  var feed: some View {
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
          .safeAreaInset(edge: .top, spacing: 0) {
            homeHeader.padding(.horizontal, feedMargin(geometry.size.width))
              .opacity(railHidden ? 0 : 1)
              .offset(y: railHidden ? -AppleMetrics.motionRailTravel : 0)
              .animation(
                .timingCurve(0.32, 0.72, 0, 1, duration: AppleMetrics.motionRailShow),
                value: railHidden
              )
              .allowsHitTesting(!railHidden)
          }
          .onChange(of: homeTopRequest) {
            withAnimation(homeTopImmediate ? nil : .easeOut) {
              proxy.scrollTo("home-top", anchor: .top)
            }
          }
      }
    }
  }
  private var homeHeader: some View {
    HStack {
      Button("Sill") { requestHomeTop() }
        .buttonStyle(.plain)
        .font(.system(size: AppleMetrics.font34, weight: .bold))
      Spacer()
      Button {
        model.presentNavigation("settings")
      } label: {
        NativeIcon(name: "person", size: AppleMetrics.space22)
          .frame(width: AppleMetrics.space36, height: AppleMetrics.space36)
          .background(AppleColors.surface, in: Circle())
          .frame(width: AppleMetrics.hitTarget, height: AppleMetrics.hitTarget)
      }.buttonStyle(.plain).accessibilityLabel(Copy.text("web.nav.settings"))
        .help(Copy.text("web.nav.settings"))
    }.frame(height: AppleMetrics.railRow)
      .background(AppleColors.canvas.opacity(0.94))
  }
  var homeCards: [Card] {
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
  var archivePanel: some View {
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
  private var searchCategories: [(type: String, label: String, artwork: String)] {
    [
      ("article", "web.search.type.article", "architecture"),
      ("mail", "web.search.type.mail", "coast"),
      ("note", "web.note", "botanical"),
      ("task", "web.task", "mountain"),
      ("event", "web.event", "coast"),
      ("media", "web.media", "mountain"),
    ]
  }
  var searchPage: some View {
    GeometryReader { geometry in
      let searching =
        !model.query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        || model.typeFilter != "all" || model.filter != Copy.appleAll
        || !model.tagFilter.isEmpty
      VStack(spacing: AppleMetrics.space16) {
        HStack {
          Text(Copy.text("web.search.title"))
            .font(.system(size: AppleMetrics.font17, weight: .semibold))
          Spacer()
          iconButton("person", "web.nav.settings") { model.presentNavigation("settings") }
            .background(AppleColors.surface, in: Circle())
        }
        HStack(spacing: AppleMetrics.space8) {
          HStack(spacing: AppleMetrics.space8) {
            NativeIcon(name: "search", size: AppleMetrics.space22).foregroundStyle(
              AppleColors.primary)
            TextField(Copy.text("web.panels.a76ee88e6c2e"), text: $model.query).textFieldStyle(
              .plain
            )
            .font(.system(size: AppleMetrics.font17)).focused($searchFocused)
            .onAppear { searchFocused = true }.onChange(of: model.searchFocusRequest) {
              searchFocused = true
            }
            if !model.query.isEmpty {
              iconButton("x", "web.panels.b6f00afa6537") { model.query = "" }
            } else {
              iconButton("mic", "web.ai.speak") {}.disabled(true)
            }
          }.padding(.leading, AppleMetrics.space12).padding(.trailing, AppleMetrics.space10)
            .frame(height: AppleMetrics.searchPillHeight).background(
              AppleColors.surface, in: Capsule())
        }
        if searching {
          ScrollView(.horizontal) {
            HStack(spacing: AppleMetrics.space8) {
              chip(Copy.text("web.all"), selected: model.typeFilter == "all") {
                model.typeFilter = "all"
              }
              ForEach(searchCategories, id: \.type) { category in
                chip(Copy.text(category.label), selected: model.typeFilter == category.type) {
                  model.typeFilter = category.type
                }
              }
            }.padding(AppleMetrics.space4 / 2)
          }.scrollIndicators(.hidden).accessibilityLabel(Copy.text("web.search.filters.type"))
        }
        DisclosureGroup(isExpanded: $searchFiltersExpanded) {
          VStack(spacing: AppleMetrics.space8) {
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
          }.padding(.top, AppleMetrics.space8)
        } label: {
          HStack(spacing: AppleMetrics.space8) {
            Text(Copy.text("web.search.filtersLabel"))
            if model.filter != Copy.appleAll {
              Text(model.filter).foregroundStyle(AppleColors.secondary)
            }
            if !model.tagFilter.isEmpty {
              Text("#" + model.tagFilter).foregroundStyle(AppleColors.secondary)
            }
          }
        }.font(.system(size: AppleMetrics.font14)).tint(AppleColors.primary)
        ScrollViewReader { proxy in
          ScrollView {
            observation("search")
            let all = searching ? model.visible : []
            let desk = Array(
              all.filter { model.items[$0.id]?["archived"]?.bool != true }.prefix(searchLimit))
            let shelved = Array(
              all.filter { model.items[$0.id]?["archived"]?.bool == true }.prefix(
                max(0, searchLimit - desk.count)))
            if !searching {
              LazyVGrid(
                columns: Array(
                  repeating: GridItem(.flexible(), spacing: AppleMetrics.space12),
                  count: geometry.size.width > 650 ? 3 : 2),
                spacing: AppleMetrics.space12
              ) {
                ForEach(searchCategories, id: \.type) { category in
                  Button {
                    model.typeFilter = category.type
                  } label: {
                    Color.clear.aspectRatio(16 / 9, contentMode: .fit)
                      .overlay {
                        GeometryReader { size in
                          Image(category.artwork, bundle: .module).resizable().scaledToFill()
                            .frame(width: size.size.width, height: size.size.height).clipped()
                        }
                      }
                      .overlay(Color.black.opacity(0.18))
                      .overlay(alignment: .bottomLeading) {
                        Text(Copy.text(category.label)).font(
                          .system(size: AppleMetrics.font17, weight: .semibold)
                        )
                        .foregroundStyle(.white).shadow(
                          color: .black.opacity(0.55), radius: 3, y: 1
                        )
                        .padding(AppleMetrics.space12)
                      }
                      .clipShape(RoundedRectangle(cornerRadius: AppleMetrics.space12))
                  }.buttonStyle(.plain)
                }
              }
            } else if all.isEmpty {
              Text(
                model.query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                  ? Copy.text("web.app.4a684ec67af5")
                  : Copy.text("web.panels.11a8f9879575") + model.query + "」"
              ).foregroundStyle(
                AppleColors.secondary
              ).padding(AppleMetrics.space24)
            } else if searching {
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
              if searching && searchLimit < all.count { searchLimit += 40 }
            }
          }.scrollIndicators(.hidden)
            .onChange(of: model.query) { resetSearch(proxy) }
            .onChange(of: model.typeFilter) { resetSearch(proxy) }
            .onChange(of: model.filter) { resetSearch(proxy) }
            .onChange(of: model.tagFilter) { resetSearch(proxy) }
        }
      }.padding(.horizontal, AppleMetrics.space40).padding(.top, AppleMetrics.space16)
    }.background(AppleColors.card)
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
}
