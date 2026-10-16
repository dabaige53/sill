import AppKit

@MainActor final class AppDelegate: NSObject, NSApplicationDelegate {
  var model: Workspace?
  func applicationWillTerminate(_ notification: Notification) { model?.persistDraft() }
  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}
