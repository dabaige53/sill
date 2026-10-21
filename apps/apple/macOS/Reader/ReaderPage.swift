import AppKit
import SillKit
import SwiftUI

/// The fullscreen page: the whole window, card background, a 2px progress line at the top,
/// collapse and close in one glass group top right, text at most 860 wide (an article: 600).
struct ReaderPage: View {
  let card: CardModel
  let state: CardState
  let layer: Reader.Layer
  @Environment(Reader.self) private var reader
  @Environment(Workspace.self) private var workspace
  @State private var scroll = ReaderScroll()

  var body: some View {
    let tools = ReaderTools.actions(
      card: card, state: state, hidden: workspace.preferences.hiddenActions)
    ZStack(alignment: .top) {
      AppleColors.card
      ScrollView(.vertical) {
        ReaderContent(card: card, state: state, type: .page)
          .frame(
            maxWidth: card.kind == .article
              ? AppleMetrics.articleMeasure : AppleMetrics.readerBodyWidth
          )
          .padding(.top, AppleMetrics.space88)
          .padding(
            .horizontal, card.kind == .article ? AppleMetrics.articleGutter : AppleMetrics.space32
          )
          .padding(.bottom, AppleMetrics.space160)
          .frame(maxWidth: .infinity)
          .background(ReaderScrollProbe(scroll: scroll))
          .modifier(ReaderPullOffset(motion: scroll.motion))
      }
      .scrollIndicators(.automatic)
      ReaderProgress(motion: scroll.motion)
      HStack(spacing: AppleMetrics.space2) {
        ToolButton(icon: "collapse", label: Copy.text("web.reader.exitFullscreen")) {
          reader.open(card.id, full: false)
        }
        ToolButton(icon: "x", label: Copy.text("web.reader.close")) { reader.closeAll() }
      }
      .padding(AppleMetrics.space4)
      .glass(Capsule())
      .accessibilityElement(children: .contain)
      .accessibilityLabel(Copy.text("web.readerTools"))
      .modifier(ReaderToolsTuck(motion: scroll.motion, top: true))
      .padding(.top, AppleMetrics.readerToolsTop)
      .padding(.trailing, AppleMetrics.readerToolsRight)
      .frame(maxWidth: .infinity, alignment: .trailing)
      VStack(spacing: AppleMetrics.space12) {
        Spacer(minLength: 0)
        FinishRing(motion: scroll.motion)
        if !tools.isEmpty {
          ReaderToolbar(card: card, state: state, actions: tools)
            .modifier(ReaderToolsTuck(motion: scroll.motion))
        }
      }
      .padding(.bottom, AppleMetrics.readerBarBottom)
    }
    .ignoresSafeArea()
    .onAppear { configure() }
    .task { await countReadingTime() }
    .accessibilityElement(children: .contain)
    .accessibilityLabel(card.title)
    .accessibilityAddTraits(.isModal)
  }

  private func configure() {
    scroll.initialOffset = reader.positions[layer.id] ?? 0
    scroll.trailing = AppleMetrics.space160
    scroll.finishEnabled =
      card.kind.readable && !card.body.isEmpty && workspace.preferences.collapseOnFinish
    let id = card.id
    let layerID = layer.id
    scroll.offsetChanged = { [weak reader] offset in reader?.positions[layerID] = offset }
    scroll.progressChanged = { [weak workspace] value in
      workspace?.recorder.read(id, progress: value)
    }
    scroll.reachedEnd = { [weak reader] in
      if card.kind.readable { reader?.reachedEnd(id) }
    }
    scroll.finished = { [weak reader] done in
      reader?.reachedEnd(id, completion: done) ?? done(false)
    }
    scroll.close = { [weak reader] in reader?.close() }
  }

  /// Web: one second per second while the page is open, the app is in front and there was input
  /// within the last minute. Counted in the recorder only; written when the reader closes.
  private func countReadingTime() async {
    let anyInput = CGEventType(rawValue: ~0)!
    while !Task.isCancelled {
      try? await Task.sleep(for: .seconds(1))
      guard !Task.isCancelled else { return }
      let idle = CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: anyInput)
      if NSApp.isActive, idle < 60 { workspace.recorder.readingSecond() }
    }
  }
}

/// The 2px reading line. Only this view observes the per-frame progress.
private struct ReaderProgress: View {
  let motion: ReaderMotion
  var body: some View {
    AppleColors.accentFill
      .frame(height: AppleMetrics.readerProgressHeight)
      .scaleEffect(x: motion.progress, y: 1, anchor: .leading)
      .frame(maxWidth: .infinity, alignment: .leading)
      .allowsHitTesting(false)
      .accessibilityHidden(true)
  }
}
