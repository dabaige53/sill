import AppKit
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
            if images.count > 1 { photoStep("back", -1, "web.photo.previous") }
            NativeArtwork(name: images[min(index, images.count - 1)], fit: true)
              .id(images[min(index, images.count - 1)]).transition(NativeMotion.fade)
              .frame(maxWidth: .infinity, minHeight: AppleMetrics.coverHeight, maxHeight: .infinity)
            if images.count > 1 { photoStep("arrow", 1, "web.photo.next") }
          }
          HStack(spacing: AppleMetrics.space8) {
            ForEach(Array(images.enumerated()), id: \.offset) { number, name in
              Button {
                index = number
              } label: {
                NativeArtwork(name: name)
                  .frame(width: AppleMetrics.hitTarget, height: AppleMetrics.hitTarget).clipped()
                  .clipShape(RoundedRectangle(cornerRadius: AppleMetrics.space8))
                  .overlay(
                    RoundedRectangle(cornerRadius: AppleMetrics.space8).strokeBorder(
                      number == index ? AppleColors.primary : .clear, lineWidth: 2))
              }.buttonStyle(.plain).accessibilityLabel(
                Copy.text("web.photo.indexPrefix") + "\(number + 1)"
                  + Copy.text("web.common.cardCountSuffix"))
            }
          }
        }.animation(NativeMotion.ease(AppleMetrics.motionFast), value: index)
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
          }
        }.aspectRatio(16 / 9, contentMode: .fit)
          .overlay(alignment: .bottomTrailing) {
            if card.type == "media", card.fields["media"]?.string != "podcast",
              let duration = card.mediaDurationText
            {
              Text(duration).font(.system(size: AppleMetrics.font12, design: .rounded))
                .foregroundStyle(.white).padding(.horizontal, AppleMetrics.space6)
                .padding(.vertical, AppleMetrics.space4)
                .background(
                  .black.opacity(0.65), in: RoundedRectangle(cornerRadius: AppleMetrics.space6)
                )
                .padding(AppleMetrics.space10)
            }
          }
          .clipShape(RoundedRectangle(cornerRadius: AppleMetrics.coverRadius))
          .saturation(faded ? 0.6 : 1).accessibilityLabel(card.title)
      }
    }
  }
  private func picture(_ name: String, width: CGFloat, height: CGFloat) -> some View {
    NativeArtwork(name: name).frame(width: width, height: height)
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

/// Cached artwork appears immediately; newly decoded artwork fades over its placeholder.
struct NativeArtwork: View {
  let name: String
  var fit = false
  @State private var loaded: NSImage?
  @State private var opacity = 0.0
  @State private var placeholder = AppleColors.surface
  private var cached: NSImage? {
    ArtworkCache.packaged[name] ?? ArtworkCache.remote.object(forKey: name as NSString)
  }
  var body: some View {
    GeometryReader { geometry in
      ZStack {
        if !fit { placeholder }
        if let image = loaded ?? cached {
          Image(nsImage: image).resizable().aspectRatio(contentMode: fit ? .fit : .fill)
            .frame(width: geometry.size.width, height: geometry.size.height)
            .opacity(loaded == nil && cached != nil ? 1 : opacity)
        } else {
          NativeIcon(name: "image", size: AppleMetrics.space24).foregroundStyle(
            AppleColors.secondary)
        }
      }
    }.clipped().task(id: name) {
      loaded = nil
      opacity = 0
      placeholder = AppleColors.surface
      if cached != nil {
        opacity = 1
        return
      }
      guard let url = URL(string: name), ["https", "http"].contains(url.scheme ?? "") else {
        return
      }
      do {
        let (data, response) = try await URLSession.shared.data(from: url)
        guard !Task.isCancelled, (response as? HTTPURLResponse)?.statusCode == 200,
          let image = NSImage(data: data)
        else { return }
        loaded = image
        placeholder = Self.dominantColor(image)
        ArtworkCache.remote.setObject(image, forKey: name as NSString)
        await Task.yield()
        guard !Task.isCancelled else { return }
        withAnimation(NativeMotion.ease(AppleMetrics.motionFast)) { opacity = 1 }
      } catch { return }
    }
  }

  private static func dominantColor(_ image: NSImage) -> Color {
    guard let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
      return AppleColors.surface
    }
    let bitmap = NSBitmapImageRep(cgImage: cgImage)
    var red = 0.0
    var green = 0.0
    var blue = 0.0
    var weight = 0.0
    // A small fixed sample grid is enough for the temporary color behind the decoded image.
    for y in stride(from: 0, to: bitmap.pixelsHigh, by: max(1, bitmap.pixelsHigh / 16)) {
      for x in stride(from: 0, to: bitmap.pixelsWide, by: max(1, bitmap.pixelsWide / 16)) {
        guard let color = bitmap.colorAt(x: x, y: y)?.usingColorSpace(.deviceRGB) else { continue }
        red += color.redComponent * color.alphaComponent
        green += color.greenComponent * color.alphaComponent
        blue += color.blueComponent * color.alphaComponent
        weight += color.alphaComponent
      }
    }
    return weight > 0
      ? Color(red: red / weight, green: green / weight, blue: blue / weight) : AppleColors.surface
  }
}

@MainActor private enum ArtworkCache {
  static let remote = NSCache<NSString, NSImage>()
  static let packaged: [String: NSImage] = {
    let urls = Bundle.module.urls(forResourcesWithExtension: "png", subdirectory: nil) ?? []
    return Dictionary(
      uniqueKeysWithValues: urls.compactMap { url in
        NSImage(contentsOf: url).map { (url.deletingPathExtension().lastPathComponent, $0) }
      })
  }()
}
