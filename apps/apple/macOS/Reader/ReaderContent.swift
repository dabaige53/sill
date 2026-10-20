import SillKit
import SwiftUI

/// Type sizes for the preview sheet and the fullscreen page (Web `.preview-body`, `.reader-body`).
struct ReaderType {
  var title: CGFloat
  var titleLeading: CGFloat
  var titleTracking: CGFloat
  var body: CGFloat
  var bodyLeading: CGFloat

  static let preview = ReaderType(
    title: AppleMetrics.previewTitle, titleLeading: AppleMetrics.previewTitleLeading,
    titleTracking: AppleMetrics.previewTitleTracking, body: AppleMetrics.previewLead,
    bodyLeading: AppleMetrics.previewBodyLeading)
  static let page = ReaderType(
    title: AppleMetrics.font34, titleLeading: AppleMetrics.readerTitleLeading,
    titleTracking: AppleMetrics.readerTitleTracking, body: AppleMetrics.font18,
    bodyLeading: AppleMetrics.readerBodyLeading)
}

/// The content of a detail, by card type (Web `previews-components.tsx`). The first row reports
/// its height so the floating discs can center on it.
struct ReaderContent: View {
  let card: CardModel
  let state: CardState
  var type = ReaderType.preview
  /// Room kept on the right of the first row for the floating discs.
  var discRoom: CGFloat = 0
  @Environment(\.cardIntents) private var intents

