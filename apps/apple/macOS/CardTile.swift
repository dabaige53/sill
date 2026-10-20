import SillKit
import SwiftUI

struct CardTile: View {
  @EnvironmentObject var model: Workspace
  @Environment(\.colorScheme) private var colorScheme
  let card: Card
  var detail = false
  var compact = false
  var open: (() -> Void)?
  @FocusState private var focusedTask: String?
  @State private var heldTasks: [String] = []
  private var fields: JSONValue { card.fields }
  private var state: JSONValue { model.items[card.id] ?? .object([:]) }
  private var tasks: [JSONValue] { fields["tasks"]?.array ?? [] }
  private var complete: Bool { !tasks.isEmpty && tasks.allSatisfy { model.taskDone(card, $0) } }
  private var settled: Bool {
    (card.readable && state["read"]?.bool == true && model.preferences["fadeRead"]?.bool != false)
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
        if card.type == "reminder" {
          HStack(alignment: .top, spacing: AppleMetrics.space10) {
            ReminderCompletion(card: card)
            title
          }.padding(.top, AppleMetrics.space12)
        } else {
          title.padding(.top, AppleMetrics.space12)
        }
        if showSummary {
          summary.padding(.top, AppleMetrics.space6)
            .padding(.leading, card.type == "reminder" ? AppleMetrics.space28 : 0)
        }
        if card.type == "task" { checklist.padding(.top, AppleMetrics.space12) }
        if card.type == "event", let people = fields["people"]?.strings, !people.isEmpty {
          HStack(spacing: AppleMetrics.space8) {
            avatarRow(people)
            Text(people.joined(separator: "、")).lineLimit(1)
          }.font(.system(size: AppleMetrics.font13)).foregroundStyle(AppleColors.secondary)
            .padding(.top, AppleMetrics.space8)
        }
        if card.type == "media", fields["media"]?.string == "podcast",
          let duration = card.mediaDurationText
        {
          Text(duration).font(.system(size: AppleMetrics.font12, design: .rounded))
            .foregroundStyle(AppleColors.secondary).padding(.top, AppleMetrics.space8)
        }
        if card.type == "mail", let attachment = fields["attachment"]?.string {
          reference("file", attachment).padding(.top, AppleMetrics.space12)
        }
        if card.type == "file" { files.padding(.top, AppleMetrics.space12) }
        if card.type == "suggestion" { related.padding(.top, AppleMetrics.space12) }
        if card.type == "event", let start = card.date("start"), let end = card.date("end"),
          start.timeIntervalSinceNow <= 900, end > .now,
          let link = fields["meeting"]?["url"]?.string, let url = URL(string: link)
        {
          HStack {
            Spacer()
            Link(Copy.text("web.templates.451755e3831f"), destination: url).buttonStyle(
              .borderedProminent)
          }.padding(.top, AppleMetrics.space8)
        }
      }.padding(.horizontal, AppleMetrics.cardPadding).padding(
        .vertical, compact ? AppleMetrics.space14 : AppleMetrics.cardPadding)
      if let snippet = searchSnippet {
        Text(highlighted(snippet)).font(.system(size: AppleMetrics.font13)).foregroundStyle(
          AppleColors.secondary
        ).padding(.horizontal, AppleMetrics.cardPadding).padding(
          .bottom, AppleMetrics.cardPadding)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(
      settled ? AppleColors.readCard : AppleColors.card,
      in: RoundedRectangle(cornerRadius: AppleMetrics.cardRadius)
    )
    .clipShape(RoundedRectangle(cornerRadius: AppleMetrics.cardRadius))
    .overlay {
      RoundedRectangle(cornerRadius: AppleMetrics.cardRadius).strokeBorder(
        model.selection.contains(card.id) && !detail
          ? AppleColors.primary : AppleColors.primary.opacity(AppleMetrics.borderOpacity),
        lineWidth: model.selection.contains(card.id) && !detail ? 2 : 1)
    }
    .shadow(
      color: .black.opacity(settled ? 0 : colorScheme == .dark ? 0.3 : 0.04),
      radius: AppleMetrics.space16, y: AppleMetrics.space4
    )
    .contentShape(RoundedRectangle(cornerRadius: AppleMetrics.cardRadius))
    .onTapGesture { open?() }
    .accessibilityElement(children: .contain)
    .accessibilityAction(named: Text(Copy.appleView)) { open?() }
    .accessibilityAddTraits(model.selection.contains(card.id) ? .isSelected : [])
    .onChange(of: focusedTask) { _, next in if next == nil { heldTasks = [] } }
    .tint(AppleColors.accent)
  }
  private var searchSnippet: String? {
    let query = model.searchWords.trimmingCharacters(in: .whitespacesAndNewlines)
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
    let query = model.searchWords.trimmingCharacters(in: .whitespacesAndNewlines)
    guard model.searchPresented, !query.isEmpty else { return result }
    var remaining = result.startIndex..<result.endIndex
    while let range = result[remaining].range(of: query, options: .caseInsensitive) {
      result[range].inlinePresentationIntent = .stronglyEmphasized
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
          weight: quote ? .medium : capture ? .regular : .semibold)
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
      if model.selection.contains(card.id) {
        Image(systemName: "checkmark.circle.fill").foregroundStyle(.tint)
          .accessibilityLabel(Copy.appleSelect)
      }
      if !detail {
        Menu(Copy.appleOrganize, systemImage: "ellipsis") { CardActions(card: card) }
          .labelStyle(.iconOnly).menuStyle(.borderlessButton).fixedSize()
      }
      if card.type == "task" && !tasks.isEmpty {
        Text("\(tasks.count { model.taskDone(card, $0) })/\(tasks.count)").foregroundStyle(
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
      if card.type == "reminder", let due = card.date("due") {
        let snooze = state["snoozedUntil"]?.number ?? 0
        let date = snooze > 0 ? Date(timeIntervalSince1970: snooze / 1000) : due
        Text(
          Calendar.current.isDateInToday(date)
            ? cardTime(date) : cardDay(date) + " " + cardTime(date)
        )
        .foregroundStyle(
          date <= .now && state["reminderDone"]?.bool != true && state["dismissed"]?.bool != true
            ? AppleColors.accent : AppleColors.secondary
        )
        .font(.system(size: AppleMetrics.font13, design: .rounded))
      }
      if card.type == "event" {
        Text(cardEventRelative(card)).foregroundStyle(AppleColors.accent).fontWeight(.medium)
      }
    }.font(.system(size: AppleMetrics.font13)).foregroundStyle(AppleColors.secondary).frame(
      minHeight: AppleMetrics.space20
    )

  }
  private var headText: String {
    if card.type == "event", let date = card.date("start") { return cardDay(date) }
    if card.type == "task" { return fields["project"]?["name"]?.string ?? Copy.text("web.task") }
    if card.type == "reminder" {
      return [Copy.text("web.reminder"), card.source].reduce(into: [String]()) {
        if !$1.isEmpty && !$0.contains($1) { $0.append($1) }
      }.joined(separator: " · ")
    }
    if card.type == "photo" {
      return [Copy.text("web.photo"), fields["location"]?.string ?? ""]
        .filter { !$0.isEmpty }.joined(separator: " · ")
    }
    if card.type == "file" {
      return [Copy.text("web.file"), card.sourceLine].filter { !$0.isEmpty }.joined(
        separator: " · ")
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
            detail
              ? nil
              : covered || !points.isEmpty || model.preferences["density"]?.string == "compact"
                ? 2 : 3)
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
      ForEach(visible.prefix(detail ? tasks.count : 3).map(CardTaskEntry.init)) { entry in
        CardTaskRow(card: card, task: entry.value).focused($focusedTask, equals: entry.id)
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
    return HStack(spacing: AppleMetrics.space10) {
      if let name = card.senderName {
        CardAvatar(name: name, size: 28)
      } else {
        CardSourceGlyph(card: card)
      }
      VStack(alignment: .leading, spacing: 2) {
        if let name = card.senderName {
          Text(name).font(.system(size: AppleMetrics.font15, weight: .semibold))
        }
        Text(
          [
            card.senderName == nil ? card.source : Copy.text("web.mail"),
            card.date("sentAt").map(cardDay) ?? "", card.readingEstimateText,
          ].filter { !$0.isEmpty }.joined(
            separator: " · ")
        ).font(.system(size: AppleMetrics.font12)).foregroundStyle(AppleColors.secondary)
      }
      Spacer(minLength: 0)
      if model.selection.contains(card.id) {
        Image(systemName: "checkmark.circle.fill").foregroundStyle(.tint)
      }
      Menu(Copy.appleOrganize, systemImage: "ellipsis") { CardActions(card: card) }
        .labelStyle(.iconOnly).menuStyle(.borderlessButton).fixedSize()
    }
  }
  private func eventTime(_ start: Date) -> some View {
    HStack(alignment: .firstTextBaseline, spacing: AppleMetrics.space12) {
      Text(cardTime(start)).font(
        .system(size: AppleMetrics.font34, weight: .medium, design: .rounded)
      ).foregroundStyle(settled ? AppleColors.secondary : AppleColors.primary)
      Spacer(minLength: AppleMetrics.space8)
      if let end = card.date("end") {
        VStack(alignment: .trailing, spacing: 2) {
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
