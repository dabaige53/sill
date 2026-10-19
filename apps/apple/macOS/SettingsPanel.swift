import SillKit
import SwiftUI

struct SettingsPanel: View {
  @EnvironmentObject var model: Workspace
  var availableSize = CGSize(width: AppleMetrics.windowWidth, height: AppleMetrics.windowHeight)
  private var narrow: Bool { availableSize.width <= 650 }
  @State private var group = "desk"
  @State private var captureText = ""
  @State private var confirmsClear = false
  @State private var clearSubmitted = false
  private let groups = [
    ("add", "web.settings.add"), ("desk", "web.panels.f48d334495f6"),
    ("look", "web.panels.86a63f23a076"), ("keys", "web.panels.ee2638183d3e"),
    ("data", "web.cloudentry.ebdc835e8f87"),
  ]
  var body: some View {
    Group { if confirmsClear { clearConfirmation } else { settingsContents } }
      .onChange(of: model.busy) {
        if !model.busy && clearSubmitted {
          clearSubmitted = false
          if model.error == nil { model.settingsPresented = false }
        }
      }
  }
  private var clearConfirmation: some View {
    VStack(alignment: .leading, spacing: AppleMetrics.space16) {
      Text(Copy.text("web.app.7f1a78cdb3f2")).font(
        .system(size: AppleMetrics.font19, weight: .semibold))
      Text(Copy.text("web.app.d008fc7f75ba")).font(.system(size: AppleMetrics.font15))
        .foregroundStyle(AppleColors.secondary)
      HStack(spacing: AppleMetrics.space10) {
        Button(Copy.text("web.cancel")) { confirmsClear = false }.buttonStyle(CardPillStyle())
          .frame(maxWidth: .infinity)
        Button {
          clearSubmitted = true
          model.clearAll()
        } label: {
          Text(Copy.text("web.app.bce2377283c2")).font(
            .system(size: AppleMetrics.font14, weight: .medium)
          ).foregroundStyle(.white)
            .frame(maxWidth: .infinity, minHeight: AppleMetrics.hitTarget).background(
              AppleColors.warning, in: Capsule())
        }.buttonStyle(.plain).disabled(model.busy)
      }
    }.padding(AppleMetrics.railEdge).frame(
      width: min(AppleMetrics.editorWidth, availableSize.width - AppleMetrics.space32)
    )
    .background(AppleColors.card, in: RoundedRectangle(cornerRadius: AppleMetrics.panelRadius))
  }
  private var settingsContents: some View {
    (narrow
      ? AnyLayout(VStackLayout(spacing: 0)) : AnyLayout(HStackLayout(alignment: .top, spacing: 0)))
    {
      (narrow ? AnyLayout(HStackLayout(spacing: 2)) : AnyLayout(VStackLayout(spacing: 2))) {
        ForEach(groups, id: \.0) { key, label in
          Button {
            group = key
          } label: {
            Text(Copy.text(label)).font(
              .system(size: AppleMetrics.font14, weight: group == key ? .semibold : .regular)
            )
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, AppleMetrics.space12).frame(height: AppleMetrics.space36)
            .background(
              group == key ? AppleColors.card : .clear,
              in: RoundedRectangle(cornerRadius: AppleMetrics.settingsNavRadius)
            )
            .shadow(
              color: AppleColors.shadow.opacity(group == key ? AppleMetrics.borderOpacity : 0),
              radius: 2, y: 1)
          }.buttonStyle(.plain)
        }
        if !narrow { Spacer(minLength: 0) }
      }.padding(.horizontal, AppleMetrics.space10).padding(.vertical, AppleMetrics.space24)
        .frame(width: narrow ? nil : AppleMetrics.settingsNavWidth)
        .overlay(alignment: .trailing) {
          Rectangle().fill(AppleColors.primary.opacity(AppleMetrics.borderOpacity)).frame(width: 1)
        }
      ScrollView {
        VStack(alignment: .leading, spacing: AppleMetrics.space16) {
          Text(Copy.text(groups.first { $0.0 == group }?.1 ?? ""))
            .font(.system(size: AppleMetrics.space22, weight: .semibold)).padding(.bottom, 2)
          contents
        }.padding(.vertical, AppleMetrics.railEdge).padding(.horizontal, AppleMetrics.space32)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
    }
    .frame(
      width: narrow
        ? availableSize.width
        : min(AppleMetrics.settingsWidth, availableSize.width - AppleMetrics.space32),
      height: narrow ? availableSize.height : min(panelHeight, availableSize.height * 0.78)
    )
    .background(AppleColors.canvas, in: RoundedRectangle(cornerRadius: AppleMetrics.panelRadius))
    .overlay(alignment: .topTrailing) { closeButton.padding(AppleMetrics.space12) }
    .tint(AppleColors.accent)

  }
  @ViewBuilder private var contents: some View {
    switch group {
    case "add":
      settingsCard {
        CaptureField(text: $captureText, save: { model.capture(captureText) })
      }
    case "desk":
      settingsCard {
        toggle(
          "web.panels.5142e436b1f9", "stack", fallback: true, detail: "web.panels.840f6c8f8823")
        toggle("web.panels.a11a80a0843c", "fadeRead", fallback: true)
        toggle("web.panels.0f01370710b6", "floatTimely", fallback: true)
      }
      settingsCard {
        toggle("web.panels.ba8a435e2ff0", "collapseOnFinish", fallback: true)
        segmented(
          "web.panels.87852ffbea52", "newHint", fallback: "away",
          options: [("away", "web.panels.d4d78fb603fd"), ("off", "web.panels.a0937d519f82")])
      }
    case "look":
      settingsCard {
        segmented(
          "web.panels.788db1cfec2a", "theme", fallback: "system",
          options: [
            ("system", "web.panels.217cfe7db1e3"), ("light", "web.panels.aa0819dfc4d8"),
            ("dark", "web.panels.a6b75d068032"),
          ])
        segmented(
          "web.panels.1cbb90eb7995", "density", fallback: "standard",
          options: [
            ("compact", "web.panels.5d63d587b0b0"), ("standard", "web.panels.6bea77acefb3"),
            ("roomy", "web.panels.051a34d53a73"),
          ])
      }
    case "keys":
      settingsCard {
        toggle("web.panels.cad165d34a9d", "singleKeyShortcuts", fallback: true)
        keyRow("web.search", "⌘ K")
        keyRow("web.panels.5a15649c2481", "N")
        keyRow("web.panels.9347631d48bf", "Enter")
        keyRow("web.panels.ba167b0c3011", "Esc")
        keyRow("web.panels.aee887434131", "R")
        keyRow("web.panels.53d77f56548d", "T")
      }
    default:
      if model.owner != nil {
        Text(Copy.text("web.cloudentry.67c5f7479766")).font(.system(size: AppleMetrics.font15))
          .foregroundStyle(AppleColors.secondary)
        Text(Copy.text("web.cloudentry.adf4e8d0d4f0")).font(.system(size: AppleMetrics.font15))
          .foregroundStyle(AppleColors.secondary)
      } else {
        settingsCard {
          row("web.panels.f3a8c4c52977") {
            Text(Copy.text("web.panels.e722a46eabe8")).foregroundStyle(AppleColors.secondary)
          }
          row("web.panels.c0aa76aebce6") {
            Text(storageSize).monospacedDigit().foregroundStyle(AppleColors.secondary)
          }
          toggle("web.panels.18fb131cc724", "aiLocal", fallback: true)
        }
      }
      settingsCard {
        actionRow(model.owner == nil ? "web.panels.af419089eb31" : "web.cloud.export") {
          model.exportWorkspace()
        }
        actionRow(model.owner == nil ? "web.panels.21f7e90ee0f1" : "web.cloud.clear", danger: true)
        { confirmsClear = true }
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
  private var panelHeight: CGFloat {
    let heading = AppleMetrics.space22 + AppleMetrics.space18 + AppleMetrics.railEdge * 2
    switch group {
    case "add": return heading + AppleMetrics.captureHeight + AppleMetrics.settingsRowHeight
    case "desk": return heading + AppleMetrics.settingsRowHeight * 5 + AppleMetrics.space16
    case "look": return heading + AppleMetrics.settingsRowHeight * 4
    case "keys": return heading + AppleMetrics.settingsRowHeight * 7
    default: return heading + AppleMetrics.settingsRowHeight * 5 + AppleMetrics.space16
    }
  }
  private var storageSize: String {
    let value = JSONValue.object([
      "cards": .array(model.cards.compactMap { try? $0.raw }), "items": .object(model.items),
      "preferences": .object(model.preferences),
    ])
    return ByteCountFormatter.string(
      fromByteCount: Int64((try? value.encoded().count) ?? 0), countStyle: .file)
  }
  private var closeButton: some View {
    Button {
      model.settingsPresented = false
    } label: {
      NativeIcon(name: "x", size: AppleMetrics.space18).frame(
        width: AppleMetrics.hitTarget, height: AppleMetrics.hitTarget)
    }
    .buttonStyle(.plain).accessibilityLabel(Copy.text("web.close"))
  }
  private func settingsCard<Content: View>(@ViewBuilder content: () -> Content) -> some View {
    VStack(spacing: 0, content: content).padding(.horizontal, AppleMetrics.space16)
      .background(AppleColors.card, in: RoundedRectangle(cornerRadius: AppleMetrics.settingsRadius))
      .overlay(
        RoundedRectangle(cornerRadius: AppleMetrics.settingsRadius).strokeBorder(
          AppleColors.primary.opacity(AppleMetrics.borderOpacity), lineWidth: 0.5))
  }
  private func row<Side: View>(_ key: String, @ViewBuilder side: () -> Side) -> some View {
    HStack(spacing: AppleMetrics.space16) {
      Text(Copy.text(key)).frame(maxWidth: .infinity, alignment: .leading)
      side()
    }.font(.system(size: AppleMetrics.font14)).frame(minHeight: AppleMetrics.settingsRowHeight)
      .overlay(alignment: .bottom) {
        Rectangle().fill(AppleColors.primary.opacity(AppleMetrics.borderOpacity)).frame(height: 0.5)
      }
  }
  private func toggle(_ label: String, _ key: String, fallback: Bool = false, detail: String? = nil)
    -> some View
  {
    row(label) {
      if let detail {
        Text(Copy.text(detail)).font(.system(size: AppleMetrics.font13)).foregroundStyle(
          AppleColors.secondary)
      }
      let enabled = model.preferences[key]?.bool ?? fallback
      Button {
        model.setPreference(key, .bool(!enabled))
      } label: {
        Capsule().fill(enabled ? AppleColors.accent : AppleColors.toggleOff)
          .overlay(alignment: .leading) {
            Circle().fill(.white).frame(
              width: AppleMetrics.toggleKnob, height: AppleMetrics.toggleKnob
            )
            .shadow(color: .black.opacity(0.15), radius: 2, y: 2)
            .padding(AppleMetrics.toggleInset).offset(x: enabled ? AppleMetrics.toggleTravel : 0)
          }.frame(width: AppleMetrics.toggleWidth, height: AppleMetrics.toggleHeight)
      }.buttonStyle(.plain).accessibilityLabel(Copy.text(label)).accessibilityAddTraits(
        enabled ? .isSelected : []
      )
      .disabled(model.busy)
    }
  }
  private func segmented(
    _ label: String, _ key: String, fallback: String, options: [(String, String)]
  ) -> some View {
    row(label) {
      HStack(spacing: 0) {
        ForEach(options, id: \.0) { value, name in
          Button {
            model.setPreference(key, .string(value))
          } label: {
            Text(Copy.text(name)).font(.system(size: AppleMetrics.font13))
              .padding(.horizontal, AppleMetrics.space12).frame(minHeight: AppleMetrics.font30)
              .background(
                (model.preferences[key]?.string ?? fallback) == value ? AppleColors.card : .clear,
                in: RoundedRectangle(cornerRadius: AppleMetrics.space8))
          }.buttonStyle(.plain)
        }
      }.padding(2).background(
        AppleColors.surface, in: RoundedRectangle(cornerRadius: AppleMetrics.space10))
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
    Button(action: action) {
      Text(Copy.text(key)).frame(
        maxWidth: .infinity, minHeight: AppleMetrics.settingsRowHeight, alignment: .leading)
    }
    .buttonStyle(.plain).foregroundStyle(danger ? AppleColors.warning : AppleColors.accent).font(
      .system(size: AppleMetrics.font14))
  }
}

struct CaptureField: View {
  @EnvironmentObject var model: Workspace
  @Binding var text: String
  var showsNextEvent = false
  let save: () -> Void
  var body: some View {
    VStack(spacing: AppleMetrics.space8) {
      HStack(alignment: .top, spacing: AppleMetrics.space12) {
        NativeIcon(name: "plus", size: AppleMetrics.space18).foregroundStyle(AppleColors.secondary)
          .padding(.top, AppleMetrics.space12)
        TextField(Copy.text("web.panels.fd06b053572e"), text: $text, axis: .vertical)
          .textFieldStyle(.plain).lineLimit(5...10).font(.system(size: AppleMetrics.font17))
          .padding(.vertical, AppleMetrics.space12)
          .onChange(of: text) { if text.count > 4000 { text = String(text.prefix(4000)) } }
      }
      if showsNextEvent, let event = nextEvent, let start = event.date("start") {
        HStack(spacing: AppleMetrics.space12) {
          Text(start, format: .dateTime.hour(.twoDigits(amPM: .omitted)).minute(.twoDigits)).font(
            .system(size: AppleMetrics.space20, weight: .semibold, design: .rounded))
          VStack(alignment: .leading, spacing: AppleMetrics.space5) {
            Text(event.title).font(.system(size: AppleMetrics.font14, weight: .medium)).lineLimit(1)
            Text(eventRelative(start)).font(.system(size: AppleMetrics.font12)).foregroundStyle(
              AppleColors.accent)
          }.frame(maxWidth: .infinity, alignment: .leading)
          if start.timeIntervalSinceNow <= 900, let link = event.fields["meeting"]?["url"]?.string,
            let url = URL(string: link)
          {
            Link(Copy.text("web.templates.451755e3831f"), destination: url).buttonStyle(
              CardPillStyle(primary: true, solid: true))
          }
        }.padding(.vertical, AppleMetrics.space12).padding(.horizontal, AppleMetrics.space14)
          .background(
            AppleColors.surface, in: RoundedRectangle(cornerRadius: AppleMetrics.settingsRadius))
      }
      HStack {
        Text("N").font(.system(size: AppleMetrics.font12, design: .rounded)).padding(
          AppleMetrics.space5
        ).background(AppleColors.surface, in: RoundedRectangle(cornerRadius: 6))
        Text(Copy.text("web.panels.9be4933b25fb")).font(.system(size: AppleMetrics.font13))
          .foregroundStyle(AppleColors.secondary)
        Spacer()
        Button(Copy.text("web.panels.a0fb6bc1d3c5"), action: save).buttonStyle(
          CardPillStyle(primary: true, solid: true)
        )
        .disabled(
          text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || model.busy || !model.ready
        )
      }.padding(.bottom, AppleMetrics.space12)
    }
  }
  private var nextEvent: Card? {
    model.cards.filter {
      $0.type == "event" && ($0.date("end") ?? .distantPast) > .now
        && ($0.date("start") ?? .distantFuture).timeIntervalSinceNow < 10_800
    }
    .sorted { ($0.date("start") ?? .distantFuture) < ($1.date("start") ?? .distantFuture) }.first
  }
  private func eventRelative(_ start: Date) -> String {
    let minutes = Int(ceil(start.timeIntervalSinceNow / 60))
    if minutes > 90 {
      return "\(Int((Double(minutes) / 60).rounded()))" + Copy.text("web.primitives.ec13a671ba0c")
    }
    if minutes > 0 { return "\(minutes)" + Copy.text("web.primitives.a63a9dc60e00") }
    return Copy.text("web.primitives.055da4d50c7e")
  }

}
