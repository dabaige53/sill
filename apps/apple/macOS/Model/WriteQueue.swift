import Foundation
import SillKit

/// Runs reads and writes one at a time. There is no global busy switch: callers lock only the card
/// or control that started a write.
///
/// Each write carries the revision its author saw. When one of our own writes moves the revision
/// from r to r', queued foreground writes based on r move to r'. Deferred records keep their
/// original version until the screen has applied and checked the saved state.
@MainActor final class WriteQueue {
  enum Priority { case foreground, background }
  enum Kind {
    case read
    case write([WorkspaceOperation])
    /// Built when it starts, so background records coalesce while they wait.
    case deferred(() -> [WorkspaceOperation])
  }
  private struct Job {
    let kind: Kind
    var base: Int
    let priority: Priority
    var trace: PerformanceTrace.Span? = nil
    let completion: (Result<Snapshot, any Error>?) -> Void
  }

  private var jobs: [Job] = []
  private var running = false
  private var generation = 0
  var backend: (any WorkspaceBackend)?
  /// The newest revision any read or write has returned.
  private(set) var knownRevision = 0

  var idle: Bool { !running && jobs.isEmpty }
  var hasQueuedBackgroundWork: Bool {
    jobs.contains {
      if case .deferred = $0.kind { return true }
      return false
    }
  }

  func read(_ completion: @escaping (Result<Snapshot, any Error>?) -> Void) {
    enqueue(Job(kind: .read, base: knownRevision, priority: .foreground, completion: completion))
  }

  func write(
    _ operations: [WorkspaceOperation], priority: Priority = .foreground,
    expectedRevision: Int? = nil,
    _ completion: @escaping (Result<Snapshot, any Error>?) -> Void
  ) {
    enqueue(
      Job(
        kind: .write(operations), base: expectedRevision ?? knownRevision, priority: priority,
        completion: completion)
    )
  }

  /// One waiting background job at most; later records join it.
  func background(
    expectedRevision: Int,
    _ build: @escaping () -> [WorkspaceOperation],
    _ completion: @escaping (Result<Snapshot, any Error>?) -> Void
  ) {
    guard !hasQueuedBackgroundWork else { return }
    enqueue(
      Job(
        kind: .deferred(build), base: expectedRevision, priority: .background,
        completion: completion))
  }

  /// Drop queued work (account change). The running request finishes but its result is ignored.
  func reset(revision: Int = 0) {
    generation += 1
    knownRevision = revision
    let dropped = jobs
    jobs = []
    for job in dropped {
      PerformanceTrace.shared.end(job.trace, success: false)
      job.completion(nil)
    }
  }

  private func enqueue(_ job: Job) {
    var job = job
    job.trace = PerformanceTrace.shared.begin(
      .queueWait, reason: job.priority == .background ? .backgroundActivity : .user)
    // Foreground work goes ahead of waiting background records.
    if job.priority == .foreground,
      let index = jobs.firstIndex(where: { $0.priority == .background })
    {
      jobs.insert(job, at: index)
    } else {
      jobs.append(job)
    }
    pump()
  }

  private func pump() {
    guard !running, !jobs.isEmpty, let backend else { return }
    let job = jobs.removeFirst()
    PerformanceTrace.shared.end(job.trace, values: ["queue_depth": Double(jobs.count)])
    let operations: [WorkspaceOperation]?
    switch job.kind {
    case .read: operations = nil
    case .write(let list): operations = list
    case .deferred(let build):
      let list = build()
      guard !list.isEmpty else {
        job.completion(nil)
        pump()
        return
      }
      operations = list
    }
    let reason: PerformanceTrace.Reason
    if operations == nil {
      reason = .refresh
    } else if job.priority == .background {
      reason = .backgroundActivity
    } else if let first = operations?.first {
      switch first {
      case .preferences: reason = .preferences
      case .itemPatch: reason = .cardState
      case .reading: reason = .backgroundActivity
      case .upsert, .delete: reason = .content
      }
    } else {
      reason = .unknown
    }
    running = true
    let token = generation
    // A newer network response may not be drawn yet. Never upgrade stale input to its revision.
    let base = job.base
    Task {
      let trace = PerformanceTrace.shared.begin(
        operations == nil ? .read : .write,
        reason: reason, parent: job.trace)
      let result: Result<Snapshot, any Error>
      do {
        if let operations {
          result = .success(try await backend.apply(operations, expectedRevision: base))
        } else {
          result = .success(try await backend.read())
        }
      } catch {
        result = .failure(error)
      }
      if case .success = result {
        PerformanceTrace.shared.end(
          trace, values: ["operation_count": Double(operations?.count ?? 0)])
      } else {
        PerformanceTrace.shared.end(trace, success: false)
      }
      running = false
      guard token == generation else {
        job.completion(nil)
        pump()
        return
      }
      if case .success(let snapshot) = result {
        knownRevision = snapshot.revision
        if operations != nil, snapshot.revision != base {
          for index in jobs.indices
          where jobs[index].base == base && jobs[index].priority == .foreground {
            jobs[index].base = snapshot.revision
          }
        }
      }
      job.completion(result)
      pump()
    }
  }
}
