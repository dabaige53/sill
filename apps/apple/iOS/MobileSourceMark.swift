#if os(iOS)
  import SillKit
  import SwiftUI

  private struct MobileSourceBrand: Decodable, Sendable {
    let names: [String]
    let kinds: [String]
    let path: String
    static let brands =
      (try? JSONDecoder().decode(
        [String: Self].self, from: Data(SourceMarkData.json.utf8))) ?? [:]
    static func matching(name: String, kind: String) -> Self? {
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
  struct MobileSourceMark: View {
    let card: MobileCard
    var size: CGFloat = AppleMetrics.space16

    var body: some View {
      let sources = Array((card.raw["sources"]?.array ?? []).prefix(3))
      Group {
        if sources.isEmpty || (card.type == "note" && card.sourceKind == "capture") {
          MobileIcon(MobileCardTile.icon(card.type), size: size)
        } else {
          HStack(spacing: -AppleMetrics.space6) {
            ForEach(Array(sources.enumerated()), id: \.offset) { _, source in
              mark(name: source["name"]?.string ?? "", kind: source["kind"]?.string ?? "local")
            }
          }
        }
      }.accessibilityHidden(true)
    }

    @ViewBuilder private func mark(name: String, kind: String) -> some View {
      let brand = MobileSourceBrand.matching(name: name, kind: kind)
      if brand == nil
        && ["task", "event", "reminder", "digest", "photo", "file"].contains(card.type)
      {
        MobileIcon(MobileCardTile.icon(card.type), size: size)
      } else {
        Group {
          if let brand {
            MobileSourceShape(data: brand.path).fill(AppleColors.primary)
              .frame(width: size, height: size)
          } else {
            MobileIcon(Self.kindIcon(kind), size: size).foregroundStyle(AppleColors.primary)
          }
        }.frame(width: size + AppleMetrics.space4, height: size + AppleMetrics.space4)
          .background(AppleColors.surface, in: Circle())
      }
    }
    private static func kindIcon(_ kind: String) -> String {
      switch kind {
      case "rss": "rss"
      case "readwise": "book"
      case "web": "globe"
      case "youtube": "video"
      case "twitter": "chat"
      case "podcast": "mic"
      case "mail": "mail"
      case "reminders": "check-circle"
      case "linear": "target"
      case "github": "pull"
      case "calendar": "calendar"
      case "photos": "image"
      case "folder": "folder"
      case "capture", "markdown", "local": "note"
      case "agent": "sparkles"
      default: "link"
      }
    }
  }

  private struct MobileSourceShape: Shape {
    let data: String
    func path(in rect: CGRect) -> Path {
      SVGPathParser(data).path()
        .applying(CGAffineTransform(scaleX: rect.width / 24, y: rect.height / 24))
    }
  }
#endif
