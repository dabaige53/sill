import Darwin
import Foundation
import SillKit

@main struct SillStoreProbe {
  static func main() async throws {
    let arguments = CommandLine.arguments
    guard arguments.count >= 3 else { exit(2) }
    let directory = URL(fileURLWithPath: arguments[2], isDirectory: true)
    if arguments[1] == "session" {
      let session = try WorkspaceSession(directory: directory)
      FileHandle.standardOutput.write(Data("locked\n".utf8))
      withExtendedLifetime(session) {
        while true { sleep(1) }
      }
    }
    if arguments[1] == "hold" {
      let descriptor = open(
        directory.appendingPathComponent("cards.json.lock").path, O_RDWR | O_CREAT, 0o600)
      guard descriptor >= 0, flock(descriptor, LOCK_EX) == 0 else { exit(3) }
      FileHandle.standardOutput.write(Data("locked\n".utf8))
      while true { sleep(1) }
    }
    let store = try CardStore(directory: directory)
    let card = try Card(
      json: .object([
        "id": .string("process"), "type": .string("note"), "title": .string("Process"),
      ]))
    do {
      _ = try await store.upsert(card, expectedRevision: Int(arguments[3])!)
      exit(0)
    } catch StoreError.conflict { exit(4) }
  }
}
