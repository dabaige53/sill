#if os(iOS)
import SillKit
import SwiftUI
import UniformTypeIdentifiers

struct MobileSettings: View {
  let workspace: MobileWorkspace
  @Environment(\.dismiss) private var dismiss
  @State private var reminders = MobileReminders.shared
  @State private var backups = MobileBackups()
  @State private var exporting = false
  @State private var capturing = false
  @State private var confirmingResolution = false
  @State private var document = MobileJSONDocument(data: Data())
  @State private var confirmingClear = false
  @State private var confirmingLogout = false
  @State private var clearRevision = 0

  private var writesBlocked: Bool {
    workspace.busy || workspace.unresolvedWrite || backups.busy || backups.pending
  }

  var body: some View {
    Form {
      Section(Copy.text("web.settings.add")) {
        Button(Copy.text("web.capture.title")) { capturing = true }.disabled(writesBlocked)
      }
      Section(Copy.text("web.settings.appearance")) {
        preference("theme", label: "web.settings.theme.label", options: ["system", "light", "dark"], prefix: "web.settings.theme.", fallback: "system")
        Toggle(Copy.text("web.settings.fadeRead"), isOn: boolean("fadeRead", fallback: true)).disabled(writesBlocked)
        preference("textWeight", label: "web.settings.layout.textWeight", options: ["standard", "strong"])
      }
      Section(Copy.text("web.settings.layout.cards")) {
        preference("cardTextSize", label: "web.settings.layout.cardTextSize", options: ["small", "standard", "large"])
        preference("cardSpacing", label: "web.settings.layout.cardSpacing", options: ["compact", "standard", "roomy"])
        preference("cardPadding", label: "web.settings.layout.cardPadding", options: ["compact", "standard", "roomy"])
      }
      Section(Copy.text("web.settings.layout.reading")) {
        preference("readerTextSize", label: "web.settings.layout.readerTextSize", options: ["small", "standard", "large"])
        preference("readerSpacing", label: "web.settings.layout.readerSpacing", options: ["compact", "standard", "roomy"])
        preference("readerWidth", label: "web.settings.layout.readerWidth", options: ["narrow", "standard", "full"], fallback: "full")
        Button(Copy.text("web.settings.layout.reset")) {
          Task {
            _ = await workspace.updatePreferences([
              "cardTextSize": .string("standard"), "cardSpacing": .string("standard"),
              "cardPadding": .string("standard"), "readerTextSize": .string("standard"),
              "readerSpacing": .string("standard"), "readerWidth": .string("full"),
              "textWeight": .string("standard"),
            ])
          }
        }
      }.disabled(writesBlocked)
      Section {
        Toggle(Copy.text("reminders.title"), isOn: Binding(
          get: { reminders.enabled },
          set: { value in Task { await reminders.setEnabled(value, workspace: workspace) } }
        )).disabled(reminders.busy || workspace.busy)
        if let message = reminders.message { Text(message).foregroundStyle(AppleColors.error) }
        if reminders.remaining > 0 {
          Text(Copy.text("mobile.reminders.capacity")
            .replacingOccurrences(of: "{scheduled}", with: String(reminders.scheduled))
            .replacingOccurrences(of: "{remaining}", with: String(reminders.remaining)))
        }
      } footer: {
        Text(Copy.text("mobile.reminders.hint"))
      }
      Section(Copy.text("apple.data")) {
        LabeledContent(Copy.text("web.settings.storage.location"), value: Copy.text("web.settings.storage.cloudAccount"))
        Button(Copy.text("web.settings.exportAllCards")) { export() }
        NavigationLink(Copy.text("web.backup.title")) {
          MobileBackupSettings(workspace: workspace, model: backups)
        }.disabled(workspace.busy || workspace.unresolvedWrite)
        Button(Copy.text("web.cloud.clear"), role: .destructive) {
          clearRevision = workspace.revision
          confirmingClear = true
        }.disabled(writesBlocked)
        Button(Copy.text("web.cloudentry.3ab8cc15939f"), role: .destructive) {
          confirmingLogout = true
        }.disabled(writesBlocked)
      }
      if let error = workspace.error {
        Section {
          Text(error).foregroundStyle(AppleColors.error)
          Button(Copy.text("web.settings.shortcuts.refresh")) { Task { await workspace.refresh() } }
          if workspace.unresolvedWrite {
            Button(Copy.text("mobile.resolveUnknown")) { confirmingResolution = true }
              .disabled(workspace.busy || backups.busy || backups.pending)
          }
        }
      }
    }
    .scrollContentBackground(.hidden)
    .background(AppleColors.canvas)
    .tint(AppleColors.accent)
    .navigationTitle(Copy.text("apple.settings"))
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .confirmationAction) {
        Button(Copy.text("web.close")) { dismiss() }
          .disabled(backups.busy || backups.pending)
      }
    }
    .interactiveDismissDisabled(backups.busy || backups.pending)
    .sheet(isPresented: $capturing) { NavigationStack { MobileCapture(workspace: workspace) } }
    .confirmationDialog(Copy.text("mobile.resolveUnknown"), isPresented: $confirmingResolution, titleVisibility: .visible) {
      Button(Copy.text("mobile.resolveUnknown")) { Task { await workspace.acknowledgeUnknownWrite() } }
      Button(Copy.text("web.cancel"), role: .cancel) {}
    } message: { Text(Copy.text("mobile.resolveUnknownDetail")) }
    .confirmationDialog(Copy.text("web.cloud.clear"), isPresented: $confirmingClear, titleVisibility: .visible) {
      Button(Copy.text("web.cloud.clear"), role: .destructive) {
        Task { _ = await workspace.clearAll(expectedRevision: clearRevision) }
      }
      Button(Copy.text("web.cancel"), role: .cancel) {}
    } message: { Text(Copy.text("web.cloud.clearDetail")) }
    .confirmationDialog(Copy.text("web.cloudentry.3ab8cc15939f"), isPresented: $confirmingLogout, titleVisibility: .visible) {
      Button(Copy.text("web.cloudentry.3ab8cc15939f"), role: .destructive) {
        Task {
          await workspace.logout()
          await reminders.reconcile(workspace)
          if workspace.owner == nil { dismiss() }
        }
      }
      Button(Copy.text("web.cancel"), role: .cancel) {}
    }
    .fileExporter(isPresented: $exporting, document: document, contentType: .json, defaultFilename: "sill.json") { result in
      if case .failure = result { workspace.error = Copy.text("mobile.exportFailed") }
      document = MobileJSONDocument(data: Data())
    }
    .task { await reminders.reconcile(workspace) }
  }

  private func preference(
    _ key: String, label: String, options: [String],
    prefix: String = "web.settings.layout.", fallback: String = "standard"
  ) -> some View {
    Picker(Copy.text(label), selection: Binding(
      get: { workspace.preferences[key]?.string ?? fallback },
      set: { value in Task { _ = await workspace.updatePreferences([key: .string(value)]) } }
    )) {
      ForEach(options, id: \.self) { Text(Copy.text(prefix + $0)).tag($0) }
    }.disabled(writesBlocked)
  }

  private func boolean(_ key: String, fallback: Bool) -> Binding<Bool> {
    Binding(
      get: { workspace.preferences[key]?.bool ?? fallback },
      set: { value in Task { _ = await workspace.updatePreferences([key: .bool(value)]) } }
    )
  }

  private func export() {
    do {
      document = MobileJSONDocument(data: try workspace.exportData())
      exporting = true
    } catch { workspace.error = Copy.text("mobile.exportFailed") }
  }
}

struct MobileJSONDocument: FileDocument {
  static var readableContentTypes: [UTType] { [.json] }
  var data: Data
  init(data: Data) { self.data = data }
  init(configuration: ReadConfiguration) throws {
    data = configuration.file.regularFileContents ?? Data()
  }
  func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
    FileWrapper(regularFileWithContents: data)
  }
}
#endif
