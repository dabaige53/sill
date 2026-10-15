import SwiftUI
import AppKit

struct Card: Identifiable {
    let raw: [String: Any]
    var id: String { raw["id"] as? String ?? "" }
    var title: String { raw["title"] as? String ?? "无标题" }
    var type: String { raw["type"] as? String ?? "note" }
    var source: String { raw["source"] as? String ?? "本地" }
    var body: String { (raw["body"] as? [String] ?? []).joined(separator: "\n\n") }
    var summary: String { raw["summary"] as? String ?? "" }
}
struct Draft: Identifiable, Codable, Sendable {
    var id: String
    var title: String
    var body: String
    var revision: Int
    var original: Data?
}

@MainActor final class Workspace: ObservableObject {
    @Published var cards: [Card] = []
    @Published var items: [String: [String: Any]] = [:]
    @Published var query = ""
    @Published var filter = "全部"
    @Published var searchPresented = false
    @Published var searchFocusRequest = 0
    @Published var selected: String?
    @Published var draft: Draft?
    @Published var error: String?
    @Published var ready = false
    @Published var busy = false
    @Published var loading = false
    private var launchTask: Task<Void, Never>?
    private var refreshTask: Task<Void, Never>?
    private let draftQueue = DispatchQueue(label: "app.sill.draft", qos: .userInitiated)
    private(set) var launchCount = 0
    // Only self-tests replace transport; the shipping UI always uses URLSession.
    var requestTransport: (@MainActor (URLRequest) async throws -> (Data, URLResponse))?
    var revision = 0
    var process: Process?
    var output: Pipe?
    var base: URL?
    let directory: URL
    var draftURL: URL { directory.appendingPathComponent("draft.json") }
    init() {
        let arguments = ProcessInfo.processInfo.arguments
        if arguments.contains("--self-test") {
            directory = FileManager.default.temporaryDirectory.appendingPathComponent("sill-swift-test-" + UUID().uuidString)
        } else if let index = arguments.firstIndex(of: "--data-directory"), arguments.indices.contains(index + 1), arguments[index + 1].hasPrefix("/") {
            directory = URL(fileURLWithPath: arguments[index + 1], isDirectory: true).standardizedFileURL
        } else {
            directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Sill", isDirectory: true)
        }
        Task {
            await launch()
            if ProcessInfo.processInfo.arguments.contains("--self-test") {
                guard ready else { print("FAIL: " + (error ?? "启动失败")); exit(1) }
                await selfTest()
            }
        }
    }
    var visible: [Card] {
        cards.filter { card in
            let item = items[card.id] ?? [:]
            let matches = query.isEmpty || [card.title, card.body, card.summary, card.source].joined(separator: " ").localizedCaseInsensitiveContains(query)
            return matches && (filter == "全部" || filter == "收藏" && item["bookmarked"] as? Bool == true || filter == "稍后读" && item["later"] as? Bool == true)
        }
    }
    func launch() async {
        if let launchTask { await launchTask.value; return }
        if process?.isRunning == true, base != nil { return }
        let task = Task { await startService() }
        launchTask = task
        await task.value
        launchTask = nil
    }
    private func startService() async {
        loading = true
        defer { loading = false }
        ready = false
        base = nil
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            guard let resources = Bundle.main.resourceURL else { throw failure("找不到应用资源") }
            let p = Process(), pipe = Pipe()
            p.executableURL = resources.appendingPathComponent("runtime/service-lock")
            p.arguments = [directory.appendingPathComponent("cards.json.lock").path, resources.appendingPathComponent("runtime/node").path, resources.appendingPathComponent("runtime/launch.mjs").path, directory.appendingPathComponent("cards.json").path]
            p.standardOutput = pipe
            p.standardError = FileHandle.nullDevice
            p.terminationHandler = { [weak self] terminated in
                Task { @MainActor in
                    guard let self, self.process === terminated else { return }
                    self.base = nil; self.ready = false
                    self.error = "本地服务已停止。原卡片和草稿已保留，请重试。"
                }
            }
            try p.run()
            launchCount += 1
            process = p; output = pipe
            let data = await Task.detached { pipe.fileHandleForReading.availableData }.value
            if let value = try? JSONSerialization.jsonObject(with: data) as? [String: String], let message = value["error"] { throw failure(message) }
            guard let text = String(data: data, encoding: .utf8), let port = Int(text.trimmingCharacters(in: .whitespacesAndNewlines)) else { throw failure("本地服务未能启动。请重新打开 Sill。") }
            base = URL(string: "http://127.0.0.1:\(port)")!
            try await refreshThrowing()
            ready = true
            error = nil
            if draft == nil, let saved = try? Data(contentsOf: draftURL), let d = try? JSONDecoder().decode(Draft.self, from: saved) { draft = d; error = "已恢复上次未保存的草稿。保存前请核对最新内容。" }
        } catch {
            self.error = error.localizedDescription
            let failed = process
            process = nil; base = nil; ready = false
            if failed?.isRunning == true { failed?.terminate() }
        }
    }
    func selfTest() async {
        do {
            let stale = try await request("api/local/state")
            edit(); draft?.title = "原生模型测试"; draft?.body = "正文"; await saveDraft()
            guard cards.count == 1, draft == nil else { throw failure("创建失败") }
            accept(stale)
            guard cards.count == 1 else { throw failure("旧快照覆盖较新 revision") }
            let alivePID = process?.processIdentifier
            let starts = launchCount
            async let existingA: Void = launch()
            async let existingB: Void = launch()
            _ = await (existingA, existingB)
            guard launchCount == starts, process?.processIdentifier == alivePID else { throw failure("重复启动创建额外进程") }
            edit(cards[0]); draft?.title = "重试保留草稿"; scheduleDraftPersistence(); persistDraft()
            let stopped = process!
            stopped.terminate()
            await Task.detached { stopped.waitUntilExit() }.value
            async let restartA: Void = reload()
            async let restartB: Void = launch()
            _ = await (restartA, restartB)
            guard ready, cards.count == 1, cards[0].title == "原生模型测试", draft?.title == "重试保留草稿", launchCount == starts + 1 else { throw failure("停止后重试未恢复原内容或重复启动") }
            discardDraft()
            var raw = cards[0].raw; raw["body"] = ["第一段\n\n仍属第一段", "", "末段"]
            try await apply([["op": "card.upsert", "card": raw]])
            var card = cards[0]
            edit(card); await saveDraft()
            guard cards[0].raw["body"] as? [String] == raw["body"] as? [String] else { throw failure("原段落边界改变") }
            card = cards[0]
            edit(card); draft?.title = "冲突草稿"; persistDraft()
            try await apply([["op": "item.patch", "id": card.id, "values": ["bookmarked": true]]])
            await saveDraft()
            guard draft?.title == "冲突草稿", cards[0].title == "原生模型测试", FileManager.default.fileExists(atPath: draftURL.path) else { throw failure("冲突草稿丢失") }
            let restored = try JSONDecoder().decode(Draft.self, from: Data(contentsOf: draftURL))
            guard restored.title == "冲突草稿" else { throw failure("草稿恢复失败") }
            discardDraft(); edit(card); draft?.title = "更新笔记"; await saveDraft()
            guard cards[0].title == "更新笔记" else { throw failure("编辑失败") }
            var writes = 0
            requestTransport = { req in
                let response = try await URLSession.shared.data(for: req)
                if req.httpMethod == "POST" { writes += 1; throw URLError(.networkConnectionLost) }
                return response
            }
            let previousCount = cards.count
            edit(); draft?.title = "响应丢失但已写入"; draft?.body = "核对正文"
            let verifiedID = draft!.id
            await saveDraft()
            guard draft == nil, cards.count == previousCount + 1, writes == 1, cards.contains(where: { $0.id == verifiedID }) else { throw failure("未知写入核对失败或重复创建") }
            requestTransport = { req in
                if req.httpMethod == "POST" { _ = try await URLSession.shared.data(for: req); throw URLError(.networkConnectionLost) }
                throw URLError(.notConnectedToInternet)
            }
            edit(); draft?.title = "读取不可用时保留"; draft?.body = "未确认的草稿"
            let uncertainID = draft!.id
            await saveDraft()
            guard draft?.id == uncertainID, FileManager.default.fileExists(atPath: draftURL.path) else { throw failure("核对不可用时丢失草稿") }
            requestTransport = nil
            try await refreshThrowing()
            guard cards.filter({ $0.id == uncertainID }).count == 1 else { throw failure("未知写入重复或未落地") }
            discardDraft()
            requestTransport = { req in
                let response = try await URLSession.shared.data(for: req)
                if req.httpMethod == "POST" {
                    let committed = try JSONSerialization.jsonObject(with: response.0) as! [String: Any]
                    let state = committed["state"] as! [String: Any]
                    var changed = (state["cards"] as! [[String: Any]]).first { $0["id"] as? String == verifiedID }!
                    changed["title"] = "核对前被其他写入改变"
                    var concurrent = req
                    concurrent.httpBody = try JSONSerialization.data(withJSONObject: ["expectedRevision": committed["revision"]!, "operations": [["op": "card.upsert", "card": changed]]])
                    _ = try await URLSession.shared.data(for: concurrent)
                    throw URLError(.networkConnectionLost)
                }
                return response
            }
            edit(cards.first { $0.id == verifiedID }!); draft?.title = "应保留的冲突草稿"
            await saveDraft()
            guard draft?.title == "应保留的冲突草稿" else { throw failure("核对发现不同内容时丢失草稿") }
            requestTransport = nil
            try await refreshThrowing()
            guard cards.first(where: { $0.id == verifiedID })?.title == "核对前被其他写入改变" else { throw failure("核对冲突覆盖真实服务内容") }
            discardDraft()
            try await apply([["op": "card.delete", "id": verifiedID], ["op": "card.delete", "id": uncertainID]])
            try await apply([["op": "card.delete", "id": card.id]])
            guard cards.isEmpty else { throw failure("删除失败") }
            print("PASS: Swift Workspace CRUD, stale snapshot rejection, merged launches, service restart recovery, paragraph boundaries, unknown-write verification, unavailable-read draft retention, preserved and restored draft")
            process?.terminate()
            try? FileManager.default.removeItem(at: directory)
            exit(0)
        } catch { print("FAIL: \(error.localizedDescription)"); process?.terminate(); exit(1) }
    }
    func failure(_ message: String) -> NSError { NSError(domain: "Sill", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
    func request(_ path: String, body: [String: Any]? = nil) async throws -> [String: Any] {
        guard let base else { throw failure("本地服务尚未启动") }
        var req = URLRequest(url: base.appendingPathComponent(path)); req.timeoutInterval = 15
        if let body { req.httpMethod = "POST"; req.setValue("application/json", forHTTPHeaderField: "Content-Type"); req.httpBody = try JSONSerialization.data(withJSONObject: body) }
        let result: (Data, URLResponse)
        if let requestTransport { result = try await requestTransport(req) }
        else { result = try await URLSession.shared.data(for: req) }
        let (data, response) = result
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
        guard let response = response as? HTTPURLResponse, response.statusCode == 200 else { throw NSError(domain: "SillHTTP", code: (response as? HTTPURLResponse)?.statusCode ?? 0, userInfo: [NSLocalizedDescriptionKey: json["error"] as? String ?? "无法读取本地数据"]) }
        return json
    }
    func accept(_ json: [String: Any]) {
        guard let incoming = json["revision"] as? Int, incoming >= revision else { return }
        guard let state = json["state"] as? [String: Any] ?? (incoming == 0 ? [:] : nil) else { return }
        revision = incoming
        cards = (state["cards"] as? [[String: Any]] ?? []).map { Card(raw: $0) }
        items = state["items"] as? [String: [String: Any]] ?? [:]
        if let selected, !cards.contains(where: { $0.id == selected }) { self.selected = nil }
    }
    func refreshThrowing() async throws { accept(try await request("api/local/state")) }
    func refresh() {
        guard refreshTask == nil else { return }
        refreshTask = Task { await reload(); refreshTask = nil }
    }
    func reload() async {
        if process?.isRunning != true || base == nil { await launch(); return }
        loading = true
        defer { loading = false }
        do { try await refreshThrowing(); error = nil }
        catch {
            self.error = "无法读取本地数据。原卡片和草稿已保留，请重试。"
            if process?.isRunning != true { base = nil; ready = false }
        }
    }
    func apply(_ operations: [[String: Any]], expected: Int? = nil) async throws { accept(try await request("api/local/operations", body: ["operations": operations, "expectedRevision": expected ?? revision])) }
    func toggle(_ key: String, card: Card) {
        Task { do { try await apply([["op": "item.patch", "id": card.id, "values": [key: !(items[card.id]?[key] as? Bool ?? false)]]]); error = nil } catch { self.error = error.localizedDescription; try? await refreshThrowing() } }
    }
    func edit(_ card: Card? = nil) {
        guard draft == nil else { return }
        draft = Draft(id: card?.id ?? UUID().uuidString, title: card?.title ?? "", body: card?.body ?? "", revision: revision, original: card.flatMap { try? JSONSerialization.data(withJSONObject: $0.raw) })
    }
    // Every input snapshot is queued immediately; no debounce window discards
    // recent text. Encoding and disk IO run off the UI thread in strict order.
    func scheduleDraftPersistence() {
        guard let draft else { return }
        let url = draftURL
        draftQueue.async { [weak self] in
            do { try JSONEncoder().encode(draft).write(to: url, options: [.atomic, .completeFileProtectionUnlessOpen]) }
            catch { Task { @MainActor in self?.error = "草稿无法保存在本机：\(error.localizedDescription)" } }
        }
    }
    func persistDraft() {
        guard let draft else { return }
        let url = draftURL
        do { try draftQueue.sync { try JSONEncoder().encode(draft).write(to: url, options: [.atomic, .completeFileProtectionUnlessOpen]) } }
        catch { self.error = "草稿无法保存在本机：\(error.localizedDescription)" }
    }
    func discardDraft() {
        draft = nil
        let url = draftURL
        draftQueue.sync { try? FileManager.default.removeItem(at: url) }
    }
    var draftIsDirty: Bool {
        guard let draft else { return false }
        let original = draft.original.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
        return draft.title != (original?["title"] as? String ?? "") || draft.body != (original?["body"] as? [String] ?? []).joined(separator: "\n\n")
    }
    func saveDraft() async {
        guard !busy, let d = draft, !d.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        busy = true; defer { busy = false }
        persistDraft()
        var submitted = d.original.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] } ?? ["id": d.id, "type": "note", "source": "本地", "kind": "local", "time": Date().timeIntervalSince1970 * 1000, "summary": "", "tags": [String](), "form": "standard"]
        submitted["title"] = d.title
        let originalBody = submitted["body"] as? [String]
        if originalBody == nil || originalBody?.joined(separator: "\n\n") != d.body { submitted["body"] = d.body.components(separatedBy: "\n\n") }
        do {
            try await apply([["op": "card.upsert", "card": submitted]], expected: d.revision)
            discardDraft(); error = nil
        } catch {
            let requestError = error as NSError
            if requestError.domain != "SillHTTP" {
                // Exactly one read verifies an unknown write. Never repeat the
                // operation or allocate a new card ID after a lost response.
                if let snapshot = try? await request("api/local/state"),
                   let checkedRevision = snapshot["revision"] as? Int, checkedRevision >= revision,
                   let state = snapshot["state"] as? [String: Any],
                   let stored = (state["cards"] as? [[String: Any]])?.first(where: { $0["id"] as? String == d.id }),
                   NSDictionary(dictionary: stored).isEqual(to: submitted) {
                    accept(snapshot); discardDraft(); self.error = nil; return
                }
                self.error = "保存结果尚未确认。草稿已保留；请恢复连接后刷新并核对同一张卡片，不要重复创建。"
            } else {
                self.error = requestError.localizedDescription + "。草稿已保留；请复制草稿后，取消编辑并刷新，再合并最新内容。"
            }
        }
    }

    func delete(_ card: Card) {
        Task { do { try await apply([["op": "card.delete", "id": card.id]]); error = nil } catch { self.error = error.localizedDescription; try? await refreshThrowing() } }
    }
}

