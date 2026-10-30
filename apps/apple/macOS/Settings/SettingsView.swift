import AppKit
import SillKit
import SwiftUI

/// The settings sheet (⌘, or the avatar). Web `panelSettings` in a desktop window: a centered wide
/// sheet with 设置 and a close button on top, settings groups on the left, one screen each.
/// A changed setting draws at once and writes in the background; only that setting waits for
/// the store, and a failed write returns it to the stored value.
/// @design settings-sheet
struct SettingsView: View {
  enum Group: String, CaseIterable {
    case desk, look, keys, data, backup, about
    var title: String {
      switch self {
      case .desk: Copy.text("web.common.desk")
      case .look: Copy.text("web.settings.appearance")
      case .keys: Copy.text("web.settings.shortcuts")
      case .data: Copy.text("web.cloudentry.ebdc835e8f87")
      case .backup: Copy.text("web.backup.navigation")
      case .about: Copy.text("web.about.title")
      }
    }
  }

  @Environment(Workspace.self) private var workspace
  @Environment(Account.self) private var account
  @Environment(Panels.self) private var panels
  @State private var group = Group.desk
  @State private var pending: [String: (value: JSONValue, count: Int)] = [:]

  var body: some View {
    GeometryReader { bounds in
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
            .disabled(group != .about && workspace.phase != .ready)
            .opacity(
              group == .about || workspace.phase == .ready ? 1 : AppleMetrics.disabledOpacity)
          }
          .scrollIndicators(.hidden)
        }
      }
      .frame(
        width: min(bounds.size.width, AppleMetrics.settingsWidth),
        height: min(
          bounds.size.height,
          AppleMetrics.settingsHeight + AppleMetrics.space60 + AppleMetrics.space16)
      )
      .background(shape.fill(AppleColors.canvas))
      .clipShape(shape)
      .shadow(.sheet)
      .accessibilityElement(children: .contain)
      .accessibilityAddTraits(.isModal)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
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
      ForEach(Group.allCases.filter { $0 != .backup || !workspace.isLocal }, id: \.self) { item in
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
    case .desk: desk
    case .look: look
    case .keys: keys
    case .data: DataPage()
    case .backup: BackupSettingsView().id(account.owner)
    case .about: AboutSettingsView()
    }
  }

  private var desk: some View {
    let preferences = workspace.preferences
    return VStack(alignment: .leading, spacing: 0) {
      SystemReminderSettingsView()
      SettingsCard {
        switchRow("web.settings.stackSameSource", "stack", preferences.stack, first: true) {
          Text(Copy.text("web.settings.stackThreshold"))
        }
        switchRow("web.settings.fadeRead", "fadeRead", preferences.fadeRead)
        switchRow("web.settings.floatTimely", "floatTimely", preferences.floatTimely)
      }
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
    let preferences = layoutPreferences
    let theme = Copy.text("web.settings.theme.label")
    let width = Copy.text("web.settings.cardWidth.label")
    return VStack(alignment: .leading, spacing: AppleMetrics.space16) {
      SettingsCard {
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
        layoutRow(
          "textWeight", value: preferences.textWeight.rawValue, choices: ["standard", "strong"])
      }
      layoutLabel("web.settings.layout.cards")
      SettingsCard {
        layoutRow(
          "cardTextSize", value: preferences.cardTextSize.rawValue,
          choices: ["small", "standard", "large"], first: true)
        layoutRow(
          "cardSpacing", value: preferences.cardSpacing.rawValue,
          choices: ["compact", "standard", "roomy"])
        layoutRow(
          "cardPadding", value: preferences.cardPadding.rawValue,
          choices: ["compact", "standard", "roomy"])
      }
      layoutLabel("web.settings.layout.reading")
      SettingsCard {
        layoutRow(
          "readerTextSize", value: preferences.readerTextSize.rawValue,
          choices: ["small", "standard", "large"], first: true)
        layoutRow(
          "readerSpacing", value: preferences.readerSpacing.rawValue,
          choices: ["compact", "standard", "roomy"])
        layoutRow(
          "readerWidth", value: preferences.readerWidth.rawValue,
          choices: ["narrow", "standard", "full"])
      }
      Button(Copy.text("web.settings.layout.reset")) { resetLayout() }
        .buttonStyle(.plain).foregroundStyle(AppleColors.accent)
    }
  }

  private var layoutPreferences: Preferences {
    var values = workspace.storedPreferences
    for (key, entry) in pending { values[key] = entry.value }
    return Preferences(values)
  }

  private func layoutLabel(_ key: String) -> some View {
    Text(Copy.text(key)).font(.sans(AppleMetrics.font12)).foregroundStyle(AppleColors.secondary)
  }

  private func layoutRow(_ key: String, value: String, choices: [String], first: Bool = false)
    -> some View
  {
    let label = Copy.text("web.settings.layout." + key)
    return SettingRow(label: label, first: first) {
      SettingSegmented(
        label: label, options: choices.map { ($0, Copy.text("web.settings.layout." + $0)) },
        selection: value
      ) {
        set(key, .string($0))
      }
    }
  }

  private func resetLayout() {
    let keys = [
      "density", "cardTextSize", "cardSpacing", "cardPadding", "readerTextSize", "readerSpacing",
      "textWeight",
    ]
    var values = Dictionary(uniqueKeysWithValues: keys.map { ($0, JSONValue.string("standard")) })
    values["readerWidth"] = .string("full")
    setValues(values)
  }

  private var keys: some View {
    let rows: [(String, [String])] = [
      ("web.search", ["⌘", "K"]),
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
    setValues([key: value], announce: announce)
  }

  private func setValues(_ values: [String: JSONValue], announce: Bool = false) {
    for (key, value) in values { pending[key] = (value, (pending[key]?.count ?? 0) + 1) }
    workspace.write([.preferences(values)]) { done in
      for key in values.keys {
        guard let entry = pending[key] else { continue }
        if !done || entry.count <= 1 {
          pending[key] = nil
        } else {
          pending[key] = (entry.value, entry.count - 1)
        }
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
