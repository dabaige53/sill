import AppKit
import SillKit
import SwiftUI

/// The page chrome wraps the same scroll view in preview and full modes. Resizing never
/// replaces the document, field selection, or the media player's host view.
struct ReaderPage<Content: View>: View {
  let card: CardModel
  let state: CardState
  let layer: Reader.Layer
  @Environment(Reader.self) private var reader
  @Environment(Workspace.self) private var workspace
  @Environment(Panels.self) private var panels
  let scroll: ReaderScroll
  let content: Content
  @State private var currentHeading: Int?
  @Namespace private var outlineIndicator
  private var full: Bool { layer.full }
  private var expandedWorkspace: Bool { card.kind == .media || card.kind == .article }
  private var headings: [(index: Int, block: MarkdownBody.Block)] {
    card.kind == .article
      ? card.markdown.blocks.enumerated().compactMap {
        $0.element.heading > 0 ? (index: $0.offset, block: $0.element) : nil
      } : []
  }

  var body: some View {
    let tools = ReaderTools.actions(
      card: card, state: state, hidden: workspace.preferences.hiddenActions)
    ZStack(alignment: .top) {
      ScrollViewReader { proxy in
        HStack(alignment: .top, spacing: full ? AppleMetrics.space40 : 0) {
          if full, !headings.isEmpty {
            outline(proxy: proxy)
              .frame(width: AppleMetrics.readerOutlineWidth)
              .padding(.top, AppleMetrics.space24)
          }
          content
            .onPreferenceChange(ReaderHeadingPositions.self) { positions in
              let passed = headings.last {
                (positions[$0.index] ?? .infinity) <= AppleMetrics.space40
              }
              let view = scroll.scrollView
              let documentHeight = view?.documentView?.bounds.height ?? 0
              let viewport = view?.contentView.bounds ?? .zero
              let atEnd = documentHeight > viewport.height && viewport.maxY >= documentHeight - 1
              let selected = atEnd ? headings.last?.index : passed?.index ?? headings.first?.index
              if selected != currentHeading { currentHeading = selected }
            }
        }
        .padding(.horizontal, full ? AppleMetrics.readerPageGutter : 0)
        .padding(.top, full ? (expandedWorkspace ? AppleMetrics.space64 : AppleMetrics.space88) : 0)
      }
      if full, card.kind != .media {
        ReaderProgress(motion: scroll.motion)
          .modifier(DetailReveal(tools: true))
      }
      if full {
        HStack(spacing: AppleMetrics.space2) {
          ToolButton(icon: "collapse", label: Copy.text("web.reader.exitFullscreen")) {
            reader.open(card.id, full: false)
          }
          ToolButton(icon: "x", label: Copy.text("web.reader.close")) { reader.close() }
        }
        .padding(AppleMetrics.space4)
        .desktopGlass(Capsule())
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Copy.text("web.readerTools"))
        .modifier(ReaderToolsTuck(motion: scroll.motion, top: true, enabled: !expandedWorkspace))
        .padding(.top, AppleMetrics.readerToolsTop)
        .padding(.trailing, AppleMetrics.readerToolsRight)
        .frame(maxWidth: .infinity, alignment: .trailing)
        .modifier(DetailReveal(tools: true))
      }
      if full && expandedWorkspace && !tools.isEmpty {
        ReaderToolbar(card: card, state: state, actions: tools, top: true)
          .padding(.leading, AppleMetrics.space16)
          .padding(.top, AppleMetrics.space4)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
      if full {
        VStack(spacing: AppleMetrics.space12) {
          Spacer(minLength: 0)
          // The check returns with the surface and its spring instead of fading out ahead of it.
          FinishRing(motion: scroll.motion)
          if !expandedWorkspace && !tools.isEmpty {
            ReaderToolbar(card: card, state: state, actions: tools)
              .modifier(ReaderToolsTuck(motion: scroll.motion))
              .modifier(DetailReveal(tools: true))
          }
        }
        .padding(.bottom, AppleMetrics.readerBarBottom)
      }
    }
    .task(id: full) { if full { await countReadingTime() } }
  }

  private func outline(proxy: ScrollViewProxy) -> some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 0) {
        HStack(spacing: AppleMetrics.space8) {
          Icon("list", size: AppleMetrics.space16)
          Text(Copy.text("web.reader.outline"))
        }
        .font(.sans(AppleMetrics.font15, .medium))
        .foregroundStyle(AppleColors.primary)
        .padding(.bottom, AppleMetrics.space6)
        ForEach(headings, id: \.index) { heading in
          let selected = (currentHeading ?? headings.first?.index) == heading.index
          Button {
            Motion.instantly { proxy.scrollTo("reader-section-\(heading.index)", anchor: .top) }
          } label: {
            OutlineTitle(text: heading.block.text, selected: selected)
              .multilineTextAlignment(.leading)
              .fixedSize(horizontal: false, vertical: true)
              .padding(
                .leading,
                CGFloat(
                  min(
                    2,
                    max(0, heading.block.heading - (headings.map { $0.block.heading }.min() ?? 1))))
                  * AppleMetrics.space12
              )
              .padding(.trailing, AppleMetrics.space12)
              .padding(.vertical, AppleMetrics.space4)
              .frame(maxWidth: .infinity, minHeight: AppleMetrics.space32, alignment: .leading)
              .overlay(alignment: .leading) {
                if selected {
                  Circle().fill(AppleColors.accent)
                    .frame(width: AppleMetrics.space6, height: AppleMetrics.space6)
                    .matchedGeometryEffect(id: "outline", in: outlineIndicator)
                    .animation(
                      Motion.keyboardDriven
                        ? nil
                        : .spring(
                          duration: AppleMetrics.outlineTravelDuration,
                          bounce: AppleMetrics.outlineTravelBounce), value: currentHeading)
                }
              }
          }.buttonStyle(.plain)
            .accessibilityAddTraits(selected ? .isSelected : [])
        }
      }
    }.scrollIndicators(.hidden).accessibilityLabel(Copy.text("web.reader.outline"))
  }

  /// Web: one second per second while the page is open, the app is in front and there was input
  /// within the last minute. Counted in the recorder only; written when the reader closes.
  private func countReadingTime() async {
    let anyInput = CGEventType(rawValue: ~0)!
    while !Task.isCancelled {
      try? await Task.sleep(for: .seconds(1))
      guard !Task.isCancelled, reader.sessionActive else { return }
      let idle = CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: anyInput)
      if NSApp.isActive, idle < 60, reader.top?.id == layer.id, reader.shown, panels.kind == nil {
        workspace.recorder.readingSecond()
      }
    }
  }
}

private struct OutlineTitle: View {
  let text: String
  let selected: Bool
  var body: some View {
    Text(text).foregroundStyle(AppleColors.secondary)
      .overlay(alignment: .leading) {
        Text(text).foregroundStyle(AppleColors.accent)
          .mask {
            Rectangle().scaleEffect(x: selected ? 1 : 0, anchor: .leading)
              .animation(
                Motion.keyboardDriven
                  ? nil
                  : Motion.ease(
                    selected ? AppleMetrics.outlineWipeIn : AppleMetrics.outlineWipeOut),
                value: selected)
          }.accessibilityHidden(true)
      }
      .font(.sans(AppleMetrics.font15))
      .offset(x: selected ? AppleMetrics.space14 : 0)
      .padding(.trailing, AppleMetrics.space14)
      .animation(
        Motion.keyboardDriven ? nil : Motion.ease(AppleMetrics.outlineShiftDuration),
        value: selected)
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
