import AppKit
import SillKit
import SwiftUI

struct Desktop: View {
  @EnvironmentObject var model: Workspace
  @Environment(\.controlActiveState) var windowActivity
  @FocusState var toastFocused: Bool
  @FocusState var undoFocused: Bool
  @FocusState var searchFocused: Bool
  @State var pageLimit = 40
  @State var homeTopRequest = 0
  @State var searchLimit = 40
  @State var railHidden = false
  @State var lastOffset: CGFloat = 0
  @State var downward: CGFloat = 0
  @State var upward: CGFloat = 0
  @State var revealTask: Task<Void, Never>?
  @State private var homeSelection: Set<String> = []
  @State private var searchSelection: Set<String> = []
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
  @State var pendingIds: Set<String> = []
  @State var aiDropTargeted = false
  @FocusState var aiTargetFocused: Bool
  @FocusState var focusedCard: String?
  @State var toastText = ""
  @State var toastTask: Task<Void, Never>?
  @State var toastLifetime = ToastLifetime(duration: .zero)
  @State var toastHovered = false
  @State var undoPatches: [String: JSONValue] = [:]
  @State private var undoRevision = 0
  @State var pendingUndo: [String: JSONValue] = [:]
  @State var pendingToast = ""
  @State private var detail = DetailPresentation()
  @Namespace var navigation
  private var railConcealed: Bool { railHidden || model.settingsPresented }
  private var railAnimation: Animation {
    return railConcealed
      ? .timingCurve(0.23, 1, 0.32, 1, duration: AppleMetrics.motionRailHide)
      : .timingCurve(0.32, 0.72, 0, 1, duration: AppleMetrics.motionRailShow)
  }
  var body: some View {
    GeometryReader { geometry in
      ZStack(alignment: .bottom) {
        AppleColors.canvas.ignoresSafeArea()
        feed
          .opacity(model.page == "home" ? 1 : 0)
          .allowsHitTesting(model.page == "home")
          .accessibilityHidden(model.page != "home")
        if model.searchPresented { searchPage }
        if model.page == "ai" {
          aiPage.padding(
            .horizontal,
            max(AppleMetrics.railEdge, (geometry.size.width - AppleMetrics.aiWidth) / 2)
          )
          .padding(.top, AppleMetrics.space16).padding(
            .bottom, AppleMetrics.railEdge + AppleMetrics.railRow + AppleMetrics.space24
          )
          .frame(maxWidth: .infinity, maxHeight: .infinity).background(AppleColors.canvas)
        }
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
          .offset(y: railConcealed ? AppleMetrics.motionRailTravel : 0)
          .animation(railAnimation, value: railConcealed)
          .allowsHitTesting(!railHidden && !model.settingsPresented)
          .accessibilityHidden(railHidden || model.settingsPresented)
        if model.settingsPresented {
          overlay { SettingsPanel(availableSize: geometry.size) }
        }
        if archivePresented {
          overlay {
            archivePanel.frame(
              width: min(AppleMetrics.aiWidth, geometry.size.width - AppleMetrics.space32))
          }
        }
        if model.capturePresented {
          overlay {
            VStack(spacing: 0) {
              HStack {
                Spacer()
                iconButton("x", "web.close") { model.capturePresented = false }
              }
              CaptureField(text: $captureText, showsNextEvent: true) { model.capture(captureText) }
                .padding(.horizontal, AppleMetrics.railEdge)
            }.padding(.top, AppleMetrics.space8).frame(
              width: min(AppleMetrics.editorWidth, geometry.size.width - AppleMetrics.space32)
            )
            .background(
              AppleColors.card, in: RoundedRectangle(cornerRadius: AppleMetrics.panelRadius))
          }
        }
        if tagEditor {
          overlay {
            metadataEditor.frame(
              width: min(AppleMetrics.editorWidth, geometry.size.width - AppleMetrics.space32))
          }
        }
        if let displayedID = detail.cardID {
          ZStack {
            AppleColors.dim.ignoresSafeArea().onTapGesture { model.dismissReader() }
              .opacity(detail.visible ? 1 : 0)
            CardReader(availableSize: geometry.size, presentedID: displayedID).environmentObject(
              model
            )
            .opacity(detail.visible ? 1 : 0)
            .offset(
              y: !detail.visible
                ? (model.selected == nil
                  ? AppleMetrics.motionDetailExitY : AppleMetrics.motionDetailEnterY) : 0)
          }
          .allowsHitTesting(model.selected != nil)
          .accessibilityHidden(model.selected == nil)
        }
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
    .background(NativeKeyboard(handle: handleKey).frame(width: 0, height: 0))
    .foregroundStyle(AppleColors.primary).tint(AppleColors.accent)
    .frame(minWidth: AppleMetrics.desktopMinWidth, minHeight: AppleMetrics.desktopMinHeight)
    .preferredColorScheme(
      model.preferences["theme"]?.string == "dark"
        ? .dark : model.preferences["theme"]?.string == "light" ? .light : nil
    )
    .onChange(of: model.cards.map(\.id)) { old, new in
      let additions = Set(new).subtracting(old)
      if !old.isEmpty && (model.scrollOffsets["home"] ?? 0) > AppleMetrics.space24 {
        pendingIds.formUnion(additions)
      }
      pendingIds.formIntersection(Set(new))
    }
    .onChange(of: model.page) { old, new in
      if old == "search" {
        searchSelection = model.selection
      } else if old == "home" {
        homeSelection = model.selection
      }
      model.selection = new == "search" ? searchSelection : new == "home" ? homeSelection : []
      showRail()
      lastOffset = model.scrollOffsets[new] ?? 0
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
      presentDetail(model.selected)
    }
    .onChange(of: model.selected) { _, id in presentDetail(id) }
    .onExitCommand { dismissTop() }
    .onDisappear {
      revealTask?.cancel()
      toastTask?.cancel()
      toastLifetime.pause(at: .now)
      detail.invalidate()
    }
  }
  private func presentDetail(_ id: String?) {
    let generation = detail.prepare(id)
    let duration = id == nil ? AppleMetrics.motionDetailClose : AppleMetrics.motionDetailOpen
    if id != nil {
      // Mount at the entry position before starting the local presentation transaction.
      Task { @MainActor in
        await Task.yield()
        guard detail.generation == generation else { return }
        withAnimation(
          .timingCurve(0.23, 1, 0.32, 1, duration: duration)
        ) {
          detail.visible = true
        }
      }
    } else {
      withAnimation(
        .timingCurve(0.23, 1, 0.32, 1, duration: duration),
        completionCriteria: .removed
      ) {
        detail.visible = false
      } completion: {
        detail.finishClose(generation)
      }
    }
  }
  private var rail: some View {
    HStack(spacing: AppleMetrics.space8) {
      if model.page == "home" && !pendingIds.isEmpty
        && model.preferences["newHint"]?.string != "off"
      {
        Button {
          pendingIds.removeAll()
          homeTopRequest += 1
        } label: {
          HStack(spacing: AppleMetrics.space8) {
            NativeIcon(name: "up", size: AppleMetrics.space14)
            Text("\(pendingIds.count)" + Copy.text("web.app.b50caa663fcf"))
          }.font(.system(size: AppleMetrics.font14))
            .padding(.horizontal, AppleMetrics.space18).frame(height: AppleMetrics.railRow)
        }.buttonStyle(.plain).modifier(GlassSurface()).accessibilityLabel(
          Copy.text("web.app.3fa133e511d1"))
      }
      if !model.selection.isEmpty { selectionBar }
      HStack(spacing: 0) {
        nav("home", "home", "web.nav.home")
        nav("search", "search", "web.nav.search")
        nav("ai", "chat", "web.nav.aiLabel")
        nav("settings", "sill", "web.nav.settings")
      }.padding(AppleMetrics.railInset).modifier(GlassSurface())
    }
  }
}
