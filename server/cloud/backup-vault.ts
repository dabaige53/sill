// Server-side only. The wrapping key is supplied by deployment secret storage.
// Bind ciphertext to owner and target so moving rows cannot swap credentials.
export async function sealBackupSecret(
	key: CryptoKey,
	owner: string,
	target: string,
	secret: string,
) {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const data = await crypto.subtle.encrypt(
		{
			name: "AES-GCM",
			iv,
			additionalData: new TextEncoder().encode(JSON.stringify([owner, target])),
		},
		key,
		new TextEncoder().encode(secret),
	);
	return { version: 1, iv: Array.from(iv), data: Array.from(new Uint8Array(data)) };
}
export async function openBackupSecret(
	key: CryptoKey,
	owner: string,
	target: string,
	sealed: { version: number; iv: number[]; data: number[] },
) {
	if (sealed.version !== 1) throw new Error("unsupported_secret_version");
	try {
		const data = await crypto.subtle.decrypt(
			{
				name: "AES-GCM",
				iv: new Uint8Array(sealed.iv),
				additionalData: new TextEncoder().encode(JSON.stringify([owner, target])),
			},
			key,
			new Uint8Array(sealed.data),
		);
		return new TextDecoder().decode(data);
	} catch {
		throw new Error("backup_credentials_unavailable");
	}
}
export async function backupEncryptionKey(encoded: string) {
	if (!/^[a-f0-9]{64}$/i.test(encoded || "")) throw new Error("backup_credentials_unavailable");
	return crypto.subtle.importKey(
		"raw",
		new Uint8Array(encoded.match(/../g)!.map((n) => parseInt(n, 16))),
		{ name: "AES-GCM" },
		false,
		["encrypt", "decrypt"],
	);
}
