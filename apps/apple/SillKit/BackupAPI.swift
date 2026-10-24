import Foundation

/// Uses the existing account session transport; no separate session or credential cache.
public typealias BackupRequest = @Sendable (String, String, JSONValue?) async throws -> JSONValue

public struct BackupRestore: Sendable {
  public let body: JSONValue
  public init(preview: JSONValue) throws {
    guard let id = preview["backupId"]?.string, let digest = preview["digest"]?.string,
      let revision = preview["expectedRevision"]?.number
    else { throw CloudWorkspaceError.invalidResponse }
    body = .object([
      "backupId": .string(id), "digest": .string(digest), "expectedRevision": .number(revision),
      "confirmed": .bool(true), "idempotencyKey": .string(UUID().uuidString),
    ])
  }
}
