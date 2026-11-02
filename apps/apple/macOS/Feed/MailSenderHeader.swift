import SillKit
import SwiftUI

/// The card and detail share one mail header, with space reserved for the date.
struct MailSenderHeader: View {
  let card: CardModel
  var detail = false

  var body: some View {
    if let sender = card.sender {
      HStack(alignment: .top, spacing: AppleMetrics.space10) {
        Avatar(name: sender, size: detail ? AppleMetrics.space36 : AppleMetrics.space32)
        VStack(alignment: .leading, spacing: AppleMetrics.space4) {
          HStack(alignment: .firstTextBaseline, spacing: AppleMetrics.space8) {
            Text(sender)
              .textStyle(detail ? AppleMetrics.font15 : AppleMetrics.font14, .semibold)
              .foregroundStyle(AppleColors.primary)
              .lineLimit(detail ? nil : 1)
              .frame(maxWidth: .infinity, alignment: .leading)
            Text(card.displayDate)
              .textStyle(AppleMetrics.font12)
              .foregroundStyle(AppleColors.secondary)
              .fixedSize()
          }
          Text(card.sourceName.isEmpty ? Copy.text("web.mail") : card.sourceName)
            .textStyle(AppleMetrics.font12)
            .foregroundStyle(AppleColors.secondary)
            .lineLimit(1)
        }
      }
    } else {
      CardHead(
        card: card,
        text: [
          card.sourceName.isEmpty ? Copy.text("web.mail") : card.sourceName,
          card.displayDate,
        ].filter { !$0.isEmpty }.joined(separator: " · "))
    }
  }
}
