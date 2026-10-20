import SillKit
import SwiftUI

struct CardSourceGlyph: View {
  let card: Card
  var body: some View {
    let sources = card.fields["sources"]?.array ?? []
    if sources.count > 1 {
      HStack(spacing: -AppleMetrics.space6) {
        ForEach(Array(sources.prefix(3).enumerated()), id: \.offset) { _, source in
          NativeIcon(
            name: Card.sourceIcon(source["kind"]?.string ?? "local"), size: AppleMetrics.font12
          ).frame(width: AppleMetrics.space20, height: AppleMetrics.space20).background(
            AppleColors.card, in: Circle()
          ).overlay(Circle().strokeBorder(AppleColors.surface))
        }
      }
    } else {
      NativeIcon(name: card.sourceIcon, size: AppleMetrics.font16)
    }
  }
}
struct CardAvatar: View {
  let name: String
  var size: CGFloat = 32
  private var tone: Color {
    let tones: [UInt32] = [0x5e7a99, 0x7d6b8f, 0x6b8a7a, 0x9a7b5f, 0x5f8a99, 0x8a6b6b]
    let value = tones[name.unicodeScalars.reduce(0) { $0 + Int($1.value) } % tones.count]
    return Color(
      red: Double(value >> 16) / 255, green: Double((value >> 8) & 255) / 255,
      blue: Double(value & 255) / 255)
  }
  var body: some View {
    Text(String(name.prefix(1))).font(.system(size: size * 0.4, weight: .medium)).frame(
      width: size, height: size
    ).foregroundStyle(.white).background(tone, in: Circle()).overlay(
      Circle().strokeBorder(AppleColors.card, lineWidth: 2))
  }
}
struct CardTaskRow: View {
  @Environment(Workspace.self) var model: Workspace
  let card: Card
  let task: JSONValue
  var body: some View {
    let done = model.taskDone(card, task)
    Toggle(
      isOn: Binding(
        get: { model.taskDone(card, task) },
        set: { if $0 != model.taskDone(card, task) { model.toggleTask(card, task) } }
      )
    ) {
      Text(task["text"]?.string ?? "").strikethrough(done)
        .foregroundStyle(done ? .secondary : .primary)
        .multilineTextAlignment(.leading).lineLimit(2)
    }.toggleStyle(.checkbox).font(.system(size: AppleMetrics.font15)).disabled(model.busy)
      .frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 4)
  }
}
struct CardReferences: View {
  @Environment(Workspace.self) var model: Workspace
  let card: Card
  var limit: Int?
  var body: some View {
    let ids = (card.fields["related"]?.strings ?? []).filter { id in
      model.cards.contains { $0.id == id }
    }
    VStack(alignment: .leading, spacing: AppleMetrics.space8) {
      ForEach(Array(ids.prefix(limit ?? ids.count)), id: \.self) { id in
        if let related = model.cards.first(where: { $0.id == id }) {
          Button {
            model.selected = id
          } label: {
            HStack(spacing: AppleMetrics.space8) {
              NativeIcon(name: related.nativeIcon, size: AppleMetrics.font15)
              Text(related.title).lineLimit(2)
              Spacer(minLength: 0)
              NativeIcon(name: "chevron", size: AppleMetrics.font14)
            }.font(.system(size: AppleMetrics.font13)).padding(AppleMetrics.space10).background(
              AppleColors.surface, in: RoundedRectangle(cornerRadius: AppleMetrics.space12))
          }.buttonStyle(.plain)
        }
      }
      if let limit, ids.count > limit {
        Text(
          Copy.text("web.templates.dff74742a6f0") + "\(ids.count - limit)"
            + Copy.text("web.related.moreSuffix")
        ).font(.system(size: AppleMetrics.font12)).foregroundStyle(AppleColors.secondary)
      }
    }
  }
}
func reminderLabel(_ card: Card, _ state: JSONValue) -> String {
  if state["dismissed"]?.bool == true { return Copy.text("web.feedpolicy.f641f7ed9f5d") }
  if state["reminderDone"]?.bool == true { return Copy.text("web.feedpolicy.0eb5f2f421ed") }
  let snoozed = state["snoozedUntil"]?.number ?? 0
  guard let due = snoozed > 0 ? snoozed : card.fields["due"]?.number else { return "" }
  let minutes = Int(ceil((due / 1000 - Date.now.timeIntervalSince1970) / 60))
  return minutes > 0
    ? "\(minutes)" + Copy.text("web.primitives.a63a9dc60e00")
      + (snoozed > 0 ? Copy.text("web.feedpolicy.ab068f148b03") : "")
    : Copy.text(snoozed > 0 ? "web.feedpolicy.098d14f95600" : "web.feedpolicy.56c92f48088a")
}

