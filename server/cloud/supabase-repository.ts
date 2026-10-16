const errors = {
	unauthenticated: 401,
	forbidden: 403,
	not_found: 404,
	invalid_request: 400,
	revision_conflict: 409,
	idempotency_conflict: 409,
	idempotency_expired: 409,
	event_terminal_conflict: 409,
	cursor_expired: 410,
	rate_limited: 429,
};
export function serviceError(code?: any, status: any = errors[code] ?? 503) {
	return Object.assign(new Error(code), { code, status });
}
// A request-scoped user-JWT client, never a service-role client or raw table gateway.
export class SupabaseRepository {
	declare client: any;

	constructor(client?: any) {
		this.client = client;
	}
	async rpc(name?: any, args?: any) {
		let result: any;
		try {
			result = await this.client.rpc(name, args);
		} catch {
			throw serviceError("unavailable");
		}
		if (result.error) {
			const code = result.error.message;
			throw serviceError(Object.hasOwn(errors, code) ? code : "unavailable");
		}
		return result.data;
	}
	workspace() {
		return this.rpc("sill_get_workspace", {});
	}
	applyOperations(payload: any, idem: string) {
		return this.rpc("sill_apply_operations", { payload, idem });
	}
	session() {
		return this.rpc("sill_session_info", {});
	}
	list({ cursor = null, since = null, limit = null }: any = {}) {
		return this.rpc("sill_list_contents", {
			cursor_token: cursor,
			since_token: since,
			requested_limit: limit,
		});
	}
	get(id?: any) {
		return this.rpc("sill_get_content", { resource_id: id });
	}
	getEvent(id?: any) {
		return this.rpc("sill_get_event", { event_id: id });
	}
	write(op?: any, id?: any, payload?: any, key?: any) {
		return this.rpc("sill_write_v1", { op, resource_id: id, payload, idem: key });
	}
}
