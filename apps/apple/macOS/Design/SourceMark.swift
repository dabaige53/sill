import SillKit
import SwiftUI

struct SourceBrand: Decodable, Sendable {
  let names: [String]
  let kinds: [String]
  let path: String

  private static let brands =
    (try? JSONDecoder().decode(
      [String: SourceBrand].self, from: Data(SourceMarkData.json.utf8))) ?? [:]

  static func matching(name: String, kind: String) -> SourceBrand? {
    let name = name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    return brands.sorted { $0.key < $1.key }.first { _, brand in
      brand.kinds.contains(kind.lowercased())
        || brand.names.contains { alias in
          let label = alias.lowercased()
          return name == label || name.hasPrefix(label + " · ")
        }
    }?.value
  }
}

/// @design source-marks
struct SourceMark: View {
  let name: String
  let kind: String
  var typeIcon: String? = nil
  var size: CGFloat = AppleMetrics.space16

  var body: some View {
    let brand = SourceBrand.matching(name: name, kind: kind)
    if brand == nil, let typeIcon {
      Icon(typeIcon, size: size)
    } else {
      Group {
        if let brand {
          SourceBrandShape(data: brand.path).fill(AppleColors.primary)
            .frame(width: size, height: size)
        } else {
          Icon(SourceKind.icon(kind) ?? "link", size: size)
            .foregroundStyle(AppleColors.primary)
        }
      }
      .frame(width: size + AppleMetrics.space4, height: size + AppleMetrics.space4)
      .background(Circle().fill(AppleColors.surface))
    }
  }
}

private struct SourceBrandShape: Shape {
  let data: String
  func path(in rect: CGRect) -> Path {
    SVGPathParser(data).path()
      .applying(CGAffineTransform(scaleX: rect.width / 24, y: rect.height / 24))
  }
}
