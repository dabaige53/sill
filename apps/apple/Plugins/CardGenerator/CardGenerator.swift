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
    // Reject stale literal references before they can surface as raw keys in the native UI.
    let sourceDirectory = context.package.directoryURL.appending(path: "macOS")
    let copyPattern = try NSRegularExpression(pattern: #""(web\.[A-Za-z0-9_.]+)""#)
    for source in try FileManager.default.contentsOfDirectory(
      at: sourceDirectory, includingPropertiesForKeys: nil)
    where source.pathExtension == "swift" {
      let text = try String(contentsOf: source, encoding: .utf8)
      let matches = copyPattern.matches(in: text, range: NSRange(text.startIndex..., in: text))
      for match in matches {
        guard let range = Range(match.range(at: 1), in: text) else { continue }
        let key = String(text[range])
        guard !key.hasSuffix("."), copy[key] == nil else { continue }
        throw NSError(
          domain: "Sill.Copy", code: 1,
          userInfo: [
            NSLocalizedDescriptionKey:
              "Missing copy key \(key) in \(source.lastPathComponent)"
          ])
      }
    }
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
    let allCopy = copy.sorted(by: { $0.key < $1.key }).map { key, value in
      "\(String(reflecting: key)): \(String(reflecting: value))"
    }.joined(separator: ",\n")
    let sharedCopy = """
        private static let values: [String: String] = [\(allCopy)]
        public static func text(_ key: String) -> String { values[key] ?? key }
      """
    try "import Foundation\n\npublic enum Copy {\n\(declarations)\n\(sharedCopy)\n}\n".write(
      to: copyOutput, atomically: true, encoding: .utf8)
    let iconDirectory = root.appending(path: "design-system/assets/Icons")
    let iconFiles = try FileManager.default.contentsOfDirectory(
      at: iconDirectory, includingPropertiesForKeys: nil
    )
    .filter { $0.pathExtension == "svg" }.sorted { $0.path < $1.path }
    let iconValues = try iconFiles.map { file in
      "\(String(reflecting: file.deletingPathExtension().lastPathComponent)): \(String(reflecting: try String(contentsOf: file, encoding: .utf8)))"
    }.joined(separator: ",\n")
    let iconOutput = output.appending(path: "IconSVG.swift")
    try "public enum IconSVG { public static let values: [String: String] = [\(iconValues)] }"
      .write(to: iconOutput, atomically: true, encoding: .utf8)
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
      if role.hasPrefix("#") {
        let pair = role.split(separator: "/").map { String($0.dropFirst()) }
        guard pair.count == 2, let light = UInt32(pair[0], radix: 16),
          let dark = UInt32(pair[1], radix: 16)
        else { throw CocoaError(.coderInvalidValue) }
        return
          "  public static var \(key): Color { adaptive(\(light), \(dark), alpha: \(pair[0].count == 8)) }"
      }
      guard let expression = roles[role] else { throw CocoaError(.coderInvalidValue) }
      return "  public static var \(key): Color { \(expression) }"
    }.joined(separator: "\n")
    let adaptive = """
        private static func adaptive(_ light: UInt32, _ dark: UInt32, alpha: Bool) -> Color {
          Color(nsColor: NSColor(name: nil) { appearance in
            let value = appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? dark : light
            let hex = alpha ? value >> 8 : value
            return NSColor(srgbRed: Double((hex >> 16) & 255) / 255,
              green: Double((hex >> 8) & 255) / 255, blue: Double(hex & 255) / 255,
              alpha: alpha ? Double(value & 255) / 255 : 1)
          })
        }
      """
    try
      "#if os(macOS)\nimport SwiftUI\n\npublic enum AppleColors {\n\(colors)\n\(adaptive)\n}\n#endif\n"
      .write(
        to: colorsOutput, atomically: true, encoding: .utf8)
    return [
      .buildCommand(
        displayName: "Generate Card Codable from contracts",
        executable: try context.tool(named: "swift-openapi-generator").url,
        arguments: [
          "generate", input.path, "--config", config.path, "--output-directory", output.path,
        ],
        inputFiles: [input, config, schema, copyURL, tokensURL] + iconFiles,
        outputFiles: [
          output.appending(path: "Types.swift"), embedded, copyOutput, metricsOutput, colorsOutput,
          iconOutput,
        ])
    ]
  }
}
