import AppKit
import SillKit
import SwiftUI
import UniformTypeIdentifiers

/// Web `data`: where the workspace lives, how much it holds, export and clear.
struct DataPage: View {
  @Environment(Workspace.self) private var workspace
  @Environment(Account.self) private var account
  @State private var signingOut = false
  @State private var usage: Int?
  @State private var confirming = false
  @State private var clearing = false

  var body: some View {
    VStack(alignment: .leading, spacing: AppleMetrics.space16) {
      SettingsCard {
        SettingRow(label: Copy.text("web.settings.storage.location"), first: true) {
          Text(
            Copy.text(
              workspace.isLocal
                ? "web.settings.storage.localDirectory" : "web.settings.storage.cloudAccount"))
        }
        if workspace.isLocal {
          SettingRow(label: Copy.text("web.settings.storage.usage")) {
            Text(usage.map { Format.fileSize($0) } ?? "").font(.number(AppleMetrics.font13))
          }
        }
      }
      SettingsCard {
        SettingLine(first: true) {
          Button(Copy.text(workspace.isLocal ? "web.settings.exportAllCards" : "web.cloud.export"))
          { export() }
          .buttonStyle(TextLinkStyle(padded: false))
        }
        SettingLine {
          Button(Copy.text(workspace.isLocal ? "web.settings.clearAllData" : "web.cloud.clear")) {
            confirming = true
          }
          .buttonStyle(TextLinkStyle(warn: true, padded: false))
          .disabled(clearing)
        }
      }
      if !workspace.isLocal {
        BackupSettingsView().id(account.owner)
        SettingsCard {
          SettingLine(first: true) {
            Text(Copy.text("web.cloudentry.4cc5be794516"))
            Spacer(minLength: 0)
            Button(Copy.text("web.cloudentry.3ab8cc15939f")) { signingOut = true }
              .buttonStyle(TextLinkStyle(padded: false))
              .disabled(account.busy)
          }
        }
        if let error = account.error {
          Text(error).font(.sans(AppleMetrics.font13)).foregroundStyle(AppleColors.error)
        }
      }
    }
    .confirmationDialog(Copy.text("web.cloudentry.3ab8cc15939f"), isPresented: $signingOut) {
      Button(Copy.text("web.cloudentry.3ab8cc15939f"), role: .destructive) {
        Task { await account.logout() }
      }
      Button(Copy.text("web.cancel"), role: .cancel) {}
    }
    .task(id: workspace.catalogVersion) { if workspace.isLocal { await measure() } }
    .alert(Copy.text("web.app.7f1a78cdb3f2"), isPresented: $confirming) {
      Button(Copy.text("web.cancel"), role: .cancel) {}
      Button(Copy.text("web.app.bce2377283c2"), role: .destructive) {
        clearing = true
        workspace.clearAll { _ in clearing = false }
      }
    } message: {
      Text(Copy.text("web.app.d008fc7f75ba"))
    }
  }

  /// Web `Store.bytes`: the size of everything stored, as exported. Measured off the main thread.
  private func measure() async {
    let state = workspace.exportState()
    usage = await Task.detached(priority: .utility) { (try? state.encoded())?.count ?? 0 }.value
  }

  private func export() {
    let panel = NSSavePanel()
    panel.nameFieldStringValue = "sill-\(Self.day.string(from: .now)).json"
    panel.allowedContentTypes = [.json]
    let state = workspace.exportState()
    let write: (URL) -> Void = { [workspace] url in
      do {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        try encoder.encode(state).write(to: url, options: .atomic)
      } catch {
        workspace.notice = .init(text: Copy.appleExportError)
      }
    }
    if let window = NSApp.keyWindow {
      panel.beginSheetModal(for: window) { response in
        if response == .OK, let url = panel.url { write(url) }
      }
    } else if panel.runModal() == .OK, let url = panel.url {
      write(url)
    }
  }

  private static let day: DateFormatter = {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = TimeZone(identifier: "UTC")
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter
  }()
}
