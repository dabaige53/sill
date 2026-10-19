import SillKit
import SwiftUI

struct CardTile: View {
  @EnvironmentObject var model: Workspace
  @Environment(\.colorScheme) private var colorScheme
  let card: Card
  var detail = false
  var compact = false
  var open: (() -> Void)?
  @State private var hovering = false
  @FocusState private var focusedTask: String?
  @State private var heldTasks: [String] = []
  private var fields: JSONValue { card.fields }
  private var state: JSONValue { model.items[card.id] ?? .object([:]) }
  private var tasks: [JSONValue] { fields["tasks"]?.array ?? [] }
  private var complete: Bool { !tasks.isEmpty && tasks.allSatisfy { model.taskDone(card, $0) } }
  private var settled: Bool {
    (card.readable && state["read"]?.bool == true && model.preferences["fadeRead"]?.bool != false)
      || (card.type == "digest" && state["seen"]?.bool == true && model.preferences["fadeRead"]?.bool != false)
      || (card.type == "task" && complete)
      || (card.type == "reminder" && state["reminderDone"]?.bool == true)
      || (card.type == "event" && (card.date("end") ?? .distantFuture) < .now)
  }
  private var covered: Bool {
    card.type == "photo"
      || (["article", "media"].contains(card.type) && fields["image"]?.string != nil)
  }
  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      if covered {
        CardMedia(card: card, detail: detail, faded: settled).padding(
          .horizontal, AppleMetrics.space8
        ).padding(.top, AppleMetrics.space8)
      }
      VStack(alignment: .leading, spacing: 0) {
        if card.type == "mail" { sender } else { head }
        if card.type == "event", let start = card.date("start") {
          eventTime(start).padding(.top, AppleMetrics.space8)
        }
        title.padding(.top, AppleMetrics.space12)
        if showSummary { summary.padding(.top, AppleMetrics.space6) }
        if card.type == "task" { checklist.padding(.top, AppleMetrics.space12) }
        if card.type == "event", let people = fields["people"]?.strings, !people.isEmpty {
          HStack(spacing: AppleMetrics.space8) {
            avatarRow(people)
            Text(people.joined(separator: "、")).lineLimit(1)
          }.font(.system(size: AppleMetrics.font13)).foregroundStyle(AppleColors.secondary)
            .padding(.top, AppleMetrics.space8)
        }
        if card.type == "media" && fields["media"]?.string == "podcast" {
          podcastBar.padding(.top, AppleMetrics.space8)
        }
        if card.type == "mail", let attachment = fields["attachment"]?.string {
          reference("file", attachment).padding(.top, AppleMetrics.space12)
        }
        if card.type == "file" { files.padding(.top, AppleMetrics.space12) }
        if card.type == "suggestion" { related.padding(.top, AppleMetrics.space12) }
        if card.type == "reminder" { ReminderActions(card: card).padding(.top, AppleMetrics.space8) }
        if card.type == "event", let start = card.date("start"), let end = card.date("end"),
          start.timeIntervalSinceNow <= 900, end > .now,
          let link = fields["meeting"]?["url"]?.string, let url = URL(string: link)
        {
          HStack {
            Spacer()
            Link(Copy.text("web.templates.451755e3831f"), destination: url).buttonStyle(
              CardPillStyle(primary: true))
          }.padding(.top, AppleMetrics.space8)
        }
      }.padding(.horizontal, AppleMetrics.cardPadding).padding(
        .vertical, compact ? AppleMetrics.space14 : AppleMetrics.cardPadding)
      if let snippet = searchSnippet {
        Text(highlighted(snippet)).font(.system(size: AppleMetrics.font13)).foregroundStyle(
          AppleColors.secondary
        ).padding(.horizontal, AppleMetrics.cardPadding).padding(.bottom, AppleMetrics.cardPadding)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(
      settled ? AppleColors.readCard : AppleColors.card,
      in: RoundedRectangle(cornerRadius: AppleMetrics.cardRadius)
    )
    .clipShape(RoundedRectangle(cornerRadius: AppleMetrics.cardRadius))
    .overlay(
      RoundedRectangle(cornerRadius: AppleMetrics.cardRadius).strokeBorder(
        model.selection.contains(card.id) && !detail
          ? AppleColors.primary : AppleColors.primary.opacity(AppleMetrics.borderOpacity),
        lineWidth: model.selection.contains(card.id) ? 2 : 1)
    )
    .overlay(alignment: .topTrailing) {
      if !detail && hovering {
        Menu {
          CardActions(card: card)
        } label: {
          NativeIcon(name: "more", size: AppleMetrics.font18).frame(
            width: AppleMetrics.space28, height: AppleMetrics.space28)
        }
        .menuStyle(.borderlessButton).fixedSize().padding(AppleMetrics.space12).accessibilityLabel(
          Copy.appleOrganize)
      }
    }
    .shadow(
      color: .black.opacity(settled ? 0 : colorScheme == .dark ? 0.3 : hovering ? 0.04 : 0.025),
      radius: hovering ? 5 : 2, y: hovering ? 2 : 1
    )
    .shadow(
      color: .black.opacity(settled || colorScheme == .dark ? 0 : hovering ? 0.07 : 0.035),
      radius: hovering ? 24 : 16, y: hovering ? 10 : 4
    )
    .contentShape(RoundedRectangle(cornerRadius: AppleMetrics.cardRadius))
    .onTapGesture { open?() }
    .onHover { hovering = $0 }
    .onChange(of: focusedTask) { _, next in if next == nil { heldTasks = [] } }
    .tint(AppleColors.accent)
  }
  private var searchSnippet: String? {
    let query = model.query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard model.searchPresented, !query.isEmpty,
      let text = ([card.summary, state["note"]?.string ?? ""] + card.paragraphs).first(where: {
        $0.localizedCaseInsensitiveContains(query)
      }),
      let range = text.range(of: query, options: .caseInsensitive)
    else { return nil }
    let at = text.distance(from: text.startIndex, to: range.lowerBound)
    let start = max(0, at - 24)
    let end = min(text.count, max(start + 100, at + query.count))
    return (start > 0 ? "…" : "")
      + String(
        text[
          text.index(text.startIndex, offsetBy: start)..<text.index(text.startIndex, offsetBy: end)]
      )
  }
  private func highlighted(_ text: String) -> AttributedString {
    var result = AttributedString(text)
    let query = model.query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard model.searchPresented, !query.isEmpty else { return result }
    var remaining = result.startIndex..<result.endIndex
    while let range = result[remaining].range(of: query, options: .caseInsensitive) {
      result[range].backgroundColor = AppleColors.warning.opacity(0.2)
      result[range].foregroundColor = AppleColors.primary
      remaining = range.upperBound..<result.endIndex
    }
    return result
  }
  private var showSummary: Bool {
    if compact { return false }
    if ["event", "file", "photo", "task"].contains(card.type) { return false }
    if card.type == "media" && fields["media"]?.string != "podcast" { return false }
    if card.type == "note" && (card.sourceKind == "capture" || fields["form"]?.string == "quote") {
      return false
    }
    return true
  }
  private var title: some View {
    let quote = fields["form"]?.string == "quote"
    let capture = card.type == "note" && card.sourceKind == "capture" && !quote
    return Button {
      open?()
    } label: {
      Text(
        highlighted(
          model.searchPresented
            && !model.query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? card.title : capture ? (card.summary.isEmpty ? card.title : card.summary) : card.title
        )
      )
      .font(
        .system(
          size: quote ? AppleMetrics.font21 : capture ? AppleMetrics.font15 : AppleMetrics.font17,
          weight: capture ? .regular : quote ? .medium : .semibold)
      )
      .lineSpacing(quote ? AppleMetrics.space4 : 0).lineLimit(
        detail ? nil : quote ? 4 : capture ? 6 : 2
      )
      .frame(maxWidth: .infinity, alignment: .leading).multilineTextAlignment(.leading)
    }.buttonStyle(.plain).foregroundStyle(settled ? AppleColors.secondary : AppleColors.primary)
  }
  private var head: some View {
    HStack(spacing: AppleMetrics.space6) {
      CardSourceGlyph(card: card)
      Text(headText).lineLimit(1)
      Spacer(minLength: 0)
      if card.type == "task" && !tasks.isEmpty {
        Text("\(tasks.filter { model.taskDone(card, $0) }.count)/\(tasks.count)").foregroundStyle(
          AppleColors.primary
        ).fontWeight(.semibold)
      }
      if card.readable && state["read"]?.bool != true, let progress = state["progress"]?.number,
        progress > 0
      {
        ZStack {
          Circle().stroke(AppleColors.surface, lineWidth: 2)
          Circle().trim(from: 0, to: progress).stroke(AppleColors.accent, lineWidth: 2)
            .rotationEffect(.degrees(-90))
        }.frame(width: AppleMetrics.font14, height: AppleMetrics.font14)
        Text("\(Int((progress * 100).rounded()))%").foregroundStyle(AppleColors.accent)
      }
      if card.type == "reminder" {
        ReminderStatusIcon(card: card, state: state)
      }
      if card.type == "event" {
        Text(cardEventRelative(card)).foregroundStyle(AppleColors.accent).fontWeight(.medium)
      }
    }.font(.system(size: AppleMetrics.font13)).foregroundStyle(AppleColors.secondary).frame(
      minHeight: AppleMetrics.space20
    )
    .padding(.trailing, covered ? 0 : AppleMetrics.space28)
  }
  private var headText: String {
    if card.type == "event", let date = card.date("start") { return cardDay(date) }
    if card.type == "task" { return fields["meta"]?.string ?? Copy.text("web.task") }
    if card.type == "reminder" { return Copy.text("web.reminder") }
    if card.type == "photo" {
      return [Copy.text("web.photo"), fields["location"]?.string ?? fields["meta"]?.string ?? ""]
        .filter { !$0.isEmpty }.joined(separator: " · ")
    }
    if card.type == "file" {
      return [Copy.text("web.file"), card.source].filter { !$0.isEmpty }.joined(separator: " · ")
    }
    return card.sourceLine
  }
  private var summary: some View {
    VStack(alignment: .leading, spacing: AppleMetrics.space4) {
      let points = fields["points"]?.strings ?? []
      let text =
        card.type == "digest" && card.summary.isEmpty && points.isEmpty
        ? card.paragraphs.first ?? "" : card.summary
      if !text.isEmpty {
        Text(text).font(.system(size: AppleMetrics.font15)).lineSpacing(AppleMetrics.space4)
          .foregroundStyle(AppleColors.secondary).lineLimit(
            detail ? nil : covered || !points.isEmpty ? 2 : 3)
      }
      ForEach(Array(points.prefix(detail ? points.count : 3).enumerated()), id: \.offset) {
        i, point in
        HStack(alignment: .firstTextBaseline, spacing: AppleMetrics.space10) {
          Text("\(i + 1)").font(
            .system(size: AppleMetrics.font13, weight: .semibold, design: .rounded)
          ).foregroundStyle(AppleColors.accent)
          Text(point).font(.system(size: AppleMetrics.font15)).lineLimit(detail ? nil : 1)
        }
      }
    }
  }
  private var checklist: some View {
    let ordered =
      tasks.filter { !model.taskDone(card, $0) } + tasks.filter { model.taskDone(card, $0) }
    let held = heldTasks.compactMap { id in tasks.first { $0["id"]?.string == id } }
    let visible = held + ordered.filter { task in !heldTasks.contains(task["id"]?.string ?? "") }
    return VStack(alignment: .leading, spacing: AppleMetrics.space4) {
      if tasks.isEmpty {
        Text(card.summary).font(.system(size: AppleMetrics.font15)).foregroundStyle(
          AppleColors.secondary)
      }
      ForEach(Array(visible.prefix(detail ? tasks.count : 3).enumerated()), id: \.offset) {
        _, task in
        CardTaskRow(card: card, task: task).focused($focusedTask, equals: task["id"]?.string ?? "")
          .simultaneousGesture(
            TapGesture().onEnded {
              if heldTasks.isEmpty {
                heldTasks = Array(visible.prefix(3)).compactMap { $0["id"]?.string }
              }
            })
      }
      if !detail && tasks.count > 3 {
        Text(
          Copy.text("web.templates.dff74742a6f0") + "\(tasks.count - 3)"
            + Copy.text("web.templates.f9d529eacdf3")
        ).font(.system(size: AppleMetrics.font12)).foregroundStyle(AppleColors.secondary)
      }
    }
  }
  private var sender: some View {
    let name = fields["sender"]?.string ?? card.source
    return HStack(spacing: AppleMetrics.space10) {
      CardAvatar(name: name)
      VStack(alignment: .leading, spacing: 2) {
        Text(name).font(.system(size: AppleMetrics.font14, weight: .semibold))
        Text(
          [Copy.text("web.mail"), fields["meta"]?.string ?? ""].filter { !$0.isEmpty }.joined(
            separator: " · ")
        ).font(.system(size: AppleMetrics.font12)).foregroundStyle(AppleColors.secondary)
      }
    }
  }
  private func eventTime(_ start: Date) -> some View {
    HStack(alignment: .firstTextBaseline, spacing: AppleMetrics.space12) {
      Text(cardTime(start)).font(
        .system(size: AppleMetrics.font34, weight: .medium, design: .rounded)
      ).foregroundStyle(settled ? AppleColors.secondary : AppleColors.primary)
      if let end = card.date("end") {
        VStack(alignment: .leading, spacing: 2) {
          Text(Copy.text("web.templates.83532308ecca") + cardTime(end))
          Text(
            Copy.text("web.templates.2428420e407f") + "\(Int(end.timeIntervalSince(start) / 60))"
              + Copy.text("web.templates.40de54344d22")
          ).font(.system(size: AppleMetrics.font12))
        }.font(.system(size: AppleMetrics.font13, design: .rounded)).foregroundStyle(
          AppleColors.secondary)
      }
    }
  }
  private var podcastBar: some View {
    let total = fields["duration"]?.number ?? 0
    let progress = state["progress"]?.number ?? 0
    return HStack(spacing: AppleMetrics.space10) {
      NativeIcon(name: "play", size: AppleMetrics.font14).foregroundStyle(AppleColors.card).frame(
        width: AppleMetrics.space28, height: AppleMetrics.space28
      ).background(AppleColors.primary, in: Circle())
      GeometryReader { geometry in
        ZStack(alignment: .leading) {
          Capsule().fill(AppleColors.surface)
          Capsule().fill(AppleColors.primary).frame(width: geometry.size.width * progress)
        }
      }.frame(height: AppleMetrics.space4)
      Text((progress > 0 ? "-" : "") + cardDuration(total * (1 - progress))).font(
        .system(size: AppleMetrics.font12, design: .rounded)
      ).foregroundStyle(AppleColors.secondary)
    }.padding(.top, AppleMetrics.space4)
  }
  private var files: some View {
    let values = fields["files"]?.array ?? []
    return VStack(alignment: .leading, spacing: AppleMetrics.space8) {
      ForEach(Array(values.prefix(detail ? values.count : 3).enumerated()), id: \.offset) {
        _, file in reference("file", file["name"]?.string ?? "")
      }
      if !detail && values.count > 3 {
        Text(
          Copy.text("web.templates.dff74742a6f0") + "\(values.count - 3)"
            + Copy.text("web.templates.7aaf96ad52e0")
        ).font(.system(size: AppleMetrics.font12)).foregroundStyle(AppleColors.secondary)
      }
    }
  }
  private var related: some View { CardReferences(card: card, limit: detail ? nil : 2) }
  private func reference(_ icon: String, _ text: String) -> some View {
    HStack(spacing: AppleMetrics.space8) {
      NativeIcon(name: icon, size: AppleMetrics.font15)
      Text(text).lineLimit(1)
    }.font(.system(size: AppleMetrics.font13)).foregroundStyle(AppleColors.secondary)
  }
  private func avatarRow(_ people: [String]) -> some View {
    HStack(spacing: -AppleMetrics.space6) {
      ForEach(people, id: \.self) { CardAvatar(name: $0, size: AppleMetrics.space24) }
    }
  }
}

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
  var body: some View {
    Text(String(name.prefix(1))).font(.system(size: size * 0.4, weight: .medium)).frame(
      width: size, height: size
    ).background(AppleColors.surface, in: Circle()).overlay(
      Circle().strokeBorder(AppleColors.card, lineWidth: 2))
  }
}
struct CardTaskRow: View {
  @EnvironmentObject var model: Workspace
  let card: Card
  let task: JSONValue
  var body: some View {
    let done = model.taskDone(card, task)
    Button {
      model.toggleTask(card, task)
    } label: {
      HStack(alignment: .top, spacing: AppleMetrics.space10) {
        NativeIcon(name: done ? "check-circle" : "ring", size: AppleMetrics.font20).foregroundStyle(
          done ? AppleColors.accent : AppleColors.secondary)
        Text(task["text"]?.string ?? "").strikethrough(done).foregroundStyle(
          done ? AppleColors.secondary : AppleColors.primary
        ).multilineTextAlignment(.leading)
        Spacer(minLength: 0)
      }.font(.system(size: AppleMetrics.font15)).padding(.vertical, AppleMetrics.space4)
    }.buttonStyle(.plain).disabled(model.busy)
  }
}
struct CardReferences: View {
  @EnvironmentObject var model: Workspace
  let card: Card
  var limit: Int?
  var body: some View {
    let ids = card.fields["related"]?.strings ?? []
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
    let due = (snoozed > 0 ? snoozed : card.fields["due"]?.number ?? .infinity) <= Date.now.timeIntervalSince1970 * 1000
    let label = reminderLabel(card, state)
    if !label.isEmpty {
      NativeIcon(name: dismissed ? "bell-off" : done ? "check-circle" : due ? "bell" : "clock", size: 18)
        .foregroundStyle(!dismissed && !done && due ? AppleColors.warning : AppleColors.secondary)
        .frame(width: 28, height: 28).background(AppleColors.surface, in: Circle())
        .accessibilityElement(children: .ignore).accessibilityLabel(label).help(label)
    }
  }
}

