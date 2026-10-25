#if os(iOS)
import SillKit
import SwiftUI

struct MobileCardTile: View {
  let workspace: MobileWorkspace
  let card: MobileCard
  let open: () -> Void
  @ScaledMetric(relativeTo: .body) private var dynamicScale: CGFloat = 1

  var body: some View {
    VStack(alignment: .leading, spacing: AppleMetrics.space12) {
      Button(action: open) {
        VStack(alignment: .leading, spacing: AppleMetrics.space12) {
          HStack(spacing: AppleMetrics.space6) {
            MobileIcon(Self.icon(card.type), size: AppleMetrics.space16)
            Text(card.sourceName.isEmpty ? Copy.text("card.type.\(card.type)") : card.sourceName)
              .lineLimit(1)
            Spacer(minLength: AppleMetrics.space8)
            if card.bookmarked { MobileIcon("bookmark", size: AppleMetrics.space16) }
          }
          .font(contentFont(AppleMetrics.font13))
          .foregroundStyle(AppleColors.secondary)
          if let image = card.image ?? card.photos.first, ["media", "photo"].contains(card.type) {
            MobileRemoteImage(url: image, title: card.title)
              .aspectRatio(2, contentMode: .fit)
              .clipShape(RoundedRectangle(cornerRadius: AppleMetrics.coverRadius))
          }
          HStack(alignment: .top, spacing: AppleMetrics.space12) {
            if card.type == "event", let start = card.start {
              Text(Date(timeIntervalSince1970: start / 1000), format: .dateTime.hour().minute())
                .font(contentFont(AppleMetrics.eventCardTimeSize, weight: .semibold, design: .rounded))
                .monospacedDigit()
            }
            VStack(alignment: .leading, spacing: AppleMetrics.space8) {
              Text(card.title).font(contentFont(AppleMetrics.font17, weight: .semibold))
                .multilineTextAlignment(.leading).frame(maxWidth: .infinity, alignment: .leading)
              if !card.summary.isEmpty {
                Text(card.summary).font(contentFont(AppleMetrics.font15))
                  .foregroundStyle(AppleColors.secondary).lineLimit(2)
                  .multilineTextAlignment(.leading)
              }
              if let location = card.location, !location.isEmpty {
                Text(location).font(contentFont(AppleMetrics.font13))
                  .foregroundStyle(AppleColors.secondary).lineLimit(1)
              }
            }
            if card.type == "article", let image = card.image {
              MobileRemoteImage(url: image, title: card.title)
                .frame(width: AppleMetrics.headerEdgeHeight, height: AppleMetrics.headerEdgeHeight)
                .clipped().clipShape(RoundedRectangle(cornerRadius: AppleMetrics.coverRadius))
            }
          }
          if !card.tags.isEmpty {
            Text(card.tags.map { "#" + $0 }.joined(separator: "  "))
              .font(contentFont(AppleMetrics.font12)).foregroundStyle(AppleColors.secondary)
              .lineLimit(2)
          }
        }.contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityHint(Copy.text("apple.openHint"))
      if card.type == "task" {
        ForEach(card.tasks.prefix(3)) { task in
          Button {
            Task { await workspace.toggleTask(card, taskID: task.id) }
          } label: {
            HStack(spacing: AppleMetrics.space8) {
              MobileIcon(task.done ? "check-circle" : "circle", size: AppleMetrics.taskDotSize)
              Text(task.text).strikethrough(task.done).lineLimit(2)
                .frame(maxWidth: .infinity, alignment: .leading)
            }.frame(minHeight: AppleMetrics.hitTarget)
              .font(contentFont(AppleMetrics.font14))
          }.buttonStyle(.plain).disabled(workspace.busy || workspace.unresolvedWrite)
        }
      }
      if card.type == "reminder" {
        Button(Copy.text(card.reminderDone ? "web.reminder.restore" : "web.reminder.complete")) {
          Task { await workspace.toggle(card, field: "reminderDone") }
        }.buttonStyle(.plain).foregroundStyle(AppleColors.accent)
          .frame(minHeight: AppleMetrics.hitTarget)
          .disabled(workspace.busy || workspace.unresolvedWrite)
      }
      if card.type == "file" {
        ForEach(Array((card.raw["files"]?.array ?? []).prefix(3).enumerated()), id: \.offset) { _, file in
          HStack(spacing: AppleMetrics.space8) {
            MobileIcon("file", size: AppleMetrics.space16)
            Text(file["name"]?.string ?? "").lineLimit(1)
          }.font(contentFont(AppleMetrics.font14)).foregroundStyle(AppleColors.secondary)
        }
      }
    }
    .foregroundStyle(AppleColors.primary)
    .padding(AppleMetrics.space16 * MobileContentStyle.spacing(workspace.preferences["cardPadding"]?.string))
    .frame(maxWidth: .infinity, alignment: .leading)
    .background((card.read && (workspace.preferences["fadeRead"]?.bool ?? true)) || card.completed ? AppleColors.readCard : AppleColors.card,
      in: RoundedRectangle(cornerRadius: AppleMetrics.mobileCardRadius))
    .overlay {
      RoundedRectangle(cornerRadius: AppleMetrics.mobileCardRadius)
        .strokeBorder(AppleColors.lineCard, lineWidth: AppleMetrics.lineWidth)
    }
    .shadow(color: .black.opacity(AppleMetrics.shadowCardNearOpacity),
      radius: AppleMetrics.shadowCardNearBlur / 2, y: AppleMetrics.shadowCardNearY)
    .shadow(color: .black.opacity(AppleMetrics.shadowCardFarOpacity),
      radius: AppleMetrics.shadowCardFarBlur / 2, y: AppleMetrics.shadowCardFarY)
  }

  private func contentFont(_ size: CGFloat, weight: Font.Weight = .regular, design: Font.Design = .default) -> Font {
    MobileContentStyle.font(size, weight: weight, design: design,
      scale: dynamicScale * AppleMetrics.mobileTextScale * MobileContentStyle.text(workspace.preferences["cardTextSize"]?.string),
      strong: workspace.preferences["textWeight"]?.string == "strong")
  }

  static func icon(_ type: String) -> String {
    switch type {
    case "article": "book"
    case "mail": "mail"
    case "note": "note"
    case "task": "check-circle"
    case "event": "calendar"
    case "reminder": "bell"
    case "media": "video"
    case "digest": "chart"
    case "suggestion": "sparkles"
    case "photo": "image"
    case "file": "folder"
    case "pr": "pull"
    default: "file"
    }
  }
}
/// Shared content preferences leave controls at their normal system size.
enum MobileContentStyle {
  static func text(_ value: String?) -> CGFloat {
    switch value {
    case "small": AppleMetrics.layoutTextSmall
    case "large": AppleMetrics.layoutTextLarge
    default: 1
    }
  }
  static func spacing(_ value: String?) -> CGFloat {
    switch value {
    case "compact": AppleMetrics.layoutSpaceCompact
    case "roomy": AppleMetrics.layoutSpaceRoomy
    default: 1
    }
  }
  static func font(_ size: CGFloat, weight: Font.Weight = .regular, design: Font.Design = .default,
    scale: CGFloat, strong: Bool) -> Font {
    let resolved: Font.Weight = strong ? (weight == .regular ? .medium : .bold) : weight
    return .system(size: size * scale, weight: resolved, design: design)
  }
}
#endif
