import SillKit
import SwiftUI

struct AIDock: View {
  /// The window, for the panel's and the full view's height.
  let window: CGSize
  @Environment(AIContext.self) private var context
  @Environment(CardDrag.self) private var drag
  @Environment(Reader.self) private var reader
  @FocusState private var focused: Bool
  @State private var threadHeight: CGFloat = 0
  @State private var hovered = false
  @State private var shrinkHovered = false
  @State private var lastDrag: CGFloat = 0
  @State private var collapseLeft = false
  @FocusState private var bubbleFocused: Bool

  private var minimized: Bool { context.minimized && !carrying && !grown }
  private func bounds(_ width: CGFloat) -> ClosedRange<CGFloat> {
    let panel = min(AppleMetrics.aiDockWidth, max(0, width - 2 * AppleMetrics.railEdge))
    let drawnWidth =
      minimized
      ? AppleMetrics.railRow
      : (height == .full ? min(AppleMetrics.aiFullWidth, width - 2 * AppleMetrics.railEdge) : panel)
    let base = minimized ? (panel - drawnWidth) / 2 * (collapseLeft ? -1 : 1) : 0
    let half = max(0, (width - drawnWidth) / 2 - AppleMetrics.railEdge)
    return (-half - base)...(half - base)
  }
  private var offset: CGFloat {
    let range = bounds(window.width)
    return min(range.upperBound, max(range.lowerBound, context.horizontalOffset))
  }
  private var moveGesture: some Gesture {
    DragGesture(minimumDistance: AppleMetrics.space4, coordinateSpace: .global)
      .onChanged { value in
        guard abs(value.translation.width) > abs(value.translation.height) else { return }
        let range = bounds(window.width)
        let next = offset + value.translation.width - lastDrag
        Motion.instantly {
          context.horizontalOffset = min(range.upperBound, max(range.lowerBound, next))
        }
        lastDrag = value.translation.width
      }
      .onEnded { _ in lastDrag = 0 }
  }

  private var session: AISession? { context.session }
  private var height: AIHeight { session == nil ? .line : context.height }
  private var grown: Bool { height != .line }
  private var panelWidth: CGFloat {
    min(AppleMetrics.aiDockWidth, window.width - 2 * AppleMetrics.railEdge)
  }
  private var fullWidth: CGFloat {
    min(AppleMetrics.aiFullWidth, window.width - 2 * AppleMetrics.railEdge)
  }

  var body: some View {
    VStack(alignment: .leading, spacing: AppleMetrics.space8) {
      if !grown && !minimized {
        // The shrink button occupies the upper-right corner; it must not cover a chip's X.
        AIContextCards().padding(.trailing, AppleMetrics.hitTarget + AppleMetrics.space8)
      }
      surface
    }
    .frame(width: height == .full ? fullWidth : panelWidth)
    .offset(x: offset)
    .onChange(of: window.width) { old, new in
      let previous = bounds(old)
      let next = bounds(new)
      let fraction =
        previous.upperBound > previous.lowerBound
        ? (context.horizontalOffset - previous.lowerBound)
          / (previous.upperBound - previous.lowerBound) : 0.5
      context.horizontalOffset =
        next.lowerBound + min(1, max(0, fraction)) * (next.upperBound - next.lowerBound)
    }
    .onChange(of: minimized) { context.horizontalOffset = offset }
    .animation(
      Motion.keyboardDriven
        ? nil
        : Motion.sheet(minimized ? AppleMetrics.aiCollapseDuration : AppleMetrics.aiExpandDuration),
      value: minimized)
  }

