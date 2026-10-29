import SillKit
import SwiftUI

// The AI box's grown parts, the same as Web `views/ai-thread.tsx` and `views/ai-dock.tsx`
// (handbook ai-conversation.md). Nothing here sends to a model.

/// A ring that turns while something runs.
struct AISpinner: View {
  var size: CGFloat = AppleMetrics.font18
  @State private var turn = false
  var body: some View {
    ZStack {
      Circle().stroke(AppleColors.lineHover, lineWidth: AppleMetrics.space2)
      Circle().trim(from: 0, to: 0.25)
        .stroke(
          AppleColors.secondary,
          style: StrokeStyle(lineWidth: AppleMetrics.space2, lineCap: .round)
        )
        .rotationEffect(.degrees(turn ? 360 : 0))
    }
    .padding(size / 6)
    .frame(width: size, height: size)
    .accessibilityHidden(true)
    .onAppear {
      withAnimation(.linear(duration: AppleMetrics.aiSpinTurn).repeatForever(autoreverses: false)) {
        turn = true
      }
    }
  }
}

/// The session button's face: running, a new result, or something to check.
struct AIStatusFace: View {
  let status: AISessionStatus
  var body: some View {
    switch status {
    case .running: AISpinner(size: AppleMetrics.font20)
    case .attention:
      Icon("info", size: AppleMetrics.font20).foregroundStyle(AppleColors.warning)
    case .unseen, .idle:
      Icon("chat", size: AppleMetrics.font18)
        .foregroundStyle(AppleColors.primary)
        .overlay(alignment: .topTrailing) {
          if status == .unseen {
            Circle().fill(AppleColors.accent)
              .frame(width: AppleMetrics.aiUnseenDot, height: AppleMetrics.aiUnseenDot)
              .overlay(Circle().stroke(AppleColors.card, lineWidth: AppleMetrics.space2))
              .offset(x: AppleMetrics.space3, y: -AppleMetrics.space2)
          }
        }
    }
  }

  static func label(_ status: AISessionStatus) -> String {
    status == .idle ? "" : Copy.text("ai.status.\(status.rawValue)")
  }
}

/// One changed card: type, title, what changed, and its real write state.
struct AIResultRow: View {
  let result: AIResult
  let connected: Bool
  let open: @MainActor (String) -> Void

  private var warn: Bool { result.state == .failed || result.state == .unknown }

