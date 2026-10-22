import SillKit
import SwiftUI

struct MediaChapters: View {
  let chapters: [CardRichFields.Chapter]
  let duration: Double
  let position: Double
  let seek: (Double) -> Void
  var body: some View {
    VStack(spacing: AppleMetrics.space8) {
      GeometryReader { geometry in
        HStack(spacing: AppleMetrics.space3) {
          if chapters.isEmpty {
            Capsule().fill(AppleColors.surface)
          } else {
            ForEach(Array(chapters.enumerated()), id: \.offset) { index, chapter in
              let end = index + 1 < chapters.count ? chapters[index + 1].start : duration
              let length = max(1, end - chapter.start)
              let fraction = max(0, min(1, (position - chapter.start) / length))
              let width = max(
                AppleMetrics.space3,
                (geometry.size.width - CGFloat(chapters.count - 1) * AppleMetrics.space3)
                  * length / max(1, duration))
              Button {
                seek(chapter.start)
              } label: {
                ZStack(alignment: .leading) {
                  Rectangle().fill(AppleColors.surface)
                  Rectangle().fill(AppleColors.accent).frame(width: width * fraction)
                }.frame(width: width).clipShape(Capsule())
              }.buttonStyle(.plain).disabled(duration <= 0)
                .accessibilityLabel(chapter.title).help(chapter.title)
            }
          }
        }
      }.frame(height: AppleMetrics.space4)
      HStack(spacing: AppleMetrics.space6) {
        Icon("list", size: AppleMetrics.font14)
        Text(
          chapters.last(where: { $0.start <= position })?.title
            ?? Copy.text("web.media.emptyChapters"))
        Spacer(minLength: 0)
        Text(
          "\(Format.duration(Int(position))) / \(duration > 0 ? Format.duration(Int(duration)) : Copy.text("web.media.unknownDuration"))"
        )
        .font(.number(AppleMetrics.font12))
      }.font(.sans(AppleMetrics.font12)).foregroundStyle(AppleColors.secondary)
    }
  }
}
