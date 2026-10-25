#if os(iOS)
  import SillKit
  import SwiftUI
  import UIKit

  /// Phone card surfaces follow the PWA card renderer, with dedicated controls outside open buttons.
  struct MobileCardTile: View {
    let workspace: MobileWorkspace
    let card: MobileCard
    var query = ""
    var selected = false
    var onSelect: () -> Void = {}
    var stackLabel: String? = nil
    var onExpand: (() -> Void)? = nil
    var openRelated: ((String) -> Void)? = nil
    let open: () -> Void
    @State private var pressed = false
    @State private var menuOpen = false
    @State private var menuVisible = false
    @State private var annotation: MobileCard?
    @State private var closeTask: Task<Void, Never>?
    @ScaledMetric(relativeTo: .body) private var dynamicScale: CGFloat = 1

    var body: some View {
      let faded = card.faded(
        fadeRead: workspace.preferences["fadeRead"]?.bool ?? true,
        now: MobileFormat.milliseconds())
      let shape = RoundedRectangle(cornerRadius: AppleMetrics.mobileCardRadius)
      MobileCardBody(
        workspace: workspace, card: card, query: query, faded: faded,
        scale: dynamicScale * AppleMetrics.mobileTextScale
          * MobileContentStyle.text(workspace.preferences["cardTextSize"]?.string),
        strong: workspace.preferences["textWeight"]?.string == "strong",
        paddingScale: MobileContentStyle.spacing(workspace.preferences["cardPadding"]?.string),
        stackLabel: stackLabel, pressed: $pressed, open: open, titleAction: onExpand ?? open,
        openRelated: openRelated
      )
      .background {
        Button(action: open) { shape.fill(faded ? AppleColors.readCard : AppleColors.card) }
          .buttonStyle(MobileCardOpenStyle(pressed: $pressed)).accessibilityHidden(true)
      }
      .clipShape(shape)
      .overlay(
        shape.strokeBorder(
          selected
            ? AppleColors.accent
            : faded ? AppleColors.lineRead : AppleColors.lineCard,
          lineWidth: selected ? AppleMetrics.selectionLineWidth : AppleMetrics.lineWidth)
      )
      .overlay(alignment: .bottomTrailing) { more.padding(AppleMetrics.space4) }
      .mobileShadow(.card, visible: !faded)
      .scaleEffect(pressed && !menuOpen ? AppleMetrics.motionPressScale : 1)
      .animation(MobileMotion.press, value: pressed)
      .animation(MobileMotion.read, value: faded)
      .overlay { if menuOpen { menuLayer } }
      .zIndex(menuOpen ? 1 : 0)
      .preference(key: MobileCardMenuPresence.self, value: menuOpen)
      .sheet(item: $annotation) { baseline in
        MobileBatchAnnotations(workspace: workspace, baselines: [baseline])
          .presentationDetents([.medium, .large]).presentationDragIndicator(.visible)
      }
      .onDisappear {
        closeTask?.cancel()
        menuOpen = false
        menuVisible = false
      }
      .accessibilityElement(children: .contain)
      .accessibilityAddTraits(selected ? .isSelected : [])
      .accessibilityIdentifier("card-\(card.id)")
    }

    private var more: some View {
      Button {
        if menuOpen {
          closeMenu()
        } else {
          closeTask?.cancel()
          pressed = false
          menuOpen = true
        }
      } label: {
        MobileIcon("more", size: AppleMetrics.space20).foregroundStyle(AppleColors.secondary)
          .frame(width: AppleMetrics.hitTarget, height: AppleMetrics.hitTarget)
          .contentShape(Rectangle())
      }.buttonStyle(MobilePressStyle())
        .accessibilityLabel(Copy.text("web.templates.ee9430845e26"))
    }
    private var menuLayer: some View {
      GeometryReader { proxy in
        let box = proxy.frame(in: .global)
        let height = AppleMetrics.space12 + AppleMetrics.hitTarget * (card.isReadable ? 5 : 4)
        let floor =
          UIScreen.main.bounds.height - proxy.safeAreaInsets.bottom - AppleMetrics.railRow
          - AppleMetrics.space12
        let top = max(
          AppleMetrics.cardMenuEdge - box.minY,
          min(AppleMetrics.cardMenuTop, floor - box.minY - height))
        ZStack(alignment: .topLeading) {
          Color.clear.contentShape(Rectangle())
            .frame(width: UIScreen.main.bounds.width, height: UIScreen.main.bounds.height)
            .offset(x: -box.minX, y: -box.minY).onTapGesture { closeMenu() }
          menuItems
            .frame(
              width: min(
                AppleMetrics.cardMenuWidth, proxy.size.width - AppleMetrics.cardMenuInset * 2)
            )
            .opacity(menuVisible ? 1 : 0)
            .scaleEffect(menuVisible ? 1 : AppleMetrics.motionMenuScale, anchor: .topTrailing)
            .offset(y: menuVisible ? 0 : -AppleMetrics.motionMenuY)
            .offset(
              x: max(
                AppleMetrics.cardMenuInset,
                proxy.size.width - AppleMetrics.cardMenuInset - AppleMetrics.cardMenuWidth), y: top)
        }.onAppear { withAnimation(MobileMotion.menuOpen) { menuVisible = true } }
      }
    }
    private var menuItems: some View {
      VStack(spacing: 0) {
        menuItem("bookmark", card.bookmarked ? "web.preview.removeBookmark" : "web.bookmark") {
          Task { await workspace.toggle(card, field: "bookmarked") }
        }
        menuItem("glasses", card.later ? "web.app.1056291ba162" : "web.later") {
          Task { await workspace.toggle(card, field: "later") }
        }
        menuItem("tag", "web.app.09fe39e89e28") { annotation = card }
        if card.isReadable {
          menuItem(
            card.read ? "undo" : "circle",
            card.read ? "web.app.fe32886b3172" : "web.app.82f35d89b827"
          ) {
            Task { await workspace.toggle(card, field: "read") }
          }
        }
        menuItem(
          "check-circle", selected ? "web.app.74966e20df2e" : "web.app.c11330b85234",
          action: onSelect)
      }.padding(AppleMetrics.space6)
        .background(
          AppleColors.card, in: RoundedRectangle(cornerRadius: AppleMetrics.cardMenuRadius)
        )
        .overlay(
          RoundedRectangle(cornerRadius: AppleMetrics.cardMenuRadius)
            .strokeBorder(AppleColors.line, lineWidth: AppleMetrics.lineWidth)
        )
        .mobileShadow(.glass)
        .disabled(workspace.busy || workspace.unresolvedWrite)
        .allowsHitTesting(menuVisible)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Copy.text("web.templates.ee9430845e26"))
    }
    private func menuItem(_ icon: String, _ key: String, action: @escaping () -> Void) -> some View
    {
      Button {
        closeMenu()
        action()
      } label: {
        HStack(spacing: AppleMetrics.space12) {
          MobileIcon(icon, size: AppleMetrics.font18)
          Text(Copy.text(key)).lineLimit(1)
          Spacer(minLength: 0)
        }.font(.system(size: AppleMetrics.font14)).foregroundStyle(AppleColors.primary)
          .padding(.horizontal, AppleMetrics.space12).frame(minHeight: AppleMetrics.hitTarget)
          .contentShape(Rectangle())
      }.buttonStyle(MobilePressStyle())
    }
    private func closeMenu() {
      withAnimation(MobileMotion.menuClose) { menuVisible = false }
      closeTask?.cancel()
      closeTask = Task {
        do { try await Task.sleep(for: .seconds(AppleMetrics.motionMenuClose)) } catch { return }
        menuOpen = false
      }
    }
    static func icon(_ type: String) -> String {
      switch type {
      case "article": "book"
      case "mail": "mail"
      case "note": "note"
      case "task": "check-circle"
      case "event": "calendar"
      case "reminder": "bell"
      case "media": "video"
      case "digest": "chart"
      case "suggestion": "sparkles"
      case "photo": "image"
      case "file": "folder"
      case "pr": "pull"
      default: "file"
      }
    }
  }
  /// Shared content preferences leave controls at their normal system size.
  enum MobileContentStyle {
    static func lineSpacing(_ size: CGFloat, ratio: CGFloat) -> CGFloat {
      max(0, size * ratio - UIFont.systemFont(ofSize: size).lineHeight)
    }
    static func text(_ value: String?) -> CGFloat {
      switch value {
      case "small": AppleMetrics.layoutTextSmall
      case "large": AppleMetrics.layoutTextLarge
      default: 1
      }
    }
    static func spacing(_ value: String?) -> CGFloat {
      switch value {
      case "compact": AppleMetrics.layoutSpaceCompact
      case "roomy": AppleMetrics.layoutSpaceRoomy
      default: 1
      }
    }
    static func font(
      _ size: CGFloat, weight: Font.Weight = .regular, design: Font.Design = .default,
      scale: CGFloat, strong: Bool
    ) -> Font {
      let resolved: Font.Weight = strong ? (weight == .regular ? .medium : .bold) : weight
      return .system(size: size * scale, weight: resolved, design: design)
    }
  }
#endif
