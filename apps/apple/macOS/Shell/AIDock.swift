import SillKit
import SwiftUI

// @design ai-conversation
/// The desktop AI box: bottom center, 28 from the bottom, 640×60 glass. With a session it grows
/// into the panel and the full view (ADR 0064). The built-in AI is not connected, so add, voice
/// and send stay disabled; nothing is sent and no reply is invented. Input and context cards live
/// only in this window's session.
@MainActor @Observable final class AIContext {
  var draft = ""
  private(set) var cards: [String] = []
  /// Bumped to put focus in the input.
  private(set) var focusRequest = 0
  /// Bumped when a click lands outside the box; the input gives up focus.
  private(set) var blurRequest = 0
  /// Whether the input has focus. Read only by the window's click monitor.
  @ObservationIgnored var focused = false
  /// The built-in AI is not connected: no sessions arrive and nothing is sent.
  let connected = false
  private(set) var sessions: [AISession] = []
  private(set) var sessionId: String?
  private(set) var height: AIHeight = .line
  private(set) var listOpen = false

  var session: AISession? { sessions.first { $0.id == sessionId } ?? sessions.first }

  func requestFocus() { focusRequest += 1 }
  func blur() { blurRequest += 1 }

  func add(_ ids: [String]) {
    for id in ids where !cards.contains(id) {
      withAnimation(Motion.fast) { cards.append(id) }
    }
  }
  func remove(_ id: String) { withAnimation(Motion.fast) { cards.removeAll { $0 == id } } }
  func prune(_ exists: (String) -> Bool) {
    let kept = cards.filter(exists)
    if kept != cards { cards = kept }
  }

  /// The handbook's height table, with the card spring; keyboard changes land at once.
  func event(_ event: AIHeightEvent) {
    let next = AIRules.next(height, event, hasSession: session != nil)
    guard next != height else { return }
    let change = {
      self.height = next
      if next != .panel { self.listOpen = false }
    }
    if Motion.keyboardDriven {
      Motion.instantly(change)
    } else {
      withAnimation(Motion.card, change)
    }
  }
  /// Escape steps back one level: the session list, then full → panel → one line.
  func escape() -> Bool {
    if listOpen {
      withAnimation(Motion.menuClose) { listOpen = false }
      return true
    }
    guard height != .line else { return false }
    event(.escape)
    return true
  }
  func toggleList() {
    withAnimation(listOpen ? Motion.menuClose : Motion.menuOpen) { listOpen.toggle() }
  }
  func pick(_ id: String) {
    guard let index = sessions.firstIndex(where: { $0.id == id }) else { return }
    sessions[index].unseen = false
    sessionId = id
    withAnimation(Motion.menuClose) { listOpen = false }
  }
  /// Sessions come only from the built-in AI, or from debug design samples.
  func load(_ sessions: [AISession]) {
    self.sessions = sessions
    sessionId = sessions.first?.id
  }
}

