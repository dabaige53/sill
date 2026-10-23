import AppKit
import Observation
import SillKit
import SwiftUI

@main struct SillApp: App {
  @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
  @State private var app = AppModel()

  var body: some Scene {
    Window(Copy.appleWindowTitle, id: "desktop") {
      RootView()
        .environment(app.workspace)
        .environment(app.account)
        .environment(app.feed)
        .environment(app.selection)
        .environment(app.reader)
        .environment(app.chrome)
        .environment(app.shell)
        .environment(app.interaction)
        .environment(app.ai)
        .environment(app.drag)
        .environment(app.menu)
        .environment(app.panels)
        .environment(app.newContent)
        .preferredColorScheme(app.workspace.preferences.colorScheme)
        .task { await app.account.start() }
        .onOpenURL { url in Task { await app.account.completeLogin(url) } }
        .onAppear {
          Keyboard.install()
          delegate.workspace = app.workspace
        }
    }
    .defaultSize(width: AppleMetrics.windowWidth, height: AppleMetrics.windowHeight)
    .windowStyle(.hiddenTitleBar)
    .commands { DesktopCommands(app: app) }
  }
}

/// Everything the window shares. Created once; each object is observed only where it is drawn.
@MainActor @Observable final class AppModel {
  let workspace: Workspace
  let account: Account
  var interaction: DesktopInteraction
  var feed: Feed
  var selection: Selection
  var reader: Reader
  var menu: CardMenu
  var chrome = Chrome()
  var shell = Shell()
  var ai = AIContext()
  var panels = Panels()
  var newContent = NewContent()
  var drag = CardDrag()

  init(workspace supplied: Workspace? = nil, accountService: (any CloudAccountService)? = nil) {
    if let root = ProcessInfo.processInfo.environment["SILL_PERF_OUTPUT"] {
      try? PerformanceTrace.shared.start(directory: URL(fileURLWithPath: root))
    }
    let workspace = supplied ?? Workspace(autoload: false)
    self.workspace = workspace
    account = Account(
      workspace: workspace, service: accountService ?? CloudBackend(cloud: CloudWorkspace()))
    let feed = Feed(workspace: workspace)
    let selection = Selection(workspace: workspace)
    let reader = Reader(workspace: workspace)
    let menu = CardMenu(workspace: workspace)
    let panels = Panels()
    let shell = Shell()
    let drag = CardDrag()
    self.feed = feed
    self.selection = selection
    self.reader = reader
    self.menu = menu
    self.panels = panels
    self.shell = shell
    self.drag = drag
    interaction = DesktopInteraction(
      panels: panels, reader: reader, shell: shell, menu: menu, drag: drag)
    workspace.sessionCleared = { [weak self] in self?.clearSurfaces() }
  }

  private func clearSurfaces() {
    reader.invalidateSession()
    drag.cancel()
    feed = Feed(workspace: workspace)
    selection = Selection(workspace: workspace)
    reader = Reader(workspace: workspace)
    menu = CardMenu(workspace: workspace)
    chrome = Chrome()
    shell = Shell()
    ai = AIContext()
    panels = Panels()
    newContent = NewContent()
    drag = CardDrag()
    interaction = DesktopInteraction(
      panels: panels, reader: reader, shell: shell, menu: menu, drag: drag)
  }
}

private struct RootView: View {
  @Environment(Workspace.self) private var workspace
  @Environment(Account.self) private var account
  var body: some View {
    switch workspace.phase {
    case .ready:
      if account.needsPasswordSetup { CloudLogin() } else { DesktopView() }
    case .connecting:
      AppleColors.canvas.ignoresSafeArea()
    case .signedOut:
      CloudLogin()
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
    CommandMenu(
      Copy.text(PerformanceTrace.shared.recording ? "apple.trace.active" : "apple.trace.menu")
    ) {
      Button(Copy.text("apple.trace.start")) { PerformanceTrace.shared.startFromMenu() }
        .disabled(PerformanceTrace.shared.recording || PerformanceTrace.shared.exporting)
      Button(Copy.text("apple.trace.mark")) { PerformanceTrace.shared.mark() }
        .disabled(!PerformanceTrace.shared.recording)
      Button(Copy.text("apple.trace.stop")) { PerformanceTrace.shared.exportFromMenu() }
        .disabled(!PerformanceTrace.shared.recording)
    }
    // Settings opens as a sheet in the window (Web `#modal.panel.wide`), not a window of its own.
    CommandGroup(replacing: .appSettings) {
      Button(Copy.appleSettingsMenu) { app.panels.open(.settings) }
        .keyboardShortcut(",")
        .disabled(app.workspace.phase != .ready || app.account.needsPasswordSetup)
    }
    CommandGroup(after: .newItem) {
      Button(Copy.appleRefresh) {
        app.workspace.refresh { done in if done { app.feed.refreshMembership(reorder: true) } }
      }
      .keyboardShortcut("r")
      .disabled(app.workspace.phase != .ready || app.account.needsPasswordSetup)
    }
    CommandGroup(after: .textEditing) {
      Button(Copy.appleSearch) { app.interaction.focusSearch() }
        .keyboardShortcut("k")
        .disabled(
          !app.interaction.canSearch || app.workspace.phase != .ready
            || app.account.needsPasswordSetup)
      Divider()
      ForEach(Scope.allCases, id: \.self) { scope in
        Button(scope.label) {
          app.shell.menu.close()
          app.feed.select(scope)
        }
        .keyboardShortcut(KeyEquivalent(scope.shortcut), modifiers: .command)
        .disabled(
          !app.interaction.canSearch || app.workspace.phase != .ready
            || app.account.needsPasswordSetup)
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
    guard PerformanceTrace.shared.stopForQuit() else { return .terminateCancel }
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
