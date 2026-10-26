#if os(iOS)
  import SillKit
  import SwiftUI
  import UIKit

  /// The same named covers and dominant colors as the Web; remote images share a decoded cache.
  struct MobileCoverImage: View {
    let source: String?
    var faded = false
    var contentMode: ContentMode = .fill
    var canvas: Color? = nil
    @State private var loaded: UIImage?

    var body: some View {
      GeometryReader { geometry in
        ZStack {
          canvas ?? MobileImageCache.tone(source)
          if let image = loaded ?? MobileImageCache.cached(source) {
            Image(uiImage: image).resizable().aspectRatio(contentMode: contentMode)
              .frame(width: geometry.size.width, height: geometry.size.height)
              .transition(.opacity)
          }
        }
        .frame(width: geometry.size.width, height: geometry.size.height)
        .clipped().saturation(faded ? AppleMetrics.readCoverSaturation : 1)
      }
      .accessibilityHidden(true)
      .task(id: source) {
        loaded = nil
        guard let source else { return }
        if let cached = MobileImageCache.cached(source) {
          loaded = cached
          return
        }
        guard let image = await MobileImageCache.load(source), !Task.isCancelled else { return }
        withAnimation(MobileMotion.fast) { loaded = image }
      }
    }
  }

  @MainActor private enum MobileImageCache {
    static let images = NSCache<NSString, UIImage>()
    static func cached(_ source: String?) -> UIImage? {
      source.flatMap { images.object(forKey: $0 as NSString) }
    }
    static func load(_ source: String) async -> UIImage? {
      if let image = cached(source) { return image }
      let image: UIImage?
      if ["architecture", "coast", "botanical", "mountain"].contains(source),
        let path = Bundle.module.url(forResource: source, withExtension: "png")
      {
        image = UIImage(contentsOfFile: path.path)
      } else if let url = MobileCard.safeURL(source) {
        guard let (data, response) = try? await URLSession.shared.data(from: url),
          let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode)
        else { return nil }
        image = UIImage(data: data)
      } else {
        image = nil
      }
      if let image { images.setObject(image, forKey: source as NSString) }
      return image
    }
    static func tone(_ source: String?) -> Color {
      switch source {
      case "architecture": AppleColors.fixedToneArchitecture
      case "coast": AppleColors.fixedToneCoast
      case "botanical": AppleColors.fixedToneBotanical
      case "mountain": AppleColors.fixedToneMountain
      default: AppleColors.surface
      }
    }
  }
#endif
