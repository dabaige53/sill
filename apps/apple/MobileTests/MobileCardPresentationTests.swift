import Foundation
import SillKit
import Testing

@testable import SillMobile

@Suite struct MobileCardPresentationTests {
  @Test func contentDatesDistinguishRelativeDaysFutureDatesAndCrossYear() throws {
    let now = try #require(MobileFormat.localDay("2026-01-02"))
    #expect(
      MobileFormat.publication("2026-01-02", now: now) == Copy.text("web.primitives.d5f5a7a01073"))
    #expect(
      MobileFormat.publication("2026-01-01", now: now) == Copy.text("web.primitives.0c184871f658"))
    #expect(MobileFormat.publication("2025-12-31", now: now) == "2025/12/31")
    #expect(MobileFormat.publication("2026-02-03", now: now) == "2/3")
    #expect(
      MobileFormat.publication("2026-01-02", includeTime: true, now: now)
        == Copy.text("web.primitives.d5f5a7a01073"))
  }

  @Test func explicitOffsetsKeepClocksButAmbiguousAndInvalidDatesAreRejected() throws {
    #expect(MobileFormat.parseDate("2026-02-30") == nil)
    #expect(MobileFormat.parseDate("2026-02-29T10:00:00Z") == nil)
    #expect(MobileFormat.parseDate("2026-10-25T14:30") == nil)
    #expect(MobileFormat.parseDate("2024-02-29") != nil)
    let timestamp = "2026-10-25T14:30+08:00"
    let date = try #require(MobileFormat.parseDate(timestamp))
    let text = try #require(MobileFormat.publication(timestamp, includeTime: true, now: date))
    #expect(
      text == Copy.text("web.primitives.d5f5a7a01073") + " "
        + MobileFormat.time(MobileFormat.milliseconds(date)))
    #expect(MobileFormat.parseDate(timestamp) == MobileFormat.parseDate("2026-10-25T06:30:00Z"))
  }

  @Test func publicationIdentityAndEstimateDoNotInventCaptureDates() throws {
    let fields: [String: JSONValue] = [
      "publisher": .object(["name": .string("Journal")]),
      "authors": .array([.object(["name": .string("Ada")]), .object(["name": .string("Journal")])]),
      "sources": .array([.object(["name": .string("Readwise"), "kind": .string("readwise")])]),
      "readingEstimate": .object([
        "seconds": .number(61), "scope": .string("full"), "origin": .string("provided"),
      ]),
      "time": .number(123456),
    ]
    let note = try card("note", fields: fields)
    #expect(note.sourceName == "Readwise")
    #expect(note.publicationName == "Journal · Ada")
    #expect(note.presentationDate.isEmpty)
    #expect(note.presentationSourceLine.hasPrefix("Journal · Ada · "))
    #expect(
      note.readingTime
        == "\(Copy.text("web.metadata.readingFull")) 2 \(Copy.text("web.metadata.readingSuffix"))")
    let article = try card(
      "article", fields: fields.merging(["savedAt": .string("2024-04-07")]) { _, new in new })
    #expect(article.presentationDate == MobileFormat.publication("2024-04-07"))
  }

  @Test func completedRowsRemainVisibleUntilExplicitPreviewRebuild() throws {
    let tasks: [JSONValue] = ["a", "b", "c", "d"].map {
      .object(["id": .string($0), "text": .string($0)])
    }
    let before = try card(
      "task", fields: ["tasks": .array(tasks)], item: ["taskDone": .array([.string("a")])])
    let held = before.previewTasks(holding: []).map(\.id)
    #expect(held == ["b", "c", "d"])
    let after = try card(
      "task", fields: ["tasks": .array(tasks)],
      item: ["taskDone": .array(["a", "b", "c", "d"].map(JSONValue.string))])
    #expect(after.completed)
    #expect(after.previewTasks(holding: held).map(\.id) == held)
    let removed = try card("task", fields: ["tasks": .array(Array(tasks.dropLast()))])
    #expect(removed.previewTasks(holding: ["b", "b", "d", "c"]).map(\.id) == ["b", "c", "a"])
  }

  @Test func readColorAppliesOnlyToReadableTypesAndCompletionHasItsOwnRule() throws {
    for type in ["article", "mail", "note", "media", "suggestion", "photo"] {
      var fields: [String: JSONValue] = [:]
      if type == "media" { fields["media"] = .string("podcast") }
      if type == "photo" { fields["photos"] = .array([.string("coast")]) }
      let value = try card(type, fields: fields, item: ["read": .bool(true)])
      #expect(value.faded(fadeRead: true, now: 0))
      #expect(!value.faded(fadeRead: false, now: 0))
    }
    let video = try card(
      "media", fields: ["media": .string("video"), "image": .string("coast")],
      item: ["read": .bool(true)])
    #expect(video.faded(fadeRead: true, now: 0))
    let reminder = try card("reminder", item: ["reminderDone": .bool(true)])
    #expect(reminder.faded(fadeRead: false, now: 0))
    let event = try card("event", fields: ["start": .number(1000), "end": .number(2000)])
    #expect(!event.faded(fadeRead: true, now: 1999))
    #expect(event.faded(fadeRead: false, now: 2000))
    for type in ["digest", "file", "pr", "task"] {
      let value = try card(type, fields: requiredFields(type), item: ["read": .bool(true)])
      #expect(!value.faded(fadeRead: true, now: 0))
    }
  }

  @Test func namedCoversAttachmentsAndPRObservationStayExplicit() throws {
    let photo = try card(
      "photo", fields: ["photos": .array([.string("coast"), .string("mountain")])])
    #expect(photo.photoSources == ["coast", "mountain"])
    let mail = try card(
      "mail",
      fields: ["attachment": .string("report.pdf"), "sentAt": .string("2026-10-25T08:10:00Z")])
    #expect(mail.attachments.first?["name"]?.string == "report.pdf")
    #expect(
      mail.presentationDate == MobileFormat.publication("2026-10-25T08:10:00Z", includeTime: true))
    let pr = try card("pr", fields: requiredFields("pr"))
    #expect(
      pr.presentationDate == MobileFormat.publication("2026-10-25T08:10:00Z", includeTime: true))
    #expect(pr.raw["pullRequest"]?["comments"] == nil)
  }

  private func requiredFields(_ type: String) -> [String: JSONValue] {
    switch type {
    case "task":
      return ["tasks": .array([.object(["id": .string("one"), "text": .string("Todo")])])]
    case "file": return ["files": .array([.object(["name": .string("report.pdf")])])]
    case "pr":
      return [
        "pullRequest": .object([
          "repository": .string("example/project"), "number": .number(7), "state": .string("open"),
          "observedAt": .string("2026-10-25T08:10:00Z"),
        ])
      ]
    default: return [:]
    }
  }
  private func card(
    _ type: String, fields: [String: JSONValue] = [:],
    item: [String: JSONValue] = [:]
  ) throws -> MobileCard {
    let base: [String: JSONValue] = [
      "id": .string("synthetic"), "type": .string(type), "title": .string("Synthetic"),
    ]
    return try MobileCard(
      card: Card(json: .object(base.merging(fields) { _, new in new })), item: .object(item))
  }
}
