import SillKit
import SillMobile
import SwiftUI

@main
struct SillMobileApp: App {
  var body: some Scene {
    WindowGroup {
      #if DEBUG
        SillMobileRootView(cloud: MobileUITestFixture.cloud() ?? CloudWorkspace())
      #else
        SillMobileRootView()
      #endif
    }
  }
}
