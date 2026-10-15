// Provider authorization IDs are opaque URL-safe handles, not database UUIDs.
export const isAuthorizationId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{16,128}$/.test(value);
