import SillKit
import SwiftUI

/// Web `ShelfView`: at the end of the desk, one row for the cards that were put away. It shows
/// only while browsing and only when there is something on the shelf.
struct ShelfEntry: View {
  let count: Int
  @Environment(Panels.self) private var panels

  var body: some View {
    Button {
      panels.open(.archive)
    } label: {
      HStack(spacing: AppleMetrics.space8) {
        Icon("ring", size: AppleMetrics.font16).foregroundStyle(AppleColors.secondary)
        Text(Copy.text("web.templates.7b7e6e8bd4ba")).fontWeight(.semibold)
          .foregroundStyle(AppleColors.primary)
        Text(Copy.text("web.templates.08ae1ab86ff2"))
          .font(.sans(AppleMetrics.font13))
          .foregroundStyle(AppleColors.secondary)
        Spacer(minLength: 0)
        Text("\(count)").font(.number(AppleMetrics.font13)).foregroundStyle(AppleColors.secondary)
      }
      .font(.sans(AppleMetrics.font14))
      .padding(.horizontal, AppleMetrics.space18)
      .frame(minHeight: AppleMetrics.shelfRowHeight)
    }
    .buttonStyle(
      RowStyle(
        fill: AppleColors.faintRow, highlight: AppleColors.faint,
        radius: AppleMetrics.shelfRowRadius)
    )
    .accessibilityLabel(Copy.text("web.templates.25775c98c7b8"))
    .accessibilityValue("\(Copy.text("web.templates.7b7e6e8bd4ba")) \(count)")
  }
}

/// Web `Panels.archive`: the cards that were read and put away, newest first, grouped into this
/// week, last week and earlier by when they were read. Each row opens the card or puts it back on
/// the desk.
struct ArchivePanel: View {
  @Environment(Workspace.self) private var workspace
  @Environment(Feed.self) private var feed
  @Environment(Panels.self) private var panels
  @Environment(Reader.self) private var reader

  var body: some View {
    let groups = Self.groups(workspace: workspace, now: Format.milliseconds())
    let count = groups.reduce(0) { $0 + $1.cards.count }
    VStack(alignment: .leading, spacing: 0) {
      PanelHead(title: Copy.text("web.templates.7b7e6e8bd4ba")) {
        Text("\(count)").font(.number(AppleMetrics.font13)).foregroundStyle(AppleColors.secondary)
      }
      if groups.isEmpty {
        Text(Copy.text("web.archive.empty"))
          .font(.sans(AppleMetrics.font15))
          .foregroundStyle(AppleColors.secondary)
          .frame(maxWidth: .infinity)
          .padding(.vertical, AppleMetrics.space32)
      } else {
        ScrollView(.vertical) {
          VStack(alignment: .leading, spacing: 0) {
            ForEach(groups.indices, id: \.self) { index in
              GroupLabel(text: groups[index].label, first: index == 0)
              ForEach(Array(groups[index].cards.enumerated()), id: \.element.card.id) {
                offset, row in
                ArchiveRow(card: row.card, at: row.at, divider: offset > 0) {
                  panels.close()
                  reader.open(row.card.id)
                } restore: {
                  workspace.restore(row.card.id) { feed.refreshMembership() }
                }
              }
            }
          }
        }
        .scrollIndicators(.hidden)
        .frame(
          maxHeight: (NSApp.keyWindow?.contentView?.bounds.height ?? 800)
            * AppleMetrics.archiveScrollShare
        )
        .fixedSize(horizontal: false, vertical: true)
      }
    }
  }

  struct Group {
    var label: String
    var cards: [(card: CardModel, at: Double)]
  }

  /// Archived cards by `readAt` (or the card time), into 本周, 上周 and 更早.
  static func groups(workspace: Workspace, now: Double) -> [Group] {
    let day = 86_400_000.0
    let rows = workspace.cards
      .filter { workspace.state($0.id).archived }
      .sorted { $0.time > $1.time }
      .map { card -> (card: CardModel, at: Double) in
        let readAt = workspace.state(card.id).confirmed["readAt"]?.number ?? 0
        return (card, readAt > 0 ? readAt : card.time)
      }
    var groups: [Group] = []
    for row in rows {
      let age = now - row.at
      let label =
        age < 7 * day
        ? Copy.text("web.archive.thisWeek")
        : age < 14 * day
          ? Copy.text("web.primitives.0cf8b14f4651") : Copy.text("web.archive.earlier")
      if let index = groups.firstIndex(where: { $0.label == label }) {
        groups[index].cards.append(row)
      } else {
        groups.append(Group(label: label, cards: [row]))
      }
    }
    return groups
  }
}

/// Web `.group-label`: caption size, muted, 16 above (none for the first) and 4 below.
struct GroupLabel: View {
  let text: String
  var first = false
  var body: some View {
    Text(text)
      .font(.sans(AppleMetrics.font12))
      .foregroundStyle(AppleColors.secondary)
      .padding(.top, first ? 0 : AppleMetrics.space16)
      .padding(.bottom, AppleMetrics.space4)
      .accessibilityAddTraits(.isHeader)
  }
}

/// Web `.list-row`: type icon, title and source, the date and 「放回桌面」 on the right.
private struct ArchiveRow: View {
  let card: CardModel
  let at: Double
  let divider: Bool
  let open: () -> Void
  let restore: () -> Void
  @State private var hovered = false

  var body: some View {
    HStack(spacing: AppleMetrics.space12) {
      Icon(card.kind.icon, size: AppleMetrics.font16)
        .foregroundStyle(AppleColors.secondary)
        .frame(width: AppleMetrics.rowIconSize, height: AppleMetrics.rowIconSize)
        .background(
          RoundedRectangle(cornerRadius: AppleMetrics.rowIconRadius).fill(AppleColors.surface))
      Button(action: open) {
        VStack(alignment: .leading, spacing: 0) {
          Text(card.title).font(.sans(AppleMetrics.font15)).foregroundStyle(AppleColors.primary)
            .lineLimit(1)
          if !card.sourceName.isEmpty {
            Text(card.sourceName).font(.sans(AppleMetrics.font12))
              .foregroundStyle(AppleColors.secondary).lineLimit(1)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      HStack(spacing: AppleMetrics.space12) {
        Text(Self.date(at)).font(.number(AppleMetrics.font12)).foregroundStyle(
          AppleColors.secondary)
        Button(Copy.text("web.archive.restoreToDesk"), action: restore)
          .buttonStyle(TextLinkStyle())
      }
    }
    .padding(.vertical, AppleMetrics.space6)
    .padding(.horizontal, AppleMetrics.space10)
    .frame(minHeight: AppleMetrics.listRowHeight)
    .background(
      RoundedRectangle(cornerRadius: AppleMetrics.controlRadius)
        .fill(hovered ? AppleColors.canvas : .clear)
    )
    .overlay(alignment: .top) {
      if divider {
        Rectangle().fill(AppleColors.line).frame(height: AppleMetrics.lineWidth)
          .padding(.horizontal, AppleMetrics.space10)
      }
    }
    .padding(.horizontal, -AppleMetrics.space10)
    .onHover { hovered = $0 }
    .accessibilityElement(children: .contain)
  }

  /// 「10月20日」.
  static func date(_ at: Double) -> String {
    let parts = Calendar.current.dateComponents([.month, .day], from: Format.date(at))
    return "\(parts.month ?? 1)\(Copy.text("web.primitives.1625179badc0"))\(parts.day ?? 1)"
      + Copy.text("web.primitives.85217f7aff77")
  }
}
