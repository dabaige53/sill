import Foundation

extension CardValidator {
  static func validateRichFields(_ card: [String: JSONValue], type: String) throws {
    var labels = (card["chapters"]?.array ?? []).compactMap { $0["title"]?.string }
    labels += (card["transcript"]?.array ?? []).compactMap { $0["text"]?.string }
    if let pr = card["pullRequest"] {
      labels += [
        pr["headBranch"]?.string, pr["baseBranch"]?.string,
      ].compactMap { $0 }
      labels += (pr["reviewers"]?.array ?? []).compactMap { $0["login"]?.string }
      labels += (pr["checks"]?.array ?? []).compactMap { $0["name"]?.string }
    }
    guard !labels.contains(where: { $0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty })
    else { throw CardValidationError("card.emptyRichField") }
    if card["audioUrl"] != nil && (type != "media" || card["media"]?.string != "podcast") {
      throw CardValidationError("card.audioUrl")
    }
    if card["pullRequest"] != nil && type != "pr" || type == "pr" && card["pullRequest"] == nil {
      throw CardValidationError("card.pullRequest")
    }
    for field in ["chapters", "transcript"] {
      if card[field] != nil && type != "media" { throw CardValidationError("card." + field) }
      var previous: Double = -1
      for entry in card[field]?.array ?? [] {
        guard let start = entry["start"]?.number, start > previous,
          card["duration"]?.number.map({ start <= $0 }) ?? true
        else { throw CardValidationError("card." + field) }
        previous = start
      }
    }
    if let pr = card["pullRequest"] {
      guard let date = pr["observedAt"]?.string, validDate(date, dateOnly: false) else {
        throw CardValidationError("card.pullRequest.observedAt")
      }
      for check in pr["checks"]?.array ?? [] {
        if check["conclusion"] != nil && check["status"]?.string != "completed" {
          throw CardValidationError("card.pullRequest.checks")
        }
      }
    }
  }
}
