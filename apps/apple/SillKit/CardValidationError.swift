import Foundation

public struct CardValidationError: Error, Equatable, Sendable {
  public let path: String
  public init(_ path: String) { self.path = path }
}
