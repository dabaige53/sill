import SillKit
import SwiftUI

struct CaptureField: View {
  @Environment(Workspace.self) var model: Workspace
  @Binding var text: String
  @FocusState private var inputFocused: Bool
  var showsNextEvent = false
  let save: () -> Void
  var body: some View {
    VStack(spacing: AppleMetrics.space8) {
      HStack(alignment: .top, spacing: AppleMetrics.space12) {
        NativeIcon(name: "plus", size: AppleMetrics.space18).foregroundStyle(AppleColors.secondary)
          .padding(.top, AppleMetrics.space12)
        TextField(Copy.text("web.capture.placeholder"), text: $text, axis: .vertical)
          .textFieldStyle(.roundedBorder).focused($inputFocused).lineLimit(5...10).font(.body)
          .padding(.vertical, AppleMetrics.space12)
          .onChange(of: text) { if text.count > 4000 { text = String(text.prefix(4000)) } }
      }
      if showsNextEvent {
        TimelineView(.everyMinute) { _ in upcomingEvent }
      }
      HStack {
        Text("⌘ N").font(.system(size: AppleMetrics.font12, design: .rounded)).padding(
          AppleMetrics.space5
        ).background(AppleColors.surface, in: RoundedRectangle(cornerRadius: 6))
        Text(Copy.text("web.capture.shortcutHint")).font(.callout)
          .foregroundStyle(AppleColors.secondary)
        Spacer()
        Button(Copy.text("web.capture.save"), action: save).buttonStyle(
          .borderedProminent
        )
        .keyboardShortcut(.return, modifiers: .command)
        .disabled(
          text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || model.busy || !model.ready
        )
      }.padding(.bottom, AppleMetrics.space12)
    }.defaultFocus($inputFocused, true)
  }
  @ViewBuilder private var upcomingEvent: some View {
    if let event = nextEvent, let start = event.date("start") {
      HStack(spacing: AppleMetrics.space12) {
        Text(start, format: .dateTime.hour(.twoDigits(amPM: .omitted)).minute(.twoDigits)).font(
          .system(size: AppleMetrics.space20, weight: .semibold, design: .rounded))
        VStack(alignment: .leading, spacing: AppleMetrics.space5) {
          Text(event.title).font(.system(size: AppleMetrics.font14, weight: .medium)).lineLimit(1)
          Text(eventRelative(start)).font(.caption).foregroundStyle(AppleColors.accent)
        }.frame(maxWidth: .infinity, alignment: .leading)
        if start.timeIntervalSinceNow <= 900, let link = event.fields["meeting"]?["url"]?.string,
          let url = URL(string: link)
        {
          Link(Copy.text("web.templates.451755e3831f"), destination: url).buttonStyle(
            .borderedProminent)
        }
      }.padding(.vertical, AppleMetrics.space12).padding(.horizontal, AppleMetrics.space14)
        .background(
          AppleColors.surface, in: RoundedRectangle(cornerRadius: AppleMetrics.settingsRadius))
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
