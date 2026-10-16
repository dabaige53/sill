import Foundation
import PackagePlugin

@main struct CardGenerator: BuildToolPlugin {
  func createBuildCommands(context: PluginContext, target: Target) async throws -> [Command] {
    let root = context.package.directoryURL.deletingLastPathComponent().deletingLastPathComponent()
    let input = root.appending(path: "contracts/apple-openapi.json")
    let config = context.package.directoryURL.appending(path: "openapi-generator-config.yaml")
    let output = context.pluginWorkDirectoryURL
    let schema = root.appending(path: "contracts/schema.json")
    let embedded = output.appending(path: "ContractSchema.swift")
    let schemaText = try String(contentsOf: schema, encoding: .utf8)
    let literal = String(reflecting: schemaText)
    try "enum ContractSchema { static let json = \(literal) }".write(
      to: embedded, atomically: true, encoding: .utf8)
    let copyURL = root.appending(path: "design-system/copy/zh-Hans.json")
    let copy = try JSONDecoder().decode([String: String].self, from: Data(contentsOf: copyURL))
    let copyOutput = output.appending(path: "Copy.swift")
    let declarations = copy.sorted(by: { $0.key < $1.key }).filter { $0.key.hasPrefix("apple.") }
      .map { key, value in
        let segments = key.components(separatedBy: ".")
        let name =
          segments[0]
          + segments.dropFirst().map { $0.prefix(1).uppercased() + $0.dropFirst() }.joined()
        return
          "    public static var \(name): String { String(localized: \(String(reflecting: key)), defaultValue: \(String(reflecting: value))) }"
      }.joined(separator: "\n")
    try "import Foundation\n\npublic enum Copy {\n\(declarations)\n}\n".write(
      to: copyOutput, atomically: true, encoding: .utf8)
    let tokensURL = root.appending(path: "design-system/tokens.json")
    let tokens = try JSONDecoder().decode(DesignTokens.self, from: Data(contentsOf: tokensURL))
    let metricsOutput = output.appending(path: "AppleMetrics.swift")
    let metrics = tokens.apple.sorted(by: { $0.key < $1.key }).map { key, value in
      "  public static let \(key) = \(value)"
    }.joined(separator: "\n")
    try "public enum AppleMetrics {\n\(metrics)\n}\n".write(
      to: metricsOutput, atomically: true, encoding: .utf8)
    let colorsOutput = output.appending(path: "AppleColors.swift")
    let roles = [
      "windowBackgroundColor": "Color(nsColor: .windowBackgroundColor)",
      "textBackgroundColor": "Color(nsColor: .textBackgroundColor)",
      "controlBackgroundColor": "Color(nsColor: .controlBackgroundColor)",
      "primary": "Color.primary", "secondary": "Color.secondary",
      "orange": "Color.orange", "red": "Color.red", "black": "Color.black",
    ]
    let colors = try tokens.appleColors.sorted(by: { $0.key < $1.key }).map { key, role in
      guard let expression = roles[role] else { throw CocoaError(.coderInvalidValue) }
      return "  public static var \(key): Color { \(expression) }"
    }.joined(separator: "\n")
    try "#if os(macOS)\nimport SwiftUI\n\npublic enum AppleColors {\n\(colors)\n}\n#endif\n".write(
      to: colorsOutput, atomically: true, encoding: .utf8)
    return [
      .buildCommand(
        displayName: "Generate Card Codable from contracts",
        executable: try context.tool(named: "swift-openapi-generator").url,
        arguments: [
          "generate", input.path, "--config", config.path, "--output-directory", output.path,
        ],
        inputFiles: [input, config, schema, copyURL, tokensURL],
        outputFiles: [
          output.appending(path: "Types.swift"), embedded, copyOutput, metricsOutput, colorsOutput,
        ])
    ]
  }
}