struct ReminderActions: View {
  @EnvironmentObject var model: Workspace
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
        }.buttonStyle(CardPillStyle()).frame(maxWidth: .infinity)
        if card.type == "reminder" {
          Button(Copy.text("web.done")) {
            model.patch([card.id], values: ["reminderDone": .bool(true)])
          }.buttonStyle(CardPillStyle(primary: true))
        }
      }
    }.controlSize(.large).disabled(model.busy)
  }
}
struct CardActions: View {
  @EnvironmentObject var model: Workspace
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

struct CardPillStyle: ButtonStyle {
  var primary = false
  var solid = false
  func makeBody(configuration: Configuration) -> some View {
    configuration.label.font(
      .system(size: solid ? AppleMetrics.font14 : AppleMetrics.font13, weight: .medium)
    )
    .padding(.horizontal, solid ? AppleMetrics.space20 : AppleMetrics.space14)
    .frame(
      minWidth: primary && !solid ? 72 : nil,
      minHeight: solid ? AppleMetrics.hitTarget : AppleMetrics.space36
    )
    .foregroundStyle(primary ? Color.white : AppleColors.primary)
    .background(primary ? AppleColors.accent : AppleColors.surface, in: Capsule())
    .scaleEffect(configuration.isPressed ? (solid ? 0.98 : 0.97) : 1)
  }
}
