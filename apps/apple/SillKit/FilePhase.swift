import Foundation

public enum FilePhase: Sendable {
  case beforeRead
  case beforeWrite
  case afterRename
}

public typealias FileFault = @Sendable (FilePhase, URL) throws -> Void
