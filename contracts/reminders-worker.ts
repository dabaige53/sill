/** Click bridge only: no cache, background scheduling or push subscription. */
export const remindersWorker = `
self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("notificationclick", event => {
  const data = event.notification.data;
  event.notification.close();
  if (!data || typeof data.owner !== "string" || typeof data.card !== "string" || typeof data.key !== "string") return;
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clients) {
      if (new URL(client.url).origin !== self.location.origin) continue;
      const accepted = await new Promise(resolve => {
        const channel = new MessageChannel();
        const finish = value => { clearTimeout(timeout); channel.port1.close(); resolve(value); };
        const timeout = setTimeout(() => finish(false), 1000);
        channel.port1.onmessage = reply => finish(reply.data?.accepted === true);
        try { client.postMessage({ type: "sill-reminder-open", owner: data.owner, card: data.card, key: data.key }, [channel.port2]); }
        catch { finish(false); }
      });
      if (accepted) { await client.focus(); return; }
    }
  })());
});
`;
