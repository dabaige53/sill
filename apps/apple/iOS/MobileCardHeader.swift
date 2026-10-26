#if os(iOS)
  import SillKit
  import SwiftUI

  struct MobileCardMenuPresence: PreferenceKey {
    static let defaultValue = false
    static func reduce(value: inout Bool, nextValue: () -> Bool) { value = value || nextValue() }
  }

  /// Apply at a feed/search row boundary so a popup can cover neighboring cards.
  struct MobileCardMenuElevation: ViewModifier {
    @State private var open = false
    func body(content: Content) -> some View {
      content.onPreferenceChange(MobileCardMenuPresence.self) { open = $0 }
        .zIndex(open ? 1 : 0)
    }
  }

  struct MobileCardHeader: View {
    let card: MobileCard
    let text: String
    var trailing = ""
    var trailingColor = AppleColors.secondary
    var progress: Double = 0
    var scale: CGFloat = 1
    var strong = false

    var body: some View {
      HStack(spacing: AppleMetrics.space6) {
        MobileSourceMark(card: card)
        Text(text).lineLimit(1).frame(maxWidth: .infinity, alignment: .leading)
        if progress > 0 {
          MobileProgressRing(progress: progress).frame(
            width: AppleMetrics.space14, height: AppleMetrics.space14)
          Text("\(Int((progress * 100).rounded()))%").monospacedDigit()
        }
        if !trailing.isEmpty { Text(trailing).monospacedDigit().foregroundStyle(trailingColor) }
      }.font(MobileContentStyle.font(AppleMetrics.font12, scale: scale, strong: strong))
        .foregroundStyle(AppleColors.secondary).frame(minHeight: AppleMetrics.cardHeadHeight)
    }
  }

  struct MobileProgressRing: View {
    let progress: Double
    var body: some View {
      let width = AppleMetrics.space14 * AppleMetrics.moreStroke / AppleMetrics.space20
      ZStack {
        Circle().stroke(AppleColors.accent.opacity(0.14), lineWidth: width)
        Circle().trim(from: 0, to: min(1, max(0, progress)))
          .stroke(AppleColors.accent, style: StrokeStyle(lineWidth: width, lineCap: .round))
          .rotationEffect(.degrees(-90))
      }.accessibilityHidden(true)
    }
  }

  struct MobileAvatar: View {
    let name: String
    var size: CGFloat = AppleMetrics.avatarSize
    var body: some View {
      let tones = [
        AppleColors.fixedAvatar1, AppleColors.fixedAvatar2, AppleColors.fixedAvatar3,
        AppleColors.fixedAvatar4, AppleColors.fixedAvatar5, AppleColors.fixedAvatar6,
      ]
      let index = name.unicodeScalars.reduce(0) { $0 + Int($1.value) } % tones.count
      Circle().fill(tones[index]).frame(width: size, height: size)
        .overlay {
          Text(String(name.prefix(1))).font(
            .system(
              size: size <= AppleMetrics.avatarStackSize
                ? AppleMetrics.avatarStackFont : AppleMetrics.font12, weight: .semibold)
          )
          .foregroundStyle(AppleColors.fixedWhite)
        }.accessibilityHidden(true)
    }
  }

  struct MobileAvatars: View {
    let names: [String]
    var body: some View {
      HStack(spacing: -AppleMetrics.space6) {
        ForEach(Array(names.prefix(3).enumerated()), id: \.offset) { _, name in
          MobileAvatar(name: name, size: AppleMetrics.avatarStackSize)
            .overlay(Circle().strokeBorder(AppleColors.card, lineWidth: AppleMetrics.avatarBorder))
        }
      }
    }
  }

  struct MobileHighlightedText: View {
    let value: String
    let query: String
    var body: some View { Text(attributed) }
    private var attributed: AttributedString {
      var text = AttributedString(value)
      for token in query.split(whereSeparator: \.isWhitespace).filter({ !$0.hasPrefix("#") }) {
        var range = text.startIndex..<text.endIndex
        while let match = text[range].range(of: String(token), options: .caseInsensitive) {
          text[match].foregroundColor = AppleColors.primary
          text[match].inlinePresentationIntent = .stronglyEmphasized
          range = match.upperBound..<text.endIndex
        }
      }
      return text
    }
  }

  /// Publish only presses on an open area to the tile; a checklist/button press stays local.
  struct MobileCardOpenStyle: ButtonStyle {
    @Binding var pressed: Bool
    func makeBody(configuration: Configuration) -> some View {
      configuration.label.contentShape(Rectangle())
        .onChange(of: configuration.isPressed) { _, value in pressed = value }
        .onDisappear { pressed = false }
    }
  }

  struct MobileCheckButton: View {
    let done: Bool
    let label: String
    var reminder = false
    var textScale: CGFloat = 1
    var strong = false
    var rowHeight: CGFloat = AppleMetrics.hitTarget
    let action: () -> Void
    var body: some View {
      Button(action: action) {
        HStack(alignment: .center, spacing: AppleMetrics.space8) {
          MobileCheckCircle(done: done, reminder: reminder)
          if !reminder {
            Text(label).font(
              MobileContentStyle.font(AppleMetrics.font14, scale: textScale, strong: strong)
            )
            .foregroundStyle(done ? AppleColors.secondary : AppleColors.primary)
            .strikethrough(done).lineLimit(2).frame(maxWidth: .infinity, alignment: .leading)
          }
        }.frame(minWidth: reminder ? AppleMetrics.hitTarget : nil, minHeight: rowHeight)
          .contentShape(Rectangle())
      }.buttonStyle(MobileCheckStyle()).accessibilityLabel(label)
        .accessibilityValue(
          Copy.text(done ? "web.templates.f28461bb49c8" : "web.templates.6707de42c29d"))
    }
  }

  private struct MobileCheckPressKey: EnvironmentKey { static let defaultValue = false }
  extension EnvironmentValues {
    fileprivate var mobileCheckPressed: Bool {
      get { self[MobileCheckPressKey.self] }
      set { self[MobileCheckPressKey.self] = newValue }
    }
  }
  private struct MobileCheckStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
      configuration.label.environment(\.mobileCheckPressed, configuration.isPressed)
    }
  }
  private struct MobileCheckCircle: View {
    let done: Bool
    let reminder: Bool
    @Environment(\.mobileCheckPressed) private var pressed
    var body: some View {
      Circle().fill(done ? AppleColors.success : .clear)
        .overlay(
          Circle().stroke(
            done ? .clear : AppleColors.lineHover, lineWidth: AppleMetrics.reminderDotLine)
        )
        .overlay {
          if done {
            MobileIcon("check", size: AppleMetrics.space12).foregroundStyle(AppleColors.fixedWhite)
          }
        }
        .frame(width: AppleMetrics.reminderDotSize, height: AppleMetrics.reminderDotSize)
        .scaleEffect(pressed ? AppleMetrics.motionPressScale : 1)
        .animation(MobileMotion.press, value: pressed).animation(MobileMotion.state, value: done)
        .accessibilityHidden(true)
    }
  }
#endif
