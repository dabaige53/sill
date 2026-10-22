import Foundation
import Testing

@testable import Sill
@testable import SillKit

@MainActor struct CardRichFieldsTests {
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
