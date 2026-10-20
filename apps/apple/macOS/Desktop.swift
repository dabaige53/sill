import AppKit
import SillKit
import SwiftUI

struct Desktop: View {
  @Environment(Workspace.self) var model: Workspace
  @Environment(\.controlActiveState) var windowActivity
  @Environment(\.openSettings) private var openSettings
  @Environment(\.accessibilityReduceMotion) var reduceMotion
  @FocusState var toastFocused: Bool
  @FocusState var undoFocused: Bool
  @FocusState var searchFocused: Bool
  @State var scopePresented = false
  @State var scopeMounted = false
  @State var scopeImmediate = false
  @State var scopeFrame = CGRect.zero
  @State var desktopFrame = CGRect.zero
  @State var detail = DetailPresentation()
  @State var detailFocus: String?
  @State var pageLimit = 40
  @State var homeTopRequest = 0
  @State var homeTopImmediate = false
  @State var scopeOffsets: [FeedScope: CGFloat] = [:]
  @State var pendingScopeOffset: CGFloat?
  @State var restoreOffset: CGFloat = 0
  @State var restoreRequest = 0
  @State var railHidden = false
  @State var chrome = ScrollChromeState()
  @FocusState var aiFocused: Bool
  @State var feedOrder: [String] = []
  @State var stackGroups: [String: [String]] = [:]
  @State var tagEditor = false
  @State var tagText = ""
  @State var tagIds: [String] = []
  @State var tagRevision = 0
  @State var tagSaving = false
  @State var editingTags: [String] = []
  @State var editingNote = ""
  @State var bulkPending = false
  @State var captureText = ""
  @State var openStacks: Set<String> = []
  @State var archivePresented = false
  @State var archiveSelection: String?
  @State var pendingIds: Set<String> = []
  @State var refreshPull: CGFloat = 0
  @State var feedEdge: CGFloat = 0
  @State var refreshHold: Task<Void, Never>?
  @State var aiDropTargeted = false
  @FocusState var focusedCard: String?
  @State var toastText = ""
  @State var toastTask: Task<Void, Never>?
  @State var toastLifetime = ToastLifetime(duration: .zero)
  @State var toastHovered = false
  @State var undoPatches: [String: JSONValue] = [:]
  @State private var undoRevision = 0
  @State var pendingUndo: [String: JSONValue] = [:]
  @State var pendingToast = ""
  private var railConcealed: Bool { railHidden }
  private var railAnimation: Animation? {
    reduceMotion
      ? nil
      : NativeMotion.sheet(railHidden ? AppleMetrics.motionRailHide : AppleMetrics.motionRailShow)
  }
  var body: some View {
    @Bindable var workspace = model
    ZStack(alignment: .bottom) {
      AppleColors.canvas.ignoresSafeArea()
      feed.disabled(detail.cardID != nil).accessibilityHidden(detail.cardID != nil)
        .scrollDisabled(detail.cardID != nil || scopeMounted || model.cardMenuID != nil)
      LinearGradient(
        colors: [AppleColors.canvas, AppleColors.canvas.opacity(0)], startPoint: .bottom,
        endPoint: .top
      )
      .frame(height: AppleMetrics.railRow + AppleMetrics.space24).allowsHitTesting(false)
      .opacity(railConcealed ? 0 : 1)
      .animation(railAnimation, value: railConcealed)
      rail.padding(.bottom, AppleMetrics.railEdge)
        .opacity(railConcealed ? 0 : 1)
        .animation(railAnimation, value: railConcealed)
        .offset(y: railConcealed && !reduceMotion ? AppleMetrics.motionRailTravel : 0)
        .animation(railAnimation, value: railConcealed)
        .allowsHitTesting(!railHidden && detail.cardID == nil)
        .accessibilityHidden(railHidden || model.readerPresented)
      if !toastText.isEmpty {
        HStack(spacing: AppleMetrics.space16) {
          Text(toastText)
          if !undoPatches.isEmpty {
            Button(Copy.text("web.app.926a50b98ece")) {
              guard !model.busy else { return }
              model.batchPatch(undoPatches, expectedRevision: undoRevision)
              dismissToast()
            }.buttonStyle(.plain).foregroundStyle(AppleColors.accent).disabled(model.busy)
              .focused($undoFocused)
          }
        }.font(.system(size: AppleMetrics.font14)).padding(.horizontal, AppleMetrics.space18)
          .padding(.vertical, AppleMetrics.space12)
          .modifier(GlassSurface())
          .focusable(undoPatches.isEmpty).focused($toastFocused)
          .onHover { toastHovered = $0 }
          .frame(maxWidth: .infinity, alignment: .trailing).padding(
            .trailing, AppleMetrics.railEdge
          )
          .padding(.bottom, AppleMetrics.railEdge + AppleMetrics.railRow + AppleMetrics.space12)
          .transition(NativeMotion.fade)
      }
      if let error = model.error {
        VStack {
          HStack(spacing: AppleMetrics.space12) {
            Text(error).font(.system(size: AppleMetrics.font14)).textSelection(.enabled)
            Button(Copy.appleRetry) { model.refresh() }.disabled(model.loading)
            iconButton("x", "web.close") { model.error = nil }
          }.padding(AppleMetrics.space12).background(
            AppleColors.card, in: RoundedRectangle(cornerRadius: AppleMetrics.space12))
          Spacer()
        }
        .padding(AppleMetrics.space16)
      }
    }
    .animation(NativeMotion.ease(AppleMetrics.motionFast), value: toastText.isEmpty)
    .background(WindowAnchor { desktopFrame = $0 })
    .overlay {
      if scopeMounted {
        ScopeMenu(
          presented: $scopePresented,
          anchor: CGPoint(
            x: scopeFrame.minX - desktopFrame.minX, y: desktopFrame.maxY - scopeFrame.minY),
          immediate: scopeImmediate, removed: { scopeMounted = false })
      }
    }
    .overlayPreferenceValue(CardMenuAnchor.self) { anchors in
      GeometryReader { geometry in
        if let id = model.cardMenuID, let anchor = anchors[id],
          let card = model.cards.first(where: { $0.id == id })
        {
          CardMenu(card: card, anchor: geometry[anchor], available: geometry.size).id(id)
        }
      }
    }
    .dropDestination(for: String.self) { values, _ in
      guard model.page == "home", model.selected == nil, !model.settingsPresented,
        !values.allSatisfy({ id in model.cards.contains { $0.id == id } })
      else { return false }
      let text = values.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
      guard !text.isEmpty else { return false }
      model.capture(text)
      return true
    }
    .disabled(detail.cardID != nil)
    .accessibilityHidden(detail.cardID != nil)
    .overlay {
      GeometryReader { geometry in
        if let selected = detail.cardID {
          ZStack {
            AppleColors.dim.ignoresSafeArea().opacity(detail.visible ? 1 : 0)
              .onTapGesture { model.dismissReader() }
            CardReader(availableSize: geometry.size, presentedID: selected)
              .id(selected)
              .opacity(detail.visible ? 1 : 0)
              .offset(y: detail.visible ? 0 : AppleMetrics.motionDetailEnterY)
              .transition(
                .opacity.combined(
                  with: .offset(y: detail.visible ? AppleMetrics.motionDetailEnterY : 0))
              )
              .allowsHitTesting(detail.visible && model.selected == selected)
          }.frame(maxWidth: .infinity, maxHeight: .infinity)
        }
      }
    }
    .toolbar { nativeToolbar }
    .toolbar(detail.cardID != nil ? .hidden : .visible, for: .windowToolbar)
    .sheet(isPresented: $workspace.capturePresented) {
      CaptureSheet(text: $captureText).environment(model)
    }
    .sheet(isPresented: $tagEditor) {
      metadataEditor.frame(width: AppleMetrics.editorWidth)
        .interactiveDismissDisabled(model.busy)
    }
    .sheet(
      isPresented: $archivePresented,
      onDismiss: {
        if let id = archiveSelection {
          archiveSelection = nil
          model.selected = id
        }
      }
    ) {
      archivePanel.frame(width: AppleMetrics.aiWidth)
    }
    .onChange(of: model.selected, initial: true) { _, selected in
      presentDetail(selected)
      if selected != nil { model.closeCardMenu(immediate: true) }
      if selected != nil {
        searchFocused = false
        aiFocused = false
      }
    }
    .onChange(of: model.settingsPresented) {
      if model.settingsPresented {
        openSettings()
        model.settingsPresented = false
      }
    }
    .modifier(WorkspaceSearch(query: $workspace.query, focus: $searchFocused, hidden: railHidden))
    .onChange(of: model.searchFocusRequest) { searchFocused = true }
    .background(NativeKeyboard(handle: handleKey).frame(width: 0, height: 0))
    .foregroundStyle(AppleColors.primary).tint(AppleColors.accent)
    .frame(minWidth: AppleMetrics.desktopMinWidth, minHeight: AppleMetrics.desktopMinHeight)
    .preferredColorScheme(model.preferredAppearance)
    .onChange(of: model.cards.map(\.id)) { old, new in
      let additions = Set(new).subtracting(old)
      if !old.isEmpty && model.preferences["newHint"]?.string != "off"
        && (model.scrollOffsets["home"] ?? 0) > AppleMetrics.space24
      {
        pendingIds.formUnion(additions.subtracting(model.capturedIDs))
      }
      model.capturedIDs.subtract(additions)
      pendingIds.formIntersection(Set(new))
    }
    .onChange(of: model.loading) { _, loading in
      if !loading {
        refreshHold?.cancel()
        withAnimation(NativeMotion.sheet(AppleMetrics.motionSheet)) { refreshPull = 0 }
        if model.refreshInitiated && model.error == nil { resetFeed() }
      }
    }
    .onChange(of: model.query) { resetFeed() }
    .onChange(of: model.feedScope) { old, new in
      scopeOffsets[old] = model.scrollOffsets["home"] ?? 0
      pendingScopeOffset = scopeOffsets[new] ?? 0
      resetFeed(restoreScope: true)
    }
    .onChange(of: model.typeFilter) { resetFeed() }
    .onChange(of: model.tagFilter) { resetFeed() }
    .onChange(of: model.preferences["sort"]) { resetFeed() }
    .onChange(of: model.preferences["stack"]) { resetFeed() }
    .onChange(of: model.preferences["floatTimely"]) { resetFeed() }
    .onChange(of: searchFocused) { if searchFocused { showRail() } }
    .onChange(of: aiFocused) { if aiFocused { showRail() } }
    .onChange(of: scopePresented) { if scopePresented { showRail() } }
    .onChange(of: model.cardMenuVisible) { if model.cardMenuVisible { showRail() } }
    .onChange(of: model.aiFocusRequest) {
      showRail()
      aiFocused = true
    }
    .onChange(of: model.busy) {
      guard !model.busy else { return }
      if tagSaving {
        tagSaving = false
        if model.error == nil {
          tagEditor = false
          model.selection.removeAll()
        }
      }
      if bulkPending {
        bulkPending = false
        if model.error == nil {
          model.selection.removeAll()
          undoPatches = pendingUndo
          undoRevision = model.revision
          showToast(pendingToast, undo: true)
        }
      }
    }
    .onChange(of: model.capturePresented) {
      if !model.capturePresented && model.error == nil { captureText = "" }
    }
    .onChange(of: toastPaused) { updateToastTimer() }
    .onAppear {
      updateToastTimer()
    }
    .onExitCommand { dismissTop(immediateDetail: true) }
    .onDisappear {
      chrome.revealTask?.cancel()
      toastTask?.cancel()
      toastLifetime.pause(at: .now)
    }
  }
  private var rail: some View {
    ZStack {
      aiDock.opacity(model.selection.isEmpty ? 1 : 0)
        .allowsHitTesting(model.selection.isEmpty).accessibilityHidden(!model.selection.isEmpty)
      selectionBar.opacity(model.selection.isEmpty ? 0 : 1)
        .allowsHitTesting(!model.selection.isEmpty).accessibilityHidden(model.selection.isEmpty)
    }
    .animation(NativeMotion.ease(AppleMetrics.motionFast), value: model.selection.isEmpty)
    .frame(maxWidth: 640)
    .padding(.horizontal, AppleMetrics.space24)
  }
}
