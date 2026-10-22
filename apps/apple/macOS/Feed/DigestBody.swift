import SillKit
import SwiftUI

struct DigestBody: View {
  let card: CardModel
  let context: CardContext
  @Environment(\.cardFaded) private var faded
  var body: some View {
    BodyStack(compact: context.compact) {
      CardHead(
        card: card,
        text: card.coverageStart.flatMap { from in
          card.coverageEnd.map { "\(Format.dateLabel(from)) – \(Format.dateLabel($0))" }
        } ?? card.displaySourceLine
      ) {
        if !card.related.isEmpty {
          Text("\(card.related.count)\(Copy.text("web.card.relatedCount"))")
        }
      }
      CardTitle(text: card.title, faded: faded, query: context.query).afterHead()
      if !context.compact {
        SummaryBlock(
          summary: card.summary.isEmpty
            ? card.body.first ?? "" : card.summary,
          query: context.query
        ).afterTitle()
      }
    }
  }
}
