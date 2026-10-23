import Foundation

struct DesignTokens: Decodable {
  let apple: [String: Double]
  struct Group: Decodable {
    struct Token: Decodable {
      let name: String
      let value: String
    }
    let tokens: [Token]
  }
  let spacing: Group
  var loginWidth: Double {
    Double(
      spacing.tokens.first { $0.name == "auth-login-width" }!.value.replacingOccurrences(
        of: "px", with: ""))!
  }
  let appleColors: [String: String]
}
