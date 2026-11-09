import Foundation
import Testing

@testable import SillKit

final class MemoryCloudVault: CloudSessionVault, @unchecked Sendable {
  private let lock = NSLock()
  private var value: Data?
  func load() throws -> Data? { lock.withLock { value } }
  func save(_ data: Data) throws { lock.withLock { value = data } }
  func clear() throws { lock.withLock { value = nil } }
}

final class CloudProtocol: URLProtocol, @unchecked Sendable {
  static let lock = NSLock()
  nonisolated(unsafe) static var handler:
    ((URLRequest) throws -> (Int, [String: String], JSONValue))?
  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func startLoading() {
    do {
      let handler = Self.lock.withLock { Self.handler }
      let (status, headers, json) = try handler!(request)
      let response = HTTPURLResponse(
        url: request.url!, statusCode: status, httpVersion: nil,
        headerFields: headers)!
      client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
      client?.urlProtocol(self, didLoad: try json.encoded())
      client?.urlProtocolDidFinishLoading(self)
    } catch { client?.urlProtocol(self, didFailWithError: error) }
  }
  override func stopLoading() {}
}

extension CloudWorkspaceTests {
  var empty: JSONValue {
    .object([
      "revision": .number(0),
      "state": .object([
        "cards": .array([]), "items": .object([:]), "preferences": .object([:]),
        "seconds": .number(0),
      ]),
    ])
  }
  func make(
    _ handler: @escaping (URLRequest) throws -> (Int, [String: String], JSONValue),
    vault: MemoryCloudVault = MemoryCloudVault()
  ) -> CloudWorkspace {
    CloudProtocol.lock.withLock { CloudProtocol.handler = handler }
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [CloudProtocol.self]
    return CloudWorkspace(vault: vault, configuration: config)
  }
  func auth(_ request: URLRequest) -> (Int, [String: String], JSONValue)? {
    #expect(request.url?.host == "sill-web-preview.scs1213-temp-email.workers.dev")
    #expect(
      request.value(forHTTPHeaderField: "Origin")
        == "https://sill-web-preview.scs1213-temp-email.workers.dev")
    switch request.url?.path {
    case "/auth/password":
      return (
        200,
        [
          "Set-Cookie":
            "__Host-sill-access=synthetic; Secure; Path=/, __Host-sill-refresh=synthetic-refresh; Secure; Path=/"
        ], .object([:])
      )
    case "/auth/session":
      #expect(
        request.value(forHTTPHeaderField: "Cookie")?.contains(
          "__Host-sill-refresh=synthetic-refresh") == true)
      return (
        200, [:], .object(["userId": .string("synthetic-owner"), "workspaceRead": .bool(true)])
      )
    default: return nil
    }
  }
}