  private var surface: some View {
    let shape = RoundedRectangle(
      cornerRadius: grown ? AppleMetrics.sheetRadius : AppleMetrics.aiDockRadius,
      style: .continuous)
    return
      layout
      .opacity(minimized ? 0 : 1)
      .animation(
        Motion.keyboardDriven
          ? nil
          : Motion.ease(
            minimized
              ? AppleMetrics.aiCollapseContentDuration : AppleMetrics.aiExpandContentDuration
          ).delay(minimized ? 0 : AppleMetrics.aiBubbleDuration), value: minimized
      )
      .allowsHitTesting(!minimized)
      .accessibilityHidden(minimized)
      .frame(maxWidth: height == .line ? AppleMetrics.aiDockWidth : nil)
      .frame(
        width: height == .full ? fullWidth : height == .panel ? panelWidth : nil,
        height: height == .full ? window.height - AppleMetrics.aiFullInset : nil
      )
      // Panel and full view: the glass turns into the solid card surface.
      .background { shape.fill(AppleColors.card).opacity(grown ? 1 : 0) }
      .clipShape(shape)
      // While a card is carried, rings keep spreading out of the box: it takes cards.
      .background {
        if carrying { DropPulse() }
      }
      .desktopGlass(shape)
      .shadow(.sheet, visible: grown)
      .mask(alignment: collapseLeft ? .topLeading : .topTrailing) {
        RoundedRectangle(cornerRadius: AppleMetrics.aiDockRadius)
          .frame(
            width: minimized ? AppleMetrics.railRow : (height == .full ? fullWidth : panelWidth),
            height: minimized ? AppleMetrics.railRow : nil)
      }
      .overlay(alignment: minimized && collapseLeft ? .topLeading : .topTrailing) {
        if minimized {
          Button {
            withAnimation(Motion.keyboardDriven ? nil : Motion.sheet(AppleMetrics.aiExpandDuration))
            { context.minimized = false }
            context.requestFocus()
          } label: {
            Icon("chat", size: AppleMetrics.space20)
              .frame(width: AppleMetrics.railRow, height: AppleMetrics.railRow)
          }.buttonStyle(IconPress(highlight: false))
            .focused($bubbleFocused)
            .highPriorityGesture(moveGesture)
            .onKeyPress(.leftArrow) {
              move(-1)
              return .handled
            }
            .onKeyPress(.rightArrow) {
              move(1)
              return .handled
            }
            .accessibilityLabel(Copy.text("web.ai.dock"))
            .transition(
              Motion.keyboardDriven
                ? .identity
                : .opacity.animation(
                  Motion.ease(AppleMetrics.aiBubbleDuration).delay(
                    minimized ? AppleMetrics.aiCollapseContentDuration : 0)))
        } else if !grown {
          Button {
            focused = false
            collapseLeft = context.horizontalOffset < 0
            withAnimation(
              Motion.keyboardDriven ? nil : Motion.sheet(AppleMetrics.aiCollapseDuration)
            ) {
              context.minimized = true
            }
            bubbleFocused = true
          } label: {
            Icon("ai-minimize", size: AppleMetrics.space16)
              .frame(width: AppleMetrics.space44, height: AppleMetrics.space44)
          }.buttonStyle(IconPress(highlight: false))
            .opacity(hovered || shrinkHovered || focused ? 1 : 0)
            .allowsHitTesting(hovered || shrinkHovered || focused)
            .onHover { shrinkHovered = $0 }
            .accessibilityLabel(Copy.text("ai.shrink"))
            .offset(y: -AppleMetrics.space44)
        }
      }
      .onHover { hovered = $0 }
      // Web `.ai-dock.is-ready`: a carried card over the box tints it and draws a 2px accent ring.
      .overlay {
        if drag.ready {
          shape.fill(AppleColors.accent.opacity(AppleMetrics.aiReadyTint))
            .shadow(
              color: AppleColors.accent.opacity(AppleMetrics.aiReadyGlowOpacity),
              radius: AppleMetrics.aiReadyGlowBlur / 4, y: AppleMetrics.aiReadyGlowY / 2
            )
            .allowsHitTesting(false)
        }
      }
      .overlay {
        if drag.ready {
          shape.strokeBorder(AppleColors.accent, lineWidth: AppleMetrics.selectionLineWidth)
            .allowsHitTesting(false)
        }
      }
      // The box grows a little while a card is carried and a little more once it is over the box.
      .scaleEffect(
        grown
          ? 1
          : drag.ready ? AppleMetrics.aiDropReadyScale : carrying ? AppleMetrics.aiDropScale : 1
      )
      .animation(Motion.spring(), value: carrying)
      .animation(Motion.spring(), value: drag.ready)
      .onGeometryChange(for: CGRect.self) {
        $0.frame(in: .global)
      } action: {
        drag.target = $0
      }
      .onChange(of: context.focusRequest) { focused = true }
      .onChange(of: context.blurRequest) { focused = false }
      .onChange(of: focused) { _, value in context.focused = value }
  }