  var body: some View {
    HStack(spacing: AppleMetrics.space8) {
      Button {
        open(result.cardId)
      } label: {
        HStack(spacing: AppleMetrics.space12) {
          Icon(result.kind.icon, size: AppleMetrics.font20)
            .foregroundStyle(AppleColors.secondary)
            .frame(width: AppleMetrics.aiResultTile, height: AppleMetrics.aiResultTile)
            .background(
              RoundedRectangle(cornerRadius: AppleMetrics.space10).fill(AppleColors.card)
                .overlay(
                  RoundedRectangle(cornerRadius: AppleMetrics.space10)
                    .strokeBorder(AppleColors.line, lineWidth: AppleMetrics.lineWidth)))
          VStack(alignment: .leading, spacing: 0) {
            Text(result.title).font(.sans(AppleMetrics.font15, .medium))
              .foregroundStyle(AppleColors.primary).lineLimit(1)
            Text(warn ? Copy.text("ai.result.\(result.state.rawValue)") : result.change)
              .font(.sans(AppleMetrics.font13))
              .foregroundStyle(
                result.state == .failed
                  ? AppleColors.error : warn ? AppleColors.warning : AppleColors.secondary)
              .lineLimit(1)
          }
          Spacer(minLength: 0)
        }
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .modifier(HandCursor())
      .accessibilityLabel(
        Copy.text("ai.openCard").replacingOccurrences(of: "{title}", with: result.title))
      if result.state == .failed {
        action(Copy.text("ai.retry"), enabled: connected) {}
          .accessibilityLabel(connected ? Copy.text("ai.retry") : Copy.text("ai.retryUnavailable"))
      }
      if result.state == .unknown {
        action(Copy.text("ai.check"), enabled: true) { open(result.cardId) }
      }
      stateIcon
        .frame(width: AppleMetrics.space24, height: AppleMetrics.space24)
        .accessibilityElement()
        .accessibilityLabel(Copy.text("ai.result.\(result.state.rawValue)"))
    }
    .padding(.leading, AppleMetrics.space8).padding(.trailing, AppleMetrics.space12)
    .padding(.vertical, AppleMetrics.space8)
    .frame(minHeight: AppleMetrics.aiResultRow)
    .background(
      RoundedRectangle(cornerRadius: AppleMetrics.coverRadius).fill(AppleColors.surface))
  }

  @ViewBuilder private var stateIcon: some View {
    switch result.state {
    case .running: AISpinner()
    case .pending:
      Circle()
        .stroke(
          AppleColors.secondary,
          style: StrokeStyle(
            lineWidth: AppleMetrics.selectionLineWidth,
            dash: [CGFloat(AppleMetrics.space3), CGFloat(AppleMetrics.space3)])
        )
        .frame(width: AppleMetrics.space16, height: AppleMetrics.space16)
    case .written: Icon("check", size: AppleMetrics.font18).foregroundStyle(AppleColors.success)
    case .failed: Icon("x", size: AppleMetrics.font18).foregroundStyle(AppleColors.error)
    case .unknown: Icon("info", size: AppleMetrics.font18).foregroundStyle(AppleColors.warning)
    }
  }

  private func action(
    _ title: String, enabled: Bool, run: @escaping @MainActor () -> Void
  ) -> some View {
    Button(action: run) {
      Text(title).font(.sans(AppleMetrics.font13, .semibold))
        .foregroundStyle(enabled ? AppleColors.accentInk : AppleColors.secondary)
        .padding(.horizontal, AppleMetrics.space12)
        .frame(height: AppleMetrics.space28)
        .background(Capsule().fill(enabled ? AppleColors.accentSoft : AppleColors.faint))
    }
    .buttonStyle(.plain)
    .disabled(!enabled)
    .modifier(HandCursor())
  }
}

/// The conversation, oldest first.
struct AIMessagesView: View {
  let session: AISession
  let connected: Bool
  /// The column width; your bubbles stay within 78% of it.
  let width: CGFloat
  let open: @MainActor (String) -> Void
  @Environment(Workspace.self) private var workspace

  var body: some View {
    VStack(alignment: .leading, spacing: AppleMetrics.space20) {
      ForEach(session.messages) { message in
        switch message.role {
        case .you: you(message)
        case .ai: says(message)
        }
      }
    }
  }

  private func you(_ message: AIMessage) -> some View {
    VStack(alignment: .trailing, spacing: AppleMetrics.space6) {
      let cards = message.cards.compactMap { workspace.model($0) }
      if !cards.isEmpty {
        FlowRow(spacing: AppleMetrics.space6) {
          ForEach(cards, id: \.id) { card in
            Text(card.title).font(.sans(AppleMetrics.font13))
              .foregroundStyle(AppleColors.secondary).lineLimit(1)
              .padding(.horizontal, AppleMetrics.space10)
              .frame(height: AppleMetrics.space28)
              .background(
                RoundedRectangle(cornerRadius: AppleMetrics.controlRadius)
                  .fill(AppleColors.surface))
          }
        }
        .accessibilityLabel(Copy.text("ai.attached"))
      }
      Text(message.text)
        .font(.sans(AppleMetrics.font15))
        .foregroundStyle(AppleColors.aiInk)
        .padding(.horizontal, AppleMetrics.space14).padding(.vertical, AppleMetrics.space10)
        .background(
          RoundedRectangle(cornerRadius: AppleMetrics.aiBubbleRadius, style: .continuous)
            .fill(AppleColors.aiComposer)
        )
        .frame(maxWidth: width * AppleMetrics.aiBubbleMaxRatio, alignment: .trailing)
    }
    .frame(maxWidth: .infinity, alignment: .trailing)
  }

