import Foundation
import SillKit

/// Typed snapshots for the dedicated card layouts. Unknown facts remain nil.
struct CardRichFields: Equatable, Sendable {
  struct Party: Equatable, Sendable {
    let name: String
    let url: URL?
    init(_ value: JSONValue) {
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
  struct Why: Equatable, Sendable {
    let reason: String
    let basis: [String]
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
    struct File: Equatable, Sendable {
      let path: String
      let additions: Int?
      let deletions: Int?
    }
    let repository: String
    let number: Int
    let state: String
    let observedAt: String
    let headBranch: String?
    let baseBranch: String?
    let author: Party?
    let reviewers: [Reviewer]
    let checks: [Check]
    let additions: Int?
    let deletions: Int?
    let changedFiles: Int?
    let comments: Int?
    let reviewRequested: Bool?
    let files: [File]
    init(_ v: JSONValue) {
      repository = v["repository"]?.string ?? ""
      number = Int(v["number"]?.number ?? 0)
      state = v["state"]?.string ?? ""
      observedAt = v["observedAt"]?.string ?? ""
      headBranch = v["headBranch"]?.string
      baseBranch = v["baseBranch"]?.string
      author = v["author"].map(Party.init)
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
      comments = v["comments"]?.number.map(Int.init)
      reviewRequested = v["reviewRequested"]?.bool
      files = (v["files"]?.array ?? []).map {
        File(
          path: $0["path"]?.string ?? "", additions: $0["additions"]?.number.map(Int.init),
          deletions: $0["deletions"]?.number.map(Int.init))
      }
    }
  }
  let authors: [Party]
  let publisher: Party?
  let coverageStart: Double?
  let coverageEnd: Double?
  let why: Why?
  let audioURL: URL?
  let chapters: [Chapter]
  let transcript: [Transcript]
  let attachments: [CardModel.FileItem]
  let pullRequest: PullRequest?
  init(raw: JSONValue) {
    authors = (raw["authors"]?.array ?? []).map(Party.init)
    publisher = raw["publisher"].map(Party.init)
    coverageStart = raw["coverageStart"]?.number
    coverageEnd = raw["coverageEnd"]?.number
    why = raw["why"].map {
      Why(reason: $0["reason"]?.string ?? "", basis: $0["basis"]?.strings ?? [])
    }
    audioURL = raw["audioUrl"]?.string.flatMap(URL.init(string:))
    chapters = (raw["chapters"]?.array ?? []).map {
      Chapter(start: $0["start"]?.number ?? 0, title: $0["title"]?.string ?? "")
    }
    transcript = (raw["transcript"]?.array ?? []).map {
      Transcript(start: $0["start"]?.number ?? 0, text: $0["text"]?.string ?? "")
    }
    attachments =
      (raw["attachments"]?.array ?? raw["attachment"]?.string.map {
        [.object(["name": .string($0)])]
      } ?? []).map { v in
        CardModel.FileItem(
          name: v["name"]?.string ?? "",
          detail: [
            ((v["name"]?.string ?? "") as NSString).pathExtension.uppercased().nilIfEmpty ?? v[
              "mimeType"]?.string ?? "", Format.fileSize(v["sizeBytes"]?.number.map(Int.init)),
          ].filter { !$0.isEmpty }.joined(separator: " · "), modifiedAt: nil,
          isImage: v["mimeType"]?.string?.hasPrefix("image/") ?? false,
          url: v["url"]?.string.flatMap(URL.init(string:)))
      }
    pullRequest = raw["pullRequest"].map(PullRequest.init)
  }
}

extension CardModel {
  var authors: [CardRichFields.Party] { rich.authors }
  var publisher: CardRichFields.Party? { rich.publisher }
  var publicationName: String {
    let names = ([publisher?.name].compactMap { $0 } + authors.map(\.name)).filter { !$0.isEmpty }
      .uniqued()
    return names.isEmpty ? sourceName : names.joined(separator: " · ")
  }
  var coverageStart: Double? { rich.coverageStart }
  var coverageEnd: Double? { rich.coverageEnd }
  var why: CardRichFields.Why? { rich.why }
  var audioURL: URL? { rich.audioURL }
  var chapters: [CardRichFields.Chapter] { rich.chapters }
  var transcript: [CardRichFields.Transcript] { rich.transcript }
  var attachments: [FileItem] { rich.attachments }
  var pullRequest: CardRichFields.PullRequest? { rich.pullRequest }
}