  private func move(_ direction: CGFloat) {
    let range = bounds(window.width)
    context.horizontalOffset = min(
      range.upperBound,
      max(range.lowerBound, offset + direction * (range.upperBound - range.lowerBound) * 0.1))
  }

  private var carrying: Bool { drag.active && drag.moved }

  @ViewBuilder private var layout: some View {
    if height == .full, let session {
      HStack(spacing: 0) {
        ScrollView {
          AISessionListView(
            sessions: context.sessions, currentId: session.id, connected: context.connected,
            pick: context.pick
          )
          .padding(.horizontal, AppleMetrics.space10).padding(.vertical, AppleMetrics.space12)
        }
        .frame(width: AppleMetrics.aiSessionsWidth)
        .background(AppleColors.canvas)
        let column = min(
          AppleMetrics.aiThreadWidth,
          fullWidth - AppleMetrics.aiSessionsWidth - 2 * AppleMetrics.space24)
        VStack(spacing: 0) {
          head(session)
          thread(session, width: column)
          VStack(spacing: 0) {
            if !context.cards.isEmpty {
              AIContextCards()
                .padding(.horizontal, AppleMetrics.space16)
                .padding(.top, AppleMetrics.space12)
            }
            row
          }
          .frame(width: column)
          .background(
            RoundedRectangle(cornerRadius: AppleMetrics.aiDockRadius, style: .continuous)
              .fill(AppleColors.aiComposer)
          )
          .padding(.bottom, AppleMetrics.space20)
        }
        .frame(maxWidth: .infinity)
      }
    } else {
      VStack(spacing: 0) {
        if grown, let session {
          head(session)
          thread(session, width: panelWidth - 2 * AppleMetrics.space24)
          if !context.cards.isEmpty { AIContextCards().padding(.horizontal, AppleMetrics.space16) }
        }
        row
      }
      .overlay(alignment: .top) {
        if grown, context.listOpen, let session { sessionDropdown(session) }
      }
    }
  }

  private func head(_ session: AISession) -> some View {
    HStack(spacing: AppleMetrics.space4) {
      if height == .full {
        Text(session.title).font(.sans(AppleMetrics.font17, .semibold)).lineLimit(1)
        Spacer(minLength: 0)
        headButton("ai-minimize", label: Copy.text("ai.shrink")) { context.event(.shrink) }
      } else {
        Button {
          context.toggleList()
        } label: {
          HStack(spacing: AppleMetrics.space4) {
            Text(session.title).font(.sans(AppleMetrics.font15, .semibold)).lineLimit(1)
            Icon("chevron", size: AppleMetrics.font16).rotationEffect(.degrees(90))
              .foregroundStyle(AppleColors.secondary)
          }
          .padding(.horizontal, AppleMetrics.space8)
          .frame(height: AppleMetrics.space32)
          .background(
            RoundedRectangle(cornerRadius: AppleMetrics.space8)
              .fill(context.listOpen ? AppleColors.glassPress : .clear)
          )
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.leading, -AppleMetrics.space8)
        .modifier(HandCursor())
        .accessibilityValue(context.listOpen ? Copy.text("ai.sessions") : "")
        let others = AIRules.othersRunning(context.sessions, current: session.id)
        if others > 0 {
          Text(
            Copy.text("ai.othersRunning")
              .replacingOccurrences(of: "{number}", with: String(others))
          )
          .font(.sans(AppleMetrics.font13)).foregroundStyle(AppleColors.secondary).lineLimit(1)
        }
        Spacer(minLength: 0)
        headButton("expand", label: Copy.text("ai.full")) { context.event(.full) }
        headButton("ai-minimize", label: Copy.text("ai.collapse")) {
          context.event(.collapse)
          focused = true
        }
      }
    }
    .foregroundStyle(AppleColors.primary)
    .padding(.leading, height == .full ? AppleMetrics.space24 : AppleMetrics.space14)
    .padding(.trailing, AppleMetrics.space10)
    .frame(height: height == .full ? AppleMetrics.railRow : AppleMetrics.aiHeadHeight)
  }

