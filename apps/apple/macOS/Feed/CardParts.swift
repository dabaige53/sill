import SillKit
import SwiftUI

/// Values every card in the feed shares. A plain value: changing one redraws the cards that use it.
struct CardContext: Equatable {
  var now: Double
  var query = ""
  var fadeRead = true
  var summaryLines = 3
  /// Shown in an open stack: summary hidden, tighter padding.
  var compact = false
}

/// Intents a card can raise. Not observable: holding it never redraws anything.
/// Set once on the main actor before any view reads it.
final class CardIntents: @unchecked Sendable {
  var open: @MainActor (String) -> Void = { _ in }
  var toggleTask: @MainActor (String, String) -> Void = { _, _ in }
  var reminder: @MainActor (String, Workspace.ReminderAction) -> Void = { _, _ in }
  var join: @MainActor (String) -> Void = { _ in }
  var openStack: @MainActor (String) -> Void = { _ in }
  var closeStack: @MainActor (String) -> Void = { _ in }
  var menu: @MainActor (String) -> Void = { _ in }
  var select: @MainActor (String) -> Void = { _ in }
  var beginDrag: @MainActor (String) -> Void = { _ in }
}

private struct CardIntentsKey: EnvironmentKey {
  static let defaultValue = CardIntents()
}

extension EnvironmentValues {
  var cardIntents: CardIntents {
    get { self[CardIntentsKey.self] }
    set { self[CardIntentsKey.self] = newValue }
  }
}

/// head: source icon · source · meta, with one timely value on the right.
struct CardHead<Right: View>: View {
  let icon: AnyView
  let text: String
  var reserveMore = true
  @ViewBuilder var right: Right

  init(
    card: CardModel, text: String, reserveMore: Bool = true,
    @ViewBuilder right: () -> Right = { EmptyView() }
  ) {
    self.icon = AnyView(SourceIcon(card: card))
    self.text = text
    self.reserveMore = reserveMore
    self.right = right()
  }

  var body: some View {
    HStack(spacing: AppleMetrics.space6) {
      icon.foregroundStyle(AppleColors.iconSecondary)
      Text(text).lineLimit(1).truncationMode(.tail)
        .foregroundStyle(AppleColors.secondary)
      Spacer(minLength: 0)
      right
    }
    .font(.sans(AppleMetrics.font13))
    .frame(minHeight: AppleMetrics.cardHeadHeight)
    // The more button's slot stays free; covers carry it over the image instead.
    .padding(.trailing, reserveMore ? AppleMetrics.space30 : 0)
  }
}

struct SourceIcon: View {
  let card: CardModel
  var size: CGFloat = AppleMetrics.space16
  var body: some View {
    if card.sources.count > 1 {
      HStack(spacing: -AppleMetrics.space6) {
        ForEach(Array(card.sources.prefix(3).enumerated()), id: \.offset) { _, source in
          Icon(SourceKind.icon(source.kind) ?? "book", size: AppleMetrics.font12)
            .frame(width: AppleMetrics.sourceDisc, height: AppleMetrics.sourceDisc)
            .background(Circle().fill(AppleColors.card))
            .overlay(Circle().stroke(AppleColors.line, lineWidth: AppleMetrics.lineWidth))
        }
      }
      .accessibilityHidden(true)
    } else {
      Icon(card.headIcon, size: size)
    }
  }
}

struct CardTitle: View {
  let text: String
  var faded = false
  var query = ""
  var lines = 2
  var body: some View {
    Highlighted(text: text, query: query)
      .textStyle(
        AppleMetrics.font17, .semibold, leading: AppleMetrics.cardTitleLeading,
        tracking: AppleMetrics.cardTitleTracking
      )
      .foregroundStyle(faded ? AppleColors.secondary : AppleColors.primary)
      .lineLimit(lines)
      .frame(maxWidth: .infinity, alignment: .leading)
      .fixedSize(horizontal: false, vertical: true)
  }
}

struct CardSummary: View {
  let text: String
  var lines: Int
  var query = ""
  var indent: CGFloat = 0
  var body: some View {
    Highlighted(text: text, query: query)
      .textStyle(AppleMetrics.font15, leading: AppleMetrics.summaryLeading)
      .foregroundStyle(AppleColors.secondary)
      .lineLimit(lines)
      .frame(maxWidth: .infinity, alignment: .leading)
      .fixedSize(horizontal: false, vertical: true)
      .padding(.leading, indent)
  }
}

/// Summary, or a one-line conclusion with up to three numbered points.
struct SummaryBlock: View {
  let summary: String
  let points: [String]
  var lines: Int
  var query = ""
  var body: some View {
    if !points.isEmpty {
      VStack(alignment: .leading, spacing: AppleMetrics.space8) {
        if !summary.isEmpty { CardSummary(text: summary, lines: 2, query: query) }
        KeyPoints(points: Array(points.prefix(3)), singleLine: true)
          .padding(.top, AppleMetrics.space2)
      }
    } else if !summary.isEmpty {
      CardSummary(text: summary, lines: lines, query: query)
    }
  }
}

