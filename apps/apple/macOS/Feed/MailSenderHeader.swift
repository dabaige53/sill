import SillKit
import SwiftUI

/// One head row like every other card: avatar · sender · date. A long name truncates; the date
/// stays whole. The card and detail share it (Web `MailSender`).
struct MailSenderHeader: View {
  let card: CardModel
  var detail = false

  var body: some View {
    if let sender = card.sender {
      HStack(spacing: AppleMetrics.space6) {
        Avatar(name: sender, size: detail ? AppleMetrics.space22 : AppleMetrics.space18)
        Text(sender)
          .fontWeight(.semibold)
          .foregroundStyle(AppleColors.primary)
          .lineLimit(1)
          .truncationMode(.tail)
        if !card.displayDate.isEmpty {
          (Text("· ") + card.metaText(card.displayDate))
            .foregroundStyle(AppleColors.secondary)
            .fixedSize()
        }
      }
      .textStyle(detail ? AppleMetrics.font13 : AppleMetrics.font12)
      .frame(minHeight: AppleMetrics.cardHeadHeight)
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
