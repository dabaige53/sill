# Clean-checkout Codex plugin validation — 2026-10-14

Source change: `ec0530547cfb50d964618cdd54402c651528eb2d` (PR23). Base main: `fc9f267947f7b220d34f4fac13c1eef727b6d179`.

The marketplace now selects the committed `plugins/quiet-glass` directory. A fresh HTTPS clone of `fix/installable-local-plugin` contained the complete package without running a build or installing npm dependencies.

Actual host: `codex-cli 0.159.0-alpha.3`, Node.js `v24.19.0`.

```sh
git clone --branch fix/installable-local-plugin https://github.com/dabaige53/quiet-glass.git /tmp/qg-clean-checkout
mkdir -p /workspace/plugin-validation/home /workspace/plugin-validation/codex
env HOME=/workspace/plugin-validation/home CODEX_HOME=/workspace/plugin-validation/codex codex plugin marketplace add /tmp/qg-clean-checkout --json
env HOME=/workspace/plugin-validation/home CODEX_HOME=/workspace/plugin-validation/codex codex plugin add quiet-glass@quiet-glass-local --json
env HOME=/workspace/plugin-validation/home CODEX_HOME=/workspace/plugin-validation/codex codex plugin list --json
```

CLI returned `quiet-glass@quiet-glass-local`, version `0.4.1`, installed=true, enabled=true. Its installed path was `/workspace/plugin-validation/codex/plugins/cache/quiet-glass-local/quiet-glass/0.4.1`. These are disposable test directories, not runtime paths embedded in the skill.

The installed skill's `scripts/qg.mjs capabilities` was also executed from `/tmp` against an isolated local server on an ephemeral loopback port (`QG_LOCAL_PORT`). It returned valid JSON. The local server needs repository dependencies (`npm ci`); the plugin installer and bundled CLI do not. No existing workspace data was used. Package regression checks passed, including command resolution from an unrelated working directory and removal of stale MCP/App registrations.

This proves local plugin discovery, installation and a harmless local capability read. It does **not** prove cloud login, remote MCP, OAuth consent or access to any real account. No credentials or MCP registration are included. PR21 remains a separate local stdio implementation; PR20 remains the default-disabled remote transport preparation.
