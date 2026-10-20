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
  @State var pageLimit = 40
  @State var homeTopRequest = 0
  @State var homeTopImmediate = false
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
    reduceMotion ? nil : .spring(response: 0.32, dampingFraction: 1)
  }
  var body: some View {
    @Bindable var workspace = model
    ZStack(alignment: .bottom) {
      AppleColors.canvas.ignoresSafeArea()
      feed.disabled(model.readerPresented).accessibilityHidden(model.readerPresented)
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
        .allowsHitTesting(!railHidden && !model.readerPresented)
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
    .dropDestination(for: String.self) { values, _ in
      guard model.page == "home", model.selected == nil, !model.settingsPresented,
        !values.allSatisfy({ id in model.cards.contains { $0.id == id } })
      else { return false }
      let text = values.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
      guard !text.isEmpty else { return false }
      model.capture(text)
      return true
    }
    .disabled(model.readerPresented)
    .accessibilityHidden(model.readerPresented)
    .overlay {
      GeometryReader { geometry in
        if let selected = model.selected {
          ZStack {
            AppleColors.dim.ignoresSafeArea().onTapGesture { model.dismissReader() }
            CardReader(availableSize: geometry.size, presentedID: selected)
          }.frame(maxWidth: .infinity, maxHeight: .infinity)
        }
      }
    }
    .toolbar { nativeToolbar }
    .toolbar(model.readerPresented ? .hidden : .visible, for: .windowToolbar)
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
    .onChange(of: model.selected) { _, selected in
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
    .modifier(WorkspaceSearch(query: $workspace.query, focus: $searchFocused))
    .onChange(of: model.searchFocusRequest) { searchFocused = true }
    .background(NativeKeyboard(handle: handleKey).frame(width: 0, height: 0))
    .foregroundStyle(AppleColors.primary).tint(AppleColors.accent)
    .frame(minWidth: AppleMetrics.desktopMinWidth, minHeight: AppleMetrics.desktopMinHeight)
    .preferredColorScheme(model.preferredAppearance)
    .onChange(of: model.cards.map(\.id)) { old, new in
      let additions = Set(new).subtracting(old)
      if !old.isEmpty && (model.scrollOffsets["home"] ?? 0) > AppleMetrics.space24 {
        pendingIds.formUnion(additions)
      }
      pendingIds.formIntersection(Set(new))
    }
    .onChange(of: model.query) { resetFeed() }
    .onChange(of: model.feedScope) { resetFeed() }
    .onChange(of: model.typeFilter) { resetFeed() }
    .onChange(of: model.tagFilter) { resetFeed() }
    .onChange(of: model.preferences["sort"]) { resetFeed() }
    .onChange(of: model.preferences["stack"]) { resetFeed() }
    .onChange(of: model.preferences["floatTimely"]) { resetFeed() }
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
    Group {
      if model.selection.isEmpty { aiDock } else { selectionBar }
    }
    .frame(maxWidth: 640)
    .padding(.horizontal, AppleMetrics.space24)
  }
}