struct AIDock: View {
  /// The window, for the panel's and the full view's height.
  let window: CGSize
  @Environment(AIContext.self) private var context
  @Environment(Workspace.self) private var workspace
  @Environment(CardDrag.self) private var drag
  @Environment(Reader.self) private var reader
  @FocusState private var focused: Bool
  @State private var threadHeight: CGFloat = 0

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
    let shape = RoundedRectangle(
      cornerRadius: grown ? AppleMetrics.sheetRadius : AppleMetrics.aiDockRadius,
      style: .continuous)
    layout
      .frame(maxWidth: height == .line ? AppleMetrics.aiDockWidth : nil)
      .frame(
        width: height == .full ? fullWidth : height == .panel ? panelWidth : nil,
        height: height == .full ? window.height - AppleMetrics.aiFullInset : nil)
      // Panel and full view: the glass turns into the solid card surface.
      .background { shape.fill(AppleColors.card).opacity(grown ? 1 : 0) }
      .clipShape(shape)
      // While a card is carried, rings keep spreading out of the box: it takes cards.
      .background {
        if carrying { DropPulse() }
      }
      .desktopGlass(shape)
      .shadow(.sheet, visible: grown)
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
      .overlay(alignment: .top) {
        if !grown {
          contextCards.alignmentGuide(.top) { $0[.bottom] + AppleMetrics.space8 }
        }
      }
      .onGeometryChange(for: CGRect.self) {
        $0.frame(in: .global)
      } action: {
        drag.target = $0
      }
      .onChange(of: context.focusRequest) { focused = true }
      .onChange(of: context.blurRequest) { focused = false }
      .onChange(of: focused) { _, value in context.focused = value }
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
              contextCards
                .padding(.horizontal, AppleMetrics.space16)
                .padding(.top, AppleMetrics.space12)
            }
            row
          }
          .frame(width: column)
          .background(
            RoundedRectangle(cornerRadius: AppleMetrics.aiDockRadius, style: .continuous)
              .fill(AppleColors.aiComposer))
          .padding(.bottom, AppleMetrics.space20)
        }
        .frame(maxWidth: .infinity)
      }
    } else {
      VStack(spacing: 0) {
        if grown, let session {
          head(session)
          thread(session, width: panelWidth - 2 * AppleMetrics.space24)
          if !context.cards.isEmpty { contextCards.padding(.horizontal, AppleMetrics.space16) }
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
        headButton("collapse", label: Copy.text("ai.shrink")) { context.event(.shrink) }
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
              .fill(context.listOpen ? AppleColors.glassPress : .clear))
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
              .replacingOccurrences(of: "{number}", with: String(others)))
            .font(.sans(AppleMetrics.font13)).foregroundStyle(AppleColors.secondary).lineLimit(1)
        }
        Spacer(minLength: 0)
        headButton("expand", label: Copy.text("ai.full")) { context.event(.full) }
        headButton("chevron", turned: true, label: Copy.text("ai.collapse")) {
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
      .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { threadHeight = $0 }
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
        .shadow(.floating))
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
          .foregroundStyle(drag.ready ? AppleColors.accent : AppleColors.secondary)
      )
      .textFieldStyle(.plain)
      .font(.sans(AppleMetrics.font16))
      .foregroundStyle(AppleColors.primary)
      .padding(.horizontal, AppleMetrics.space4)
      .frame(height: AppleMetrics.space36)
      .focused($focused)
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
      stop ? Copy.text("ai.stopUnavailable") : Copy.text("web.ai.sendUnavailable"))
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

  /// The row stays mounted even when empty, so the last card fades out like the others.
  private var contextCards: some View {
    FlowRow(spacing: AppleMetrics.space8) {
      ForEach(context.cards, id: \.self) { id in
        if let card = workspace.model(id) {
          HStack(spacing: AppleMetrics.space6) {
            Text(card.title).lineLimit(1).truncationMode(.tail)
            Button {
              context.remove(id)
            } label: {
              Icon("x", size: AppleMetrics.font12)
                .foregroundStyle(AppleColors.secondary)
                .frame(width: AppleMetrics.aiChipClose, height: AppleMetrics.aiChipClose)
            }
            .buttonStyle(.plain)
            .modifier(HandCursor())
            .accessibilityLabel("\(Copy.text("web.ai.removeContext")) \(card.title)")
          }
          .font(.sans(AppleMetrics.font13))
          .foregroundStyle(AppleColors.primary)
          .padding(.leading, AppleMetrics.space10).padding(.trailing, AppleMetrics.space6)
          .frame(maxWidth: AppleMetrics.aiChipMaxWidth)
          .frame(height: AppleMetrics.aiChipHeight)
          .background(
            RoundedRectangle(cornerRadius: AppleMetrics.space10).fill(AppleColors.card)
              .overlay(
                RoundedRectangle(cornerRadius: AppleMetrics.space10).strokeBorder(
                  AppleColors.lineCard, lineWidth: AppleMetrics.lineWidth))
          )
          .transition(Motion.context)
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
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
