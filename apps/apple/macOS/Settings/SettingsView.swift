import AppKit
import SillKit
import SwiftUI

/// The settings sheet (⌘, or the avatar). Web `panelSettings` in a desktop window: a centered wide
/// sheet with 设置 and a close button on top, five groups on the left, one screen each.
/// A changed setting draws at once and writes in the background; only that setting waits for
/// the store, and a failed write returns it to the stored value.
/// @design settings-sheet
struct SettingsView: View {
  enum Group: String, CaseIterable {
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

  @Environment(Workspace.self) private var workspace
  @Environment(Panels.self) private var panels
  @State private var group = Group.desk
  @State private var pending: [String: (value: JSONValue, count: Int)] = [:]

  var body: some View {
    let shape = RoundedRectangle(cornerRadius: AppleMetrics.sheetRadius, style: .continuous)
    VStack(spacing: 0) {
      head
      HStack(spacing: 0) {
        nav
        ScrollView(.vertical) {
          VStack(alignment: .leading, spacing: 0) {
            Text(group.title)
              .font(.sans(AppleMetrics.font22, .bold))
              .foregroundStyle(AppleColors.primary)
              .padding(.trailing, AppleMetrics.space40)
              .padding(.bottom, AppleMetrics.space18)
              .accessibilityAddTraits(.isHeader)
            page
          }
          .padding(.vertical, AppleMetrics.space28)
          .padding(.horizontal, AppleMetrics.space32)
          .frame(maxWidth: .infinity, alignment: .leading)
          .disabled(workspace.phase != .ready)
          .opacity(workspace.phase == .ready ? 1 : AppleMetrics.disabledOpacity)
        }
        .scrollIndicators(.hidden)
      }
    }
    .frame(
      maxWidth: AppleMetrics.settingsWidth,
      maxHeight: AppleMetrics.settingsHeight + AppleMetrics.space60 + AppleMetrics.space16
    )
    .background(shape.fill(AppleColors.canvas))
    .clipShape(shape)
    .shadow(.sheet)
    .accessibilityElement(children: .contain)
    .accessibilityAddTraits(.isModal)
  }

  /// Web `.settings-head`: 设置 at the figure size on the left, the quiet close on the right.
  private var head: some View {
    HStack {
      Text(Copy.text("web.nav.settings"))
        .font(.sans(AppleMetrics.font34, .bold))
        .tracking(AppleMetrics.font34 * AppleMetrics.settingsTitleTracking)
        .foregroundStyle(AppleColors.primary)
        .accessibilityAddTraits(.isHeader)
      Spacer(minLength: AppleMetrics.space16)
      SheetClose(quiet: true) { panels.close() }
        .accessibilityLabel(Copy.text("web.settings.close"))
    }
    .frame(minHeight: AppleMetrics.space60)
    .padding(.top, AppleMetrics.space16)
    .padding(.horizontal, AppleMetrics.space32)
  }

  // MARK: Groups

  private var nav: some View {
    VStack(alignment: .leading, spacing: AppleMetrics.space2) {
      ForEach(Group.allCases, id: \.self) { item in
        Button {
          PerformanceTrace.shared.event(
            .settingsChanged, values: ["index": Double(Group.allCases.firstIndex(of: item) ?? 0)])
          group = item
        } label: {
          Text(item.title)
            .font(.sans(AppleMetrics.font14, item == group ? .semibold : .regular))
            .foregroundStyle(AppleColors.primary)
            .padding(.horizontal, AppleMetrics.space16)
            .frame(maxWidth: .infinity, minHeight: AppleMetrics.space32, alignment: .leading)
        }
        .buttonStyle(NavRowStyle(on: item == group))
        .accessibilityIdentifier("settings-group-\(item.rawValue)")
        .accessibilityAddTraits(item == group ? [.isButton, .isSelected] : .isButton)
      }
      Spacer(minLength: 0)
    }
    .padding(.top, AppleMetrics.space28)
    .padding(.horizontal, AppleMetrics.space16)
    .padding(.bottom, AppleMetrics.space28)
    .frame(width: AppleMetrics.settingsNavWidth)
    .frame(maxHeight: .infinity)
    .background(AppleColors.canvas)
    .overlay(alignment: .trailing) {
      Rectangle().fill(AppleColors.line).frame(width: AppleMetrics.lineWidth)
    }
    .accessibilityElement(children: .contain)
    .accessibilityLabel(Copy.text("web.settings.groupsLabel"))
  }

