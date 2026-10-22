// swift-tools-version: 6.0
import PackageDescription

let package = Package(
  name: "Sill",
  platforms: [.macOS(.v14), .iOS(.v17)],
  products: [
    .library(name: "SillKit", targets: ["SillKit"]),
    .library(name: "SillMobile", targets: ["SillMobile"]),
    .executable(name: "Sill", targets: ["Sill"]),
  ],
  dependencies: [
    .package(url: "https://github.com/swiftlang/swift-markdown.git", exact: "0.9.0"),
    .package(url: "https://github.com/apple/swift-openapi-generator", exact: "1.9.0"),
    .package(url: "https://github.com/apple/swift-openapi-runtime", exact: "1.9.0"),
  ],
  targets: [
    .target(
      name: "SillKit",
      dependencies: [
        .product(name: "OpenAPIRuntime", package: "swift-openapi-runtime"),
        .product(name: "Markdown", package: "swift-markdown"),
      ],
      path: "SillKit", plugins: ["CardGenerator"]),
    .executableTarget(
      name: "Sill", dependencies: ["SillKit"], path: "macOS", resources: [.process("Resources")]),
    .target(name: "SillMobile", dependencies: ["SillKit"], path: "iOS"),
    .executableTarget(name: "SillStoreProbe", dependencies: ["SillKit"], path: "Tests/Probe"),
    .testTarget(
      name: "SillKitTests", dependencies: ["SillKit", "SillStoreProbe"], path: "Tests",
      exclude: ["Probe"]),
    .testTarget(name: "SillDesktopTests", dependencies: ["Sill", "SillKit"], path: "DesktopTests"),
    .plugin(
      name: "CardGenerator", capability: .buildTool(),
      dependencies: [.product(name: "swift-openapi-generator", package: "swift-openapi-generator")]),
  ]
)
