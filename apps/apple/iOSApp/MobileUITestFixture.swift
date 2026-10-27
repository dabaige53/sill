#if DEBUG
  import Foundation
  import SillKit

  /// Synthetic HTTP fixture for Debug UI tests on iPhone or CI; excluded from Release builds.
  enum MobileUITestFixture {
    static func cloud() -> CloudWorkspace? {
      guard ProcessInfo.processInfo.environment["SILL_UI_TESTING"] == "1" else { return nil }
      let configuration = URLSessionConfiguration.ephemeral
      configuration.protocolClasses = [MobileUITestHTTP.self]
      return CloudWorkspace(vault: MobileUITestVault(), configuration: configuration)
    }
  }

  private final class MobileUITestVault: CloudSessionVault, @unchecked Sendable {
    func load() throws -> Data? {
      try JSONValue.object(["__Host-sill-access": .string("synthetic")]).encoded()
    }
    func save(_ data: Data) throws {}
    func clear() throws {}
  }

  private final class MobileUITestHTTP: URLProtocol, @unchecked Sendable {
    private static let lock = NSLock()
    nonisolated(unsafe) private static var revision = 4
    nonisolated(unsafe) private static var cards: [JSONValue] = [
      .object([
        "id": .string("article"), "type": .string("article"), "title": .string("阅读测试文章"),
        "body": .string(
          "# 第一节\n\n" + String(repeating: "这是一段用于模拟器测试的合成阅读内容。\n\n", count: 35)
            + "# 第二节\n\n" + String(repeating: "继续阅读以检查进度保存与目录跳转。\n\n", count: 35)),
      ]),
      .object([
        "id": .string("note"), "type": .string("note"), "title": .string("测试笔记"),
        "body": .string("仅供测试，无真实账号或个人内容。"),
      ]),
    ]
    nonisolated(unsafe) private static var items: [String: JSONValue] = [
      "article": .object(["addedAt": .number(1_792_886_400_000)])
    ]
    nonisolated(unsafe) private static var preferences: [String: JSONValue] = [:]
    nonisolated(unsafe) private static var seconds: Double = 0

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}
    override func startLoading() {
      do {
        let (status, result) = try Self.lock.withLock { try response() }
        let response = HTTPURLResponse(
          url: request.url!, statusCode: status, httpVersion: nil,
          headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: try result.encoded())
        client?.urlProtocolDidFinishLoading(self)
      } catch { client?.urlProtocol(self, didFailWithError: error) }
    }

    private func response() throws -> (Int, JSONValue) {
      if request.url?.path == "/auth/session" {
        return (200, .object(["userId": .string("ui-test"), "workspaceRead": .bool(true)]))
      }
      if request.url?.path == "/api/v1/workspace/operations" {
        var bytes = request.httpBody ?? Data()
        if let stream = request.httpBodyStream {
          stream.open()
          defer { stream.close() }
          var buffer = [UInt8](repeating: 0, count: 4096)
          while stream.hasBytesAvailable {
            let count = stream.read(&buffer, maxLength: buffer.count)
            guard count > 0 else { break }
            bytes.append(contentsOf: buffer.prefix(count))
          }
        }
        let body = try JSONValue.decode(bytes)
        guard body["expectedRevision"]?.number == Double(Self.revision) else {
          return (409, .object(["error": .object(["code": .string("revision_conflict")])]))
        }
        for operation in body["operations"]?.array ?? [] {
          let id = operation["id"]?.string ?? ""
          switch operation["op"]?.string {
          case "card.delete":
            Self.cards.removeAll { $0["id"]?.string == id }
            Self.items.removeValue(forKey: id)
          case "item.patch":
            var item = Self.items[id]?.object ?? [:]
            item.merge(operation["values"]?.object ?? [:]) { _, value in value }
            Self.items[id] = .object(item)
          case "preferences.patch":
            Self.preferences.merge(operation["values"]?.object ?? [:]) { _, value in value }
          case "reading.add": Self.seconds += operation["seconds"]?.number ?? 0
          default: break
          }
          Self.revision += 1
        }
      }
      return (
        200,
        .object([
          "revision": .number(Double(Self.revision)),
          "state": .object([
            "cards": .array(Self.cards), "items": .object(Self.items),
            "preferences": .object(Self.preferences), "seconds": .number(Self.seconds),
          ]),
        ])
      )
    }
  }
#endif