struct Desktop: View {
    @EnvironmentObject var model: Workspace
    @Environment(\.accessibilityReduceMotion) var reduceMotion
    @State private var deleting: Card?
    @FocusState private var searchFocused: Bool
    var body: some View {
        ZStack {
            Color(nsColor: .windowBackgroundColor).ignoresSafeArea()
            VStack(spacing: 0) {
                if let error = model.error {
                    HStack { Text(error).font(.callout).textSelection(.enabled); Spacer(); Button("重试") { model.refresh() }.disabled(model.loading) }.padding(14).background(Color.orange.opacity(0.1)).accessibilityElement(children: .contain)
                }
                if model.searchPresented {
                    HStack { Image(systemName: "magnifyingglass"); TextField("搜索卡片", text: $model.query).focused($searchFocused).task { try? await Task.sleep(for: .milliseconds(180)); guard !Task.isCancelled else { return }; searchFocused = true }.onDisappear { searchFocused = false }.onChange(of: model.searchFocusRequest) { searchFocused = true }; Picker("范围", selection: $model.filter) { ForEach(["全部", "收藏", "稍后读"], id: \.self) { Text($0) } }.frame(width: 110); Button("收起") { model.searchPresented = false; model.query = ""; model.filter = "全部" } }.padding().background(.regularMaterial)
                }
                if model.loading && model.cards.isEmpty { Spacer(); ProgressView("正在打开本地桌面"); Spacer() }
                else if model.visible.isEmpty {
                    Spacer()
                    VStack(spacing: 16) { Image(systemName: model.cards.isEmpty ? "square.grid.2x2" : "magnifyingglass").font(.system(size: 36, weight: .ultraLight)).foregroundStyle(.secondary); Text(model.cards.isEmpty ? "给想法留一处窗台" : "没有找到卡片").font(.title2); Text(model.cards.isEmpty ? "记下一段文字，内容会留在这台 Mac 上。" : "换个关键词，或查看全部内容。").foregroundStyle(.secondary); if model.cards.isEmpty { Button("记下第一条内容") { model.edit() }.buttonStyle(.borderedProminent).disabled(!model.ready) } }.padding(40)
                    Spacer()
                } else {
                    ScrollView { LazyVGrid(columns: [GridItem(.adaptive(minimum: 270, maximum: 360), spacing: 22)], alignment: .center, spacing: 22) {
                        ForEach(model.visible) { card in
                            Button { model.selected = card.id } label: { tile(card) }.buttonStyle(.plain)
                                .contextMenu { Button("查看") { model.selected = card.id }; if card.type == "note" { Button("编辑笔记") { model.edit(card) } }; Button("收藏 / 取消收藏") { model.toggle("bookmarked", card: card) }; Button("稍后读 / 移出") { model.toggle("later", card: card) }; Button("标记已读 / 未读") { model.toggle("read", card: card) }; Divider(); Button("删除", role: .destructive) { deleting = card } }
                                .accessibilityLabel("\(card.title)，\(card.source)").accessibilityHint("打开完整内容")
                        }
                    }.padding(32) }
                }
            }
        }
        .frame(minWidth: 640, minHeight: 480)
        .toolbar {
            ToolbarItemGroup { Button { model.searchPresented.toggle() } label: { Image(systemName: "magnifyingglass") }.help("搜索卡片 ⌘F").accessibilityLabel("搜索卡片"); Button { model.refresh() } label: { Image(systemName: "arrow.clockwise") }.help(model.loading ? "正在刷新本地数据" : "刷新本地数据 ⌘R").accessibilityLabel(model.loading ? "正在刷新本地数据" : "刷新本地数据").keyboardShortcut("r").disabled(model.loading); Button { model.edit() } label: { Image(systemName: "square.and.pencil") }.help("新建笔记 ⌘N").accessibilityLabel("新建笔记").keyboardShortcut("n").disabled(!model.ready) }
        }
        .sheet(item: Binding(get: { model.selected.flatMap { id in model.cards.first { $0.id == id } } }, set: { model.selected = $0?.id })) { card in reader(card) }
        .sheet(item: $model.draft, onDismiss: { model.persistDraft() }) { _ in Editor().environmentObject(model).interactiveDismissDisabled() }
        .confirmationDialog("删除这张本地卡片？此操作无法撤销。", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }), titleVisibility: .visible) { Button("删除卡片", role: .destructive) { if let deleting { model.delete(deleting) }; deleting = nil }; Button("取消", role: .cancel) { deleting = nil } }
        .animation(reduceMotion ? nil : .easeOut(duration: 0.15), value: model.searchPresented)
    }
    func tile(_ card: Card) -> some View {
        let read = model.items[card.id]?["read"] as? Bool == true
        return VStack(alignment: .leading, spacing: 12) {
            HStack { Image(systemName: card.type == "note" ? "text.alignleft" : "doc.text"); Text(card.source); Spacer(); if model.items[card.id]?["bookmarked"] as? Bool == true { Image(systemName: "bookmark.fill").accessibilityLabel("已收藏") }; if model.items[card.id]?["later"] as? Bool == true { Image(systemName: "eyeglasses").accessibilityLabel("稍后读") } }.font(.system(size: 12)).foregroundStyle(.secondary)
            Text(card.title).font(.system(size: 19, weight: .semibold)).foregroundStyle(read ? .secondary : .primary).lineLimit(3).frame(maxWidth: .infinity, alignment: .leading)
            if !(card.summary.isEmpty && card.body.isEmpty) { Text(card.summary.isEmpty ? card.body : card.summary).font(.system(size: 14)).foregroundStyle(.secondary).lineSpacing(5).lineLimit(5) }
            Spacer(minLength: 0)
        }.padding(22).frame(maxWidth: .infinity, minHeight: 200, alignment: .topLeading)
            .background(read ? Color(nsColor: .controlBackgroundColor) : Color(nsColor: .textBackgroundColor), in: RoundedRectangle(cornerRadius: 22))
            .overlay(RoundedRectangle(cornerRadius: 22).strokeBorder(Color.primary.opacity(0.06)))
            .shadow(color: .black.opacity(read ? 0 : 0.035), radius: 12, y: 5)
    }
    func reader(_ card: Card) -> some View {
        VStack(spacing: 0) {
            HStack { Text(card.source).foregroundStyle(.secondary); Spacer(); Button { model.toggle("bookmarked", card: card) } label: { Image(systemName: model.items[card.id]?["bookmarked"] as? Bool == true ? "bookmark.fill" : "bookmark") }.accessibilityLabel("切换收藏"); Button { model.toggle("later", card: card) } label: { Image(systemName: "eyeglasses") }.accessibilityLabel("切换稍后读"); Button { model.toggle("read", card: card) } label: { Image(systemName: model.items[card.id]?["read"] as? Bool == true ? "checkmark.circle.fill" : "checkmark.circle") }.accessibilityLabel("切换本地阅读状态"); if card.type == "note" { Button("编辑") { model.selected = nil; model.edit(card) } }; Button("放回桌面") { model.selected = nil }.keyboardShortcut(.cancelAction) }.padding(20)
            Divider()
            ScrollView { VStack(alignment: .leading, spacing: 24) { Text(card.title).font(.system(size: 30, weight: .semibold)); if !card.summary.isEmpty && !card.body.hasPrefix(card.summary) { Text(card.summary).foregroundStyle(.secondary) }; Text(card.body).font(.system(size: 17)).lineSpacing(10).frame(maxWidth: .infinity, alignment: .leading); if let tasks = card.raw["tasks"] as? [[String: Any]] { ForEach(Array(tasks.enumerated()), id: \.offset) { _, task in Text("• " + (task["text"] as? String ?? "")) } }; if let link = card.raw["url"] as? String, let url = URL(string: link), ["https", "http"].contains(url.scheme ?? "") { Link("去原文", destination: url) } }.textSelection(.enabled).padding(36).frame(maxWidth: .infinity, alignment: .leading) }
        }.frame(width: 650, height: 650)
    }
}

