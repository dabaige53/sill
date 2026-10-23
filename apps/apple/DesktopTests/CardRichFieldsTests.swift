import Foundation
import Testing

@testable import Sill
@testable import SillKit

@MainActor struct CardRichFieldsTests {
  @Test func contentDateLabelsShareLocalCalendarAndPrecision() throws {
    let now = try #require(Format.localDay("2026-10-22"))
    for (value, label) in [
      ("2026-10-22", "今天"), ("2026-10-21", "昨天"), ("2026-10-18", "10/18"),
      ("2025-10-18", "2025/10/18"), ("2026-10-23", "10/23"),
    ] {
      let date = try #require(Format.localDay(value))
      #expect(Format.shortDay(date, now: now) == label)
      #expect(Format.publication(value, now: now) == label)
      #expect(Format.publication(value, includeTime: true, now: now) == label)
    }
    let clock = try #require(
      Calendar.current.date(bySettingHour: 9, minute: 30, second: 0, of: now))
    let timestamp = ISO8601DateFormatter().string(from: clock)
    #expect(Format.publication(timestamp, includeTime: true, now: now) == "今天 09:30")
  }

  @Test func cardAndDetailUseTheSameCurrentPublicationDay() throws {
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyy-MM-dd"
    let today = formatter.string(from: .now)
    for kind in ["note", "media", "suggestion"] {
      let raw = try JSONValue.decode(
        Data(
          """
          {"id":"dated-content","type":"\(kind)","title":"Title","image":"coast","publisher":{"name":"Source"},"publishedAt":"\(today)"}
          """.utf8))
      let model = try CardModel(card: Card(json: raw))
      #expect(model.displaySourceLine == "Source · 今天")
      #expect(model.publication.date == "今天")
      #expect(model.publication.dateTitle == today)
      #expect(ReaderContent.fullDate(today) == "今天")
    }
  }

  @Test func snapshotKeepsUnknownCountsAndOriginalObservationTime() throws {
    let raw = try JSONValue.decode(
      Data(
        """
        {"id":"pr-model","type":"pr","title":"Review","pullRequest":{"repository":"example/repo","number":7,"state":"open","observedAt":"2026-10-22T13:00:00+08:00","comments":0,"author":{"login":"writer"}}}
        """.utf8))
    let model = try CardModel(card: Card(json: raw))
    let pr = try #require(model.pullRequest)
    #expect(pr.comments == 0)
    #expect(pr.additions == nil)
    #expect(pr.reviewRequested == nil)
    #expect(pr.observedAt == "2026-10-22T13:00:00+08:00")
    #expect(pr.author?.name == "writer")
  }

  @Test func explicitEmptyAttachmentsClearLegacyLabel() throws {
    let raw = try JSONValue.decode(
      Data(
        """
        {"id":"mail-model","type":"mail","title":"Mail","attachment":"legacy.pdf"}
        """.utf8))
    let legacy = try CardModel(card: Card(json: raw))
    #expect(legacy.attachments.map(\.name) == ["legacy.pdf"])
    var cleared = try #require(raw.object)
    cleared["attachments"] = .array([])
    #expect(try CardModel(card: Card(json: .object(cleared))).attachments.isEmpty)
  }

  @Test func publicationAndFileURLAreReadyForViews() throws {
    let raw = try JSONValue.decode(
      Data(
        """
        {"id":"file-model","type":"file","title":"File","publisher":{"name":"Journal"},"authors":[{"name":"Writer"},{"name":"Journal"}],"files":[{"name":"A","url":"https://example.com/a"}]}
        """.utf8))
    let model = try CardModel(card: Card(json: raw))
    #expect(model.publicationName == "Journal · Writer")
    #expect(model.files.first?.url?.absoluteString == "https://example.com/a")
  }
}