  @ViewBuilder private var page: some View {
    switch group {
    case .add: AddPage()
    case .desk: desk
    case .look: look
    case .keys: keys
    case .data:
      DataPage(aiLocal: bool("aiLocal", workspace.preferences.aiLocal)) {
        set("aiLocal", .bool($0))
      }
    }
  }

  private var desk: some View {
    let preferences = workspace.preferences
    let hidden = hiddenActions
    return VStack(alignment: .leading, spacing: 0) {
      SettingsCard {
        switchRow("web.settings.stackSameSource", "stack", preferences.stack, first: true) {
          Text(Copy.text("web.settings.stackThreshold"))
        }
        switchRow("web.settings.fadeRead", "fadeRead", preferences.fadeRead)
        switchRow("web.settings.floatTimely", "floatTimely", preferences.floatTimely)
      }
      Text(Copy.text("web.actions.title"))
        .font(.sans(AppleMetrics.font12))
        .foregroundStyle(AppleColors.secondary)
        .padding(.top, AppleMetrics.space16)
        .padding(.bottom, AppleMetrics.space4)
      SettingsCard {
        ForEach(Self.actions.indices, id: \.self) { index in
          let action = Self.actions[index]
          let label = Copy.text("web.actions." + action.key)
          SettingRow(label: label, example: Copy.text(action.example), first: index == 0) {
            SettingSwitch(label: label, on: !hidden.contains(action.key)) { visible in
              var next = hidden
              if visible { next.remove(action.key) } else { next.insert(action.key) }
              let ordered = Self.actions.map { $0.key }.filter(next.contains)
              set("hiddenActions", .array(ordered.map(JSONValue.string)))
            }
          }
        }
      }
      Text(Copy.text("web.actions.hint"))
        .font(.sans(AppleMetrics.font13))
        .foregroundStyle(AppleColors.secondary)
        .padding(.top, AppleMetrics.space8)
        .padding(.horizontal, AppleMetrics.space4)
      SettingsCard {
        switchRow(
          "web.settings.collapseOnFinish", "collapseOnFinish", preferences.collapseOnFinish,
          first: true)
        let label = Copy.text("web.settings.newContentHint.label")
        SettingRow(label: label) {
          SettingSegmented(
            label: label,
            options: [
              ("away", Copy.text("web.settings.newContentHint.awayFromTop")),
              ("off", Copy.text("web.settings.newContentHint.off")),
            ],
            selection: string("newHint", preferences.newHint.rawValue)
          ) { set("newHint", .string($0)) }
        }
      }
      .padding(.top, AppleMetrics.space16)
    }
  }

  private var look: some View {
    let preferences = workspace.preferences
    let theme = Copy.text("web.settings.theme.label")
    let width = Copy.text("web.settings.cardWidth.label")
    return SettingsCard {
      SettingRow(label: theme, first: true) {
        SettingSegmented(
          label: theme,
          options: [
            ("system", Copy.text("web.settings.theme.system")),
            ("light", Copy.text("web.settings.theme.light")),
            ("dark", Copy.text("web.settings.theme.dark")),
          ],
          selection: string("theme", preferences.theme.rawValue)
        ) { set("theme", .string($0), announce: true) }
      }
      SettingRow(label: width) {
        SettingSegmented(
          label: width,
          options: [
            ("compact", Copy.text("web.settings.cardWidth.compact")),
            ("standard", Copy.text("web.settings.cardWidth.standard")),
            ("roomy", Copy.text("web.settings.cardWidth.roomy")),
          ],
          selection: string("density", preferences.density.rawValue)
        ) { set("density", .string($0), announce: true) }
      }
    }
  }

