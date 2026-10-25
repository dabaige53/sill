#if os(iOS)
import SillKit
import SwiftUI
import UniformTypeIdentifiers

/// Reading owns its media session and never turns an external link into a completed action.
struct MobileReader: View {
  let workspace: MobileWorkspace
  let cardID: String
  @ScaledMetric(relativeTo: .body) private var dynamicScale: CGFloat = 1
  @Environment(\.dismiss) private var dismiss
  @Environment(\.scenePhase) private var scenePhase
  @State private var annotations = false
  @State var relatedID: String?
  @State private var owner: String?
  @State private var seconds = 0
  @State private var bottomVisible = false
  @State private var finished = false
  @State private var contentHeight: CGFloat = 0
  @State private var maximumProgress: Double = 0
  @State private var playback = MediaPlayback()
  @State private var calendarDocument: MobileCalendarDocument?
  @State private var exportingCalendar = false

  var body: some View {
    NavigationStack {
      Group {
        if let card = workspace.card(cardID) {
          reader(card)
        } else {
          Text(Copy.text("web.agent.noCard")).foregroundStyle(AppleColors.secondary)
        }
      }
      .background(AppleColors.card)
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button(Copy.text("web.close")) { dismiss() }
        }
      }
      .toolbarBackground(AppleColors.card, for: .navigationBar)
      .navigationBarTitleDisplayMode(.inline)
    }
    .tint(AppleColors.accent)
    .task {
      owner = workspace.owner
      while !Task.isCancelled {
        do { try await Task.sleep(for: .seconds(1)) } catch { return }
        if readingActive { seconds += 1 }
      }
    }
    .onChange(of: scenePhase) { _, phase in
      if phase != .active { playback.stop() }
    }
    .onDisappear {
      playback.stop()
      guard owner == workspace.owner, let card = workspace.card(cardID), seconds > 0 else { return }
      let elapsed = seconds
      Task { _ = await workspace.recordReading(card, seconds: elapsed, progress: max(card.progress, min(maximumProgress, 0.99))) }
    }
    .sheet(isPresented: $annotations) {
      if let card = workspace.card(cardID) {
        MobileAnnotations(workspace: workspace, baseline: card)
      }
    }
    .sheet(isPresented: Binding(
      get: { relatedID != nil }, set: { if !$0 { relatedID = nil } })
    ) {
      if let relatedID { MobileReader(workspace: workspace, cardID: relatedID) }
    }
    .fileExporter(isPresented: $exportingCalendar, document: calendarDocument,
      contentType: MobileCalendarDocument.contentType, defaultFilename: "sill.ics") { result in
      if case .failure = result { workspace.error = Copy.text("apple.exportError") }
    }
  }

  // @design article-reading
  private func reader(_ card: MobileCard) -> some View {
    GeometryReader { viewport in
      ScrollViewReader { scroll in
        ScrollView {
          VStack(alignment: .leading, spacing: AppleMetrics.rhythmGroup * readerSpacing) {
            header(card)
            if card.type == "photo" {
              MobilePhotos(urls: card.photos.isEmpty ? [card.image].compactMap { $0 } : card.photos,
                title: card.title)
            } else if card.type == "media" {
              media(card)
            } else if let image = card.image {
              MobileRemoteImage(url: image, title: card.title)
                .aspectRatio(1.6, contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: AppleMetrics.coverRadius))
            }
            facts(card)
            if card.type == "article" {
              let headings = card.markdown.blocks.enumerated().filter { $0.element.heading > 0 }
              if !headings.isEmpty {
                DisclosureGroup(Copy.text("web.reader.outline")) {
                  VStack(alignment: .leading, spacing: AppleMetrics.space8) {
                    ForEach(Array(headings), id: \.offset) { index, block in
                      Button(block.text) { scroll.scrollTo("paragraph-\(index)", anchor: .top) }
                        .frame(minHeight: AppleMetrics.hitTarget, alignment: .leading)
                    }
                  }
                }
              }
            }
            if !card.body.isEmpty {
              MobileMarkdown(document: card.markdown, textScale: readerScale, strong: strongText, spacing: readerSpacing)
            } else if !card.summary.isEmpty {
              Text(card.summary).textSelection(.enabled)
            }
            if !card.note.isEmpty {
              section("web.metadata.note") { Text(card.note).textSelection(.enabled) }
            }
            related(card)
            Color.clear.frame(height: AppleMetrics.space2)
              .background {
                GeometryReader { geometry in
                  Color.clear.preference(key: MobileReaderBottom.self,
                    value: geometry.frame(in: .named("mobile-reader")).maxY)
                }
              }
          }
          .font(contentFont(AppleMetrics.font17))
          .foregroundStyle(AppleColors.primary)
          .padding(AppleMetrics.space20)
          .frame(maxWidth: readerWidth)
          .frame(maxWidth: .infinity)
          .background {
            GeometryReader { geometry in
              Color.clear.preference(key: MobileReaderHeight.self, value: geometry.size.height)
            }
          }
        }
        .coordinateSpace(name: "mobile-reader")
        .onPreferenceChange(MobileReaderHeight.self) { contentHeight = $0 }
        .onPreferenceChange(MobileReaderBottom.self) { bottom in
          bottomVisible = bottom > 0 && bottom <= viewport.size.height + AppleMetrics.readEndSlack
          if readingActive, contentHeight > viewport.size.height {
            maximumProgress = max(maximumProgress, min(1, max(0,
              Double((contentHeight - bottom + viewport.size.height) / contentHeight))))
          }
        }
        .task(id: bottomVisible && readingActive) {
          guard bottomVisible, readingActive, card.type != "media", !finished else { return }
          do { try await Task.sleep(for: .seconds(AppleMetrics.readDwell)) } catch { return }
          guard !Task.isCancelled, owner == workspace.owner,
            let current = workspace.card(cardID) else { return }
          finished = await workspace.recordReading(current, seconds: 0, progress: 1)
        }
      }
    }
    .safeAreaInset(edge: .bottom) { actions(card).padding(AppleMetrics.space12) }
  }

  private var readingActive: Bool { scenePhase == .active && !annotations && relatedID == nil }
  private var readerScale: CGFloat { AppleMetrics.mobileTextScale * MobileContentStyle.text(workspace.preferences["readerTextSize"]?.string) }
  private var readerSpacing: CGFloat { MobileContentStyle.spacing(workspace.preferences["readerSpacing"]?.string) }
  private var strongText: Bool { workspace.preferences["textWeight"]?.string == "strong" }
  private var readerWidth: CGFloat {
    switch workspace.preferences["readerWidth"]?.string {
    case "narrow": AppleMetrics.layoutReaderNarrow
    case "standard": AppleMetrics.layoutReaderStandard
    default: .infinity
    }
  }
  func contentFont(_ size: CGFloat, weight: Font.Weight = .regular, design: Font.Design = .default) -> Font {
    MobileContentStyle.font(size, weight: weight, design: design,
      scale: dynamicScale * readerScale, strong: strongText)
  }

  private func actions(_ card: MobileCard) -> some View {
    HStack(spacing: AppleMetrics.space4) {
      tool("bookmark", label: "apple.toggleBookmarkMenu", active: card.bookmarked) {
        Task { await workspace.toggle(card, field: "bookmarked") }
      }
      tool("clock", label: "apple.toggleLaterMenu", active: card.later) {
        Task { await workspace.toggle(card, field: "later") }
      }
      tool("tag", label: "apple.organize") { annotations = true }
      Menu {
        Button(Copy.text(card.read ? "apple.unreadAction" : "apple.read")) {
          Task { await workspace.toggle(card, field: "read") }
        }
        Button(Copy.text(card.archived ? "apple.restore" : "apple.archive")) {
          Task { await workspace.toggle(card, field: "archived") }
        }
        if ["task", "event", "reminder"].contains(card.type) {
          Button(Copy.text("apple.snooze")) {
            Task {
              _ = await workspace.patch(card, values: [
                "snoozedUntil": .number(Date().timeIntervalSince1970 * 1000 + 600_000),
                "dismissed": .bool(false),
              ])
            }
          }
          Button(Copy.text("web.actions.dismiss")) {
            Task { _ = await workspace.patch(card, values: ["dismissed": .bool(true)]) }
          }
        }
        if card.type == "event", card.start != nil, card.end != nil {
          Button(Copy.text("web.actions.download")) {
            calendarDocument = MobileCalendarDocument(card)
            exportingCalendar = calendarDocument != nil
          }
        }
        if let url = card.url { Link(Copy.text("web.actions.open"), destination: url) }
      } label: {
        MobileIcon("more").frame(width: AppleMetrics.hitTarget, height: AppleMetrics.hitTarget)
      }.accessibilityLabel(Copy.text("web.actions.title"))
      ShareLink(item: card.url?.absoluteString ?? card.body, subject: Text(card.title)) {
        MobileIcon("upload").frame(width: AppleMetrics.hitTarget, height: AppleMetrics.hitTarget)
      }.accessibilityLabel(Copy.text("ios.share"))
    }
    .buttonStyle(.plain)
    .disabled(workspace.busy || workspace.unresolvedWrite)
    .padding(AppleMetrics.railInset)
    .background(.regularMaterial, in: Capsule())
  }

  private func tool(_ icon: String, label: String, active: Bool = false, action: @escaping () -> Void)
    -> some View
  {
    Button(action: action) {
      MobileIcon(icon).foregroundStyle(active ? AppleColors.accent : AppleColors.primary)
        .frame(width: AppleMetrics.hitTarget, height: AppleMetrics.hitTarget)
    }.accessibilityLabel(Copy.text(label))
      .accessibilityAddTraits(active ? .isSelected : [])
  }

  @ViewBuilder private func media(_ card: MobileCard) -> some View {
    if let id = MobileOfficialVideoPlayer.videoID(card.url), card.raw["media"]?.string != "podcast" {
      MobileOfficialVideoPlayer(videoID: id, initialPosition: card.playbackPosition, playback: playback) {
        position, ended in savePlayback(position, ended: ended)
      }
      .aspectRatio(1.6, contentMode: .fit)
      if playback.failed {
        Text(Copy.text("web.media.playbackUnavailable")).foregroundStyle(AppleColors.secondary)
        Button(Copy.text("apple.retry")) { playback.retryVideo?() }
      }
    } else if let audio = card.audioURL {
      VStack(spacing: AppleMetrics.space16) {
        if let image = card.image {
          MobileRemoteImage(url: image, title: card.title)
            .aspectRatio(1, contentMode: .fit).frame(maxWidth: AppleMetrics.playerArtSize)
            .clipShape(RoundedRectangle(cornerRadius: AppleMetrics.coverRadius))
        }
        HStack {
          Button { playback.seek(playback.position - 15) } label: { MobileIcon("rewind15") }
            .frame(width: AppleMetrics.hitTarget, height: AppleMetrics.hitTarget)
            .accessibilityLabel(Copy.text("web.preview.podcast.rewind15"))
          Spacer()
          Button { playback.toggle() } label: {
            MobileIcon(playback.playing ? "pause" : "play", size: AppleMetrics.space32)
          }.frame(width: AppleMetrics.hitTarget, height: AppleMetrics.hitTarget)
            .accessibilityLabel(Copy.text(playback.playing ? "web.media.pause" : "web.media.play"))
          Spacer()
          Button { playback.seek(playback.position + 30) } label: { MobileIcon("forward30") }
            .frame(width: AppleMetrics.hitTarget, height: AppleMetrics.hitTarget)
            .accessibilityLabel(Copy.text("web.preview.podcast.forward30"))
          Button { playback.changeRate() } label: { Text("\(playback.rate.formatted())×") }
            .frame(minWidth: AppleMetrics.hitTarget, minHeight: AppleMetrics.hitTarget)
            .accessibilityLabel(Copy.text("web.media.rate"))
        }.frame(minHeight: AppleMetrics.hitTarget).buttonStyle(.plain)
        if playback.duration > 0 {
          Slider(value: Binding(get: { playback.position }, set: { playback.seek($0) }),
            in: 0...max(1, playback.duration))
            .accessibilityLabel(Copy.text("web.media.position"))
          Text(Duration.seconds(playback.position).formatted(.time(pattern: .minuteSecond()))
            + " / " + Duration.seconds(playback.duration).formatted(.time(pattern: .minuteSecond())))
            .font(.system(size: AppleMetrics.font13, design: .rounded)).monospacedDigit()
            .foregroundStyle(AppleColors.secondary)
        }
        if playback.failed {
          Text(Copy.text("web.media.playbackFailed")).foregroundStyle(AppleColors.secondary)
          Button(Copy.text("apple.retry")) { playback.toggle() }
        }
      }
      .onAppear {
        playback.start(url: audio, position: card.playbackPosition) { position, ended in
          savePlayback(position, ended: ended)
        }
      }
      .onChange(of: scenePhase) { _, phase in
        if phase == .active {
          playback.start(url: audio, position: playback.position) { position, ended in
            savePlayback(position, ended: ended)
          }
        }
      }
    } else {
      Text(Copy.text("web.media.playbackUnavailable")).foregroundStyle(AppleColors.secondary)
    }
    if let url = card.url { Link(Copy.text("web.media.sourceOpen"), destination: url) }
    let chapters = card.raw["chapters"]?.array ?? []
    if !chapters.isEmpty {
      section("web.media.chapters") {
        ForEach(Array(chapters.enumerated()), id: \.offset) { _, chapter in
          Button(chapter["title"]?.string ?? "") { playback.seek(chapter["start"]?.number ?? 0) }
            .frame(minHeight: AppleMetrics.hitTarget, alignment: .leading)
        }
      }
    }
    let transcript = card.raw["transcript"]?.array ?? []
    if !transcript.isEmpty {
      DisclosureGroup(Copy.text("web.media.transcript")) {
        VStack(alignment: .leading, spacing: AppleMetrics.rhythmItem) {
          ForEach(Array(transcript.enumerated()), id: \.offset) { _, line in
            Button(line["text"]?.string ?? "") { playback.seek(line["start"]?.number ?? 0) }
              .buttonStyle(.plain).frame(maxWidth: .infinity, alignment: .leading)
          }
        }
      }
    }
  }

  private func savePlayback(_ position: Double, ended: Bool) {
    guard position.isFinite, owner == workspace.owner, let current = workspace.card(cardID) else { return }
    var values: [String: JSONValue] = ["playbackPosition": .number(max(0, position))]
    if ended {
      values["read"] = .bool(true)
      values["readAt"] = .number(Date().timeIntervalSince1970 * 1000)
    }
    Task { _ = await workspace.patch(current, values: values) }
  }
}

private struct MobileReaderHeight: PreferenceKey {
  static let defaultValue: CGFloat = 0
  static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}

private struct MobileReaderBottom: PreferenceKey {
  static let defaultValue: CGFloat = .infinity
  static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}

#endif
