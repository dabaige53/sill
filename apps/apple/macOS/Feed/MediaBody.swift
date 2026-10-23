import SillKit
import SwiftUI

struct MediaBody: View {
  let card: CardModel
  let state: CardState
  let context: CardContext
  @Environment(\.cardFaded) private var faded
  private var played: Double {
    card.duration.map { $0 > 0 ? min(1, state.playbackPosition / Double($0)) : 0 } ?? 0
  }
  private var remaining: String? {
    guard let duration = card.duration else { return nil }
    return Copy.text("web.media.remaining").replacingOccurrences(
      of: "{minutes}",
      with: String(Int(ceil(max(0, Double(duration) - state.playbackPosition) / 60))))
  }
  private var timeline: some View {
    GeometryReader { g in
      ZStack(alignment: .leading) {
        Rectangle().fill(
          card.isPodcast ? AppleColors.surface : AppleColors.fixedWhite.opacity(0.45))
        Rectangle().fill(card.isPodcast ? AppleColors.primary : AppleColors.fixedWhite)
          .frame(width: g.size.width * played)
      }
    }.frame(height: AppleMetrics.space3).clipShape(Capsule())
  }
  var body: some View {
    VStack(spacing: 0) {
      if card.isPodcast {
        BodyStack(compact: context.compact) {
          CardHead(card: card, text: card.displaySourceLine) {
            if let remaining { Text(remaining).font(.number(AppleMetrics.font12)) }
          }
          CardTitle(text: card.title, faded: faded, query: context.query)
          if !context.compact {
            SummaryBlock(
              summary: card.summary.isEmpty ? card.body.first ?? "" : card.summary,
              query: context.query
            )

          }
          HStack(spacing: AppleMetrics.space10) {
            Icon("play", size: AppleMetrics.space12, filled: true)
              .frame(width: AppleMetrics.space20, height: AppleMetrics.space20)
              .foregroundStyle(AppleColors.card)
              .background(Circle().fill(AppleColors.primary))
            timeline
            Text(card.duration.map(Format.duration) ?? Copy.text("web.media.unknownDuration")).font(
              .number(AppleMetrics.font12))
          }.foregroundStyle(AppleColors.secondary).padding(.top, AppleMetrics.space4)

        }
      } else {
        VStack(spacing: 0) {
          if !context.compact {
            CardCover(card: card, faded: faded) {
              ZStack {
                Icon("play", size: AppleMetrics.space20, filled: true)
                  .foregroundStyle(AppleColors.primary)
                  .frame(width: AppleMetrics.space44, height: AppleMetrics.space44)
                  .background(Circle().fill(AppleColors.glassThick))
                VStack {
                  Spacer(minLength: 0)
                  HStack(spacing: AppleMetrics.space6) {
                    timeline
                    Text(
                      card.duration.map(Format.duration) ?? Copy.text("web.media.unknownDuration")
                    )
                    .font(.number(AppleMetrics.font12)).foregroundStyle(AppleColors.fixedWhite)
                    .padding(.horizontal, AppleMetrics.space8).padding(
                      .vertical, AppleMetrics.space2
                    )
                    .background(
                      RoundedRectangle(cornerRadius: AppleMetrics.mediaLengthRadius).fill(
                        AppleColors.fixedBlack55))
                  }.padding(AppleMetrics.space10)

                }
              }.frame(maxWidth: .infinity, maxHeight: .infinity)
            }
          }
          BodyStack(compact: context.compact) {
            CardHead(card: card, text: card.displaySourceLine) {
              if let remaining { Text(remaining).font(.number(AppleMetrics.font12)) }
            }
            CardTitle(text: card.title, faded: faded, query: context.query)
          }
        }
      }
    }
  }
}
