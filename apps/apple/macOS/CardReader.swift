import AppKit
import SillKit
import SwiftUI

struct CardReader: View {
  @EnvironmentObject var model: Workspace
  @Environment(\.colorScheme) private var colorScheme
  var availableSize = CGSize(width: 1100, height: 760)
  var presentedID: String?
  @State var expanded = false
  @State var organizing = false
  @Environment(\.controlActiveState) private var windowActivity
  @State var editRevision = 0
  @State var note = ""
  @State var tags: [String] = []
  @State var newTag = ""
  @State var submitting = false
  @State private var readingProgress = 0.0
  @State private var contentHeight: CGFloat = 280
  @State private var viewportHeight: CGFloat = 0
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
        VStack(spacing: 0) {
          if expanded {
            ProgressView(value: readingProgress).progressViewStyle(.linear)
              .accessibilityLabel(Copy.text("web.primitives.8bf1d0b76278"))
          }
          ScrollView {
            VStack(alignment: .leading, spacing: AppleMetrics.previewBodyGap) {
              if card.type == "photo" {
                CardMedia(card: card, detail: true).environment(\.colorScheme, .dark)
                metadata(card).font(.system(size: AppleMetrics.font12)).foregroundStyle(
                  AppleColors.secondary)
              } else {
                if card.type == "mail" {
                  sender(card)
                  sourceMeta(card)
                } else if card.type == "event", let start = card.date("start") {
                  Text(cardDay(start)).foregroundStyle(AppleColors.secondary).font(
                    .system(size: AppleMetrics.font13))
                  eventHero(card, start)
                } else if card.type == "media" && card.fields["media"]?.string == "podcast" {
                  podcastArtwork.frame(maxWidth: .infinity)
                } else {
                  sourceMeta(card)
                }
                HStack(alignment: .firstTextBaseline, spacing: AppleMetrics.space12) {
                  if card.type == "reminder" { reminderCompletion(card) }
                  Text(card.title).font(
                    .system(
                      size: card.fields["media"]?.string == "podcast"
                        ? AppleMetrics.font20
                        : expanded ? AppleMetrics.font30 : AppleMetrics.previewTitle,
                      weight: .semibold)
                  ).frame(
                    maxWidth: .infinity,
                    alignment: card.fields["media"]?.string == "podcast" ? .center : .leading
                  ).multilineTextAlignment(
                    card.fields["media"]?.string == "podcast" ? .center : .leading
                  )
                }
                if !model.tags(card).isEmpty { tagChips(model.tags(card), removable: false) }
                metadata(card).font(.system(size: AppleMetrics.font12)).foregroundStyle(
                  AppleColors.secondary)
                if card.type == "media" && card.fields["media"]?.string == "podcast" {
                  sourceMeta(card)
                }
                if card.type == "article" && card.fields["image"]?.string != nil {
                  CardMedia(card: card, detail: true)
                }
                detailContent(card)

              }
              personalNote(card)
            }.padding(.horizontal, AppleMetrics.previewPaddingX).padding(
              .top, AppleMetrics.previewPaddingTop + AppleMetrics.space28
            ).padding(.bottom, AppleMetrics.previewPaddingX).frame(
              maxWidth: card.type == "photo" ? .infinity : AppleMetrics.readerWidth,
              alignment: .leading
            ).frame(maxWidth: .infinity).textSelection(.enabled)
              .background(
                GeometryReader { proxy in
                  Color.clear.preference(key: ReaderContentHeight.self, value: proxy.size.height)
                }
              )
              .background(
                ScrollObservation(
                  progressChanged: { progress in
                    let displayed = (progress * 100).rounded(.down) / 100
                    if displayed != readingProgress { readingProgress = displayed }
                  },
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
            .background(
              GeometryReader { proxy in
                Color.clear.preference(key: ReaderViewportHeight.self, value: proxy.size.height)
              })
          readerToolbar(card).padding(.bottom, AppleMetrics.space20)
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
        }.background(card.type == "photo" ? Color.black : AppleColors.card).tint(AppleColors.accent)
          .frame(
            width: expanded
              ? availableSize.width
              : card.type == "photo"
                ? max(280, availableSize.width - AppleMetrics.space32)
                : min(previewWidth(card), max(280, availableSize.width - AppleMetrics.space32)),
            height: expanded
              ? availableSize.height
              : card.type == "photo"
                ? max(280, availableSize.height - AppleMetrics.space32)
                : min(max(280, contentHeight + 80), max(280, availableSize.height - 64))
          )
          .clipShape(RoundedRectangle(cornerRadius: expanded ? 0 : AppleMetrics.panelRadius))
          .overlay(alignment: .topTrailing) {
            readerHead(card).padding(AppleMetrics.space12)
          }
          .onPreferenceChange(ReaderContentHeight.self) { contentHeight = $0 }
          .onPreferenceChange(ReaderViewportHeight.self) { viewportHeight = $0 }
          .task(id: card.id) {
            if model.items[card.id]?["seen"]?.bool != true && !model.busy {
              model.patch([card.id], values: ["seen": .bool(true)])
            }
            // A short piece needs the same uninterrupted visible dwell as Web.
            for _ in 0..<12 {
              do { try await Task.sleep(for: .milliseconds(100)) } catch { return }
              guard windowActivity == .key, !organizing else { return }
            }
            guard (model.selected ?? presentedID) == card.id, card.readable,
              viewportHeight > 0, card.type == "photo" || contentHeight <= viewportHeight + 2,
              model.items[card.id]?["read"]?.bool != true, !model.busy
            else { return }
            model.patch(
              [card.id],
              values: [
                "read": .bool(true), "progress": .number(1),
                "readAt": .number(Date.now.timeIntervalSince1970 * 1000),
              ])
          }
          .task(id: Int(readingProgress * 100)) {
            guard readingProgress > 0, readingProgress < 1, card.readable else { return }
            do { try await Task.sleep(for: .milliseconds(750)) } catch { return }
            guard windowActivity == .key, model.selected == card.id, !model.busy,
              model.items[card.id]?["read"]?.bool != true,
              readingProgress > (model.items[card.id]?["progress"]?.number ?? 0) + 0.02
            else { return }
            model.patch([card.id], values: ["progress": .number(readingProgress)])
          }
          .simultaneousGesture(TapGesture().onEnded { lastActivity = .now })
          .task(id: card.id) {
            while !Task.isCancelled {
              do { try await Task.sleep(for: .seconds(1)) } catch { return }
              guard model.selected == card.id else { return }
              if windowActivity == .key && Date.now.timeIntervalSince(lastActivity) < 60 {
                model.recordReadingSecond()
              }
            }
          }
          .onDisappear { model.flushReading() }
          .onChange(of: model.selected) { _, new in
            guard new != nil else {
              model.flushReading()
              return
            }
            expanded = false
            readingProgress = 0
          }
          .sheet(isPresented: $organizing) {
            editor(card).interactiveDismissDisabled(model.busy)
          }
      }
      .onExitCommand {
        if expanded { expanded = false } else { model.dismissReader() }
      }
      .environment(\.colorScheme, card.type == "photo" ? .dark : colorScheme)
    }
  }
}

private struct ReaderContentHeight: PreferenceKey {
  static let defaultValue: CGFloat = 280
  static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}

private struct ReaderViewportHeight: PreferenceKey {
  static let defaultValue: CGFloat = 0
  static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}
