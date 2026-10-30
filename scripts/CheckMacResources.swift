import AppKit
import Foundation

@main
struct CheckMacResources {
  enum Failure: Error {
    case bundleOutsideApp(URL)
    case invalidImage(String)
  }

  @MainActor static func main() throws {
    let expected = Bundle.main.bundleURL.appendingPathComponent(
      "Contents/Resources/Sill_Sill.bundle")
    let bundle = AppResources.bundle
    guard bundle.bundleURL.standardizedFileURL == expected.standardizedFileURL else {
      throw Failure.bundleOutsideApp(bundle.bundleURL)
    }
    for filename in CommandLine.arguments.dropFirst() {
      let path = filename as NSString
      guard let url = bundle.url(forResource: path.deletingPathExtension, withExtension: "png"),
        let image = NSImage(contentsOf: url), image.isValid
      else { throw Failure.invalidImage(filename) }
    }
    print("Packaged resource bundle and images verified without UI")
  }
}
