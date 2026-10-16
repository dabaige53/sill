// Design-only example, iOS 15+ / macOS 12+. No main(), credentials or automatic writes.
// Compile on an Apple development machine: xcrun swiftc -typecheck SillClient.swift
import Foundation

struct ReadingState: Codable, Sendable {
  var read: Bool?
  var done: Bool?
  var archived: Bool?
}
struct Card: Codable, Sendable {
  let id: String
  let title: String
  let type: String
  let body: [String]
  let state: ReadingState
  let revision: Int64
  let createdAt: String  // RFC 3339 UTC wire value; format for display in the UI.
  let updatedAt: String
  let deleted: Bool
  let url: String?

  enum CodingKeys: String, CodingKey {
    case id
    case title
    case type
    case body
    case state
    case revision
    case createdAt = "created_at"
    case updatedAt = "updated_at"
    case deleted
    case url
  }
}
struct CardPage: Codable, Sendable {
  let items: [Card]
  let nextCursor: String?
  let syncCursor: String?

  enum CodingKeys: String, CodingKey {
    case items
    case nextCursor = "next_cursor"
    case syncCursor = "sync_cursor"
  }
}
struct CreateCard: Encodable, Sendable {
  let title: String
  let type: String
  let body: [String]
}
struct Changes: Encodable, Sendable {
  var title: String? = nil
  var body: [String]? = nil
  var state: ReadingState? = nil
}
struct ResultMetadata: Encodable, Sendable {
  let eventId: String
  let outcome: String
  let summary: String

  enum CodingKeys: String, CodingKey {
    case eventId = "event_id"
    case outcome
    case summary
  }
}
struct UpdateCard: Encodable, Sendable {
  let expectedRevision: Int64
  var changes: Changes? = nil
  var metadata: ResultMetadata? = nil
}
struct DeleteCard: Encodable { let expectedRevision: Int64 }
struct SubmitEvent: Encodable, Sendable {
  let eventId: String
  let cardId: String
  let cardVersion: Int64
  let action: String
  let destinationRef: String

  enum CodingKeys: String, CodingKey {
    case eventId = "event_id"
    case cardId = "card_id"
    case cardVersion = "card_version"
    case action
    case destinationRef = "destination_ref"
  }
}
struct DeliveryEvent: Codable, Sendable {
  let eventId: String
  let cardId: String
  let cardVersion: Int64
  let action: String
  let destinationRef: String
  let delivery: String
  let outcome: String
  let createdAt: String
  let updatedAt: String
  let resultRevision: Int64?
  let summary: String

  enum CodingKeys: String, CodingKey {
    case eventId = "event_id"
    case cardId = "card_id"
    case cardVersion = "card_version"
    case action
    case destinationRef = "destination_ref"
    case delivery
    case outcome
    case createdAt = "created_at"
    case updatedAt = "updated_at"
    case resultRevision = "result_revision"
    case summary
  }
}
struct ErrorEnvelope: Decodable {
  struct Detail: Decodable {
    let code: String
    let message: String
    let requestId: String
    let currentRevision: Int64?
    let retryAfterSeconds: Int?

