#if os(iOS)
  import SillKit
  import SwiftUI

  struct MobileCapture: View {
    let workspace: MobileWorkspace
    @Environment(\.dismiss) private var dismiss
    @State private var hasDraft = false
    @State private var discard = false
    var body: some View {
      VStack(spacing: AppleMetrics.space16) {
        HStack {
          Text(Copy.text("web.capture.title"))
            .font(.system(size: AppleMetrics.font22, weight: .bold))
          Spacer()
          MobileIconButton("x", label: Copy.text("web.close")) {
            if hasDraft { discard = true } else { dismiss() }
          }
        }
        MobileCaptureEditor(
          workspace: workspace, onSaved: { dismiss() }, onDraftChange: { hasDraft = $0 })
        Spacer(minLength: 0)
      }
      .padding(AppleMetrics.space16).background(AppleColors.canvas)
      .toolbar(.hidden, for: .navigationBar)
      .interactiveDismissDisabled(hasDraft || workspace.busy)
      .confirmationDialog(
        Copy.text("apple.discardConfirm"), isPresented: $discard, titleVisibility: .visible
      ) {
        Button(Copy.text("apple.discard"), role: .destructive) { dismiss() }
        Button(Copy.text("apple.continueEditing"), role: .cancel) {}
      }
    }
  }

  /// The same light capture field is used by the Add group and the quick-capture panel.
  struct MobileCaptureEditor: View {
    let workspace: MobileWorkspace
    var onSaved: (() -> Void)? = nil
    var onDraftChange: ((Bool) -> Void)? = nil
    @State private var text = ""
    @FocusState private var focused: Bool
    @Environment(\.openURL) private var openURL

    var body: some View {
      VStack(alignment: .leading, spacing: AppleMetrics.space12) {
        VStack(alignment: .leading, spacing: AppleMetrics.space4) {
          HStack(alignment: .top, spacing: AppleMetrics.space10) {
            MobileIcon("plus", size: AppleMetrics.font18)
              .foregroundStyle(AppleColors.secondary).padding(.top, AppleMetrics.space12)
            TextEditor(text: $text)
              .font(.system(size: AppleMetrics.font16))
              .scrollContentBackground(.hidden)
              .frame(
                minHeight: AppleMetrics.captureMinHeight, maxHeight: AppleMetrics.captureHeight
              )
              .focused($focused)
              .accessibilityLabel(Copy.text("web.capture.placeholder"))
              .overlay(alignment: .topLeading) {
                if text.isEmpty {
                  Text(Copy.text("web.capture.placeholder"))
                    .font(.system(size: AppleMetrics.font16))
                    .foregroundStyle(AppleColors.secondary)
                    .padding(.top, AppleMetrics.space8).padding(.leading, AppleMetrics.space4)
                    .allowsHitTesting(false)
                }
              }
          }
          HStack {
            Text(Copy.text("web.capture.shortcutHint"))
              .font(.system(size: AppleMetrics.font13)).foregroundStyle(AppleColors.secondary)
            Spacer()
            Button(Copy.text("web.capture.save"), action: save)
              .buttonStyle(MobileCommitStyle())
              .keyboardShortcut(.return, modifiers: .command)
              .disabled(
                workspace.busy || workspace.unresolvedWrite || text.count > 4000
                  || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
          }
        }
        .padding(AppleMetrics.space16)
        .background(
          AppleColors.card, in: RoundedRectangle(cornerRadius: AppleMetrics.settingsRadius)
        )
        .overlay(
          RoundedRectangle(cornerRadius: AppleMetrics.settingsRadius)
            .strokeBorder(AppleColors.lineCard, lineWidth: AppleMetrics.lineWidth / 2))
        if text.count > 4000 {
          Text(Copy.text("mobile.capture.limit")).font(.system(size: AppleMetrics.font13))
        }
        if let event = nextEvent { nextEventRow(event) }
        MobileError(workspace: workspace)
      }
      .onChange(of: text) { _, value in onDraftChange?(!value.isEmpty) }
      .task { focused = true }
    }

    private var nextEvent: MobileCard? {
      let now = Date().timeIntervalSince1970 * 1000
      return workspace.cards.filter {
        $0.type == "event" && !$0.archived && ($0.end ?? 0) > now
          && ($0.start ?? .infinity) - now < 3 * 3_600_000
      }.min { ($0.start ?? 0) < ($1.start ?? 0) }
    }
    private func nextEventRow(_ card: MobileCard) -> some View {
      return HStack(spacing: AppleMetrics.space12) {
        Text(MobileFormat.time(card.start ?? 0)).font(
          .system(size: AppleMetrics.font20, weight: .semibold, design: .rounded))
        VStack(alignment: .leading) {
          Text(card.title).font(.system(size: AppleMetrics.font14, weight: .medium)).lineLimit(1)
          Text(
            MobileFormat.eventRelative(
              start: card.start ?? 0, end: card.end ?? 0, now: MobileFormat.milliseconds())
          ).font(.system(size: AppleMetrics.font12)).foregroundStyle(AppleColors.accent)
        }.frame(maxWidth: .infinity, alignment: .leading)
        if MobileFormat.eventTimely(
          start: card.start ?? 0, end: card.end ?? 0, now: MobileFormat.milliseconds()),
          let url = MobileCard.safeURL(card.raw["meeting"]?["url"]?.string)
        {
          Button(Copy.text("web.actions.join")) { openURL(url) }
            .buttonStyle(MobileCommitStyle())
        }
      }
      .padding(.vertical, AppleMetrics.space12).padding(.horizontal, AppleMetrics.space14)
      .background(
        AppleColors.surface, in: RoundedRectangle(cornerRadius: AppleMetrics.nextEventRadius))
    }
    private func save() {
      guard !workspace.busy, !workspace.unresolvedWrite else { return }
      let submitted = text
      Task {
        if await workspace.capture(submitted), text == submitted {
          text = ""
          onSaved?()
        }
      }
    }
  }

  struct MobileCommitStyle: ButtonStyle {
    @Environment(\.isEnabled) private var enabled
    func makeBody(configuration: Configuration) -> some View {
      configuration.label.font(.system(size: AppleMetrics.font14, weight: .medium))
        .foregroundStyle(AppleColors.fixedWhite)
        .padding(.horizontal, AppleMetrics.space20)
        .frame(minHeight: AppleMetrics.hitTarget)
        .background(AppleColors.accentFill, in: Capsule())
        .opacity(enabled ? 1 : AppleMetrics.disabledOpacity)
        .scaleEffect(configuration.isPressed && enabled ? AppleMetrics.motionPressScale : 1)
        .animation(MobileMotion.press, value: configuration.isPressed)
    }
  }
#endif
