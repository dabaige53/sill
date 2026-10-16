import Foundation

public enum StoreError: Error, Equatable, Sendable {
  case conflict
  case invalidSnapshot
  case unavailable(Int32)
  case unknownWrite
  case workspaceInUse
}
