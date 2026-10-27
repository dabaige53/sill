#if os(iOS)
  import SillKit
  import SwiftUI

  struct MobilePageHeader: View {
    let title: String
    var settings: (() -> Void)?
    var onTitle: (() -> Void)?
    var assistant = false
    var refresh: MobileRefresh?
    var error: (() -> Void)?

    var body: some View {
      HStack(spacing: AppleMetrics.space4) {
        if let onTitle {
          Button(title, action: onTitle).buttonStyle(.plain)
            .font(.system(size: AppleMetrics.font34, weight: .bold))
            .accessibilityAddTraits(.isHeader)
        } else {
          Text(title).font(.system(size: AppleMetrics.font34, weight: .bold))
            .accessibilityAddTraits(.isHeader)
        }
        Spacer()
        if let error {
          MobileIconButton(
            "info", label: Copy.text("mobile.error.title"), belowTip: true, action: error)
        }
        if assistant {
          circle("clock", label: "web.ai.history") {}.disabled(true)
          circle("plus", label: "web.ai.newChat") {}.disabled(true)
        } else if let settings {
          circle("person", label: "apple.settings", action: settings)
            .accessibilityIdentifier("settings-\(title)")
        }
      }
      .frame(height: AppleMetrics.railRow)
      .padding(.horizontal, AppleMetrics.space16)
      .background(AppleColors.canvas.opacity(AppleMetrics.headerEdgeOpacity))
      .background(.ultraThinMaterial)
      .overlay {
        if let refresh, refresh.phase != .idle { MobileRefreshIndicator(state: refresh) }
      }
    }
    private func circle(_ icon: String, label: String, action: @escaping () -> Void) -> some View {
      MobileIconButton(icon, label: Copy.text(label), belowTip: true, action: action)
        .background(
          Circle().fill(AppleColors.surface)
            .frame(width: AppleMetrics.mobileAvatarSize, height: AppleMetrics.mobileAvatarSize))
    }
  }

  struct MobileNavigation: View {
    @Binding var tab: String
    let filtered: Bool

    var body: some View {
      HStack(spacing: 0) {
        destination("home", icon: "home", label: "web.nav.home")
        destination("ai", icon: "chat", label: "web.nav.aiLabel")
        destination("search", icon: "search", label: "web.nav.search")
      }
      .padding(AppleMetrics.railInset)
      .frame(height: AppleMetrics.railRow)
      .mobileGlass(Capsule())
      .accessibilityElement(children: .contain)
      .accessibilityLabel(Copy.text("web.nav.label"))
    }
    private func destination(_ key: String, icon: String, label: String) -> some View {
      Button {
        MobileMotion.instantly { tab = key }
      } label: {
        MobileIcon(icon, size: AppleMetrics.space22)
          .foregroundStyle(
            AppleColors.primary.opacity(tab == key ? 1 : AppleMetrics.mobileInactiveIconOpacity)
          )
          .overlay(alignment: .topTrailing) {
            if key == "search" && filtered {
              Circle().fill(AppleColors.primary)
                .frame(width: AppleMetrics.space5, height: AppleMetrics.space5)
                .offset(x: AppleMetrics.space5, y: -AppleMetrics.space3)
            }
          }
          .frame(
            width: AppleMetrics.navTab, height: AppleMetrics.railRow - 2 * AppleMetrics.railInset
          )
          .background(tab == key ? AppleColors.glassPress : .clear, in: Capsule())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(Copy.text(label))
      .accessibilityAddTraits(tab == key ? .isSelected : [])
    }
  }

  struct MobileSelectionBar: View {
    let workspace: MobileWorkspace
    @Binding var selected: Set<String>
    let annotations: () -> Void
    let discuss: () -> Void

    var body: some View {
      HStack(spacing: 0) {
        Text(String(selected.count)).font(.system(size: AppleMetrics.font14, weight: .medium))
          .monospacedDigit().padding(.horizontal, AppleMetrics.space12)
          .accessibilityLabel(
            Copy.text("mobile.selection").replacingOccurrences(
              of: "{count}", with: String(selected.count)))
        MobileIconButton("bookmark", label: Copy.text("web.app.87aeb7040c82")) {
          batch("bookmarked")
        }
        MobileIconButton("glasses", label: Copy.text("web.app.d108c0a7e2c3")) { batch("later") }
        MobileIconButton("tag", label: Copy.text("web.app.b5816e5fd0be"), action: annotations)
        MobileIconButton("chat", label: Copy.text("web.selection.toAI"), action: discuss)
        Rectangle().fill(AppleColors.lineCard)
          .frame(width: AppleMetrics.lineWidth, height: AppleMetrics.toolbarSeparatorHeight)
          .padding(.horizontal, AppleMetrics.space4)
        MobileIconButton("x", label: Copy.text("apple.clearSelection")) {
          withAnimation(MobileMotion.fast) { selected = [] }
        }
      }
      .disabled(workspace.busy || workspace.unresolvedWrite)
      .padding(.horizontal, AppleMetrics.space4)
      .frame(height: AppleMetrics.railRow)
      .mobileGlass(Capsule())
      .accessibilityElement(children: .contain)
    }
    private func batch(_ field: String) {
      let ids = selected
      let cards = workspace.cards.filter { ids.contains($0.id) }
      let target =
        field == "bookmarked" ? !cards.allSatisfy(\.bookmarked) : !cards.allSatisfy(\.later)
      Task {
        if await workspace.batch(ids: ids, field: field, value: target) { selected = [] }
      }
    }
  }
#endif