struct Editor: View {
    @EnvironmentObject var model: Workspace
    @State private var confirmDiscard = false
    @FocusState private var titleFocused: Bool
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack { Text("本地笔记").font(.headline); Spacer(); Button("取消") { if model.draftIsDirty { confirmDiscard = true } else { model.discardDraft() } }.keyboardShortcut(.cancelAction).disabled(model.busy); Button("保存") { Task { await model.saveDraft() } }.keyboardShortcut("s").buttonStyle(.borderedProminent).disabled(model.busy || model.draft?.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty != false) }
            if let error = model.error { Text(error).foregroundStyle(.red).font(.callout).textSelection(.enabled) }
            TextField("标题", text: Binding(get: { model.draft?.title ?? "" }, set: { model.draft?.title = $0; model.scheduleDraftPersistence() })).font(.title2).textFieldStyle(.plain).accessibilityLabel("笔记标题").focused($titleFocused).disabled(model.busy).onAppear { titleFocused = true }
            Divider()
            TextEditor(text: Binding(get: { model.draft?.body ?? "" }, set: { model.draft?.body = $0; model.scheduleDraftPersistence() })).font(.system(size: 16)).accessibilityLabel("笔记正文").disabled(model.busy)
            Text("保存在这台 Mac；不会改变第三方应用内容。").font(.caption).foregroundStyle(.secondary)
        }.padding(24).frame(width: 620, height: 580)
        .confirmationDialog("放弃未保存的草稿？", isPresented: $confirmDiscard, titleVisibility: .visible) { Button("放弃草稿", role: .destructive) { model.discardDraft() }; Button("继续编辑", role: .cancel) {} }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    var model: Workspace?
    func applicationWillTerminate(_ notification: Notification) { model?.persistDraft(); model?.process?.terminate() }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}
@main struct SillApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var delegate
    @StateObject private var model = Workspace()
    var body: some Scene {
        Window("Sill · 窗台", id: "desktop") { Desktop().environmentObject(model).onAppear { delegate.model = model } }.defaultSize(width: 1100, height: 760).windowStyle(.hiddenTitleBar)
            .commands { CommandGroup(replacing: .newItem) { Button("新建笔记") { model.edit() }.keyboardShortcut("n").disabled(!model.ready) }; CommandGroup(after: .newItem) { Button("刷新本地数据") { model.refresh() }.keyboardShortcut("r") }; CommandGroup(after: .textEditing) { Button("搜索卡片") { model.searchPresented = true; model.searchFocusRequest += 1 }.keyboardShortcut("f") } }
    }
}
