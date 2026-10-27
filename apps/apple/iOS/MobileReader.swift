#if os(iOS)
  import SillKit
  import SwiftUI
  import UIKit
  import UniformTypeIdentifiers

  /// One retained reading layer. The host owns presentation; this view owns its content session.
  struct MobileReader: View {
    let workspace: MobileWorkspace
    let cardID: String
    let layer: MobileReaderLayer
    let safeArea: EdgeInsets
    let isTop: Bool
    let close: () -> Void
    let openRelated: (String) -> Void
    @ScaledMetric(relativeTo: .body) private var dynamicScale: CGFloat = 1
    @Environment(\.scenePhase) var scenePhase
    @Environment(\.openURL) var openURL
    @State var annotations = false
    @State private var photoAnnotations = false
    @State var relatedID: String?
    @State var owner: String?
    @State var playback = MediaPlayback()
    @State var calendarDocument: MobileCalendarDocument?
    @State var exportingCalendar = false
    @State private var reading: MobileReadingSession?
    @State private var anchors: [String: CGFloat] = [:]
    @State private var readReported = false
    @State private var readTask: Task<Bool, Never>?

    var body: some View {
      Group {
        if let card = workspace.card(cardID) {
          if card.type == "photo" {
            MobilePhotoLightbox(
              workspace: workspace, card: card, safeArea: safeArea, close: close,
              annotationsChanged: { photoAnnotations = $0 })
          } else {
            reader(card)
          }
        } else {
          VStack(spacing: AppleMetrics.space16) {
            Text(Copy.text("web.agent.noCard"))
            Button(Copy.text("web.close"), action: close)
          }
          .frame(maxWidth: .infinity, maxHeight: .infinity)
          .foregroundStyle(AppleColors.secondary)
        }
      }
      .tint(AppleColors.accent)
      .task {
        owner = workspace.owner
        if reading == nil, let card = workspace.card(cardID) {
          reading = MobileReadingSession(progress: card.progress) { seconds, progress in
            if await workspace.recordReading(card, seconds: seconds, progress: progress) {
              return .saved
            }
            return workspace.unresolvedWrite ? .unknown : .rejected
          }
        }
        layer.complete = { await confirmRead() }
        while !Task.isCancelled {
          do { try await Task.sleep(for: .seconds(1)) } catch { return }
          if isActive { reading?.tick() }
        }
      }
      .onChange(of: isActive, initial: true) { _, active in
        if active {
          layer.active = true
          layer.complete = { await confirmRead() }
        } else {
          flushReading()
          playback.stop()
          layer.suspend()
        }
      }
      .onChange(of: layer.progress) { _, progress in
        if isActive { reading?.advance(progress) }
      }
      .onChange(of: relatedID) { _, id in
        guard let id else { return }
        relatedID = nil
        openRelated(id)
      }
      .onDisappear {
        playback.stop()
        flushReading()
      }
      .sheet(isPresented: $annotations) {
        if let card = workspace.card(cardID) {
          MobileAnnotations(workspace: workspace, baseline: card)
        }
      }
      .fileExporter(
        isPresented: $exportingCalendar, document: calendarDocument,
        contentType: MobileCalendarDocument.contentType, defaultFilename: "sill.ics"
      ) { result in
        if case .failure = result { workspace.error = Copy.text("apple.exportError") }
      }
    }

    // @design article-reading
    private func reader(_ card: MobileCard) -> some View {
      ZStack(alignment: .top) {
        MobileReaderScroll(
          layer: layer, active: isActive, accessible: isTop && layer.settled,
          finishEnabled: (workspace.preferences["collapseOnFinish"]?.bool ?? true)
            && MobileReaderPolicy.readable(card.type),
          anchors: anchors, reachedEnd: reachedEnd
        ) {
          VStack(alignment: .leading, spacing: AppleMetrics.rhythmGroup * readerSpacing) {
            readerContent(card)
          }
          .font(contentFont(AppleMetrics.font17))
          .foregroundStyle(AppleColors.primary)
          .padding(.horizontal, AppleMetrics.space20)
          .padding(.top, AppleMetrics.space18)
          .padding(.bottom, footerRoom(card))
          .frame(maxWidth: readerWidth)
          .frame(maxWidth: .infinity)
          .fixedSize(horizontal: false, vertical: true)
          .mobileReaderAnchor("reader-top")
          .coordinateSpace(name: "mobile-reader-content")
          .onPreferenceChange(MobileReaderAnchors.self) { anchors = $0 }
          .offset(y: layer.contentShift)
        }
        .background(AppleColors.card)
        .overlay(alignment: .top) { topTools(card) }
        .overlay(alignment: .bottom) { bottomTools(card) }
        .overlay(alignment: .bottom) {
          MobileReaderFinishRing(layer: layer)
            .padding(.bottom, max(safeArea.bottom, AppleMetrics.space8) + AppleMetrics.space12)
        }
        MobileReaderHandle(layer: layer)
          .frame(width: AppleMetrics.space88, height: AppleMetrics.space32)
          .opacity(layer.toolsVisible ? 1 : 0)
          .allowsHitTesting(layer.toolsVisible && isActive)
      }
      .background(AppleColors.card)
      .accessibilityAction(.escape, close)
    }

    private func topTools(_ card: MobileCard) -> some View {
      HStack(spacing: AppleMetrics.space4) {
        Spacer(minLength: AppleMetrics.space8)
        HStack(spacing: AppleMetrics.space4) {
          MobileReaderTool(
            icon: "x", label: Copy.text("web.reader.close"), belowTip: true, action: close)
        }
        .padding(AppleMetrics.railInset)
        .mobileGlass(Capsule())
      }
      .padding(.horizontal, AppleMetrics.space12)
      .padding(.top, toolsTop(card))
      .opacity(layer.toolsVisible ? 1 : 0)
      .offset(y: layer.toolsVisible ? 0 : -AppleMetrics.space12)
      .allowsHitTesting(layer.toolsVisible && isActive)
      .accessibilityHidden(!layer.toolsVisible)
    }

    @ViewBuilder private func bottomTools(_ card: MobileCard) -> some View {
      toolbar(card)
        .padding(.horizontal, AppleMetrics.space8)
        .padding(.bottom, max(safeArea.bottom, AppleMetrics.space8))
        .opacity(layer.toolsVisible ? 1 : 0)
        .offset(y: layer.toolsVisible ? 0 : AppleMetrics.motionRailTravel)
        .allowsHitTesting(layer.toolsVisible && isActive)
        .accessibilityHidden(!layer.toolsVisible)
    }

    private func footerRoom(_ card: MobileCard) -> CGFloat {
      return AppleMetrics.space22
        + (toolbarActions(card).isEmpty
          ? 0
          : AppleMetrics.railRow + AppleMetrics.space4 + max(safeArea.bottom, AppleMetrics.space8))
    }

    private func toolsTop(_ card: MobileCard) -> CGFloat {
      if layer.scrollOffset > AppleMetrics.space8 { return 0 }
      if card.type == "article", card.raw["image"]?.string != nil { return AppleMetrics.space24 }
      if card.type == "media", card.raw["media"]?.string == "podcast" { return AppleMetrics.space8 }
      return AppleMetrics.space14
    }

    var isActive: Bool {
      isTop && scenePhase == .active && !annotations && !photoAnnotations && !exportingCalendar
    }
    var readerScale: CGFloat {
      AppleMetrics.mobileTextScale * readerBodyScale
    }
    var readerBodyScale: CGFloat {
      MobileContentStyle.text(workspace.preferences["readerTextSize"]?.string)
    }
    var readerSpacing: CGFloat {
      MobileContentStyle.spacing(workspace.preferences["readerSpacing"]?.string)
    }
    var strongText: Bool { workspace.preferences["textWeight"]?.string == "strong" }
    private var readerWidth: CGFloat {
      switch workspace.preferences["readerWidth"]?.string {
      case "narrow": AppleMetrics.layoutReaderNarrow
      case "standard": AppleMetrics.layoutReaderStandard
      default: .infinity
      }
    }
    func contentFont(
      _ size: CGFloat, weight: Font.Weight = .regular, design: Font.Design = .default
    ) -> Font {
      MobileContentStyle.font(
        size, weight: weight, design: design,
        scale: dynamicScale * readerScale, strong: strongText)
    }

    private func reachedEnd() {
      guard isActive, !readReported, let card = workspace.card(cardID),
        MobileReaderPolicy.readable(card.type)
      else { return }
      Task { readReported = await confirmRead() }
    }

    private func flushReading() {
      guard owner == workspace.owner, let reading else { return }
      // Give an already-open reader time to finish its save when iOS suspends the app.
      let application = UIApplication.shared
      let background = application.beginBackgroundTask(withName: "Save reading")
      Task {
        _ = await reading.flush()
        if background != .invalid { application.endBackgroundTask(background) }
      }
    }

    private func confirmRead() async -> Bool {
      guard owner == workspace.owner, isActive, let card = workspace.card(cardID) else {
        return false
      }
      if card.read && card.progress >= 1 { return true }
      // Reaching the end and then pushing belong to the same write, even if its response is slow.
      if let readTask { return await readTask.value }
      let token = layer.generation
      guard let reading else { return false }
      let task = Task { await reading.flush(completed: true) }
      readTask = task
      let saved = await task.value
      readTask = nil
      return saved && owner == workspace.owner && layer.active && token == layer.generation
    }
  }
#endif
