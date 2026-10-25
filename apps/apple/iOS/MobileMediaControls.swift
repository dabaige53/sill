#if os(iOS)
  import SillKit
  import SwiftUI

  struct MobileAudioControls: View {
    let playback: MediaPlayback
    let duration: Double
    let available: Bool
    let large: Bool
    var body: some View {
      VStack(spacing: AppleMetrics.space8) {
        Slider(
          value: Binding(
            get: { min(max(0, playback.position), max(1, duration)) },
            set: { playback.seek($0) }), in: 0...max(1, duration)
        )
        .disabled(!available || duration <= 0).accessibilityLabel(Copy.text("web.media.position"))
        HStack {
          Text(MobileFormat.duration(Int(playback.position)))
          Spacer()
          Text(
            duration > 0
              ? "−" + MobileFormat.duration(Int(max(0, duration - playback.position)))
              : Copy.text("web.media.unknownDuration"))
        }.font(.system(size: AppleMetrics.font12, design: .rounded)).monospacedDigit()
          .foregroundStyle(AppleColors.secondary)
        HStack(spacing: AppleMetrics.space16) {
          Button {
            playback.changeRate()
          } label: {
            Text("\(playback.rate.formatted())×").font(
              .system(size: AppleMetrics.font13, weight: .medium)
            )
            .frame(width: AppleMetrics.hitTarget, height: AppleMetrics.hitTarget)
          }.accessibilityLabel(Copy.text("web.media.rate"))
          Spacer(minLength: 0)
          Button {
            playback.seek(playback.position - 15)
          } label: {
            MobileIcon("rewind15", size: AppleMetrics.space24)
              .frame(width: AppleMetrics.hitTarget, height: AppleMetrics.hitTarget)
          }.accessibilityLabel(Copy.text("web.preview.podcast.rewind15"))
          Button {
            playback.toggle()
          } label: {
            MobileIcon(playback.playing ? "pause" : "play", size: AppleMetrics.space28)
              .foregroundStyle(AppleColors.fixedWhite)
              .frame(
                width: large ? AppleMetrics.space72 : AppleMetrics.space60,
                height: large ? AppleMetrics.space72 : AppleMetrics.space60
              )
              .background(AppleColors.accent, in: Circle())
          }.accessibilityLabel(Copy.text(playback.playing ? "web.media.pause" : "web.media.play"))
          Button {
            playback.seek(playback.position + 30)
          } label: {
            MobileIcon("forward30", size: AppleMetrics.space24)
              .frame(width: AppleMetrics.hitTarget, height: AppleMetrics.hitTarget)
          }.accessibilityLabel(Copy.text("web.preview.podcast.forward30"))
          Spacer(minLength: 0)
          Color.clear.frame(width: AppleMetrics.hitTarget, height: AppleMetrics.hitTarget)
            .accessibilityHidden(true)
        }.buttonStyle(MobilePressStyle()).disabled(!available)
      }.padding(.horizontal, AppleMetrics.space12)
    }
  }

  struct MobileMediaTabs: View {
    let card: MobileCard
    let playback: MediaPlayback
    let available: Bool
    let height: CGFloat
    let textScale: CGFloat
    let strong: Bool
    let spacing: CGFloat
    let openRelated: (String, Bool) -> Void
    let cardExists: (String) -> Bool
    var headerOffset: CGFloat = 0
    @State private var tab = "transcript"
    @State private var follow = true
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private var transcript: [JSONValue] { card.raw["transcript"]?.array ?? [] }
    private var chapters: [JSONValue] { card.raw["chapters"]?.array ?? [] }
    private var active: Int? {
      transcript.lastIndex { ($0["start"]?.number ?? 0) <= playback.position }
    }

    var body: some View {
      VStack(alignment: .leading, spacing: AppleMetrics.space16) {
        tabHeader.offset(y: headerOffset).zIndex(1)
        if tab == "transcript" {
          transcriptBody
        } else if tab == "chapters" {
          chaptersBody
        } else {
          if card.markdown.blocks.isEmpty {
            Text(Copy.text("web.media.emptyNotes")).foregroundStyle(AppleColors.secondary)
          } else {
            MobileMarkdown(
              document: card.markdown, textScale: textScale, strong: strong, spacing: spacing,
              openCard: openRelated, cardExists: cardExists)
          }
        }
      }.onAppear { tab = card.raw["media"]?.string == "podcast" ? "transcript" : "summary" }
    }

    private var tabHeader: some View {
      HStack(spacing: AppleMetrics.space8) {
        tabButton("transcript", "web.media.transcript")
        tabButton("chapters", "web.media.chapters")
        tabButton(
          "summary",
          card.raw["media"]?.string == "podcast" ? "web.media.notes" : "web.media.summary")
        Spacer(minLength: 0)
        if tab == "transcript" {
          Button {
            follow.toggle()
          } label: {
            HStack(spacing: AppleMetrics.space4) {
              MobileIcon("clock", size: AppleMetrics.space14)
              Text(Copy.text("web.media.follow"))
            }.font(.system(size: AppleMetrics.font12)).foregroundStyle(
              follow ? AppleColors.accent : AppleColors.secondary
            )
            .padding(.horizontal, AppleMetrics.space10).padding(.vertical, AppleMetrics.space6)
            .background(follow ? AppleColors.accentSoft : AppleColors.surface, in: Capsule())
          }.buttonStyle(MobilePressStyle()).disabled(!available || transcript.isEmpty)
            .accessibilityAddTraits(follow ? .isSelected : [])
        }
      }.frame(maxWidth: .infinity, minHeight: AppleMetrics.space44, alignment: .leading)
        .background(AppleColors.card)
        .overlay(alignment: .bottom) {
          Rectangle().fill(AppleColors.lineCard).frame(height: AppleMetrics.lineWidth)
        }
    }
    private func tabButton(_ value: String, _ label: String) -> some View {
      Button {
        withAnimation(reduceMotion ? nil : MobileMotion.fast) { tab = value }
      } label: {
        Text(Copy.text(label)).font(.system(size: AppleMetrics.font13, weight: .medium))
          .foregroundStyle(tab == value ? AppleColors.primary : AppleColors.secondary)
          .padding(.horizontal, AppleMetrics.space8).frame(minHeight: AppleMetrics.space44)
          .overlay(alignment: .bottom) {
            if tab == value {
              Rectangle().fill(AppleColors.primary).frame(height: AppleMetrics.space2)
            }
          }
      }.buttonStyle(MobilePressStyle()).accessibilityAddTraits(tab == value ? .isSelected : [])
    }

    private var transcriptBody: some View {
      Group {
        if transcript.isEmpty {
          Text(Copy.text("web.media.emptyTranscript")).foregroundStyle(AppleColors.secondary)
        } else {
          ScrollViewReader { proxy in
            ScrollView {
              LazyVStack(alignment: .leading, spacing: AppleMetrics.space8) {
                ForEach(Array(transcript.enumerated()), id: \.offset) { index, line in
                  MobileTranscriptLine(line: line, selected: index == active, enabled: available) {
                    playback.seek(line["start"]?.number ?? 0)
                  }.equatable().id(index)
                }
              }
            }
            .frame(height: height)
            .simultaneousGesture(
              DragGesture(minimumDistance: AppleMetrics.space8).onChanged { _ in follow = false }
            )
            .onChange(of: active) { _, index in
              guard follow, let index else { return }
              withAnimation(reduceMotion ? nil : MobileMotion.base) {
                proxy.scrollTo(index, anchor: .center)
              }
            }
            .onChange(of: follow) { _, value in
              guard value, let active else { return }
              withAnimation(reduceMotion ? nil : MobileMotion.base) {
                proxy.scrollTo(active, anchor: .center)
              }
            }
          }
        }
      }
    }

    private var chaptersBody: some View {
      VStack(alignment: .leading, spacing: 0) {
        if chapters.isEmpty {
          Text(Copy.text("web.media.emptyChapters")).foregroundStyle(AppleColors.secondary)
        }
        ForEach(Array(chapters.enumerated()), id: \.offset) { index, chapter in
          let start = chapter["start"]?.number ?? 0
          let end =
            index + 1 < chapters.count
            ? chapters[index + 1]["start"]?.number ?? .infinity : .infinity
          Button {
            playback.seek(start)
          } label: {
            MobileDetailRow(
              icon: "play", title: chapter["title"]?.string ?? "",
              trailing: MobileFormat.duration(Int(start))
            )
            .padding(.horizontal, AppleMetrics.space8)
            .background(
              playback.position >= start && playback.position < end
                ? AppleColors.accentSoft : .clear,
              in: RoundedRectangle(cornerRadius: AppleMetrics.controlRadius))
          }.buttonStyle(MobilePressStyle()).disabled(!available)
        }
      }
    }
  }

  /// Only the old and new active rows need to change when the playhead advances.
  private struct MobileTranscriptLine: View, Equatable {
    let line: JSONValue
    let selected: Bool
    let enabled: Bool
    let seek: () -> Void
    static func == (lhs: Self, rhs: Self) -> Bool {
      lhs.line == rhs.line && lhs.selected == rhs.selected && lhs.enabled == rhs.enabled
    }
    var body: some View {
      Button(action: seek) {
        HStack(alignment: .top, spacing: AppleMetrics.space12) {
          Text(MobileFormat.duration(Int(line["start"]?.number ?? 0)))
            .font(.system(size: AppleMetrics.font13, design: .rounded)).monospacedDigit()
            .foregroundStyle(AppleColors.secondary)
          Text(line["text"]?.string ?? "").font(.system(size: AppleMetrics.font14))
            .lineSpacing(AppleMetrics.space6).frame(maxWidth: .infinity, alignment: .leading)
        }.padding(AppleMetrics.space8)
          .background(
            selected ? AppleColors.accentSoft : .clear,
            in: RoundedRectangle(cornerRadius: AppleMetrics.controlRadius))
      }.buttonStyle(MobilePressStyle()).disabled(!enabled).accessibilityAddTraits(
        selected ? .isSelected : [])
    }
  }
#endif