  private var keys: some View {
    let rows: [(String, [String])] = [
      ("web.search", ["⌘", "K"]),
      ("web.capture.title", ["N"]),
      ("web.settings.shortcuts.openCard", ["Enter"]),
      ("web.settings.shortcuts.closeOverlay", ["Esc"]),
      ("web.settings.shortcuts.refresh", ["R"]),
      ("web.settings.shortcuts.backToTop", ["T"]),
    ]
    return SettingsCard {
      switchRow(
        "web.settings.singleKeyShortcuts", "singleKeyShortcuts",
        workspace.preferences.singleKeyShortcuts, first: true)
      ForEach(rows.indices, id: \.self) { index in
        SettingRow(label: Copy.text(rows[index].0)) {
          HStack(spacing: AppleMetrics.space4) {
            ForEach(rows[index].1, id: \.self) { Kbd(key: $0) }
          }
        }
      }
    }
  }

  // MARK: Values

  /// Web `CardActions` and the card types each one appears on.
  static let actions: [(key: String, example: String)] = [
    ("bookmark", "web.actions.example.all"), ("tag", "web.actions.example.all"),
    ("later", "web.actions.example.all"), ("reply", "web.actions.example.mail"),
    ("open", "web.actions.example.source"), ("join", "web.actions.example.event"),
    ("snooze", "web.actions.example.reminder"), ("download", "web.actions.example.event"),
    ("dismiss", "web.actions.example.reminder"),
  ]

  private var hiddenActions: Set<String> {
    if let value = pending["hiddenActions"]?.value.strings { return Set(value) }
    return workspace.preferences.hiddenActions
  }

  private func bool(_ key: String, _ stored: Bool) -> Bool { pending[key]?.value.bool ?? stored }
  private func string(_ key: String, _ stored: String) -> String {
    pending[key]?.value.string ?? stored
  }

  private func switchRow(
    _ label: String, _ key: String, _ stored: Bool, first: Bool = false
  ) -> some View {
    switchRow(label, key, stored, first: first) { EmptyView() }
  }

  private func switchRow<Extra: View>(
    _ label: String, _ key: String, _ stored: Bool, first: Bool = false,
    @ViewBuilder extra: () -> Extra
  ) -> some View {
    let text = Copy.text(label)
    return SettingRow(label: text, first: first) {
      extra()
      SettingSwitch(label: text, on: bool(key, stored)) { set(key, .bool($0)) }
    }
  }

