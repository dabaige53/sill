import Foundation
import SillKit

/// Typed snapshots for the dedicated card layouts. Unknown facts remain nil.
struct CardRichFields: Equatable, Sendable {
  struct Party: Equatable, Sendable {
    let name: String
    let login: String
    let url: URL?
    init(_ value: JSONValue) {
      login = value["login"]?.string ?? value["name"]?.string ?? ""
      name = value["name"]?.string ?? value["login"]?.string ?? ""
      url = value["url"]?.string.flatMap(URL.init(string:))
    }
  }
  struct Chapter: Equatable, Sendable {
    let start: Double
    let title: String
  }
  struct Transcript: Equatable, Sendable {
    let start: Double
    let text: String
  }
  struct PullRequest: Equatable, Sendable {
    struct Reviewer: Equatable, Sendable {
      let login: String
      let url: URL?
      let decision: String
    }
    struct Check: Equatable, Sendable {
      let name: String
      let status: String
      let conclusion: String?
      let url: URL?
    }
    let repository: String
    let number: Int
    let state: String
    let observedAt: String
    let headBranch: String?
    let baseBranch: String?
    let reviewers: [Reviewer]
    let checks: [Check]
    let additions: Int?
    let deletions: Int?
    let changedFiles: Int?
    let reviewRequested: Bool?
    init(_ v: JSONValue) {
      repository = v["repository"]?.string ?? ""
      number = Int(v["number"]?.number ?? 0)
      state = v["state"]?.string ?? ""
      observedAt = v["observedAt"]?.string ?? ""
      headBranch = v["headBranch"]?.string
      baseBranch = v["baseBranch"]?.string
      reviewers = (v["reviewers"]?.array ?? []).map {
        Reviewer(
          login: $0["login"]?.string ?? "", url: $0["url"]?.string.flatMap(URL.init(string:)),
          decision: $0["decision"]?.string ?? "")
      }
      checks = (v["checks"]?.array ?? []).map {
        Check(
          name: $0["name"]?.string ?? "", status: $0["status"]?.string ?? "",
          conclusion: $0["conclusion"]?.string, url: $0["url"]?.string.flatMap(URL.init(string:)))
      }
      additions = v["additions"]?.number.map(Int.init)
      deletions = v["deletions"]?.number.map(Int.init)
      changedFiles = v["changedFiles"]?.number.map(Int.init)
      reviewRequested = v["reviewRequested"]?.bool
    }
  }
  let authors: [Party]
  let audioURL: URL?
  let chapters: [Chapter]
  let transcript: [Transcript]
  let pullRequest: PullRequest?
  init(raw: JSONValue) {
    authors = (raw["authors"]?.array ?? []).map(Party.init)
    audioURL = raw["audioUrl"]?.string.flatMap(URL.init(string:))
    chapters = (raw["chapters"]?.array ?? []).map {
      Chapter(start: $0["start"]?.number ?? 0, title: $0["title"]?.string ?? "")
    }
    transcript = (raw["transcript"]?.array ?? []).map {
      Transcript(start: $0["start"]?.number ?? 0, text: $0["text"]?.string ?? "")
    }
    pullRequest = raw["pullRequest"].map(PullRequest.init)
  }
}

extension CardModel {
  var authors: [CardRichFields.Party] { rich.authors }
  /// Author names, else the source names (Web `publicationName`).
  var publicationName: String {
    let names = authors.map(\.name).filter { !$0.isEmpty }.uniqued()
    return names.isEmpty ? sourceName : names.joined(separator: " · ")
  }
  /// The first author is the mail sender (ADR 0086).
  var sender: String? {
    authors.first?.name.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
  }
  var audioURL: URL? { rich.audioURL }
  var chapters: [CardRichFields.Chapter] { rich.chapters }
  var transcript: [CardRichFields.Transcript] { rich.transcript }
  var pullRequest: CardRichFields.PullRequest? { rich.pullRequest }
}
