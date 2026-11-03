import SillKit
import SwiftUI

/// A read-only introduction. Listening position belongs to the shared workspace record.
struct PodcastDetail: View {
  let card: CardModel
  let state: CardState

  @Environment(Workspace.self) private var workspace

  private var rhythm: DetailRhythm {
    DetailRhythm(scale: workspace.preferences.readerSpacing.scale)
  }

  private var sourceRow: some View {
    MetaRow(icon: AnyView(SourceIcon(card: card))) {
      card.metaText(
        [card.publicationName, card.displayDate].filter { !$0.isEmpty }.joined(separator: " · "))
    }
  }

  var body: some View {
    VStack(alignment: .leading, spacing: rhythm.group) {
      VStack(alignment: .leading, spacing: AppleMetrics.rhythmItem) {
        HStack(alignment: .center, spacing: AppleMetrics.rhythmItem) {
          CoverImage(name: card.cover)
            .frame(width: AppleMetrics.podcastCoverSize, height: AppleMetrics.podcastCoverSize)
            .background(AppleColors.surface)
            .overlay {
              if card.cover == nil {
                VStack(alignment: .leading, spacing: AppleMetrics.space12) {
                  Text(card.publicationName).font(.sans(AppleMetrics.font13))
                    .foregroundStyle(AppleColors.secondary)
                  Text(card.title).font(.sans(AppleMetrics.font16, .semibold)).lineLimit(3)
                }
                .padding(AppleMetrics.space12)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
              }
            }
            .clipShape(RoundedRectangle(cornerRadius: AppleMetrics.controlRadius))
          VStack(alignment: .leading, spacing: AppleMetrics.rhythmClose) {
            // Program · date, the same source row as the card; the program opens its page.
            if let url = card.url {
              Link(destination: url) { sourceRow }.buttonStyle(.plain)
            } else {
              sourceRow
            }
            HStack(spacing: AppleMetrics.space6) {
              Icon("headphones", size: AppleMetrics.space16)
              Text(Copy.text("web.media.listening"))
              Text(Format.duration(Int(state.playbackPosition))).fontWeight(.semibold)
              Text(
                "/ "
                  + (card.duration.map(Format.duration) ?? Copy.text("web.media.unknownDuration")))
            }.font(.number(AppleMetrics.font13)).foregroundStyle(AppleColors.secondary)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.trailing, AppleMetrics.space48)
        }
        Text(card.title).textStyle(AppleMetrics.podcastTitleSize, .semibold)
        ReaderTags(tags: state.tags(of: card))
      }
      SummaryOverview(card: card)
      if !card.markdown.blocks.isEmpty {
        section("web.media.introduction", spacing: AppleMetrics.rhythmLabel) {
          MarkdownText(
            document: card.markdown, size: AppleMetrics.font15,
            leading: AppleMetrics.previewBodyLeading)
        }
      }
      if !card.chapters.isEmpty {
        section("web.media.chapters") {
          ForEach(Array(card.chapters.enumerated()), id: \.offset) { _, chapter in
            HStack(alignment: .top, spacing: AppleMetrics.space16) {
              Text(Format.duration(Int(chapter.start)))
                .font(.number(AppleMetrics.font14)).foregroundStyle(AppleColors.secondary)
              Text(chapter.title).frame(maxWidth: .infinity, alignment: .leading)
            }.padding(.vertical, AppleMetrics.space12)
              .overlay(alignment: .bottom) { Divider() }
          }
        }
      }
      if !card.transcript.isEmpty {
        VStack(alignment: .leading, spacing: AppleMetrics.rhythmLabel) {
          HStack(alignment: .firstTextBaseline, spacing: AppleMetrics.space6) {
            Text(Copy.text("web.media.transcript")).font(.sans(AppleMetrics.font17, .semibold))
            Text(Copy.text("web.media.excerpt")).font(.sans(AppleMetrics.font12))
              .foregroundStyle(AppleColors.secondary)
          }
          VStack(alignment: .leading, spacing: AppleMetrics.rhythmItem * rhythm.scale) {
            ForEach(Array(card.transcript.prefix(5).enumerated()), id: \.offset) { _, line in
              Text(line.text).font(.system(size: AppleMetrics.font17, design: .serif))
                .fixedSize(horizontal: false, vertical: true)
            }
          }
        }
        .padding(.top, rhythm.sectionLead)
      }
      if !(card.sources.first?.name ?? "").isEmpty || !card.authors.isEmpty
        || card.publicationDate != nil || card.duration != nil
      {
        section("web.media.information") {
          fact("web.media.program", card.sources.first?.name ?? "")
          fact(
            "web.media.host",
            card.authors.map(\.name).joined(separator: "、"))
          fact("web.media.published", card.publicationDate ?? "")
          if let duration = card.duration {
            fact(
              "web.media.duration",
              String(max(1, Int((Double(duration) / 60).rounded())))
                + Copy.text("web.templates.40de54344d22"))
          }
        }
      }
    }
    .frame(maxWidth: AppleMetrics.podcastColumn, alignment: .leading)
    .frame(maxWidth: .infinity)
    .foregroundStyle(AppleColors.primary).font(.sans(AppleMetrics.font15))
  }

  private func section<Content: View>(
    _ key: String, spacing: CGFloat = AppleMetrics.rhythmClose,
    @ViewBuilder content: () -> Content
  )
    -> some View
  {
    VStack(alignment: .leading, spacing: spacing) {
      Text(Copy.text(key)).font(.sans(AppleMetrics.font17, .semibold))
      VStack(alignment: .leading, spacing: 0, content: content)
    }
    .padding(.top, rhythm.sectionLead)
  }

  @ViewBuilder private func fact(_ key: String, _ value: String) -> some View {
    if !value.isEmpty {
      HStack(alignment: .top, spacing: AppleMetrics.space16) {
        Text(Copy.text(key)).foregroundStyle(AppleColors.secondary)
        Spacer(minLength: 0)
        Text(value).multilineTextAlignment(.trailing)
      }.padding(.vertical, AppleMetrics.space12)
        .overlay(alignment: .bottom) { Divider() }
    }
  }
}