  private func says(_ message: AIMessage) -> some View {
    VStack(alignment: .leading, spacing: AppleMetrics.space14) {
      HStack(alignment: .firstTextBaseline, spacing: AppleMetrics.space4) {
        Text(message.text).font(.sans(AppleMetrics.font15))
          .foregroundStyle(AppleColors.primary)
          .lineSpacing(AppleMetrics.space6)
          .fixedSize(horizontal: false, vertical: true)
        if message.streaming {
          Circle().fill(AppleColors.primary)
            .frame(width: AppleMetrics.aiStreamDot, height: AppleMetrics.aiStreamDot)
            .accessibilityHidden(true)
        }
      }
      if !message.results.isEmpty {
        VStack(spacing: AppleMetrics.space6) {
          ForEach(message.results, id: \.cardId) { result in
            AIResultRow(result: result, connected: connected, open: open)
          }
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/// New chat, running sessions, then history by day.
struct AISessionListView: View {
  let sessions: [AISession]
  let currentId: String?
  let connected: Bool
  let pick: @MainActor (String) -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      row(icon: { Icon("plus", size: AppleMetrics.font18) }, title: Copy.text("ai.newChat"))
        .fontWeight(.semibold)
        .foregroundStyle(connected ? AppleColors.primary : AppleColors.secondary)
        .accessibilityLabel(
          connected ? Copy.text("ai.newChat") : Copy.text("ai.newChatUnavailable"))
      ForEach(AIRules.groups(sessions)) { entry in
        Text(Copy.text("ai.group.\(entry.group.rawValue)"))
          .font(.sans(AppleMetrics.font12, .semibold))
          .foregroundStyle(AppleColors.secondary)
          .padding(.horizontal, AppleMetrics.space10)
          .padding(.top, AppleMetrics.space14).padding(.bottom, AppleMetrics.space4)
        ForEach(entry.sessions) { session in
          Button {
            pick(session.id)
          } label: {
            row(
              icon: {
                switch session.status {
                case .running: AISpinner(size: AppleMetrics.font16)
                case .attention: Icon("info", size: AppleMetrics.font16)
                default: Icon("check", size: AppleMetrics.font16)
                }
              }, title: session.title,
              time: session.running ? nil : time(session.updatedAt)
            )
            .background(
              RoundedRectangle(cornerRadius: AppleMetrics.space10)
                .fill(session.id == currentId ? AppleColors.glassPress : .clear))
          }
          .buttonStyle(.plain)
          .modifier(HandCursor())
          .accessibilityAddTraits(session.id == currentId ? .isSelected : [])
        }
      }
    }
  }

  private func row<I: View>(
    @ViewBuilder icon: () -> I, title: String, time: String? = nil
  ) -> some View {
    HStack(spacing: AppleMetrics.space8) {
      icon().foregroundStyle(AppleColors.secondary).frame(width: AppleMetrics.space24)
      Text(title).font(.sans(AppleMetrics.font15)).lineLimit(1)
        .frame(maxWidth: .infinity, alignment: .leading)
      if let time {
        Text(time).font(.sans(AppleMetrics.font13)).foregroundStyle(AppleColors.secondary)
      }
    }
    .foregroundStyle(AppleColors.primary)
    .padding(.leading, AppleMetrics.space6).padding(.trailing, AppleMetrics.space10)
    .frame(height: AppleMetrics.aiSessionRow)
    .contentShape(Rectangle())
  }

  private func time(_ date: Date) -> String {
    let calendar = Calendar.current
    if calendar.isDateInToday(date) { return date.formatted(.dateTime.hour().minute()) }
    let parts = calendar.dateComponents([.month, .day], from: date)
    return Copy.text("ai.date")
      .replacingOccurrences(of: "{month}", with: String(parts.month ?? 0))
      .replacingOccurrences(of: "{day}", with: String(parts.day ?? 0))
  }
}