struct KeyPoints: View {
  let points: [String]
  var singleLine = false
  var body: some View {
    VStack(alignment: .leading, spacing: AppleMetrics.space4) {
      ForEach(Array(points.enumerated()), id: \.offset) { index, point in
        HStack(alignment: .firstTextBaseline, spacing: AppleMetrics.space10) {
          Text("\(index + 1)").font(.number(AppleMetrics.font13, .semibold))
            .foregroundStyle(AppleColors.accent)
            .frame(width: AppleMetrics.keyPointWidth, alignment: .trailing)
          Text(point).textStyle(AppleMetrics.font15, leading: AppleMetrics.summaryLeading)
            .foregroundStyle(AppleColors.primary)
            .lineLimit(singleLine ? 1 : nil)
            .fixedSize(horizontal: false, vertical: !singleLine)
        }
      }
    }
  }
}

/// Search hits in bold, without a background (interaction.md).
struct Highlighted: View {
  let text: String
  let query: String
  var body: some View {
    if query.isEmpty {
      Text(text)
    } else {
      Text(Self.attributed(text, query))
    }
  }
  static func attributed(_ text: String, _ query: String) -> AttributedString {
    var value = AttributedString(text)
    guard let range = text.range(of: query, options: [.caseInsensitive]) else { return value }
    let lower = text.distance(from: text.startIndex, to: range.lowerBound)
    let length = text.distance(from: range.lowerBound, to: range.upperBound)
    let start = value.index(value.startIndex, offsetByCharacters: lower)
    let end = value.index(start, offsetByCharacters: length)
    value[start..<end].inlinePresentationIntent = .stronglyEmphasized
    return value
  }
}

/// The task and reminder circle: accent outline, filled with a white check when done.
struct CheckDot: View {
  var done: Bool
  var size: CGFloat = AppleMetrics.taskDotSize
  var line: CGFloat = AppleMetrics.taskDotLine
  var highlighted = false
  var body: some View {
    ZStack {
      Circle().fill(
        done ? AppleColors.accentFill : highlighted ? AppleColors.accentSoft : Color.clear)
      Circle().strokeBorder(AppleColors.accent, lineWidth: line)
      if done {
        Icon("check", size: AppleMetrics.font12).foregroundStyle(AppleColors.fixedWhite)
      }
    }
    .frame(width: size, height: size)
    .animation(Motion.state, value: done)
  }
}

/// Progress ring with percentage, for unfinished reading.
struct ProgressRing: View {
  let progress: Double
  var size: CGFloat = AppleMetrics.space14
  // The Web ring: a 20-unit box, radius 8, stroke 2.4, track at 14% of the color.
  private static let box: CGFloat = 20
  private static let stroke: CGFloat = 2.4
  private static let track = 0.14
  var body: some View {
    let width = size * Self.stroke / Self.box
    ZStack {
      Circle().stroke(lineWidth: width).opacity(Self.track)
      Circle().trim(from: 0, to: max(0, min(1, progress)))
        .stroke(style: StrokeStyle(lineWidth: width, lineCap: .round))
        .rotationEffect(.degrees(-90))
    }
    .padding(size * (Self.box / 2 - 8) / Self.box)
    .frame(width: size, height: size)
    .accessibilityElement()
    .accessibilityLabel(Copy.text("web.primitives.8bf1d0b76278"))
    .accessibilityValue("\(Int((progress * 100).rounded()))%")
  }
}

struct CoverImage: View {
  let name: String?
  var faded = false
  @State private var shown = false
  var body: some View {
    let image = name.flatMap(Cover.image)
    ZStack {
      Cover.tone(name)
      if let image {
        Image(nsImage: image).resizable().scaledToFill()
          .saturation(faded ? 0.6 : 1)
          .animation(Motion.read, value: faded)
      }
    }
    .clipped()
    .accessibilityHidden(true)
  }
}

struct FileRow: View {
  let name: String
  var image = false
  var body: some View {
    HStack(spacing: AppleMetrics.space8) {
      Icon(image ? "image" : "file", size: AppleMetrics.font15)
        .foregroundStyle(AppleColors.iconSecondary)
      Text(name).lineLimit(1).truncationMode(.tail)
    }
    .font(.sans(AppleMetrics.font13))
    .foregroundStyle(AppleColors.primary)
    .frame(minHeight: AppleMetrics.fileRowHeight, alignment: .leading)
  }
}

/// 另有 N 项 / 另有 N 个
struct MoreItems: View {
  let count: Int
  let suffix: String
  var indent: CGFloat = AppleMetrics.space30
  var body: some View {
    Text("\(Copy.text("web.templates.dff74742a6f0"))\(count)\(suffix)")
      .font(.sans(AppleMetrics.font13))
      .foregroundStyle(AppleColors.secondary)
      .padding(.leading, indent)
  }
}

struct Avatars: View {
  let names: [String]
  var body: some View {
    HStack(spacing: -AppleMetrics.space6) {
      ForEach(Array(names.enumerated()), id: \.offset) { _, name in
        Avatar(name: name, size: AppleMetrics.avatarStackSize)
          .overlay(Circle().stroke(AppleColors.card, lineWidth: AppleMetrics.avatarBorder))
      }
    }
    .accessibilityElement()
    .accessibilityLabel("\(names.count)\(Copy.text("web.primitives.0b27068f8071"))")
  }
}
