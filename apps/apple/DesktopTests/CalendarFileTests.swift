import Foundation
import Observation
import Testing

@testable import Sill
@testable import SillKit

@MainActor struct CalendarFileTests {
  @Test func eventBecomesOneEscapedVEvent() async throws {
    let (workspace, _) = await ready(
      [],
      extra: [
        .object([
          "id": .string("meet"), "type": .string("event"), "title": .string("周会, 产品;设计"),
          "time": .number(1), "start": .number(1_792_000_000_000),
          "end": .number(1_792_003_600_000), "location": .string("三楼"),
        ])
      ])
    let card = try #require(workspace.model("meet"))
    let text = try #require(CalendarFile.text(card, now: Date(timeIntervalSince1970: 0)))
    #expect(text.hasPrefix("BEGIN:VCALENDAR\r\n"))
    #expect(text.contains("UID:meet@sill.local\r\n"))
    #expect(text.contains("DTSTAMP:19700101T000000Z\r\n"))
    #expect(text.contains("SUMMARY:周会\\, 产品\\;设计\r\n"))
    #expect(text.contains("LOCATION:三楼\r\n"))
    #expect(text.hasSuffix("END:VCALENDAR\r\n"))
  }
}