  private func headButton(
    _ icon: String, turned: Bool = false, label: String, run: @escaping @MainActor () -> Void
  ) -> some View {
    Button(action: run) {
      Icon(icon, size: AppleMetrics.font18).rotationEffect(.degrees(turned ? 90 : 0))
        .frame(width: AppleMetrics.space36, height: AppleMetrics.space36)
        .contentShape(Circle())
    }
    .buttonStyle(.plain)
    .modifier(HandCursor())
    .accessibilityLabel(label)
  }

  /// The conversation, pinned to the newest line; the top 28 fades out.
  private func thread(_ session: AISession, width: CGFloat) -> some View {
    let cards = context.cards.isEmpty ? 0 : AppleMetrics.aiChipHeight + AppleMetrics.space8
    let most =
      window.height - AppleMetrics.aiPanelInset - AppleMetrics.aiHeadHeight - AppleMetrics.railRow
      - cards
    return ScrollView {
      AIMessagesView(session: session, connected: context.connected, width: width) { id in
        reader.open(id)
      }
      .frame(width: width)
      .padding(.top, AppleMetrics.space8).padding(.bottom, AppleMetrics.space16)
      .frame(maxWidth: .infinity)
      .onGeometryChange(for: CGFloat.self) {
        $0.size.height
      } action: {
        threadHeight = $0
      }
    }
    .defaultScrollAnchor(.bottom)
    .frame(height: height == .panel ? max(0, min(threadHeight, most)) : nil)
    .frame(maxHeight: height == .full ? .infinity : nil)
    .mask {
      VStack(spacing: 0) {
        LinearGradient(
          colors: [.clear, AppleColors.primary], startPoint: .top, endPoint: .bottom
        )
        .frame(height: AppleMetrics.aiThreadFade)
        Rectangle()
      }
    }
  }

  /// The session list drops down inside the panel, under its head.
  private func sessionDropdown(_ session: AISession) -> some View {
    ScrollView {
      AISessionListView(
        sessions: context.sessions, currentId: session.id, connected: context.connected,
        pick: context.pick
      )
      .padding(AppleMetrics.space8)
    }
    .frame(maxHeight: AppleMetrics.aiSessionListMax)
    .fixedSize(horizontal: false, vertical: true)
    .background(
      RoundedRectangle(cornerRadius: AppleMetrics.panelRadius, style: .continuous)
        .fill(AppleColors.card)
        .shadow(.floating)
    )
    .padding(.horizontal, AppleMetrics.space8)
    .padding(.top, AppleMetrics.aiHeadHeight)
    .transition(.opacity.combined(with: .offset(y: -AppleMetrics.space4)))
  }

