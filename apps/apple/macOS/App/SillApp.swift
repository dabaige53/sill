import AppKit
import SillKit
import SwiftUI

@main struct SillApp: App {
  @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
  @State private var app = AppModel()

  var body: some Scene {
    Window(Copy.appleWindowTitle, id: "desktop") {
      RootView()
        .environment(app.workspace)
        .environment(app.feed)
        .environment(app.selection)
        .environment(app.reader)
        .environment(app.chrome)
        .environment(app.shell)
        .environment(app.ai)
        .environment(app.drag)
        .environment(app.menu)
        .environment(app.panels)
        .environment(app.newContent)
        .preferredColorScheme(app.workspace.preferences.colorScheme)
        .onAppear {
          Keyboard.install()
          delegate.workspace = app.workspace
        }
    }
    .defaultSize(width: AppleMetrics.windowWidth, height: AppleMetrics.windowHeight)
    .windowStyle(.hiddenTitleBar)
    .commands { DesktopCommands(app: app) }
    Settings {
      SettingsView()
        .environment(app.workspace)
    }
    .windowResizability(.contentSize)
  }
}

/// Everything the window shares. Created once; each object is observed only where it is drawn.
@MainActor final class AppModel {
  let workspace: Workspace
  let feed: Feed
  let selection: Selection
  let reader: Reader
  let menu: CardMenu
  let chrome = Chrome()
  let shell = Shell()
  let ai = AIContext()
  let panels = Panels()
  let newContent = NewContent()
  let drag = CardDrag()

  init() {
    workspace = Workspace()
    feed = Feed(workspace: workspace)
    selection = Selection(workspace: workspace)
    reader = Reader(workspace: workspace)
    menu = CardMenu(workspace: workspace)
  }
}

private struct RootView: View {
  @Environment(Workspace.self) private var workspace
  var body: some View {
    switch workspace.phase {
    case .ready:
      DesktopView()
    case .connecting:
      AppleColors.canvas.ignoresSafeArea()
    case .signedOut:
      // Cloud sign-in arrives with the account group; local mode needs `--data-directory`.
      VStack(spacing: AppleMetrics.space16) {
        BrandMark()
        Text(verbatim: "Sill").font(.sans(AppleMetrics.font34, .bold))
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(AppleColors.canvas)
    case .unavailable(let message):
      VStack(spacing: AppleMetrics.space12) {
        Text(message).font(.sans(AppleMetrics.font15)).foregroundStyle(AppleColors.secondary)
          .multilineTextAlignment(.center)
        Button(Copy.appleRetry) { workspace.start() }.buttonStyle(TextLinkStyle())
      }
      .frame(maxWidth: AppleMetrics.emptyMaxWidth)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(AppleColors.canvas)
    }
  }
}

/// Menu commands. ⌘K search, ⌘1–5 tabs, ⌘R refresh. Disabled while the reader is open.
private struct DesktopCommands: Commands {
  let app: AppModel
  var body: some Commands {
    CommandGroup(after: .newItem) {
      Button(Copy.appleRefresh) {
        app.workspace.refresh { done in if done { app.feed.refreshMembership() } }
      }
      .keyboardShortcut("r")
    }
    CommandGroup(after: .textEditing) {
      Button(Copy.appleSearch) { app.shell.focusSearch() }
        .keyboardShortcut("k")
      Divider()
      ForEach(Scope.allCases, id: \.self) { scope in
        Button(scope.label) {
          app.shell.menu.close()
          app.feed.select(scope)
        }
        .keyboardShortcut(KeyEquivalent(scope.shortcut), modifiers: .command)
      }
    }
  }
}

/// Background records are written when the app leaves the front and before it quits.
@MainActor final class AppDelegate: NSObject, NSApplicationDelegate {
  weak var workspace: Workspace?

  func applicationDidResignActive(_ notification: Notification) {
    workspace?.recorder.flush()
  }

  func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
    guard let workspace, workspace.recorder.hasRecords || !workspace.queue.idle else {
      return .terminateNow
    }
    workspace.recorder.flush()
    // Wait for the queued writes, at most two seconds; quitting never waits on the network for long.
    Task {
      for _ in 0..<40 where !workspace.queue.idle {
        try? await Task.sleep(for: .milliseconds(50))
      }
      sender.reply(toApplicationShouldTerminate: true)
    }
    return .terminateLater
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}
