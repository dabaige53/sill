#if os(iOS)
  import SillKit
  import SwiftUI

  /// Archived cards offer the same explicit restore action in the shelf and search.
  struct MobileArchiveRow: View {
    let workspace: MobileWorkspace
    let card: MobileCard
    var query = ""
    let open: (String) -> Void

    var body: some View {
      HStack(spacing: AppleMetrics.space12) {
        MobileIcon(MobileCardTile.icon(card.type), size: AppleMetrics.font16)
          .foregroundStyle(AppleColors.secondary)
          .frame(width: AppleMetrics.rowIconSize, height: AppleMetrics.rowIconSize)
          .background(
            AppleColors.surface, in: RoundedRectangle(cornerRadius: AppleMetrics.rowIconRadius))
        Button {
          open(card.id)
        } label: {
          VStack(alignment: .leading, spacing: AppleMetrics.space4) {
            MobileHighlightedText(value: card.title, query: query)
              .font(.system(size: AppleMetrics.font15)).foregroundStyle(AppleColors.primary)
              .lineLimit(2)
            if !card.sourceName.isEmpty {
              Text(card.sourceName).font(.system(size: AppleMetrics.font12))
                .foregroundStyle(AppleColors.secondary).lineLimit(1)
            }
          }.frame(maxWidth: .infinity, minHeight: AppleMetrics.hitTarget, alignment: .leading)
            .contentShape(Rectangle())
        }.buttonStyle(.plain)
        VStack(alignment: .trailing, spacing: 0) {
          Text(MobileFormat.shortDay(MobileFormat.date(archivedAt)))
            .font(.system(size: AppleMetrics.font12)).foregroundStyle(AppleColors.secondary)
          Button(Copy.text("web.archive.restoreToDesk")) {
            Task { await workspace.toggle(card, field: "archived") }
          }
          .font(.system(size: AppleMetrics.font13))
          .frame(minHeight: AppleMetrics.hitTarget).buttonStyle(MobilePressStyle())
          .disabled(workspace.busy || workspace.unresolvedWrite)
        }
      }
      .padding(.vertical, AppleMetrics.space6)
      .frame(minHeight: AppleMetrics.listRowHeight)
      .accessibilityElement(children: .contain)
    }
    private var archivedAt: Double {
      let readAt = card.item["readAt"]?.number ?? 0
      return readAt > 0 ? readAt : card.time
    }
  }
#endif
