import SillKit
import SwiftUI

struct NativeStack: View {
  let cards: [Card]
  let expanded: Bool
  let toggle: () -> Void
  let open: (Card) -> Void
  @State private var index = 0
  var body: some View {
    if expanded {
      VStack(spacing: AppleMetrics.space12) {
        HStack(spacing: AppleMetrics.space8) {
          if let card = cards.first { CardSourceGlyph(card: card) }
          Text(cards.first?.source ?? "").lineLimit(1)
          Text("· \(cards.count)").monospacedDigit()
          Spacer()
          Button(Copy.text("web.templates.afd4b783536b"), action: toggle).buttonStyle(.plain)
        }.font(.system(size: AppleMetrics.font13)).foregroundStyle(AppleColors.secondary)
        ForEach(cards) { card in CardTile(card: card, compact: true, open: { open(card) }) }
      }
    } else if !cards.isEmpty {
      VStack(alignment: .leading, spacing: AppleMetrics.space8) {
        HStack {
          CardSourceGlyph(card: cards[index % cards.count])
          Text(cards[index % cards.count].source).lineLimit(1)
          Spacer()
          Text("\(index % cards.count + 1)/\(cards.count)").monospacedDigit()
        }.font(.system(size: AppleMetrics.font13)).foregroundStyle(AppleColors.secondary)
        Button(action: toggle) {
          Text(cards[index % cards.count].title).font(
            .system(size: AppleMetrics.font17, weight: .semibold)
          ).lineLimit(2).frame(maxWidth: .infinity, alignment: .leading)
        }.buttonStyle(.plain)
        if !cards[index % cards.count].summary.isEmpty {
          Text(cards[index % cards.count].summary).font(.system(size: AppleMetrics.font15))
            .foregroundStyle(AppleColors.secondary).lineLimit(2)
        }
      }.padding(AppleMetrics.cardPadding).frame(maxWidth: .infinity, alignment: .leading)
        .background(AppleColors.card, in: RoundedRectangle(cornerRadius: AppleMetrics.cardRadius))
        .background {
          RoundedRectangle(cornerRadius: AppleMetrics.cardRadius).fill(AppleColors.surface).padding(
            .horizontal, AppleMetrics.space8
          ).offset(y: AppleMetrics.space8)
        }
        .background {
          RoundedRectangle(cornerRadius: AppleMetrics.cardRadius).fill(AppleColors.surface).padding(
            .horizontal, AppleMetrics.space16
          ).offset(y: AppleMetrics.space14)
        }
        .padding(.bottom, AppleMetrics.space14)
        .gesture(
          DragGesture(minimumDistance: AppleMetrics.space24).onEnded { value in
            if abs(value.translation.width) > AppleMetrics.space40 {
              index = (index + 1) % cards.count
            }
          }
        )
        .focusable()
        .onKeyPress(keys: [.return, .space, .leftArrow, .rightArrow]) { press in
          if press.key == .return || press.key == .space {
            toggle()
          } else {
            index = (index + (press.key == .rightArrow ? 1 : cards.count - 1)) % cards.count
          }
          return .handled
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(
          (cards.first?.source ?? "") + "：\(cards.count)" + Copy.text("web.templates.50091bfc40b5"))
    }
  }
}