  /// The one line: session button, +, input, microphone, send.
  private var row: some View {
    @Bindable var context = context
    return HStack(spacing: AppleMetrics.space4) {
      if let session {
        Button {
          context.event(.open)
        } label: {
          AIStatusFace(status: session.status)
            .frame(width: AppleMetrics.space36, height: AppleMetrics.space36)
            .background(Circle().fill(AppleColors.glassPress))
            .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .modifier(HandCursor())
        .accessibilityLabel(
          [Copy.text("ai.sessionOpen"), session.title, AIStatusFace.label(session.status)]
            .filter { !$0.isEmpty }.joined(separator: "，"))
      }
      dockButton("plus", label: Copy.text("web.ai.addUnavailable"))
      TextField(
        "", text: $context.draft,
        prompt: Text(placeholder)
          .fontWeight(drag.ready ? .semibold : nil)
          .foregroundStyle(drag.ready ? AppleColors.accent : AppleColors.primary)
      )
      .textFieldStyle(.plain)
      .font(.sans(AppleMetrics.font16))
      .foregroundStyle(AppleColors.primary)
      .padding(.horizontal, AppleMetrics.space4)
      .frame(height: AppleMetrics.space36)
      .focused($focused)
      .transaction { $0.animation = nil }
      .accessibilityLabel(Copy.text("web.ai.dock"))
      .onChange(of: context.draft) { _, value in
        if value.utf16.count > 4000 { context.draft = String(value.prefix(4000)) }
      }
      dockButton("mic", label: Copy.text("web.ai.speak"))
      sendKey
    }
    .modifier(TextCursor())
    .padding(.horizontal, AppleMetrics.space12)
    .frame(height: AppleMetrics.railRow)
    // The I-beam covers the row, so a click on its padding puts the caret in the input.
    .contentShape(Rectangle())
    .onTapGesture { focused = true }
    .simultaneousGesture(moveGesture)
    .onKeyPress(.leftArrow, phases: .down) { press in
      guard press.modifiers.contains(.option) else { return .ignored }
      move(-1)
      return .handled
    }
    .onKeyPress(.rightArrow, phases: .down) { press in
      guard press.modifiers.contains(.option) else { return .ignored }
      move(1)
      return .handled
    }
  }

  private var placeholder: String {
    if drag.ready { return Copy.text("web.ai.dockReady") }
    if let session {
      return Copy.text("ai.continue").replacingOccurrences(of: "{title}", with: session.title)
    }
    return Copy.text("web.ai.dockPlaceholder")
  }

  /// While the session runs, send turns into stop; both wait for the built-in AI.
  private var sendKey: some View {
    let stop = session?.running == true
    return Group {
      if stop {
        RoundedRectangle(cornerRadius: AppleMetrics.space2)
          .fill(AppleColors.secondary)
          .frame(width: AppleMetrics.space10, height: AppleMetrics.space10)
      } else {
        Icon("up", size: AppleMetrics.space20).foregroundStyle(AppleColors.secondary)
      }
    }
    .frame(width: AppleMetrics.aiSendSize, height: AppleMetrics.aiSendSize)
    .background(Circle().fill(AppleColors.faint))
    .frame(width: AppleMetrics.space36, height: AppleMetrics.space36)
    .accessibilityElement()
    .accessibilityLabel(
      stop ? Copy.text("ai.stopUnavailable") : Copy.text("web.ai.sendUnavailable")
    )
    .accessibilityAddTraits(.isButton)
    .accessibilityRespondsToUserInteraction(false)
    .modifier(ArrowCursor())
  }

  private func dockButton(_ icon: String, label: String) -> some View {
    Icon(icon, size: AppleMetrics.font20)
      .foregroundStyle(AppleColors.secondary)
      .frame(width: AppleMetrics.space36, height: AppleMetrics.space36)
      .accessibilityElement()
      .accessibilityLabel(label)
      .accessibilityAddTraits(.isButton)
      .accessibilityRespondsToUserInteraction(false)
      .modifier(ArrowCursor())
  }

}

/// An accent ring that keeps spreading out of the AI box and fading, like a ripple.
private struct DropPulse: View {
  @State private var spread = false
  var body: some View {
    Capsule()
      .strokeBorder(AppleColors.accent, lineWidth: AppleMetrics.selectionLineWidth)
      .padding(spread ? -AppleMetrics.aiDropPulseSpread : 0)
      .opacity(spread ? 0 : AppleMetrics.aiReadyGlowOpacity)
      .allowsHitTesting(false)
      .onAppear {
        withAnimation(Motion.ease(AppleMetrics.aiDropPulse).repeatForever(autoreverses: false)) {
          spread = true
        }
      }
  }
}
