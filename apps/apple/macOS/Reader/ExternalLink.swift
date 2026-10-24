import AppKit
import SillKit

/// One result for card actions, Markdown links and attachments.
@MainActor enum ExternalLink {
  @discardableResult static func open(_ url: URL, workspace: Workspace) -> Bool {
    guard ["https", "http", "mailto"].contains(url.scheme?.lowercased() ?? ""),
      NSWorkspace.shared.open(url)
    else {
      workspace.toast(Copy.text("web.agent.invalidLink"))
      return false
    }
    return true
  }
}
