import { startLocal } from './server/local.mjs';
// Invoked through service-lock, which retains the kernel lock across exec.
try {
  const server = await startLocal({ port: 0, file: process.argv[2] });
  console.log(server.address().port);
  let stopping = false;
  const stop = () => { if (stopping) return; stopping = true; server.close(() => process.exit(0)); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  const parent = process.ppid;
  setInterval(() => { if (process.ppid !== parent) stop(); }, 250).unref();
} catch {
  console.log(JSON.stringify({ error: '无法打开本地数据。请检查数据文件与目录权限，保留原文件后重试。' }));
  process.exit(1);
}
