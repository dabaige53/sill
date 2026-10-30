import SillKit
import SwiftUI

struct AboutSettingsView: View {
  private var version: String {
    Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
      ?? ProductInfo.version
  }

  var body: some View {
    VStack(alignment: .leading, spacing: AppleMetrics.space16) {
      HStack(spacing: AppleMetrics.space16) {
        BrandMark(size: AppleMetrics.space56)
        VStack(alignment: .leading, spacing: AppleMetrics.space6) {
          BrandWordmark(height: AppleMetrics.font22)
          Text(Copy.text("web.about.description"))
            .font(.sans(AppleMetrics.font13)).foregroundStyle(AppleColors.secondary)
        }
      }
      .padding(.bottom, AppleMetrics.space8)
      SettingsCard {
        SettingRow(label: Copy.text("web.about.version"), first: true) {
          Text(version).font(.number(AppleMetrics.font13)).textSelection(.enabled)
        }
        if let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String {
          SettingRow(label: Copy.text("web.about.build")) {
            Text(build).font(.number(AppleMetrics.font13)).textSelection(.enabled)
          }
        }
      }
      SettingsCard {
        ForEach(ProductInfo.links.indices, id: \.self) { index in
          let link = ProductInfo.links[index]
          if let url = URL(string: link.url) {
            Link(destination: url) {
              SettingLine(first: index == 0) {
                Icon(link.icon, size: AppleMetrics.font18).foregroundStyle(AppleColors.secondary)
                Text(Copy.text(link.key)).foregroundStyle(AppleColors.primary)
                Spacer(minLength: AppleMetrics.space12)
                Icon("external", size: AppleMetrics.font16).foregroundStyle(AppleColors.secondary)
              }
              .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
          }
        }
      }
    }
  }
}
