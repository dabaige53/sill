import AppKit
import SillKit
import SwiftUI

@main struct SillApp: App {
  @NSApplicationDelegateAdaptor(AppDelegate.self) var delegate
  @StateObject private var model = Workspace()
  var body: some Scene {
    Window(Copy.appleWindowTitle, id: "desktop") {
      Group {
        if model.ready && !model.needsPasswordSetup { Desktop() } else { CloudLogin() }
      }.environmentObject(model).onAppear { delegate.model = model }
        .onOpenURL { model.completeLogin($0) }
        .onReceive(Timer.publish(every: 5, on: .main, in: .common).autoconnect()) { _ in
          if NSApp.isActive && model.owner != nil && model.error == nil { model.refresh() }
        }
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
        }.keyboardShortcut("k")
      }
    }
  }
}
