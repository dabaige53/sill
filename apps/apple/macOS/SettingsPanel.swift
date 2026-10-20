import SillKit
import SwiftUI

struct SettingsPanel: View {
  @Environment(Workspace.self) var model: Workspace
  @Environment(\.dismiss) private var dismiss
  @State private var group: String? = "desk"
  @State private var captureText = ""
  @State private var confirmsClear = false
  @State private var clearSubmitted = false
  @State private var captureSubmitted = false
  private let groups = [
    ("add", "web.settings.add", "square.and.pencil"),
    ("desk", "web.common.desk", "rectangle.grid.2x2"),
    ("look", "apple.appearance", "paintpalette"),
    ("keys", "web.settings.shortcuts", "keyboard"),
    ("data", "web.cloudentry.ebdc835e8f87", "externaldrive"),
  ]
  var body: some View {
    NavigationSplitView {
      List(selection: $group) {
        ForEach(groups, id: \.0) { key, label, symbol in
          Label(Copy.text(label), systemImage: symbol).tag(key)
        }
      }.navigationSplitViewColumnWidth(min: 150, ideal: 170, max: 210)
    } detail: {
      Form {
        contents
        if let error = model.error {
          Section { Text(error).foregroundStyle(.red).textSelection(.enabled) }
        }
      }.formStyle(.grouped)
        .navigationTitle(Copy.text(groups.first { $0.0 == group }?.1 ?? "web.nav.settings"))
    }
    .frame(minWidth: 640, idealWidth: 720, minHeight: 440, idealHeight: 560)
    .preferredColorScheme(model.preferredAppearance)
    .alert(Copy.text("web.app.7f1a78cdb3f2"), isPresented: $confirmsClear) {
      Button(Copy.text("web.cancel"), role: .cancel) {}
      Button(Copy.text("web.app.bce2377283c2"), role: .destructive) {
        clearSubmitted = true
        model.clearAll()
      }.disabled(model.busy)
    } message: {
      Text(Copy.text("web.app.d008fc7f75ba"))
    }
    .onChange(of: model.busy) {
      if !model.busy && captureSubmitted {
        captureSubmitted = false
        if model.error == nil { captureText = "" }
      }
      if !model.busy && clearSubmitted {
        clearSubmitted = false
        if model.error == nil { dismiss() }
      }
    }
    .onChange(of: model.ready) { if !model.ready { dismiss() } }
  }
  @ViewBuilder private var contents: some View {
    switch group {
    case "add":
      settingsCard {
        CaptureField(text: $captureText) {
          model.capture(captureText)
          captureSubmitted = model.busy
        }
      }
    case "desk":
      settingsCard {
        toggle(
          "web.settings.stackSameSource", "stack", fallback: true,
          detail: "web.settings.stackThreshold")
        toggle("web.settings.fadeRead", "fadeRead", fallback: true)
        toggle("web.settings.floatTimely", "floatTimely", fallback: true)
      }
      settingsCard {
        toggle("web.settings.collapseOnFinish", "collapseOnFinish", fallback: true)
        segmented(
          "web.settings.newContentHint.label", "newHint", fallback: "away",
          options: [
            ("away", "web.settings.newContentHint.awayFromTop"),
            ("off", "web.settings.newContentHint.off"),
          ])
      }
      Text(Copy.text("web.actions.title")).font(
        .headline)
      Text(Copy.text("web.actions.hint")).font(.callout)
        .foregroundStyle(AppleColors.secondary)
      settingsCard {
        ForEach(
          ["bookmark", "tag", "later", "reply", "open", "join", "snooze", "download", "dismiss"],
          id: \.self
        ) { action in
          LabeledContent {
            Toggle(
              Copy.text("web.actions." + action),
              isOn: Binding(
                get: { !(model.preferences["hiddenActions"]?.strings ?? []).contains(action) },
                set: { visible in
                  var hidden = model.preferences["hiddenActions"]?.strings ?? []
                  hidden.removeAll { $0 == action }
                  if !visible { hidden.append(action) }
                  model.setPreference("hiddenActions", .array(hidden.map(JSONValue.string)))
                }
              )
            ).labelsHidden().toggleStyle(NativeSwitchStyle(labelVisible: false)).disabled(
              model.busy)
          } label: {
            VStack(alignment: .leading, spacing: AppleMetrics.space4) {
              Text(Copy.text("web.actions." + action))
              Text(actionExample(action)).font(.system(size: AppleMetrics.font12)).foregroundStyle(
                AppleColors.secondary)
            }
          }
        }
      }
    case "look":
      settingsCard {
        segmented(
          "apple.theme", "theme", fallback: "system",
          options: [
            ("system", "apple.system"), ("light", "apple.light"),
            ("dark", "apple.dark"),
          ])
        segmented(
          "web.settings.cardWidth.label", "density", fallback: "standard",
          options: [
            ("compact", "apple.compact"), ("standard", "apple.standard"),
            ("roomy", "apple.roomy"),
          ])
      }
    case "keys":
      settingsCard {
        toggle("web.settings.singleKeyShortcuts", "singleKeyShortcuts", fallback: true)
        keyRow("web.search", "⌘ K")
        keyRow("web.capture.title", "⌘ N")
        keyRow("web.settings.shortcuts.openCard", "Enter")
        keyRow("web.settings.shortcuts.closeOverlay", "Esc")
        keyRow("web.settings.shortcuts.refresh", "⌘ R")
        keyRow("web.settings.shortcuts.backToTop", "T")
      }
    default:
      if model.owner != nil {
        Text(Copy.text("web.cloudentry.67c5f7479766")).font(.body)
          .foregroundStyle(AppleColors.secondary)
        Text(Copy.text("web.cloudentry.adf4e8d0d4f0")).font(.body)
          .foregroundStyle(AppleColors.secondary)
      } else {
        settingsCard {
          row("web.settings.storage.location") {
            Text(Copy.text("web.settings.storage.localDirectory")).foregroundStyle(
              AppleColors.secondary)
          }
          row("web.settings.storage.usage") {
            Text(storageSize).monospacedDigit().foregroundStyle(AppleColors.secondary)
          }
          toggle("web.settings.aiLocal", "aiLocal", fallback: true)
        }
      }
      settingsCard {
        actionRow(model.owner == nil ? "apple.export" : "web.cloud.export") {
          model.exportWorkspace()
        }
        actionRow(
          model.owner == nil ? "web.settings.clearAllData" : "web.cloud.clear", danger: true
        ) { confirmsClear = true }
      }
      if model.owner != nil {
        settingsCard {
          row("web.cloudentry.4cc5be794516") {
            Button(Copy.text("web.cloudentry.3ab8cc15939f")) { model.logout() }.buttonStyle(.plain)
              .foregroundStyle(AppleColors.accent)
          }
        }
      }
    }
  }
  private func actionExample(_ action: String) -> String {
    let key =
      [
        "reply": "mail", "open": "source", "join": "event", "download": "event",
        "snooze": "reminder", "dismiss": "reminder",
      ][action] ?? "all"
    return Copy.text("web.actions.example." + key)
  }
  private var storageSize: String {
    let value = JSONValue.object([
      "cards": .array(model.cards.compactMap { try? $0.raw }), "items": .object(model.items),
      "preferences": .object(model.preferences),
    ])
    return ByteCountFormatter.string(
      fromByteCount: Int64((try? value.encoded().count) ?? 0), countStyle: .file)
  }
  private func settingsCard<Content: View>(@ViewBuilder content: () -> Content) -> some View {
    Section(content: content)
  }
  private func row<Side: View>(_ key: String, @ViewBuilder side: () -> Side) -> some View {
    LabeledContent(Copy.text(key), content: side)
  }
  private func toggle(_ label: String, _ key: String, fallback: Bool = false, detail: String? = nil)
    -> some View
  {
    Toggle(
      isOn: Binding(
        get: { model.preferences[key]?.bool ?? fallback },
        set: { model.setPreference(key, .bool($0)) }
      )
    ) {
      VStack(alignment: .leading, spacing: AppleMetrics.space4) {
        Text(Copy.text(label))
        if let detail {
          Text(Copy.text(detail)).font(.caption).foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
        }
      }
    }.toggleStyle(NativeSwitchStyle()).disabled(model.busy)
  }
  private func segmented(
    _ label: String, _ key: String, fallback: String, options: [(String, String)]
  ) -> some View {
    row(label) {
      Picker(
        Copy.text(label),
        selection: Binding(
          get: { model.preferences[key]?.string ?? fallback },
          set: { model.setPreference(key, .string($0)) }
        )
      ) {
        ForEach(options, id: \.0) { value, name in
          Text(Copy.text(name)).tag(value)
        }
      }.pickerStyle(.segmented).labelsHidden().disabled(model.busy)
    }
  }
  private func keyRow(_ label: String, _ shortcut: String) -> some View {
    row(label) {
      Text(shortcut).font(.system(size: AppleMetrics.font12, weight: .medium, design: .rounded))
        .padding(.horizontal, AppleMetrics.space8).frame(height: AppleMetrics.space24).background(
          AppleColors.surface, in: RoundedRectangle(cornerRadius: 6))
    }
  }
  private func actionRow(_ key: String, danger: Bool = false, action: @escaping () -> Void)
    -> some View
  {
    Button(Copy.text(key), role: danger ? .destructive : nil, action: action)
      .disabled(model.busy || !model.ready)
  }
}
