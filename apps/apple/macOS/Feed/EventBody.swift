import SillKit
import SwiftUI

struct EventBody: View {
  let card: CardModel
  let context: CardContext
  @Environment(\.cardIntents) private var intents
  @Environment(\.cardFaded) private var faded
  var body: some View {
    let start = card.start ?? 0
    let end = card.end ?? start
    let relative = Format.eventRelative(start: start, end: end, now: context.now)
    let timely = card.meeting != nil && Format.eventTimely(start: start, end: end, now: context.now)
    BodyStack(compact: context.compact) {
      CardHead(card: card, text: Format.dateLabel(start)) {
        if !relative.isEmpty {
          Text(relative).textStyle(AppleMetrics.font13, .medium).foregroundStyle(
            AppleColors.accent)
        }
      }
      HStack(alignment: .center, spacing: AppleMetrics.space14) {
        VStack(alignment: .leading, spacing: AppleMetrics.space4) {
          Text(Format.time(start))
            .textStyle(
              AppleMetrics.eventCardTimeSize, .semibold, leading: 1,
              tracking: AppleMetrics.cardTitleTracking, number: true
            )
            .foregroundStyle(faded ? AppleColors.secondary : AppleColors.primary)
          Text(Copy.text("web.templates.83532308ecca") + Format.time(end))
            .textStyle(AppleMetrics.font13, number: true).foregroundStyle(AppleColors.secondary)
        }
        .padding(.trailing, AppleMetrics.space14)
        .overlay(alignment: .trailing) {
          Rectangle().fill(AppleColors.accent).frame(width: AppleMetrics.space2)
        }
        VStack(alignment: .leading, spacing: AppleMetrics.space2) {
          CardTitle(text: card.title, faded: faded, query: context.query)
          if let meeting = card.meeting { location(meeting.name, icon: "video") }
          if let place = card.location { location(place, icon: "pin") }
        }.frame(maxWidth: .infinity, alignment: .leading)
      }
      if !card.people.isEmpty || timely {
        HStack(spacing: AppleMetrics.space12) {
          if !card.people.isEmpty {
            Avatars(names: card.people)
            Text(card.people.joined(separator: "、")).lineLimit(1)
              .textStyle(AppleMetrics.font13).foregroundStyle(AppleColors.secondary)
          }
          Spacer(minLength: 0)
          if timely {
            Button {
              intents.join(card.id)
            } label: {
              Text(Copy.text("web.templates.451755e3831f"))
                .font(.sans(AppleMetrics.font13, .medium)).foregroundStyle(AppleColors.fixedWhite)
                .padding(.horizontal, AppleMetrics.pillPaddingX)
                .frame(minWidth: AppleMetrics.primaryMinWidth, minHeight: AppleMetrics.pillHeight)
                .background(Capsule().fill(AppleColors.accentFill))
            }.buttonStyle(PrimaryPillStyle())
          }
        }
      }
    }
  }
  private func location(_ text: String, icon: String) -> some View {
    HStack(spacing: AppleMetrics.space6) {
      Icon(icon, size: AppleMetrics.font15)
      Text(text).lineLimit(1).truncationMode(.tail)
    }.textStyle(AppleMetrics.font13).foregroundStyle(AppleColors.secondary)
  }
}
