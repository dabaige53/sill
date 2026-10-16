import SillKit
import SwiftUI

@main struct SillApp: App {
  @NSApplicationDelegateAdaptor(AppDelegate.self) var delegate
  @StateObject private var model = Workspace()
  var body: some Scene {
    Window(Copy.appleWindowTitle, id: "desktop") {
      Desktop().environmentObject(model).onAppear { delegate.model = model }
    }.defaultSize(width: AppleMetrics.windowWidth, height: AppleMetrics.windowHeight).windowStyle(
      .hiddenTitleBar
    )
    .commands {
      CommandGroup(replacing: .newItem) {
        Button(Copy.appleNewNote) { model.edit() }.keyboardShortcut("n").disabled(!model.ready)
      }
      CommandGroup(after: .newItem) {
        Button(Copy.appleRefresh) { model.refresh() }.keyboardShortcut("r")
      }
      CommandGroup(after: .textEditing) {
        Button(Copy.appleSearch) {
          model.searchPresented = true
          model.searchFocusRequest += 1
        }.keyboardShortcut("f")
      }
    }
  }
}