    enum CodingKeys: String, CodingKey {
      case code
      case message
      case requestId = "request_id"
      case currentRevision = "current_revision"
      case retryAfterSeconds = "retry_after_seconds"
    }
  }
  let error: Detail
}
enum SillClientError: Error {
  case invalidURL, invalidID, invalidResponse
  case http(Int, ErrorEnvelope?)
}
// Credentials must never follow redirects to an untrusted host.
final class NoRedirect: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
  func urlSession(
    _ session: URLSession, task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void
  ) {
    completionHandler(nil)
  }
}
@available(iOS 15.0, macOS 12.0, *)
actor SillClient {
  private let base: URL
  private let session: URLSession
  private let token: @Sendable () async throws -> String
  // Inject a Keychain-backed token provider; no token in UserDefaults or source code.
  init(base: URL, token: @escaping @Sendable () async throws -> String) throws {
    guard base.scheme == "https", base.host != nil, base.user == nil,
      base.password == nil, base.query == nil, base.fragment == nil,
      base.path == "/api/v1"
    else { throw SillClientError.invalidURL }
    self.base = base
    self.token = token
    let config = URLSessionConfiguration.ephemeral
    config.timeoutIntervalForRequest = 15
    self.session = URLSession(configuration: config, delegate: NoRedirect(), delegateQueue: nil)
  }
  private func idPath(_ prefix: String, _ id: String) throws -> String {
    guard id.range(of: "^[a-zA-Z0-9_-]{1,100}$", options: .regularExpression) != nil
    else { throw SillClientError.invalidID }
    return prefix + "/" + id
  }
  private func request<T: Decodable>(
    _ path: String, method: String = "GET",
    query: [URLQueryItem] = [], body: Data? = nil,
    key: String? = nil
  ) async throws -> T {
    guard
      var parts = URLComponents(
        url: base.appendingPathComponent(path), resolvingAgainstBaseURL: false)
    else { throw SillClientError.invalidURL }
    if !query.isEmpty { parts.queryItems = query }
    guard let url = parts.url else { throw SillClientError.invalidURL }
    var req = URLRequest(url: url)
    req.httpMethod = method
    req.httpBody = body
    req.setValue("application/json", forHTTPHeaderField: "Accept")
    if body != nil { req.setValue("application/json", forHTTPHeaderField: "Content-Type") }
    req.setValue("Bearer " + (try await token()), forHTTPHeaderField: "Authorization")
    if let key { req.setValue(key, forHTTPHeaderField: "Idempotency-Key") }
    let (data, response) = try await session.data(for: req)
    guard let http = response as? HTTPURLResponse else { throw SillClientError.invalidResponse }
    guard (200..<300).contains(http.statusCode) else {
      throw SillClientError.http(
        http.statusCode, try? JSONDecoder().decode(ErrorEnvelope.self, from: data))
    }
    return try JSONDecoder().decode(T.self, from: data)
  }
  func list(cursor: String? = nil, since: String? = nil) async throws -> CardPage {
    var query = [URLQueryItem(name: "limit", value: "50")]
    if let cursor { query.append(URLQueryItem(name: "cursor", value: cursor)) }
    if let since { query.append(URLQueryItem(name: "since", value: since)) }
    return try await request("contents", query: query)
  }
  func get(id: String) async throws -> Card { try await request(idPath("contents", id)) }
  func create(_ body: CreateCard, key: String) async throws -> Card {
    try await request("contents", method: "POST", body: JSONEncoder().encode(body), key: key)
  }
  func update(id: String, body: UpdateCard, key: String) async throws -> Card {
    try await request(
      idPath("contents", id), method: "PATCH", body: JSONEncoder().encode(body), key: key)
  }
  func delete(id: String, revision: Int64, key: String) async throws -> Card {
    try await request(
      idPath("contents", id), method: "DELETE",
      body: JSONEncoder().encode(DeleteCard(expectedRevision: revision)), key: key)
  }
  func submit(_ body: SubmitEvent, key: String) async throws -> DeliveryEvent {
    try await request("events", method: "POST", body: JSONEncoder().encode(body), key: key)
  }
  func event(id: String) async throws -> DeliveryEvent { try await request(idPath("events", id)) }
}
// UI usage (not executed):
// let baseline = try await client.get(id: selectedID)
// let saved = try await client.update(id: baseline.id,
//     body: UpdateCard(expectedRevision: baseline.revision, changes: Changes(title: draftTitle)),
//     key: persistedUserActionKey)
// Keep baseline + draft + key until acknowledged. On 409: fetch, compare and let user merge.
// A cancelled Task/network timeout does not prove a write was rolled back; never auto-retry a new key.
