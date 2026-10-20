import Foundation
import SillKit

/// Runs reads and writes one at a time. There is no global busy switch: callers lock only the card
/// or control that started a write.
///
/// Each write carries the revision its author saw. When one of our own writes moves the revision
/// from r to r', queued writes based on r move to r'. A refresh does not rebase them, so a change
/// made elsewhere still surfaces as a version conflict instead of being overwritten.
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
    _ completion: @escaping (Result<Snapshot, any Error>?) -> Void
  ) {
    enqueue(
      Job(kind: .write(operations), base: knownRevision, priority: priority, completion: completion)
    )
  }

  /// One waiting background job at most; later records join it.
  func background(
    _ build: @escaping () -> [WorkspaceOperation],
    _ completion: @escaping (Result<Snapshot, any Error>?) -> Void
  ) {
    guard !hasQueuedBackgroundWork else { return }
    enqueue(
      Job(
        kind: .deferred(build), base: knownRevision, priority: .background, completion: completion))
  }

  /// Drop queued work (account change). The running request finishes but its result is ignored.
  func reset(revision: Int = 0) {
    generation += 1
    knownRevision = revision
    let dropped = jobs
    jobs = []
    for job in dropped { job.completion(nil) }
  }

  private func enqueue(_ job: Job) {
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
    running = true
    let token = generation
    // Background records always use the newest drawn revision: they carry no user decision.
    let base = job.priority == .background ? knownRevision : job.base
    Task {
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
      running = false
      guard token == generation else {
        job.completion(nil)
        pump()
        return
      }
      if case .success(let snapshot) = result {
        knownRevision = snapshot.revision
        if operations != nil, snapshot.revision != base {
          for index in jobs.indices where jobs[index].base == base {
            jobs[index].base = snapshot.revision
          }
        }
      }
      job.completion(result)
      pump()
    }
  }
}
