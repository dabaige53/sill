import { basename } from "node:path";

export const maxBytes = 20_000;
const lockfiles = new Set([
	"package-lock.json",
	"npm-shrinkwrap.json",
	"yarn.lock",
	"pnpm-lock.yaml",
	"bun.lock",
	"bun.lockb",
	"Package.resolved",
	"Cargo.lock",
	"uv.lock",
	"poetry.lock",
	"Gemfile.lock",
	"composer.lock",
	"go.sum",
]);
const outputs = new Set([
	"contracts/schema.json",
	"contracts/apple-openapi.json",
	"contracts/design/openapi.json",
	"contracts/design/mcp-tools.json",
	"contracts/design/fixtures.json",
	"design-system/components/bundle.js",
	"design-system/components/bundle.css",
	"design-system/copy/zh-Hans.json",
	"design-system/tokens.json",
	"supabase/drafts/sill_v1_rpc.sql",
	// Vendored React/ReactDOM used by the exported design canvas.
	"design-system/boards/support.js",
]);

export function isExempt(path: string): boolean {
	return (
		lockfiles.has(basename(path)) ||
		outputs.has(path) ||
		path.startsWith("design-system/assets/Icons/") ||
		path.startsWith("deploy/releases/") ||
		path.startsWith(".agents/skills/") ||
		/^design-system\/boards\/.*\.dc\.html$/.test(path) ||
		/^docs\/records\/.*\.(json|log|html)$/.test(path) ||
		// This already-applied migration is immutable; new migrations are still checked.
		path === "supabase/migrations/20261016092653_sill_workspace_operations.sql" ||
		/(^|\/)(generated|__generated__|vendor|node_modules)\//.test(path) ||
		/\.(generated|g)\.[^/]+$/.test(path)
	);
}
