import SillKit
import SwiftUI

/// Classic serif brand lettering, matching the Web wordmark.
struct BrandWordmark: View {
  var height: CGFloat = AppleMetrics.font34

  var body: some View {
    Text(verbatim: "Sill")
      .font(.custom("Georgia", fixedSize: height))
      .tracking(height * AppleMetrics.brandTracking)
      .foregroundStyle(AppleColors.primary)
  }
}
