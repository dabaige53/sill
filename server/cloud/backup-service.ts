/** Digest the exact remote bytes. Restore confirmation must refer to the previewed file. */
export async function backupDigest(text: string) {
	const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
	return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}
