#if os(iOS)
  import SillKit
  import SwiftUI

  struct MobileSearch: View {
    let workspace: MobileWorkspace
    let state: MobileSearchState
    let chrome: MobileChromeState
    @Binding var selected: Set<String>
    let active: Bool
    let blocked: Bool
    let settings: () -> Void
    let open: (String) -> Void
    @State private var proxy = MobileScrollProxy()
    @State private var restoring = false
    @State private var suppressUntil = Date.distantPast

    private var results: [MobileCard] { state.results(workspace) }
    private var ordered: [MobileCard] {
      results.filter { !$0.archived } + results.filter(\.archived)
    }
    private var availableTypes: [String] {
      let found = Set(state.results(workspace, anyType: true).map(\.type))
      return state.availableTypes(matching: found)
    }
    private var options: [String] { state.options(workspace) }

    var body: some View {
      VStack(spacing: AppleMetrics.space12) {
        if state.browsing {
          MobilePageHeader(title: Copy.text("web.search.title"), settings: settings)
        }
        searchBar.zIndex(3)
        if !state.text.isEmpty && state.category == nil { types }
        ScrollView {
          LazyVStack(alignment: .leading, spacing: AppleMetrics.space12) {
            if state.browsing {
              categories
            } else {
              let shown = Array(ordered.prefix(state.limit))
              ForEach(shown) { card in
                if card.archived && card.id == shown.first(where: \.archived)?.id {
                  Text(Copy.text("web.search.shelvedGroup"))
                    .font(.system(size: AppleMetrics.font13))
                    .foregroundStyle(AppleColors.secondary)
                    .padding(.top, AppleMetrics.space16)
                }
                if card.archived {
                  MobileArchiveRow(workspace: workspace, card: card, query: state.text, open: open)
                } else {
                  tile(card).modifier(MobileCardMenuElevation())
                }
              }
              if ordered.count > state.limit {
                Color.clear.frame(height: AppleMetrics.space4)
                  .onAppear { state.limits[state.positionKey] = state.limit + 40 }
              }
              if results.isEmpty { MobileEmpty(search: true) }
            }
          }
          .padding(.horizontal, AppleMetrics.space16)
          .padding(.bottom, AppleMetrics.feedBottom)
          .frame(maxWidth: AppleMetrics.readerWidth)
          .frame(maxWidth: .infinity)
          .background(MobileScrollObserver(proxy: proxy, onChange: measured, onPan: pan))
        }
        .scrollDismissesKeyboard(.interactively)
        .simultaneousGesture(
          TapGesture().onEnded {
            state.focused = false
            state.hashDismissed = true
          })
      }
      .background(AppleColors.card)
      .onChange(of: state.positionKey) { _, _ in restore() }
      .onChange(of: state.query) { _, _ in
        state.highlighted = 0
        state.hashDismissed = false
      }
      .onChange(of: state.focused) { _, focused in if focused { chrome.show() } }
      .onChange(of: active) { _, active in if active { restore() } }
      .onChange(of: blocked) { _, blocked in
        if blocked {
          proxy.stop()
          state.focused = false
        }
      }
    }

    private var searchBar: some View {
      HStack(spacing: AppleMetrics.space8) {
        HStack(spacing: AppleMetrics.space8) {
          MobileIcon("search", size: AppleMetrics.space22)
          if state.hasTokens {
            ScrollView(.horizontal, showsIndicators: false) {
              HStack(spacing: AppleMetrics.space4) {
                if let category = state.category {
                  token(MobileSearchState.typeTitle(category), hash: false) { state.category = nil }
                }
                ForEach(state.conditions, id: \.self) { condition in
                  token("#" + MobileSearchState.conditionTitle(condition), hash: true) {
                    state.conditions.removeAll { $0 == condition }
                  }
                }
              }
            }.fixedSize(horizontal: false, vertical: true).frame(maxWidth: AppleMetrics.space160)
          }
          MobileSearchInput(
            text: Binding(get: { state.query }, set: { state.query = $0 }),
            focused: Binding(get: { state.focused }, set: { state.focused = $0 }),
            placeholder: state.hasTokens ? "" : Copy.text("web.search.inputPlaceholder"),
            backspace: state.backspace,
            move: { direction in
              state.highlighted = max(0, min(options.count - 1, state.highlighted + direction))
            },
            submit: {
              guard state.hash != nil, options.indices.contains(state.highlighted) else {
                return false
              }
              state.choose(options[state.highlighted])
              return true
            },
            escape: {
              if state.hash != nil {
                state.hashDismissed = true
              } else if !state.query.isEmpty {
                state.query = ""
              } else if state.hasTokens {
                state.conditions = []
                state.category = nil
              } else {
                state.focused = false
              }
            }
          )
          .frame(minWidth: AppleMetrics.space44, minHeight: AppleMetrics.hitTarget)
          if !state.query.isEmpty {
            Button {
              state.query = ""
            } label: {
              MobileIcon("x", size: AppleMetrics.space16)
            }
            .buttonStyle(.plain).frame(
              width: AppleMetrics.searchClearSize, height: AppleMetrics.hitTarget
            )
            .accessibilityLabel(Copy.text("web.search.clear"))
          }
          Button {
          } label: {
            MobileIcon("mic", size: AppleMetrics.space22)
          }
          .buttonStyle(.plain).disabled(true).accessibilityLabel(Copy.text("web.ai.speak"))
        }
        .padding(.horizontal, AppleMetrics.space12)
        .frame(height: AppleMetrics.hitTarget)
        .background(AppleColors.surface, in: Capsule())
        if !state.browsing {
          MobileIconButton("x", label: Copy.text("web.search.reset")) {
            state.reset()
            chrome.show()
          }
        }
      }
      .padding(.horizontal, AppleMetrics.space16)
      .overlay(alignment: .topLeading) {
        if !options.isEmpty {
          hashList.padding(.top, AppleMetrics.hitTarget + AppleMetrics.space8)
            .padding(.horizontal, AppleMetrics.space16)
        }
      }
    }

    private func token(_ title: String, hash: Bool, action: @escaping () -> Void) -> some View {
      Button(title, action: action)
        .font(.system(size: AppleMetrics.font13, weight: .medium))
        .foregroundStyle(AppleColors.card)
        .padding(.horizontal, AppleMetrics.searchTokenPaddingX)
        .frame(height: AppleMetrics.searchTokenHeight)
        .background(hash ? AppleColors.accent : AppleColors.primary, in: Capsule())
        .buttonStyle(.plain)
        .accessibilityLabel(Copy.text("web.search.removeCondition") + " " + title)
    }

    private var hashList: some View {
      ScrollView {
        VStack(alignment: .leading, spacing: 0) {
          optionGroup(tag: false, label: "web.search.hashStatus")
          optionGroup(tag: true, label: "web.search.hashTag")
        }.padding(AppleMetrics.space8)
      }
      .frame(maxHeight: AppleMetrics.space220)
      .background(AppleColors.card, in: RoundedRectangle(cornerRadius: AppleMetrics.controlRadius))
      .shadow(
        color: .black.opacity(AppleMetrics.shadowFloatFarOpacity),
        radius: AppleMetrics.shadowFloatFarBlur, y: AppleMetrics.shadowFloatFarY
      )
      .accessibilityLabel(Copy.text("web.search.hashList"))
    }
    @ViewBuilder private func optionGroup(tag: Bool, label: String) -> some View {
      let group = options.filter { $0.hasPrefix("tag:") == tag }
      if !group.isEmpty {
        Text(Copy.text(label)).font(.system(size: AppleMetrics.font12))
          .foregroundStyle(AppleColors.secondary).padding(AppleMetrics.space8)
        ForEach(group, id: \.self) { option in
          Button {
            state.choose(option)
          } label: {
            Text((tag ? "#" : "") + MobileSearchState.conditionTitle(option))
              .frame(maxWidth: .infinity, minHeight: AppleMetrics.hitTarget, alignment: .leading)
              .padding(.horizontal, AppleMetrics.space8)
              .background(
                options.firstIndex(of: option) == state.highlighted ? AppleColors.surface : .clear,
                in: RoundedRectangle(cornerRadius: AppleMetrics.settingsNavRadius))
          }.buttonStyle(.plain)
        }
      }
    }

    private var types: some View {
      ScrollViewReader { reader in
        ScrollView(.horizontal, showsIndicators: false) {
          HStack(spacing: AppleMetrics.space8) {
            ForEach(availableTypes, id: \.self) { type in
              Button {
                state.type = type == "all" ? nil : type
              } label: {
                Text(MobileSearchState.typeTitle(type))
                  .font(
                    .system(
                      size: AppleMetrics.font14,
                      weight: (state.type ?? "all") == type ? .semibold : .regular)
                  )
                  .padding(.horizontal, AppleMetrics.pillPaddingX)
                  .frame(height: AppleMetrics.mobilePillHeight)
                  .foregroundStyle(
                    (state.type ?? "all") == type ? AppleColors.card : AppleColors.primary
                  )
                  .background(
                    (state.type ?? "all") == type ? AppleColors.primary : AppleColors.surface,
                    in: Capsule())
              }.buttonStyle(.plain).id(type)
            }
          }.padding(.horizontal, AppleMetrics.space16)
        }
        .onChange(of: state.type) { _, type in reader.scrollTo(type ?? "all", anchor: .center) }
      }.frame(height: AppleMetrics.hitTarget)
    }

    private var categories: some View {
      LazyVGrid(
        columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: AppleMetrics.space12
      ) {
        ForEach(MobileSearchState.kinds) { kind in
          Button {
            state.category = kind.id
            state.type = nil
          } label: {
            MobileCoverImage(source: kind.artwork)
              .aspectRatio(AppleMetrics.mobileCategoryAspect, contentMode: .fill)
              .overlay(alignment: .bottomLeading) {
                Text(Copy.text(kind.label))
                  .font(.system(size: AppleMetrics.font19, weight: .semibold))
                  .foregroundStyle(.white).padding(AppleMetrics.space16)
                  .shadow(
                    color: .black.opacity(AppleMetrics.shadowSheetFarOpacity),
                    radius: AppleMetrics.space4)
              }
              .clipShape(RoundedRectangle(cornerRadius: AppleMetrics.space12))
          }.buttonStyle(.plain)
        }
      }.padding(.top, AppleMetrics.space4)
    }
    private func tile(_ card: MobileCard) -> some View {
      MobileCardTile(
        workspace: workspace, card: card, query: state.text,
        selected: selected.contains(card.id), onSelect: { select(card.id) }, openRelated: open
      ) {
        guard suppressUntil <= .now else { return }
        if selected.isEmpty {
          state.focused = false
          open(card.id)
        } else {
          select(card.id)
        }
      }
      .simultaneousGesture(
        LongPressGesture(minimumDuration: AppleMetrics.holdToSelect).onEnded { _ in
          suppressUntil = .now.addingTimeInterval(AppleMetrics.holdToSelect)
          select(card.id)
        })
    }
    private func select(_ id: String) {
      if selected.contains(id) { selected.remove(id) } else { selected.insert(id) }
      chrome.show()
    }
    private func measured(_ metrics: MobileScrollMetrics) {
      guard active, !blocked, !restoring else { return }
      state.offsets[state.positionKey] = max(0, metrics.offset)
      chrome.scrolled(metrics)
    }
    private func restore() {
      restoring = true
      let offset = state.offsets[state.positionKey] ?? 0
      Task { @MainActor in
        await Task.yield()
        proxy.scroll(to: offset)
        chrome.sync(offset)
        restoring = false
      }
    }
    private func pan(_ sample: MobilePanSample) {
      guard active, !blocked, sample.phase == .ended, state.category == nil,
        !state.text.isEmpty, abs(sample.translation.width) > AppleMetrics.gestureFlickDistance,
        abs(sample.translation.width) > abs(sample.translation.height)
          * AppleMetrics.mobileGestureDirectionRatio
      else { return }
      let choices = availableTypes
      guard let current = choices.firstIndex(of: state.type ?? "all") else { return }
      let next = current + (sample.translation.width < 0 ? 1 : -1)
      guard choices.indices.contains(next) else { return }
      state.type = choices[next] == "all" ? nil : choices[next]
    }
  }
#endif
