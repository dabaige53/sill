import Foundation

enum AppResources {
  // App packages keep resources in Contents/Resources; SwiftPM tests use Bundle.module.
  static let bundle: Bundle = {
    if let url = Bundle.main.url(forResource: "Sill_Sill", withExtension: "bundle"),
      let bundle = Bundle(url: url)
    {
      return bundle
    }
    return .module
  }()
}
