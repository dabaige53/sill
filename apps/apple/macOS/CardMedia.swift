import SillKit
import SwiftUI

struct CardMedia: View {
  let card: Card
  var detail = false
  var faded = false
  @State private var index = 0
  var images: [String] {
    if let photos = card.fields["photos"]?.strings, !photos.isEmpty { return photos }
    return card.fields["image"]?.string.map { [$0] } ?? []
  }
  var body: some View {
    if !images.isEmpty {
      if detail && card.type == "photo" {
        VStack(spacing: AppleMetrics.space16) {
          HStack {
            Text(
              [card.fields["location"]?.string, card.date("time").map(cardDay)].compactMap { $0 }
                .joined(separator: " · ")
            )
            .foregroundStyle(AppleColors.secondary).font(.system(size: AppleMetrics.font13))
            Spacer()
          }
          HStack(spacing: AppleMetrics.space12) {
            if images.count > 1 { photoStep("back", -1, "web.panels.bcf200709dbc") }
            Image(images[min(index, images.count - 1)], bundle: .module).resizable().scaledToFit()
              .frame(maxWidth: .infinity, maxHeight: AppleMetrics.coverHeight * 2)
            if images.count > 1 { photoStep("arrow", 1, "web.panels.dcd4eb027369") }
          }
          HStack(spacing: AppleMetrics.space8) {
            ForEach(Array(images.enumerated()), id: \.offset) { number, name in
              Button {
                index = number
              } label: {
                Image(name, bundle: .module).resizable().scaledToFill()
                  .frame(width: AppleMetrics.hitTarget, height: AppleMetrics.hitTarget).clipped()
                  .clipShape(RoundedRectangle(cornerRadius: AppleMetrics.space8))
                  .overlay(
                    RoundedRectangle(cornerRadius: AppleMetrics.space8).strokeBorder(
                      number == index ? AppleColors.primary : .clear, lineWidth: 2))
              }.buttonStyle(.plain).accessibilityLabel(
                Copy.text("web.panels.9552fe3bd366") + "\(number + 1)"
                  + Copy.text("web.panels.e9e0fdc242b4"))
            }
          }
        }
      } else {
        GeometryReader { geometry in
          ZStack(alignment: .bottom) {
            if card.type == "photo" && images.count >= 3 {
              HStack(spacing: 2) {
                picture(
                  images[0], width: geometry.size.width * 2 / 3 - 1, height: geometry.size.height)
                VStack(spacing: 2) {
                  picture(
                    images[1], width: geometry.size.width / 3 - 1,
                    height: geometry.size.height / 2 - 1)
                  picture(
                    images[2], width: geometry.size.width / 3 - 1,
                    height: geometry.size.height / 2 - 1)
                }
              }
            } else {
              HStack(spacing: 2) {
                ForEach(
                  Array(images.prefix(card.type == "photo" ? 2 : 1).enumerated()), id: \.offset
                ) { _, name in
                  picture(
                    name,
                    width: (geometry.size.width
                      - (card.type == "photo" && images.count > 1 ? 2 : 0))
                      / CGFloat(card.type == "photo" ? min(2, images.count) : 1),
                    height: geometry.size.height)
                }
              }
            }
            if card.type == "media" && card.fields["media"]?.string != "podcast" {
              HStack {
                NativeIcon(name: "play", size: AppleMetrics.font18).frame(
                  width: AppleMetrics.hitTarget, height: AppleMetrics.hitTarget
                ).background(AppleColors.card.opacity(0.82), in: Circle())
                Spacer()
                if let seconds = card.fields["duration"]?.number {
                  Text(cardDuration(seconds)).font(
                    .system(size: AppleMetrics.font12, design: .rounded)
                  ).foregroundStyle(.white).padding(.horizontal, AppleMetrics.space8).padding(
                    .vertical, 2
                  ).background(
                    .black.opacity(0.55), in: RoundedRectangle(cornerRadius: AppleMetrics.space8))
                }
              }.padding(AppleMetrics.space12)
            }
          }
        }.aspectRatio(16 / 9, contentMode: .fit)
          .clipShape(RoundedRectangle(cornerRadius: AppleMetrics.coverRadius))
          .saturation(faded ? 0.6 : 1).accessibilityLabel(card.title)
      }
    }
  }
  private func picture(_ name: String, width: CGFloat, height: CGFloat) -> some View {
    Image(name, bundle: .module).resizable().scaledToFill().frame(width: width, height: height)
      .clipped()
  }
  private func photoStep(_ name: String, _ delta: Int, _ label: String) -> some View {
    Button {
      index = (index + delta + images.count) % images.count
    } label: {
      NativeIcon(name: name, size: AppleMetrics.font20).frame(
        width: AppleMetrics.hitTarget, height: AppleMetrics.hitTarget)
    }
    .buttonStyle(.plain).accessibilityLabel(Copy.text(label))
  }
}
