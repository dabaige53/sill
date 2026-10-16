# Registered local jobs

不再适用：旧阶段的说明或测试报告，仅供历史查阅，不代表当前默认产品能力。

F09 adds persistent schedules and runs for two reviewed, read-only-local operations. Jobs cannot execute shell commands, scripts, arbitrary MCP tools, connectors, an AI provider, external writes or messages. This is an application job registry, not a general automation host.

## What can run

- `recommendation-snapshot`: compute a bounded, explainable snapshot from existing cards and the owner's current saved preferences. It does not change the feed, card state or preferences.
- `data-quality-digest`: summarize existing local card coverage/quality using bounded counts. It does not fetch, repair or rewrite upstream records.

Both operations write only their own run status/result and audit metadata. A result is an observation of local data at execution time, not a subscription to external changes. Oversized input is explicitly refused rather than silently claiming a complete analysis. No operation invents a provider authorization or inherits host credentials.

## Operator-controlled worker

`jobs.enabled` defaults to false. Only operator configuration can enable the background worker; ordinary settings, HTTP and MCP cannot change that switch. The example configuration leaves it false. Implementing this feature does not activate any real schedule.

Default operator limits are 30 jobs, 200 retained runs globally, 2,000 durable manual-run receipts, 2 simultaneous runs, a 10-second run timeout, a 1-second worker tick, a 30-second renewable lease, 1,000 input cards, 8 MiB serialized input and 32 KiB result. Each setting has a strict finite upper bound; unknown configuration is rejected. Global run-history pruning removes oldest terminal runs only, never an active run. The shared application audit log remains append-only metadata and grows while scheduling is enabled; these bounds do not promise a bounded total database file. At 30 jobs every minute, start/finish events alone can add 86,400 audit rows per day. Operators must account for storage; jobs-only audit retention is future operational work, not an automatic purge of existing audit data. Manual idempotency receipts remain after history pruning; replay returns `JOB_RUN_PRUNED` rather than executing again. The receipt cap eventually refuses new manual runs rather than discarding duplicate protection. There is no receipt-reset tool in this release.

An owner may explicitly run a registered job manually while the worker is disabled or the job is paused. That is one local execution, not permission to start recurring work. Creating a job defaults to paused. The UI always creates paused jobs; resume is a separate explicit action. Pausing stops future scheduled claims, while cancelling targets a particular active run. Neither action deletes history.

## Time and occurrences

Schedules use `startAt` with an explicit ISO-8601 offset and `intervalSeconds` between 60 and 2,592,000 (30 days). The anchor is normalized to UTC. These are elapsed-time intervals, not wall-clock cron rules or a daylight-saving-time calendar. The UI labels its input as UTC. For example, a daily interval stays 86,400 seconds apart through a local DST transition.

The worker coalesces missed intervals instead of replaying an unbounded backlog. Pause/resume preserves the consumed occurrence high-water mark; explicitly changing the anchor or interval begins a new schedule series. An occurrence is claimed transactionally with its schedule cursor and lease. Multiple workers cannot claim the same occurrence or overlap the same job. Manual calls use caller-supplied idempotency keys; retry the original key after an uncertain response. A conflicting reuse is rejected. Pruning displayed history must never make an old key executable again.

Expired running leases recover to `interrupted`, not a blind retry. There is one attempt per run; a later due occurrence or a new explicit manual request is a separate run. Cancellation, timeout and lease ownership are checked before a result can be committed. Late work cannot overwrite a terminal state. Worker shutdown clears its timers and stops local run work before closing the store.

## Shared interfaces

Six owner-only tools use the same service methods as HTTP:

- `qg_list_jobs`: GET `/api/jobs`, bounded pagination and registry/worker state
- `qg_create_job`: POST `/api/jobs`, registered kind, title, schedule, paused state and idempotency key
- `qg_update_job`: PATCH `/api/jobs/:jobId`, nonempty `set` plus `expectedRevision`
- `qg_run_job`: POST `/api/jobs/:jobId/run`, explicit idempotency key
- `qg_get_job`: GET `/api/jobs/:jobId`, job and bounded paginated run history
- `qg_cancel_job_run`: POST `/api/job-runs/:runId/cancel`, empty body

HTTP maps missing job/run IDs to 404, CAS/key/overlap/pruned-history conflicts to 409, configured capacity limits to 429, and unavailable/unsafe storage state to 503. Invalid schemas use 400. MCP uses structured `isError` responses. Worker errors are safe local codes, never captured external credentials or raw exceptions.

Job revisions start at 1. Edits require the current revision; conflicts are shown rather than automatically replayed. Read/list calls never start work. Run history exposes timestamps, trigger, attempt, terminal status, bounded result or safe error. Schedule edits do not authorize a new operation kind or arbitrary target.

F07 restricted principals cannot discover or call these tools or reach the HTTP routes. No new restricted-agent grant is added. Owner browser sessions and owner stdio retain their existing full operator-facing business access, but cannot change worker configuration through a tool.

## UI and failure recovery

The existing settings panel contains a compact jobs section with registry choices, paused creation, explicit manual run and pause/resume/cancel controls. It shows worker-disabled status, due times and retained history. It is not a full calendar or workflow editor. Opening or reloading it performs reads only.

Uncertain create/run responses retain their original key for explicit recovery; repeated clicks must not generate duplicate executions. Offline or stale-revision errors are visible. Older reads must not replace newer navigation/results. Browser tests use synthetic tasks and fake timing; the feature has not activated a real user schedule.

## Future boundary

Connector collection, AI jobs, external writes, arbitrary scripts and notifications are not registered here. Adding one requires a separately reviewed operation, explicit authorization/data-sharing semantics, limits and outcome recovery; a schedule or a local owner setting cannot supply that authority.
