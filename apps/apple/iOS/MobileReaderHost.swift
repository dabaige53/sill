#if os(iOS)
  import SillKit
  import SwiftUI

  /// Mounted as an overlay: background navigation keeps its position behind an opaque drawer.
  struct MobileReaderHost: View {
    let workspace: MobileWorkspace
    @Binding var selection: String?
    @State private var presentation = MobileReaderPresentation()

    var body: some View {
      GeometryReader { geometry in
        ZStack(alignment: .bottom) {
          if let top = presentation.layers.last {
            Color.black
              .opacity(backdrop(top, width: geometry.size.width))
              .contentShape(Rectangle())
              .onTapGesture { presentation.closeTop() }
              .accessibilityLabel(Copy.text("web.preview.close"))
              .accessibilityAddTraits(.isButton)
            ForEach(presentation.layers) { layer in
              surface(layer, geometry: geometry)
            }
            Button(Copy.text("web.reader.close")) {
              guard presentation.layers.last?.active == true else { return }
              presentation.closeTop()
            }
            .keyboardShortcut(.cancelAction)
            .disabled(!top.active || top.leaving)
            .hidden()
            .accessibilityHidden(true)
          }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
      .ignoresSafeArea()
      .allowsHitTesting(!presentation.layers.isEmpty)
      .onChange(of: presentation.layers.map(\.cardID)) { before, after in
        let previous = Set(before)
        let current = Set(after)
        for id in current.subtracting(previous) {
          if let card = workspace.card(id) { workspace.readAppearance.hold(card) }
        }
        withAnimation(MobileMotion.read) {
          for id in previous.subtracting(current) { workspace.readAppearance.release(id) }
        }
      }
      .onChange(of: selection, initial: true) { _, id in
        presentation.didClose = { selection = nil }
        if let id, let card = workspace.card(id) {
          if presentation.layers.first?.cardID != id || presentation.layers.last?.leaving == true {
            presentation.open(card)
          }
        } else if !presentation.layers.isEmpty {
          presentation.clear()
        }
      }
      .onChange(of: workspace.owner) { _, _ in
        presentation.clear()
        selection = nil
      }
      .onDisappear {
        let held = Set(presentation.layers.map(\.cardID))
        presentation.clear()
        withAnimation(MobileMotion.read) {
          for id in held { workspace.readAppearance.release(id) }
        }
      }
    }

    private func surface(_ layer: MobileReaderLayer, geometry: GeometryProxy) -> some View {
      let isTop = presentation.layers.last?.id == layer.id
      let height =
        layer.full
        ? geometry.size.height
        : min(
          max(AppleMetrics.space160, layer.contentHeight),
          geometry.size.height - AppleMetrics.mobilePreviewTop)
      let resolvedHeight =
        layer.contentHeight == 0 && !layer.full
        ? geometry.size.height - AppleMetrics.mobilePreviewTop : height
      return MobileReader(
        workspace: workspace, cardID: layer.cardID, layer: layer,
        safeArea: geometry.safeAreaInsets, isTop: isTop, close: { presentation.closeTop() },
        openRelated: { id, full in
          if let card = workspace.card(id) { presentation.push(card, full: full) }
        }
      )
      .frame(width: geometry.size.width, height: resolvedHeight, alignment: .top)
      .background(AppleColors.card)
      .clipShape(
        UnevenRoundedRectangle(
          topLeadingRadius: layer.full ? 0 : AppleMetrics.sheetRadius,
          topTrailingRadius: layer.full ? 0 : AppleMetrics.sheetRadius)
      )
      .mobileShadow(.sheet)
      .offset(
        x: layer.drag.width,
        y: layer.shown ? layer.drag.height : geometry.size.height
      )
      .allowsHitTesting(isTop && !layer.leaving)
      .accessibilityHidden(!isTop || layer.leaving)
      .accessibilityAddTraits(.isModal)
      .overlay(alignment: .top) {
        if isTop, presentation.layers.count > 1, !layer.full, !layer.leaving {
          Button {
            presentation.closeTop()
          } label: {
            UnevenRoundedRectangle(
              topLeadingRadius: AppleMetrics.sheetRadius,
              topTrailingRadius: AppleMetrics.sheetRadius
            )
            .fill(AppleColors.readCard)
            .frame(height: AppleMetrics.space24)
            .padding(.horizontal, AppleMetrics.space14)
            .offset(y: -AppleMetrics.space14)
          }
          .buttonStyle(.plain)
          .accessibilityLabel(
            Copy.text("web.peekBack")
              + (workspace.card(presentation.layers[presentation.layers.count - 2].cardID)?.title
                ?? ""))
        }
      }
      .task {
        await Task.yield()
        presentation.reveal(layer)
      }
    }

    private func backdrop(_ layer: MobileReaderLayer, width: CGFloat) -> Double {
      if presentation.layers.count > 1 { return AppleMetrics.mobileBackdropOpacity }
      let travel = max(
        layer.drag.height / AppleMetrics.gestureDismissDistance,
        layer.drag.width / max(1, width))
      return layer.shown ? AppleMetrics.mobileBackdropOpacity * (1 - min(1, max(0, travel))) : 0
    }
  }
#endif