struct ReminderStatusIcon: View {
  let card: Card
  let state: JSONValue
  var body: some View {
    let dismissed = state["dismissed"]?.bool == true
    let done = state["reminderDone"]?.bool == true
    let snoozed = state["snoozedUntil"]?.number ?? 0
    let due =
      (snoozed > 0 ? snoozed : card.fields["due"]?.number ?? .infinity) <= Date.now
      .timeIntervalSince1970 * 1000
    let label = reminderLabel(card, state)
    if !label.isEmpty {
      NativeIcon(
        name: dismissed ? "bell-off" : done ? "check-circle" : due ? "bell" : "clock", size: 18
      )
      .foregroundStyle(!dismissed && !done && due ? AppleColors.warning : AppleColors.secondary)
      .frame(width: 28, height: 28).background(AppleColors.surface, in: Circle())
      .accessibilityElement(children: .ignore).accessibilityLabel(label).help(label)
    }
  }
}

struct ReminderActions: View {
  @Environment(Workspace.self) var model: Workspace
  let card: Card
  var body: some View {
    let state = model.items[card.id]
    let settled =
      state?["reminderDone"]?.bool == true || state?["dismissed"]?.bool == true
      || (state?["snoozedUntil"]?.number ?? 0) > 0
    HStack {
      if settled {
        Button {
          model.patch(
            [card.id],
            values: [
              "reminderDone": .bool(false), "dismissed": .bool(false), "snoozedUntil": .number(0),
            ])
        } label: {
          NativeIcon(name: "undo", size: 20).frame(width: 44, height: 44)
        }.buttonStyle(.plain).background(AppleColors.surface, in: Circle())
          .accessibilityLabel(Copy.text("web.templates.4b03be14c1f4"))
          .help(Copy.text("web.templates.4b03be14c1f4"))
      } else {
        Button(Copy.text("web.templates.2d89d6318b38")) {
          model.patch(
            [card.id],
            values: [
              "snoozedUntil": .number(Date.now.addingTimeInterval(600).timeIntervalSince1970 * 1000)
            ])
        }.buttonStyle(.bordered).frame(maxWidth: .infinity)
        if card.type == "reminder" {
          Button(Copy.text("web.done")) {
            model.patch([card.id], values: ["reminderDone": .bool(true)])
          }.buttonStyle(.borderedProminent)
        }
      }
    }.controlSize(.large).disabled(model.busy)
  }
}
struct CardActions: View {
  @Environment(Workspace.self) var model: Workspace
  let card: Card
  var body: some View {
    Button(Copy.appleView) { model.selected = card.id }
    Button(Copy.appleSelect) {
      if model.selection.contains(card.id) {
        model.selection.remove(card.id)
      } else {
        model.selection.insert(card.id)
      }
    }
    Divider()
    Button(Copy.appleToggleBookmarkMenu) { model.toggle("bookmarked", card: card) }
    Button(Copy.appleToggleLaterMenu) { model.toggle("later", card: card) }
    if card.readable {
      Button(model.items[card.id]?["read"]?.bool == true ? Copy.appleUnreadAction : Copy.appleRead)
      { model.toggle("read", card: card) }
    }
    Button(model.items[card.id]?["archived"]?.bool == true ? Copy.appleRestore : Copy.appleArchive)
    {
      model.patch(
        [card.id], values: ["archived": .bool(model.items[card.id]?["archived"]?.bool != true)])
    }
  }
}
