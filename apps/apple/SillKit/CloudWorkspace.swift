import Foundation
import Security

public enum CloudWorkspaceError: Error, Equatable, Sendable {
  case unauthenticated
  case service(String, Int)
  case invalidResponse
  case sessionStorage
  case unknownWrite
}

public struct CloudWorkspaceState: Sendable {
  public let owner: String
  public let json: JSONValue
  public let needsPasswordSetup: Bool
  public var revision: JSONValue? { json["revision"] }
}

private final class CloudRedirectPolicy: NSObject, URLSessionTaskDelegate, Sendable {
  func urlSession(
    _ session: URLSession, task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
    completionHandler: @escaping @Sendable (URLRequest?) -> Void
  ) { completionHandler(nil) }
}

public actor CloudWorkspace {
  private static let cookieNames = [
    "__Host-sill-access", "__Host-sill-refresh",
    "__Host-sill-pkce", "__Host-sill-login-until", "__Host-sill-password-setup",
  ]
  private let origin = URL(string: "https://sill-web-preview.scs1213-temp-email.workers.dev")!
  private let session: URLSession
  private let vault: any CloudSessionVault
  private var cookies: [String: String] = [:]
  private var expirations: [String: Double] = [:]
  private var owner: String?
  private var needsPasswordSetup = false
  private var busy = false
  private var pending: (key: String, body: JSONValue, baseline: JSONValue)?
  public var pendingWriteKey: String? { pending?.key }

  public init(
    vault: any CloudSessionVault = KeychainCloudSessionVault(),
    configuration: URLSessionConfiguration = .ephemeral
  ) {
    self.vault = vault
    configuration.httpCookieStorage = nil
    configuration.urlCache = nil
    configuration.httpShouldSetCookies = false
    configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
    configuration.timeoutIntervalForRequest = 20
    self.session = URLSession(
      configuration: configuration, delegate: CloudRedirectPolicy(),
      delegateQueue: nil)
  }

  public func login(email: String, password: String) async throws -> CloudWorkspaceState {
    guard !busy else { throw CloudWorkspaceError.service("busy", 409) }
    busy = true
    defer { busy = false }
    guard pending == nil else { throw CloudWorkspaceError.unknownWrite }
    try clearSession()
    _ = try await request(
      "/auth/password", method: "POST",
      body: .object(["email": .string(email), "password": .string(password)]))
    try await identify()
    return try await fetchWorkspace()
  }

  public func requestLoginLink(email: String, setupPassword: Bool = false) async throws -> JSONValue
  {
    guard !busy else { throw CloudWorkspaceError.service("busy", 409) }
    guard pending == nil else { throw CloudWorkspaceError.unknownWrite }
    busy = true
    defer { busy = false }
    return try await request(
      "/auth/login", method: "POST",
      body: .object([
        "email": .string(email), "setupPassword": .bool(setupPassword), "client": .string("macos"),
      ]))
  }

  public func completeLogin(url: URL) async throws -> CloudWorkspaceState {
    guard !busy else { throw CloudWorkspaceError.service("busy", 409) }
    guard pending == nil else { throw CloudWorkspaceError.unknownWrite }
    guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
      components.scheme == "sill", components.host == "auth", components.path == "/callback",
      components.user == nil, components.password == nil, components.port == nil,
      components.fragment == nil, let queries = components.queryItems, queries.count == 1,
      queries[0].name == "code", let code = queries[0].value, !code.isEmpty, code.utf8.count <= 4096
    else { throw CloudWorkspaceError.invalidResponse }
    busy = true
    defer { busy = false }
    if cookies["__Host-sill-pkce"] == nil, let data = try vault.load(),
      let stored = try JSONValue.decode(data).object
    {
      restoreCookies(stored)
    }
    guard cookies["__Host-sill-pkce"] != nil else { throw CloudWorkspaceError.unauthenticated }
    var callback = URLComponents(
      url: origin.appendingPathComponent("auth/callback"), resolvingAgainstBaseURL: false)!
    callback.queryItems = [
      URLQueryItem(name: "client", value: "macos"), URLQueryItem(name: "code", value: code),
    ]
    owner = nil
    _ = try await request(
      callback.url!.path + "?" + callback.percentEncodedQuery!, nativeCallback: true)
    try await identify()
    return try await fetchWorkspace()
  }

  public func setPassword(password: String) async throws -> CloudWorkspaceState {
    guard !busy else { throw CloudWorkspaceError.service("busy", 409) }
    guard pending == nil else { throw CloudWorkspaceError.unknownWrite }
    guard owner != nil, needsPasswordSetup else { throw CloudWorkspaceError.unauthenticated }
    busy = true
    defer { busy = false }
    _ = try await request(
      "/auth/password/update", method: "POST",
      body: .object([
        "password": .string(password)
      ]))
    needsPasswordSetup = false
    return try await fetchWorkspace()
  }

  public func restoreSession() async throws -> CloudWorkspaceState? {
    guard pending == nil else { throw CloudWorkspaceError.unknownWrite }
    guard !busy else { throw CloudWorkspaceError.service("busy", 409) }
    busy = true
    defer { busy = false }
    guard let data = try vault.load() else { return nil }
    guard let values = try JSONValue.decode(data).object else {
      try clearSession()
      throw CloudWorkspaceError.sessionStorage
    }
    restoreCookies(values)
    guard cookies["__Host-sill-access"] != nil || cookies["__Host-sill-refresh"] != nil else {
      return nil
    }
    do {
      try await identify()
      return try await fetchWorkspace()
    } catch CloudWorkspaceError.unauthenticated {
      return nil
    }
  }

  public func discardPendingWrite() throws {
    guard !busy else { throw CloudWorkspaceError.service("busy", 409) }
    pending = nil
  }

  public func logout() async throws {
    guard pending == nil else { throw CloudWorkspaceError.unknownWrite }
    guard !busy else { throw CloudWorkspaceError.service("busy", 409) }
    busy = true
    defer { busy = false }
    do {
      let result = try await request("/auth/logout", method: "POST")
      try clearSession()
      if result["revoked"]?.bool != true {
        throw CloudWorkspaceError.service("logout_unconfirmed", 503)
      }
    } catch {
      try clearSession()
      throw error
    }
  }

  public func read() async throws -> CloudWorkspaceState {
    guard !busy else { throw CloudWorkspaceError.service("busy", 409) }
    busy = true
    defer { busy = false }
    let value = try await fetchWorkspace()
    if let pending, Self.matches(pending.body, baseline: pending.baseline, actual: value.json) {
      self.pending = nil
    }
    return value
  }

  public func apply(operations: [JSONValue], expectedRevision: JSONValue? = nil) async throws
    -> CloudWorkspaceState
  {
    guard !busy else { throw CloudWorkspaceError.service("busy", 409) }
    guard pending == nil else { throw CloudWorkspaceError.unknownWrite }
    guard !operations.isEmpty, operations.count <= 5000 else {
      throw CloudWorkspaceError.service("invalid_request", 400)
    }
    busy = true
    defer { busy = false }
    let baseline = try await fetchWorkspace()
    var body: JSONValue = .object(["operations": .array(operations)])
    body["expectedRevision"] = expectedRevision ?? baseline.revision
    let key = UUID().uuidString
    pending = (key, body, baseline.json)
    do {
      let json = try await request(
        "/api/v1/workspace/operations", method: "POST", body: body, key: key)
      let result = try state(json)
      pending = nil
      return result
    } catch let error as CloudWorkspaceError {
      if case .service(_, let status) = error, (400...499).contains(status) {
        pending = nil
        throw error
      }
      if error == .unauthenticated {
        pending = nil
        throw error
      }
    } catch {}
    if let result = try? await fetchWorkspace(),
      Self.matches(body, baseline: baseline.json, actual: result.json)
    {
      pending = nil
      return result
    }
    throw CloudWorkspaceError.unknownWrite
  }

  private func identify() async throws {
    let identity = try await request("/auth/session")
    guard let id = identity["userId"]?.string, !id.isEmpty,
      identity["workspaceRead"]?.bool == true
    else { throw CloudWorkspaceError.unauthenticated }
    if owner != id {
      pending = nil
    }
    owner = id
    needsPasswordSetup = cookies["__Host-sill-password-setup"] == "1"
  }
  private func fetchWorkspace() async throws -> CloudWorkspaceState {
    guard owner != nil else { throw CloudWorkspaceError.unauthenticated }
    let result = try state(await request("/api/v1/workspace"))
    return result
  }
  private func state(_ json: JSONValue) throws -> CloudWorkspaceState {
    guard let owner else { throw CloudWorkspaceError.unauthenticated }
    _ = try Snapshot(json: json)
    return CloudWorkspaceState(owner: owner, json: json, needsPasswordSetup: needsPasswordSetup)
  }
  private func clearSession() throws {
    cookies = [:]
    expirations = [:]
    owner = nil
    needsPasswordSetup = false
    pending = nil
    try vault.clear()
  }
  private func pruneCookies() {
    for (name, expiry) in expirations where expiry <= Date().timeIntervalSince1970 {
      cookies[name] = nil
      expirations[name] = nil
    }
  }
  private func restoreCookies(_ stored: [String: JSONValue]) {
    for name in Self.cookieNames { cookies[name] = stored[name]?.string }
    expirations = stored["__expires"]?.object?.compactMapValues(\.number) ?? [:]
    pruneCookies()
  }
  private func persistCookies() throws {
    pruneCookies()
    guard !cookies.isEmpty else {
      try vault.clear()
      return
    }
    var stored = cookies.mapValues(JSONValue.string)
    stored["__expires"] = .object(expirations.mapValues(JSONValue.number))
    try vault.save(JSONValue.object(stored).encoded())
  }

  private func request(
    _ path: String, method: String = "GET", body: JSONValue? = nil,
    key: String? = nil, nativeCallback: Bool = false
  ) async throws -> JSONValue {
    guard let target = URL(string: path, relativeTo: origin)?.absoluteURL,
      target.scheme == origin.scheme, target.host == origin.host, target.port == origin.port,
      target.user == nil, target.password == nil
    else { throw CloudWorkspaceError.invalidResponse }
    var request = URLRequest(url: target)
    request.httpMethod = method
    if nativeCallback { request.setValue("macos", forHTTPHeaderField: "X-Sill-Client") }
    request.setValue(origin.absoluteString, forHTTPHeaderField: "Origin")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    if let owner { request.setValue(owner, forHTTPHeaderField: "X-Sill-Owner") }
    if let key { request.setValue(key, forHTTPHeaderField: "Idempotency-Key") }
    pruneCookies()
    if !cookies.isEmpty {
      request.setValue(
        cookies.sorted { $0.key < $1.key }.map { "\($0.key)=\($0.value)" }.joined(separator: "; "),
        forHTTPHeaderField: "Cookie")
    }
    request.httpBody = try body?.encoded()
    let (data, response) = try await session.data(for: request)
    guard let response = response as? HTTPURLResponse, response.url?.scheme == "https",
      response.url?.host == origin.host, response.url?.port == nil,
      !(300...399).contains(response.statusCode)
        || (nativeCallback && response.statusCode == 303
          && [origin.absoluteString + "/", origin.absoluteString + "/auth/password/new"]
            .contains(response.value(forHTTPHeaderField: "Location") ?? ""))
    else { throw CloudWorkspaceError.invalidResponse }
    if let header = response.value(forHTTPHeaderField: "Set-Cookie") {
      let regex = try NSRegularExpression(
        pattern: "(__Host-sill-(?:access|refresh|pkce|login-until|password-setup))=([^;,\\s]*)")
      let string = header as NSString
      let matches = regex.matches(in: header, range: NSRange(location: 0, length: string.length))
      for (index, match) in matches.enumerated() {
        let name = string.substring(with: match.range(at: 1))
        let value = string.substring(with: match.range(at: 2))
        cookies[name] = value.isEmpty ? nil : value
        let start = NSMaxRange(match.range)
        let end = index + 1 < matches.count ? matches[index + 1].range.location : string.length
        let attributes = string.substring(with: NSRange(location: start, length: end - start))
        let age = try NSRegularExpression(pattern: "(?i)Max-Age=(-?[0-9]+)")
        if let duration = age.firstMatch(
          in: attributes, range: NSRange(location: 0, length: (attributes as NSString).length)),
          let seconds = Double((attributes as NSString).substring(with: duration.range(at: 1)))
        {
          expirations[name] = Date().timeIntervalSince1970 + seconds
        }
        if value.isEmpty { expirations[name] = nil }
      }
      try persistCookies()
    }
    if nativeCallback && response.statusCode == 303 {
      needsPasswordSetup =
        response.value(forHTTPHeaderField: "Location") == origin.absoluteString
        + "/auth/password/new"
      return .object([:])
    }
    if response.statusCode == 401 {
      owner = nil
      for name in ["__Host-sill-access", "__Host-sill-refresh"] {
        cookies[name] = nil
        expirations[name] = nil
      }
      try persistCookies()
      throw CloudWorkspaceError.unauthenticated
    }
    if response.statusCode == 403 { owner = nil }
    let json = try JSONValue.decode(data)
    guard (200...299).contains(response.statusCode) else {
      throw CloudWorkspaceError.service(
        json["error"]?["code"]?.string ?? "unavailable", response.statusCode)
    }
    return json
  }

  private static let metadata = [
    "revision", "state", "created_at", "updated_at", "deleted",
    "owner_id", "change_version",
  ]

  private static func rawCard(_ input: JSONValue) -> JSONValue {
    var card = input
    for key in metadata { card[key] = nil }
    if card["body"] == nil { card["body"] = .array([]) }
    return card
  }

  private static func defaultItem(_ card: JSONValue, stored: JSONValue = .object([:])) -> JSONValue
  {
    let done = (card["tasks"]?.array ?? []).filter { $0["done"]?.bool == true }
      .compactMap { $0["id"] }
    var item: JSONValue = .object([
      "seen": .bool(false), "read": .bool(false), "bookmarked": .bool(false),
      "later": .bool(false), "tagsEdited": .bool(false), "progress": .number(0),
      "note": .string(""), "tags": .array([]), "addedAt": .number(0),
      "snoozedUntil": .number(0), "dismissed": .bool(false), "reminderDone": .bool(false),
      "lastReminderKey": .string(""), "lastNotifiedAt": .number(0), "readAt": .number(0),
      "restoredAt": .number(0), "done": .bool(false), "archived": .bool(false),
      "lessLike": .bool(false), "taskDone": .array(done),
    ])
    if card["type"]?.string == "task", let completed = stored["done"]?.bool {
      item["taskDone"] = .array(
        completed ? (card["tasks"]?.array ?? []).compactMap { $0["id"] } : [])
    }
    item["reminderDone"] = stored["reminderDone"] ?? stored["done"] ?? .bool(false)
    for (key, value) in stored.object ?? [:] { item[key] = value }
    return item
  }

  private static func matches(_ body: JSONValue, baseline: JSONValue, actual: JSONValue) -> Bool {
    guard let operations = body["operations"]?.array,
      let revision = baseline["revision"]?.number,
      body["expectedRevision"] == baseline["revision"],
      actual["revision"]?.number == revision + Double(operations.count)
    else { return false }
    var expected = baseline["state"]!
    var cards = Dictionary(
      uniqueKeysWithValues: (expected["cards"]?.array ?? []).compactMap {
        card -> (String, JSONValue)? in
        guard let id = card["id"]?.string else { return nil }
        return (id, rawCard(card))
      })
    var items = expected["items"]?.object ?? [:]
    var storedStates: [String: JSONValue] = [:]
    for card in expected["cards"]?.array ?? [] {
      if let id = card["id"]?.string { storedStates[id] = card["state"] ?? .object([:]) }
    }
    for operation in operations {
      let id = operation["id"]?.string ?? operation["card"]?["id"]?.string ?? ""
      switch operation["op"]?.string {
      case "card.upsert":
        guard let submitted = operation["card"]?.object else { return false }
        if let before = operation["before"] {
          if before == .null {
            guard cards[id] == nil else { return false }
          } else if rawCard(before) != cards[id] {
            return false
          }
        }
        var card = cards[id] ?? .object([:])
        for (key, value) in submitted { card[key] = value }
        cards[id] = rawCard(card)
        items[id] = defaultItem(card, stored: storedStates[id] ?? .object([:]))
      case "card.delete":
        guard let card = cards[id] else { return false }
        if let before = operation["before"], rawCard(before) != card { return false }
        cards[id] = nil
        items[id] = nil
      case "item.patch":
        guard let card = cards[id] else { return false }
        var item = items[id] ?? defaultItem(card)
        let values = operation["values"]?.object ?? [:]
        for (key, value) in values { item[key] = value }
        if card["type"]?.string == "task" {
          let tasks = card["tasks"]?.array ?? []
          if let done = values["taskDone"]?.strings {
            item["done"] = .bool(
              !tasks.isEmpty && tasks.allSatisfy { done.contains($0["id"]?.string ?? "") })
          } else if let done = values["done"]?.bool {
            item["taskDone"] = .array(done ? tasks.compactMap { $0["id"] } : [])
          }
        } else if card["type"]?.string == "reminder" {
          if let done = values["reminderDone"] {
            item["done"] = done
          } else if let done = values["done"] {
            item["reminderDone"] = done
          }
        }
        items[id] = item
        var stored = storedStates[id] ?? .object([:])
        for (key, value) in values { stored[key] = value }
        if card["type"]?.string == "task", values["done"] != nil || values["taskDone"] != nil {
          stored["done"] = item["done"]
          stored["taskDone"] = item["taskDone"]
        } else if card["type"]?.string == "reminder",
          values["done"] != nil || values["reminderDone"] != nil
        {
          stored["done"] = item["done"]
          stored["reminderDone"] = item["reminderDone"]
        }
        storedStates[id] = stored
      case "preferences.patch":
        var preferences = expected["preferences"]!
        for (key, value) in operation["values"]?.object ?? [:] { preferences[key] = value }
        expected["preferences"] = preferences
      case "reading.add":
        expected["seconds"] = .number(
          (expected["seconds"]?.number ?? 0) + (operation["seconds"]?.number ?? 0))
      default: return false
      }
    }
    guard let actualCards = actual["state"]?["cards"]?.array,
      actualCards.count == cards.count,
      actualCards.allSatisfy({ card in cards[card["id"]?.string ?? ""] == rawCard(card) }),
      actual["state"]?["items"]?.object == items,
      actual["state"]?["preferences"] == expected["preferences"],
      actual["state"]?["seconds"] == expected["seconds"]
    else { return false }
    return true
  }
}
