import SillKit
import SwiftUI

/// The desktop AI box: bottom center, 28 from the bottom, 640×60 glass. The built-in AI is not
/// connected, so add, voice and send stay disabled; nothing is sent and no reply is invented.
/// Input and context cards live only in this window's session.
@MainActor @Observable final class AIContext {
  var draft = ""
  private(set) var cards: [String] = []
  /// A card is being dragged toward the box.
  var dragging = false

  func add(_ ids: [String]) {
    for id in ids where !cards.contains(id) {
      withAnimation(Motion.fast) { cards.append(id) }
    }
  }
  func remove(_ id: String) { withAnimation(Motion.press) { cards.removeAll { $0 == id } } }
  func prune(_ exists: (String) -> Bool) {
    let kept = cards.filter(exists)
    if kept != cards { cards = kept }
  }
}

struct AIDock: View {
  @Environment(AIContext.self) private var context
  @Environment(Workspace.self) private var workspace
  @FocusState private var focused: Bool

  var body: some View {
    @Bindable var context = context
    let shape = RoundedRectangle(cornerRadius: AppleMetrics.aiDockRadius, style: .continuous)
    HStack(spacing: AppleMetrics.space4) {
      dockButton("plus", label: Copy.text("web.ai.addUnavailable"))
      TextField(
        "", text: $context.draft,
        prompt: Text(
          context.dragging ? Copy.text("web.ai.dockReady") : Copy.text("web.ai.dockPlaceholder")
        )
        .foregroundStyle(context.dragging ? AppleColors.accent : AppleColors.iconSecondary)
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
      Icon("up", size: AppleMetrics.space16)
        .foregroundStyle(AppleColors.card)
        .frame(width: AppleMetrics.aiSendSize, height: AppleMetrics.aiSendSize)
        .background(Circle().fill(AppleColors.faint))
        .frame(width: AppleMetrics.space36, height: AppleMetrics.space36)
        .accessibilityElement()
        .accessibilityLabel(Copy.text("web.ai.sendUnavailable"))
        .accessibilityAddTraits(.isButton)
        .accessibilityRespondsToUserInteraction(false)
    }
    .padding(.horizontal, AppleMetrics.space12)
    .frame(maxWidth: AppleMetrics.aiDockWidth)
    .frame(height: AppleMetrics.railRow)
    .glass(shape)
    .overlay(
      shape.strokeBorder(
        context.dragging ? AppleColors.accent : .clear, lineWidth: AppleMetrics.selectionLineWidth)
    )
    .overlay(alignment: .top) {
      contextCards.alignmentGuide(.top) { $0[.bottom] + AppleMetrics.space8 }
    }
    .animation(Motion.state, value: context.dragging)
  }

  private func dockButton(_ icon: String, label: String) -> some View {
    Icon(icon, size: AppleMetrics.font20)
      .foregroundStyle(AppleColors.secondary)
      .frame(width: AppleMetrics.space36, height: AppleMetrics.space36)
      .accessibilityElement()
      .accessibilityLabel(label)
      .accessibilityAddTraits(.isButton)
      .accessibilityRespondsToUserInteraction(false)
  }

  @ViewBuilder private var contextCards: some View {
    if !context.cards.isEmpty {
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
}

/// Left-to-right rows that wrap.
struct FlowRow: Layout {
  var spacing: CGFloat
  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let width = proposal.width ?? .infinity
    var x: CGFloat = 0
    var y: CGFloat = 0
    var row: CGFloat = 0
    var widest: CGFloat = 0
    for subview in subviews {
      let size = subview.sizeThatFits(.unspecified)
      if x > 0, x + size.width > width {
        y += row + spacing
        x = 0
        row = 0
      }
      x += size.width + spacing
      row = max(row, size.height)
      widest = max(widest, x - spacing)
    }
    return CGSize(width: proposal.width ?? widest, height: y + row)
  }
  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
  ) {
    var x = bounds.minX
    var y = bounds.minY
    var row: CGFloat = 0
    for subview in subviews {
      let size = subview.sizeThatFits(.unspecified)
      if x > bounds.minX, x + size.width > bounds.maxX {
        y += row + spacing
        x = bounds.minX
        row = 0
      }
      subview.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
      x += size.width + spacing
      row = max(row, size.height)
    }
  }
}
