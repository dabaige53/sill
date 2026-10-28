import SillKit
import SwiftUI

struct AIContextCards: View {
  @Environment(AIContext.self) private var context
  @Environment(Workspace.self) private var workspace
  /// The row stays mounted even when empty, so the last card fades out like the others.
  var body: some View {
    FlowRow(spacing: AppleMetrics.space8) {
      ForEach(context.cards.filter { !context.deferred.contains($0) }, id: \.self) { id in
        if let card = workspace.model(id) {
          HStack(spacing: AppleMetrics.space6) {
            Text(card.title).lineLimit(1).truncationMode(.tail)
            Button {
              context.remove(id)
            } label: {
              Icon("x", size: AppleMetrics.font12)
                .foregroundStyle(AppleColors.secondary)
                .frame(width: AppleMetrics.aiChipClose, height: AppleMetrics.aiChipHeight)
                .contentShape(Rectangle())
            }
            .buttonStyle(IconPress(highlight: false))
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
          .transition(Motion.keyboardDriven ? .identity : Motion.context)
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .animation(Motion.keyboardDriven ? nil : Motion.contextReveal, value: context.cards)
  }
}