  /// Draw the new value now; the write runs behind it. Later changes of the same setting queue
  /// after it, so the last one wins; a failure returns the setting to what is stored.
  private func set(_ key: String, _ value: JSONValue, announce: Bool = false) {
    pending[key] = (value, (pending[key]?.count ?? 0) + 1)
    workspace.setPreference(key, value) { done in
      guard let entry = pending[key] else { return }
      if !done || entry.count <= 1 {
        pending[key] = nil
      } else {
        pending[key] = (entry.value, entry.count - 1)
      }
      if done, announce {
        AccessibilityNotification.Announcement(Copy.text("web.app.434203a723b4")).post()
      }
    }
  }
}

private struct NavRowStyle: ButtonStyle {
  let on: Bool
  func makeBody(configuration: Configuration) -> some View {
    NavRowBody(configuration: configuration, on: on)
  }
}

/// Web `.settings-nav button`: the chosen group is a quiet raised row in the same ink.
private struct NavRowBody: View {
  let configuration: ButtonStyleConfiguration
  let on: Bool
  @State private var hovered = false
  var body: some View {
    let shape = RoundedRectangle(cornerRadius: AppleMetrics.settingsNavRadius, style: .continuous)
    configuration.label
      .background {
        if on {
          shape.fill(AppleColors.card)
            .overlay(
              shape.strokeBorder(AppleColors.lineCard, lineWidth: AppleMetrics.lineWidth / 2)
            )
            .shadow(
              color: AppleColors.fixedBlack6, radius: AppleMetrics.raisedShadowBlur / 2,
              y: AppleMetrics.raisedShadowY)
        } else if hovered || configuration.isPressed {
          shape.fill(AppleColors.faint)
        }
      }
      .contentShape(shape)
      .onHover { hovered = $0 }
  }
}

/// Web `settings-add`: the same one field as the capture sheet. ⌘↩ or 存 saves.
private struct AddPage: View {
  @Environment(Workspace.self) private var workspace
  @State private var text = ""
  @State private var sending = false
  @FocusState private var focused: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack(alignment: .top, spacing: AppleMetrics.space10) {
        Icon("plus", size: AppleMetrics.font18)
          .foregroundStyle(AppleColors.secondary)
          .padding(.top, AppleMetrics.space12)
        ZStack(alignment: .topLeading) {
          if text.isEmpty {
            Text(Copy.text("web.capture.placeholder"))
              .textStyle(AppleMetrics.font16, leading: AppleMetrics.captureLeading)
              .foregroundStyle(AppleColors.iconSecondary)
              .padding(.vertical, AppleMetrics.space10)
              .allowsHitTesting(false)
          }
          TextEditor(text: $text)
            .scrollContentBackground(.hidden)
            .textStyle(AppleMetrics.font16, leading: AppleMetrics.captureLeading)
            .foregroundStyle(AppleColors.primary)
            .padding(.vertical, AppleMetrics.space10)
            .padding(.horizontal, -AppleMetrics.space4)
            .frame(minHeight: AppleMetrics.captureMinHeight)
            .focused($focused)
            .accessibilityLabel(Copy.text("web.capture.placeholder"))
            .onChange(of: text) { _, value in
              if value.count > Capture.limit { text = String(value.prefix(Capture.limit)) }
            }
            .onKeyPress(.return, phases: .down) { press in
              guard press.modifiers.contains(.command) else { return .ignored }
              save()
              return .handled
            }
        }
      }
      .padding(.vertical, AppleMetrics.space4)
      HStack(spacing: AppleMetrics.space12) {
        HStack(spacing: 0) {
          Kbd(key: "N")
          Text(Copy.text("web.capture.shortcutHint"))
        }
        .font(.sans(AppleMetrics.font13))
        .foregroundStyle(AppleColors.secondary)
        Spacer(minLength: 0)
        Button(Copy.text("web.capture.save")) { save() }
          .buttonStyle(SolidButtonStyle())
          .disabled(sending)
      }
      .padding(.top, AppleMetrics.space4)
    }
    .padding(.top, AppleMetrics.space4)
    .padding(.horizontal, AppleMetrics.space16)
    .padding(.bottom, AppleMetrics.space12)
    .background(
      RoundedRectangle(cornerRadius: AppleMetrics.settingsRadius, style: .continuous)
        .fill(AppleColors.card)
        .overlay(
          RoundedRectangle(cornerRadius: AppleMetrics.settingsRadius, style: .continuous)
            .strokeBorder(AppleColors.lineCard, lineWidth: AppleMetrics.lineWidth / 2))
    )
    .onAppear { focused = true }
  }

  /// The text stays until the store has the card; a failed write keeps it for another try.
  private func save() {
    guard !sending, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
    let result = workspace.capture(text) { done in
      sending = false
      if done { text = "" }
    }
    sending = result == .sent
  }
}

/// Web `data`: where the workspace lives, how much it holds, export and clear.
private struct DataPage: View {
  let aiLocal: Bool
  let setAILocal: (Bool) -> Void
  @Environment(Workspace.self) private var workspace
  @State private var usage: Int?
  @State private var confirming = false
  @State private var clearing = false

  var body: some View {
    VStack(alignment: .leading, spacing: AppleMetrics.space16) {
      SettingsCard {
        SettingRow(label: Copy.text("web.settings.storage.location"), first: true) {
          Text(Copy.text("web.settings.storage.localDirectory"))
        }
        SettingRow(label: Copy.text("web.settings.storage.usage")) {
          Text(usage.map { Format.fileSize($0) } ?? "").font(.number(AppleMetrics.font13))
        }
        let label = Copy.text("web.settings.aiLocal")
        SettingRow(label: label) { SettingSwitch(label: label, on: aiLocal, change: setAILocal) }
      }
      SettingsCard {
        SettingLine(first: true) {
          Button(Copy.text("web.settings.exportAllCards")) { export() }
            .buttonStyle(TextLinkStyle(padded: false))
        }
        SettingLine {
          Button(Copy.text("web.settings.clearAllData")) { confirming = true }
            .buttonStyle(TextLinkStyle(warn: true, padded: false))
            .disabled(clearing)
        }
      }
    }
    .task(id: workspace.catalogVersion) { await measure() }
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
