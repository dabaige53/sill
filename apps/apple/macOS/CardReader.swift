import AppKit
import SillKit
import SwiftUI

struct CardReader: View {
  @EnvironmentObject var model: Workspace
  @Environment(\.colorScheme) private var colorScheme
  var availableSize = CGSize(width: 1100, height: 760)
  var presentedID: String?
  @State var organizing = false
  @State var expanded = false
  @State var editRevision = 0
  @State var note = ""
  @State var tags: [String] = []
  @State var newTag = ""
  @State var mediaStep = 0
  @State var playing = false
  @State var submitting = false
  @State private var readingProgress = 0.0
  @State private var contentHeight: CGFloat = 280
  @State private var lastActivity = Date.now
  private func previewWidth(_ card: Card) -> CGFloat {
    let short =
      ["task", "reminder", "note"].contains(card.type)
      && card.paragraphs.joined(separator: "\n").utf16.count < 500
      && card.summary.utf16.count < 280
    return short ? AppleMetrics.compactReaderWidth : AppleMetrics.readerWidth
  }
  var body: some View {
    if let card = model.cards.first(where: { $0.id == (model.selected ?? presentedID) }) {
      VStack(spacing: 0) {
        if expanded {
          GeometryReader { geometry in
            Rectangle().fill(AppleColors.accent).frame(width: geometry.size.width * readingProgress)
          }.frame(height: 2)
        }
        ScrollView {
          VStack(alignment: .leading, spacing: AppleMetrics.previewBodyGap) {
            if card.type == "photo" {
              CardMedia(card: card, detail: true)
            } else {
              if !expanded && card.type == "article" && card.fields["image"]?.string != nil {
                CardMedia(card: card, detail: true).padding(
                  .horizontal, AppleMetrics.space8 - AppleMetrics.previewPaddingX
                ).padding(.top, AppleMetrics.space8 - AppleMetrics.previewPaddingTop)
              }
              if card.type == "mail" {
                sender(card)
              } else if card.type == "event", let start = card.date("start") {
                Text(cardDay(start)).foregroundStyle(AppleColors.secondary).font(
                  .system(size: AppleMetrics.font13))
                eventHero(card, start)
              } else if card.type == "media" && card.fields["media"]?.string == "podcast" {
                podcastArtwork.frame(maxWidth: .infinity)
              } else {
                sourceMeta(card)
              }
              Text(card.title).font(
                .system(
                  size: card.type == "media" && card.fields["media"]?.string == "podcast"
                    ? AppleMetrics.font20
                    : expanded ? AppleMetrics.font30 : AppleMetrics.previewTitle, weight: .semibold)
              ).frame(
                maxWidth: .infinity,
                alignment: card.fields["media"]?.string == "podcast" ? .center : .leading
              ).multilineTextAlignment(
                card.fields["media"]?.string == "podcast" ? .center : .leading
              ).padding(
                .trailing,
                card.fields["media"]?.string == "podcast"
                  ? 0 : AppleMetrics.hitTarget * (card.paragraphs.isEmpty ? 1 : 2))
              if !model.tags(card).isEmpty { tagChips(model.tags(card), removable: false) }
              metadata(card).font(.system(size: AppleMetrics.font12)).foregroundStyle(
                AppleColors.secondary)
              if card.type == "media" && card.fields["media"]?.string == "podcast" {
                sourceMeta(card)
              }
              if expanded && card.fields["image"]?.string != nil {
                CardMedia(card: card, detail: true)
              }
              detailContent(card)
              sourceNote(card)
              if let note = model.items[card.id]?["note"]?.string, !note.isEmpty {
                Text(note).font(.system(size: AppleMetrics.font15)).padding(AppleMetrics.space16)
                  .frame(maxWidth: .infinity, alignment: .leading).background(
                    AppleColors.surface, in: RoundedRectangle(cornerRadius: AppleMetrics.space12))
              }
              HStack(spacing: AppleMetrics.space12) {
                external(card)

              }.padding(.top, AppleMetrics.space8)
            }
          }.padding(.horizontal, AppleMetrics.previewPaddingX).padding(
            .top, AppleMetrics.previewPaddingTop
          ).padding(.bottom, AppleMetrics.previewPaddingX).frame(
            maxWidth: .infinity, alignment: .leading
          ).textSelection(.enabled)
            .background(
              GeometryReader { proxy in
                Color.clear.preference(key: ReaderContentHeight.self, value: proxy.size.height)
              }
            )
            .background(
              ScrollObservation(
                progressChanged: { progress in readingProgress = progress },
                overscroll: { direction in
                  if direction == "top" {
                    if expanded { expanded = false } else { model.dismissReader() }
                  } else if direction == "bottom" && card.readable {
                    if model.items[card.id]?["read"]?.bool != true && !model.busy {
                      model.patch(
                        [card.id],
                        values: [
                          "read": .bool(true), "progress": .number(1),
                          "readAt": .number(Date.now.timeIntervalSince1970 * 1000),
                        ])
                    }
                    if model.preferences["collapseOnFinish"]?.bool != false {
                      model.dismissReader()
                    }
                  }
                }
              ) { offset, bottom, userScrolled in
                if userScrolled { lastActivity = .now }
                if userScrolled && card.readable && bottom && offset > 0
                  && model.items[card.id]?["read"]?.bool != true && !model.busy
                {
                  model.patch(
                    [card.id],
                    values: [
                      "read": .bool(true), "progress": .number(1),
                      "readAt": .number(Date.now.timeIntervalSince1970 * 1000),
                    ])
                }
              })
        }.id(card.id)
        if card.type != "photo" {
          HStack(spacing: AppleMetrics.space4) {
            if card.type == "event" {
              tool("download", Copy.text("web.panels.5510cee6e987")) { exportCalendar(card) }
            } else {
              tool(
                "bookmark", Copy.text("web.bookmark"),
                active: model.items[card.id]?["bookmarked"]?.bool == true
              ) { model.toggle("bookmarked", card: card) }
            }
            tool("tag", Copy.text("web.panels.786e2e9252a8")) {
              editRevision = model.revision
              note = model.items[card.id]?["note"]?.string ?? ""
              tags = model.tags(card)
              newTag = ""
              submitting = false
              organizing = true
            }
            if ["event", "task", "reminder"].contains(card.type) {
              let state = model.items[card.id]
              if state?["dismissed"]?.bool != true && state?["reminderDone"]?.bool != true
                && (state?["snoozedUntil"]?.number ?? 0) == 0
              {
                tool("bell-off", Copy.text("web.panels.311b1a019362")) {
                  model.patch([card.id], values: ["dismissed": .bool(true)])
                }
              }
            } else if card.type != "file" {
              tool(
                "glasses", Copy.text("web.later"),
                active: model.items[card.id]?["later"]?.bool == true
              ) { model.toggle("later", card: card) }
            }
          }.padding(AppleMetrics.space8).modifier(GlassSurface()).padding(
            .bottom, AppleMetrics.space20)
        }
      }.background {
        if card.fields["media"]?.string == "podcast" {
          LinearGradient(
            stops: [
              .init(
                color: colorScheme == .dark
                  ? Color(red: 42 / 255, green: 38 / 255, blue: 34 / 255)
                  : Color(red: 244 / 255, green: 237 / 255, blue: 228 / 255), location: 0),
              .init(color: AppleColors.card, location: 0.7),
            ], startPoint: .top, endPoint: .bottom)
        }
      }.overlay(alignment: .topTrailing) {
        readerHead(card).padding(.top, expanded ? AppleMetrics.space12 : AppleMetrics.space32)
          .padding(.horizontal, AppleMetrics.space16)
      }.background(AppleColors.card).tint(AppleColors.accent)
        .frame(
          width: expanded
            ? availableSize.width
            : card.type == "photo"
              ? max(280, availableSize.width - AppleMetrics.space32)
              : min(previewWidth(card), max(280, availableSize.width - AppleMetrics.space32)),
          height: organizing
            ? min(AppleMetrics.editorHeight, max(280, availableSize.height - 64))
            : expanded
              ? availableSize.height
              : card.type == "photo"
                ? max(280, availableSize.height - AppleMetrics.space32)
                : min(max(180, contentHeight + 80), max(180, availableSize.height - 64))
        )
        .onPreferenceChange(ReaderContentHeight.self) { contentHeight = $0 }
        .simultaneousGesture(TapGesture().onEnded { lastActivity = .now })
        .onChange(of: expanded) { _, isExpanded in
          if isExpanded { lastActivity = .now } else { model.flushReading() }
        }
        .task(id: expanded) {
          guard expanded else { return }
          while !Task.isCancelled && expanded {
            do { try await Task.sleep(for: .seconds(1)) } catch { return }
            guard expanded, model.selected == card.id else { return }
            if NSApp.isActive && Date.now.timeIntervalSince(lastActivity) < 60 {
              model.recordReadingSecond()
            }
          }
        }
        .onDisappear { model.flushReading() }
        .onChange(of: model.selected) { _, new in
          guard new != nil else {
            playing = false
            model.flushReading()
            return
          }
          expanded = false
          mediaStep = 0
          playing = false
          readingProgress = 0
        }
        .task(id: playing) {
          guard playing else { return }
          guard card.fields["media"]?.string != "podcast" else { return }
          if mediaStep == max(0, card.paragraphs.count - 1) {
            mediaStep = 0
          }
          while !Task.isCancelled && playing {
            do {
              try await Task.sleep(
                for: .seconds(2.5))
            } catch { return }
            guard playing, model.selected == card.id else { return }
            guard !model.busy else { continue }
            if mediaStep < max(0, card.paragraphs.count - 1) {
              mediaStep += 1
              model.patch(
                [card.id],
                values: [
                  "progress": .number(
                    Double(mediaStep + 1) / Double(max(1, card.paragraphs.count))),
                  "read": .bool(mediaStep == card.paragraphs.count - 1),
                ])
            } else {
              playing = false
            }
          }
        }
        .onChange(of: model.error) { _, error in if error != nil { playing = false } }
        .overlay {
          if organizing {
            ZStack {
              Color.black.opacity(0.25).contentShape(Rectangle()).onTapGesture {
                if !model.busy {
                  organizing = false
                }
              }
              Group {
                editor(card)
              }.background(
                AppleColors.card, in: RoundedRectangle(cornerRadius: AppleMetrics.panelRadius)
              )
              .shadow(
                color: .black.opacity(0.18), radius: AppleMetrics.space40, y: AppleMetrics.space24)
            }.onKeyPress(.escape) {
              if !model.busy {
                organizing = false
              }
              return .handled
            }
          }
        }
    }
  }
}

private struct ReaderContentHeight: PreferenceKey {
  static let defaultValue: CGFloat = 280
  static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}
