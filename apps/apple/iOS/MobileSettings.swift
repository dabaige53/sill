#if os(iOS)
  import SillKit
  import SwiftUI
  import UniformTypeIdentifiers

  /// The phone settings page keeps the Web's five groups, raised rows and immediate preferences.
  struct MobileSettings: View {
    let workspace: MobileWorkspace
    var onClose: (() -> Void)? = nil
    @Environment(\.dismiss) private var dismiss
    @State private var group = Group.desk
    @State private var reminders = MobileReminders.shared
    @State private var backups = MobileBackups()
    @State private var exporting = false
    @State private var confirmingResolution = false
    @State private var document = MobileJSONDocument(data: Data())
    @State private var confirmingClear = false
    @State private var confirmingLogout = false
    @State private var clearRevision = 0
    @State private var pending: [String: JSONValue] = [:]
    @State private var preferenceWork: Task<Void, Never>?
    @State private var preferenceSequence = 0

    private enum Group: String, CaseIterable {
      case add, desk, look, keys, data
      var title: String {
        switch self {
        case .add: Copy.text("web.settings.add")
        case .desk: Copy.text("web.common.desk")
        case .look: Copy.text("web.settings.appearance")
        case .keys: Copy.text("web.settings.shortcuts")
        case .data: Copy.text("web.cloudentry.ebdc835e8f87")
        }
      }
    }

    private var writesBlocked: Bool {
      (workspace.busy && preferenceWork == nil) || workspace.unresolvedWrite || backups.busy
        || backups.pending
    }
    private func close() { if let onClose { onClose() } else { dismiss() } }

    var body: some View {
      VStack(spacing: 0) {
        MobileSettingsHeader(
          title: Copy.text("apple.settings"), disabled: backups.busy || backups.pending,
          close: close)
        groups
        ScrollView {
          VStack(alignment: .leading, spacing: AppleMetrics.space16) {
            Text(group.title).font(.system(size: AppleMetrics.font22, weight: .bold))
              .accessibilityAddTraits(.isHeader).padding(.bottom, AppleMetrics.space2)
            page
            if let error = workspace.error { errorPanel(error) }
          }
          .padding(.horizontal, AppleMetrics.space16)
          .padding(.vertical, AppleMetrics.space20)
          .frame(maxWidth: AppleMetrics.readerWidth, alignment: .leading)
          .frame(maxWidth: .infinity, alignment: .top)
        }
        .scrollIndicators(.hidden)
      }
      .foregroundStyle(AppleColors.primary)
      .background(AppleColors.canvas)
      .toolbar(.hidden, for: .navigationBar)
      .interactiveDismissDisabled(backups.busy || backups.pending)
      .confirmationDialog(
        Copy.text("mobile.resolveUnknown"), isPresented: $confirmingResolution,
        titleVisibility: .visible
      ) {
        Button(Copy.text("mobile.resolveUnknown")) {
          Task { await workspace.acknowledgeUnknownWrite() }
        }
        Button(Copy.text("web.cancel"), role: .cancel) {}
      } message: {
        Text(Copy.text("mobile.resolveUnknownDetail"))
      }
      .confirmationDialog(
        Copy.text("web.cloud.clear"), isPresented: $confirmingClear, titleVisibility: .visible
      ) {
        Button(Copy.text("web.cloud.clear"), role: .destructive) {
          Task { _ = await workspace.clearAll(expectedRevision: clearRevision) }
        }
        .accessibilityIdentifier("confirm-clear-cards")
        Button(Copy.text("web.cancel"), role: .cancel) {}
      } message: {
        Text(Copy.text("web.cloud.clearDetail"))
      }
      .confirmationDialog(
        Copy.text("web.cloudentry.3ab8cc15939f"), isPresented: $confirmingLogout,
        titleVisibility: .visible
      ) {
        Button(Copy.text("web.cloudentry.3ab8cc15939f"), role: .destructive) {
          Task {
            await workspace.logout()
            await reminders.reconcile(workspace)
            if workspace.owner == nil { close() }
          }
        }
        Button(Copy.text("web.cancel"), role: .cancel) {}
      }
      .fileExporter(
        isPresented: $exporting, document: document, contentType: .json,
        defaultFilename: "sill.json"
      ) { result in
        if case .failure = result { workspace.error = Copy.text("mobile.exportFailed") }
        document = MobileJSONDocument(data: Data())
      }
      .task { await reminders.reconcile(workspace) }
    }

    private var groups: some View {
      ScrollView(.horizontal) {
        HStack(spacing: AppleMetrics.space2) {
          ForEach(Group.allCases, id: \.self) { value in
            Button {
              group = value
            } label: {
              Text(value.title)
                .font(
                  .system(size: AppleMetrics.font14, weight: group == value ? .semibold : .regular)
                )
                .padding(.horizontal, AppleMetrics.space16)
                .frame(minHeight: AppleMetrics.space32)
            }
            .buttonStyle(MobileSettingSegmentStyle(selected: group == value))
            .accessibilityAddTraits(group == value ? .isSelected : [])
          }
        }
        .padding(.horizontal, AppleMetrics.space12)
        .padding(.top, AppleMetrics.space16)
        .padding(.bottom, AppleMetrics.space12)
      }
      .scrollIndicators(.hidden)
      .accessibilityElement(children: .contain)
      .accessibilityLabel(Copy.text("web.settings.groupsLabel"))
    }

    @ViewBuilder private var page: some View {
      switch group {
      case .add: MobileCaptureEditor(workspace: workspace)
      case .desk: desk
      case .look: appearance
      case .keys: shortcuts
      case .data: data
      }
    }

    private var desk: some View {
      VStack(alignment: .leading, spacing: AppleMetrics.space16) {
        MobileSettingCard {
          MobileSettingRow(
            label: Copy.text("reminders.title"), example: Copy.text("mobile.reminders.hint"),
            first: true
          ) {
            MobileSettingSwitch(label: Copy.text("reminders.title"), on: reminders.enabled) {
              value in
              Task { await reminders.setEnabled(value, workspace: workspace) }
            }.disabled(reminders.busy || workspace.busy)
          }
          if let message = reminders.message {
            Text(message).font(.system(size: AppleMetrics.font13)).padding(
              .bottom, AppleMetrics.space12)
          }
          if reminders.remaining > 0 {
            Text(
              Copy.text("mobile.reminders.capacity")
                .replacingOccurrences(of: "{scheduled}", with: String(reminders.scheduled))
                .replacingOccurrences(of: "{remaining}", with: String(reminders.remaining))
            )
            .font(.system(size: AppleMetrics.font13)).padding(.bottom, AppleMetrics.space12)
          }
        }
        MobileSettingCard {
          switchRow(
            "web.settings.stackSameSource", key: "stack", first: true,
            example: "web.settings.stackThreshold")
          switchRow("web.settings.fadeRead", key: "fadeRead")
          switchRow("web.settings.floatTimely", key: "floatTimely")
        }
        heading("web.actions.title")
        MobileSettingCard {
          ForEach(Self.actions.indices, id: \.self) { index in
            let action = Self.actions[index]
            let label = Copy.text("web.actions." + action.0)
            MobileSettingRow(label: label, example: Copy.text(action.1), first: index == 0) {
              MobileSettingSwitch(label: label, on: !hiddenActions.contains(action.0)) { visible in
                var next = hiddenActions
                if visible { next.remove(action.0) } else { next.insert(action.0) }
                set([
                  "hiddenActions": .array(
                    Self.actions.map(\.0).filter(next.contains).map(JSONValue.string))
                ])
              }.disabled(writesBlocked)
            }
          }
        }
        MobileSettingCard {
          switchRow("web.settings.collapseOnFinish", key: "collapseOnFinish", first: true)
          preference(
            "newHint", label: "web.settings.newContentHint.label",
            options: [
              ("away", Copy.text("web.settings.newContentHint.awayFromTop")),
              ("off", Copy.text("web.settings.newContentHint.off")),
            ], fallback: "away")
        }
      }
    }

    private var appearance: some View {
      VStack(alignment: .leading, spacing: AppleMetrics.space16) {
        MobileSettingCard {
          preference(
            "theme", label: "web.settings.theme.label",
            options: ["system", "light", "dark"].map {
              ($0, Copy.text("web.settings.theme." + $0))
            }, fallback: "system", first: true)
          preference(
            "density", label: "web.settings.cardWidth.label",
            options: ["compact", "standard", "roomy"].map {
              ($0, Copy.text("web.settings.cardWidth." + $0))
            })
          layout("textWeight", ["standard", "strong"])
        }
        heading("web.settings.layout.cards")
        MobileSettingCard {
          layout("cardTextSize", ["small", "standard", "large"], first: true)
          layout("cardSpacing", ["compact", "standard", "roomy"])
          layout("cardPadding", ["compact", "standard", "roomy"])
        }
        heading("web.settings.layout.reading")
        MobileSettingCard {
          layout("readerTextSize", ["small", "standard", "large"], first: true)
          layout("readerSpacing", ["compact", "standard", "roomy"])
          layout("readerWidth", ["narrow", "standard", "full"], fallback: "full")
        }
        Button(Copy.text("web.settings.layout.reset")) {
          var values = Dictionary(
            uniqueKeysWithValues: [
              "density", "cardTextSize", "cardSpacing", "cardPadding", "readerTextSize",
              "readerSpacing", "textWeight",
            ].map { ($0, JSONValue.string("standard")) })
          values["readerWidth"] = .string("full")
          set(values)
        }.font(.system(size: AppleMetrics.font14)).foregroundStyle(AppleColors.accent).disabled(
          writesBlocked)
      }
    }

    private var shortcuts: some View {
      MobileSettingCard {
        switchRow("web.settings.singleKeyShortcuts", key: "singleKeyShortcuts", first: true)
        shortcut("web.search", ["⌘", "K"])
        shortcut("web.capture.title", ["N"])
        shortcut("web.settings.shortcuts.openCard", ["Enter"])
        shortcut("web.settings.shortcuts.closeOverlay", ["Esc"])
        shortcut("web.settings.shortcuts.refresh", ["R"])
        shortcut("web.settings.shortcuts.backToTop", ["T"])
      }
    }

    private var data: some View {
      VStack(spacing: AppleMetrics.space16) {
        MobileSettingCard {
          MobileSettingRow(label: Copy.text("web.settings.storage.location"), first: true) {
            Text(Copy.text("web.settings.storage.cloudAccount"))
              .font(.system(size: AppleMetrics.font13)).foregroundStyle(AppleColors.secondary)
          }
        }
        MobileSettingCard {
          MobileSettingAction(
            title: Copy.text("web.settings.exportAllCards"), first: true, action: export)
          MobileSettingAction(title: Copy.text("web.cloud.clear"), destructive: true) {
            clearRevision = workspace.revision
            confirmingClear = true
          }.disabled(writesBlocked || workspace.busy || preferenceWork != nil)
        }
        NavigationLink {
          MobileBackupSettings(workspace: workspace, model: backups)
        } label: {
          MobileSettingCard {
            MobileSettingRow(label: Copy.text("web.backup.title"), first: true) {
              MobileIcon("chevron-right", size: AppleMetrics.font16)
            }
          }
        }.buttonStyle(.plain).disabled(workspace.busy || workspace.unresolvedWrite)
        MobileSettingCard {
          MobileSettingAction(title: Copy.text("web.cloudentry.3ab8cc15939f"), first: true) {
            confirmingLogout = true
          }.disabled(writesBlocked || workspace.busy || preferenceWork != nil)
        }
      }
    }

    private func shortcut(_ key: String, _ keys: [String]) -> some View {
      MobileSettingRow(label: Copy.text(key)) {
        HStack(spacing: AppleMetrics.space4) {
          ForEach(keys, id: \.self) { value in
            Text(value).font(.system(size: AppleMetrics.font12, weight: .medium, design: .rounded))
              .padding(.horizontal, AppleMetrics.space6)
              .frame(minWidth: AppleMetrics.space24, minHeight: AppleMetrics.space24)
              .background(
                AppleColors.surface, in: RoundedRectangle(cornerRadius: AppleMetrics.kbdRadius))
          }
        }
      }
    }
    private func heading(_ key: String) -> some View {
      Text(Copy.text(key)).font(.system(size: AppleMetrics.font12)).foregroundStyle(
        AppleColors.secondary)
    }
    private func switchRow(
      _ label: String, key: String, first: Bool = false, example: String? = nil
    ) -> some View {
      MobileSettingRow(label: Copy.text(label), example: example.map(Copy.text), first: first) {
        MobileSettingSwitch(
          label: Copy.text(label),
          on: pending[key]?.bool ?? workspace.preferences[key]?.bool ?? true
        ) {
          set([key: .bool($0)])
        }.disabled(writesBlocked)
      }
    }
    private func layout(
      _ key: String, _ choices: [String], fallback: String = "standard", first: Bool = false
    ) -> some View {
      preference(
        key, label: "web.settings.layout." + key,
        options: choices.map { ($0, Copy.text("web.settings.layout." + $0)) }, fallback: fallback,
        first: first)
    }
    private func preference(
      _ key: String, label: String, options: [(String, String)], fallback: String = "standard",
      first: Bool = false
    ) -> some View {
      MobileSettingRow(label: Copy.text(label), first: first) {
        MobileSettingSegmented(
          label: Copy.text(label), options: options,
          selection: pending[key]?.string ?? workspace.preferences[key]?.string ?? fallback
        ) {
          set([key: .string($0)])
        }.disabled(writesBlocked)
      }
    }
    private var hiddenActions: Set<String> {
      Set((pending["hiddenActions"] ?? workspace.preferences["hiddenActions"])?.strings ?? [])
    }
    private static let actions: [(String, String)] = [
      ("bookmark", "web.actions.example.all"), ("tag", "web.actions.example.all"),
      ("later", "web.actions.example.all"), ("reply", "web.actions.example.mail"),
      ("open", "web.actions.example.source"), ("join", "web.actions.example.event"),
      ("snooze", "web.actions.example.reminder"), ("download", "web.actions.example.event"),
      ("dismiss", "web.actions.example.reminder"),
    ]
    private func set(_ values: [String: JSONValue]) {
      guard !writesBlocked else { return }
      let owner = workspace.owner
      preferenceSequence += 1
      let sequence = preferenceSequence
      pending.merge(values) { _, value in value }
      let previous = preferenceWork
      preferenceWork = Task {
        await previous?.value
        guard workspace.owner == owner else { return }
        let saved = await workspace.updatePreferences(values)
        for (key, value) in values where pending[key] == value { pending[key] = nil }
        if !saved { pending = [:] }
        if sequence == preferenceSequence { preferenceWork = nil }
      }
    }
    private func errorPanel(_ error: String) -> some View {
      VStack(alignment: .leading, spacing: AppleMetrics.space8) {
        Text(error).textSelection(.enabled)
        Button(Copy.text("mobile.refresh")) { Task { await workspace.refresh() } }.disabled(
          workspace.busy)
        if workspace.unresolvedWrite {
          Button(Copy.text("mobile.resolveUnknown")) { confirmingResolution = true }
            .disabled(workspace.busy || backups.busy || backups.pending)
        }
      }.font(.system(size: AppleMetrics.font13))
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