  var body: some View {
    VStack(alignment: .leading, spacing: AppleMetrics.previewBodyGap) {
      switch card.kind {
      case .mail: mail
      case .event: event
      case .file: file
      case .task, .reminder: taskReminder
      case .media where card.isPodcast: podcast
      default: article
      }
      NoteBox(note: state.note)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  // MARK: Shared rows

  private var meta: some View {
    MetaRow(icon: AnyView(SourceIcon(card: card, size: AppleMetrics.font15))) {
      Text(
        [
          card.sources.map(\.name).filter { !$0.isEmpty }.uniqued().joined(separator: " · ")
            .nilIfEmpty ?? card.kind.label, card.readingTime,
        ].filter { !$0.isEmpty }.joined(separator: " · "))
    }
    .padding(.trailing, discRoom)
    .firstRow()
  }

  private var title: some View {
    Text(card.title)
      .textStyle(type.title, .semibold, leading: type.titleLeading, tracking: type.titleTracking)
      .foregroundStyle(AppleColors.primary)
      .frame(maxWidth: .infinity, alignment: .leading)
      .fixedSize(horizontal: false, vertical: true)
      .accessibilityAddTraits(.isHeader)
  }

  @ViewBuilder private var heading: some View {
    title
    ReaderTags(tags: state.tags(of: card))
    PublicationRows(publication: card.publication)
  }

  private func paragraphs(_ list: [String]) -> some View {
    VStack(alignment: .leading, spacing: AppleMetrics.space16) {
      ForEach(Array(list.enumerated()), id: \.offset) { _, text in
        Text(text).textStyle(type.body, leading: type.bodyLeading)
          .foregroundStyle(AppleColors.primary)
          .frame(maxWidth: .infinity, alignment: .leading)
          .fixedSize(horizontal: false, vertical: true)
          .textSelection(.enabled)
      }
    }
  }

  // MARK: Types

  @ViewBuilder private var article: some View {
    meta
    heading
    if card.kind == .media, let duration = card.duration {
      Text(Format.duration(duration)).font(.number(AppleMetrics.font13))
        .foregroundStyle(AppleColors.secondary)
    }
    if card.image != nil {
      CoverImage(name: card.image)
        .aspectRatio(16 / 9, contentMode: .fit)
        .frame(maxWidth: .infinity)
        .clipShape(
          RoundedRectangle(cornerRadius: AppleMetrics.previewCoverRadius, style: .continuous))
    }
    if !card.summary.isEmpty, !card.isQuote, card.summary != card.body.first {
      Text(card.summary).textStyle(
        AppleMetrics.previewLead, leading: AppleMetrics.previewLeadLeading
      )
      .foregroundStyle(AppleColors.primary)
      .fixedSize(horizontal: false, vertical: true)
      .textSelection(.enabled)
    }
    if !card.points.isEmpty { KeyPoints(points: card.points) }
    if card.kind == .suggestion { related }
    if !card.body.isEmpty { paragraphs(card.body) }
  }

  @Environment(\.relatedCards) private var lookup

  private var related: some View {
    VStack(spacing: AppleMetrics.space8) {
      ForEach(card.related.compactMap(lookup), id: \.id) { item in
        RelatedRow(card: item) { intents.open(item.id) }
      }
    }
    .padding(.top, AppleMetrics.space4)
  }

  @ViewBuilder private var mail: some View {
    if let sender = card.sender {
      HStack(spacing: AppleMetrics.space10) {
        Avatar(name: sender, size: AppleMetrics.space36)
        VStack(alignment: .leading, spacing: 0) {
          Text(sender).font(.sans(AppleMetrics.font15, .bold)).foregroundStyle(AppleColors.primary)
          Text(
            [card.sentAt.flatMap(Self.fullDate) ?? "", card.readingTime].filter { !$0.isEmpty }
              .joined(separator: " · ")
          )
          .font(.sans(AppleMetrics.font12)).foregroundStyle(AppleColors.secondary)
        }
      }
      .padding(.trailing, discRoom)
      .firstRow()
    } else {
      meta
    }
    heading
    paragraphs(card.body.isEmpty ? [card.summary] : card.body)
    if let attachment = card.attachment {
      HStack(spacing: AppleMetrics.space8) {
        Icon("file", size: AppleMetrics.font15).foregroundStyle(AppleColors.iconSecondary)
        Text(attachment).lineLimit(1)
      }
      .font(.sans(AppleMetrics.font13)).foregroundStyle(AppleColors.primary)
      .padding(.horizontal, AppleMetrics.space10)
      .frame(minHeight: AppleMetrics.refRowHeight)
      .background(RoundedRectangle(cornerRadius: AppleMetrics.refRadius).fill(AppleColors.canvas))
      .padding(.top, AppleMetrics.space4)
    }
  }

  @ViewBuilder private var event: some View {
    let start = card.start ?? 0
    let end = card.end ?? start
    let relative = Format.eventRelative(start: start, end: end, now: Format.milliseconds())
    MetaRow(icon: nil) {
      Text(Format.dateLabel(start))
        + Text(relative.isEmpty ? "" : " · ")
        + Text(relative).foregroundColor(AppleColors.accent).fontWeight(.medium)
    }
    .padding(.trailing, discRoom)
    .firstRow()
    HStack(alignment: .firstTextBaseline, spacing: AppleMetrics.space12) {
      Text(Format.time(start))
        .textStyle(
          AppleMetrics.eventHeroSize, .semibold, leading: AppleMetrics.eventHeroLeading,
          tracking: AppleMetrics.previewTitleTracking, number: true
        )
        .foregroundStyle(AppleColors.primary)
      Text(
        "\(Copy.text("web.templates.83532308ecca"))\(Format.time(end)) · \(Int(((end - start) / 60000).rounded()))\(Copy.text("web.templates.40de54344d22"))"
      )
      .font(.number(AppleMetrics.font15)).foregroundStyle(AppleColors.secondary)
    }
    heading
    let rows = eventRows
    if !rows.isEmpty {
      VStack(spacing: 0) {
        ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
          DetailRow(icon: row.icon, title: row.title, trailing: row.trailing, divider: index > 0)
        }
      }
    }
    if !card.body.isEmpty { paragraphs(card.body) }
  }

  private var eventRows: [(icon: String, title: String, trailing: String)] {
    var rows: [(String, String, String)] = []
    if let meeting = card.meeting { rows.append(("video", meeting.name, meeting.code ?? "")) }
    if let location = card.location { rows.append(("pin", location, "")) }
    if !card.people.isEmpty {
      rows.append(
        (
          "at", card.people.joined(separator: "、"),
          "\(card.people.count)\(Copy.text("web.preview.peopleCountSuffix"))"
        ))
    }
    return rows
  }

  @ViewBuilder private var podcast: some View {
    LinearGradient(
      colors: [
        AppleColors.fixedPodcastCoverStart, AppleColors.fixedPodcastCoverMid,
        AppleColors.fixedPodcastCoverEnd,
      ], startPoint: .topLeading, endPoint: .bottomTrailing
    )
    .frame(width: AppleMetrics.playerArtSize, height: AppleMetrics.playerArtSize)
    .clipShape(RoundedRectangle(cornerRadius: AppleMetrics.coverRadius, style: .continuous))
    .frame(maxWidth: .infinity)
    .accessibilityHidden(true)
    .firstRow()
    heading
    meta
    if let duration = card.duration {
      Text(Format.duration(duration)).font(.number(AppleMetrics.font13))
        .foregroundStyle(AppleColors.secondary)
    }
    if !card.summary.isEmpty {
      Text(card.summary).textStyle(
        AppleMetrics.previewLead, leading: AppleMetrics.previewLeadLeading
      )
      .foregroundStyle(AppleColors.primary).fixedSize(horizontal: false, vertical: true)
    }
    if !card.body.isEmpty { paragraphs(card.body) }
    Text(Copy.text("web.media.playbackUnavailable"))
      .font(.sans(AppleMetrics.font13)).foregroundStyle(AppleColors.secondary)
  }

  @ViewBuilder private var file: some View {
    MetaRow(icon: AnyView(Icon("folder", size: AppleMetrics.font15))) {
      Text(
        Copy.text("web.preview.fileSourcePrefix")
          + [card.sourceName, card.readingTime].filter { !$0.isEmpty }.joined(separator: " · "))
    }
    .padding(.trailing, discRoom)
    .firstRow()
    heading
    VStack(spacing: 0) {
      ForEach(Array(card.files.enumerated()), id: \.offset) { index, file in
        DetailRow(
          icon: file.isImage ? "image" : "file", title: file.name, detail: file.detail,
          trailing: file.modifiedAt ?? "", divider: index > 0)
      }
    }
  }

  @ViewBuilder private var taskReminder: some View {
    let label: String =
      card.kind == .reminder
      ? [
        Copy.text("web.reminder"), card.sourceName,
        FeedPolicy.reminderTime(card, state: state, now: Format.milliseconds()).map {
          Format.reminderClock($0.at, now: Format.milliseconds())
        } ?? "",
      ].filter { !$0.isEmpty }.uniqued().joined(separator: " · ")
      : card.project ?? ""
    MetaRow(icon: AnyView(Icon(card.kind.icon, size: AppleMetrics.font15))) { Text(label) }
      .padding(.trailing, discRoom)
      .firstRow()
    if card.kind == .reminder {
      HStack(alignment: .top, spacing: AppleMetrics.space12) {
        ReminderCheck(card: card, state: state)
          .padding(
            .top,
            (type.title * type.titleLeading - AppleMetrics.hitTarget) / 2 + AppleMetrics.space11)
        title
      }
      ReaderTags(tags: state.tags(of: card))
    } else {
      heading
    }
    if !card.summary.isEmpty {
      Text(card.summary).textStyle(
        AppleMetrics.previewLead, leading: AppleMetrics.previewLeadLeading
      )
      .foregroundStyle(AppleColors.primary).fixedSize(horizontal: false, vertical: true)
    }
    if card.kind == .task {
      VStack(alignment: .leading, spacing: 0) {
        ForEach(state.tasks(of: card)) { task in
          TaskRow(task: task, locked: state.isWriting, large: true) {
            intents.toggleTask(card.id, task.id)
          }
        }
      }
    }
  }

  static func fullDate(_ value: String) -> String? {
    guard let date = Format.parseDate(value) else { return nil }
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyy-MM-dd HH:mm 'UTC'xxx"
    return formatter.string(from: date)
  }
}

/// Source icon and source name over the title: secondary, one line.
struct MetaRow<Label: View>: View {
  let icon: AnyView?
  @ViewBuilder var label: Label
  var body: some View {
    HStack(spacing: AppleMetrics.space6) {
      if let icon { icon.foregroundStyle(AppleColors.iconSecondary) }
      label.lineLimit(1).truncationMode(.tail)
    }
    .font(.sans(AppleMetrics.font13))
    .foregroundStyle(AppleColors.iconSecondary)
  }
}

/// Small non-interactive tags under the title.
struct ReaderTags: View {
  let tags: [String]
  var body: some View {
    if !tags.isEmpty {
      FlowRow(spacing: AppleMetrics.space6) {
        ForEach(tags, id: \.self) { tag in
          Text("#\(tag)")
            .font(.sans(AppleMetrics.font12))
            .foregroundStyle(AppleColors.primary)
            .padding(.vertical, AppleMetrics.space3).padding(.horizontal, AppleMetrics.space8)
            .background(Capsule().fill(AppleColors.surface))
        }
      }
    }
  }
}

/// Publication date and author rows: small grey text, no box (Medium-style).
struct PublicationRows: View {
  let publication: CardModel.Publication
  var body: some View {
    if publication.date != nil || !publication.rows.isEmpty {
      VStack(alignment: .leading, spacing: AppleMetrics.space6) {
        if let date = publication.date {
          Text(date).help(publication.dateTitle ?? "")
        }
        ForEach(Array(publication.rows.enumerated()), id: \.offset) { _, row in
          Text(row.label.isEmpty ? row.value : "\(row.label) · \(row.value)")
        }
      }
      .font(.sans(AppleMetrics.font12))
      .foregroundStyle(AppleColors.iconSecondary)
    }
  }
}

/// The personal note at the end of the text, in a light bordered box labelled 备注.
struct NoteBox: View {
  let note: String
  var body: some View {
    if !note.isEmpty {
      VStack(alignment: .leading, spacing: AppleMetrics.space6) {
        Text(Copy.text("web.metadata.note")).font(.sans(AppleMetrics.font12, .semibold))
        Text(note).textStyle(AppleMetrics.font14, leading: AppleMetrics.previewLeadLeading)
          .fixedSize(horizontal: false, vertical: true)
          .textSelection(.enabled)
      }
      .foregroundStyle(AppleColors.iconSecondary)
      .padding(AppleMetrics.space16)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(
        RoundedRectangle(cornerRadius: AppleMetrics.controlRadius).fill(AppleColors.surface)
          .overlay(
            RoundedRectangle(cornerRadius: AppleMetrics.controlRadius)
              .strokeBorder(AppleColors.line, lineWidth: AppleMetrics.lineWidth))
      )
      .accessibilityElement(children: .combine)
    }
  }
}

struct DetailRow: View {
  let icon: String
  let title: String
  var detail = ""
  var trailing = ""
  var divider = false
  var body: some View {
    HStack(spacing: AppleMetrics.space12) {
      Icon(icon, size: AppleMetrics.space16)
        .foregroundStyle(AppleColors.secondary)
        .frame(width: AppleMetrics.detailIconSize, height: AppleMetrics.detailIconSize)
        .background(
          RoundedRectangle(cornerRadius: AppleMetrics.detailIconRadius).fill(AppleColors.surface))
      VStack(alignment: .leading, spacing: 0) {
        Text(title).lineLimit(1).truncationMode(.tail)
        if !detail.isEmpty {
          Text(detail).font(.sans(AppleMetrics.font12)).foregroundStyle(AppleColors.secondary)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      if !trailing.isEmpty {
        Text(trailing).font(.number(AppleMetrics.font13)).foregroundStyle(AppleColors.secondary)
          .lineLimit(1)
      }
    }
    .font(.sans(AppleMetrics.font15))
    .foregroundStyle(AppleColors.primary)
    .frame(minHeight: AppleMetrics.detailRowHeight)
    .overlay(alignment: .top) {
      if divider { Rectangle().fill(AppleColors.line).frame(height: AppleMetrics.lineWidth) }
    }
  }
}

/// The first row of a detail reports its height; the floating discs center on it.
struct FirstRowHeight: PreferenceKey {
  static let defaultValue: CGFloat = 0
  static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
    value = max(value, nextValue())
  }
}

extension View {
  func firstRow() -> some View {
    background(
      GeometryReader { Color.clear.preference(key: FirstRowHeight.self, value: $0.size.height) })
  }
}

extension Array where Element: Hashable {
  func uniqued() -> [Element] {
    var seen = Set<Element>()
    return filter { seen.insert($0).inserted }
  }
}
