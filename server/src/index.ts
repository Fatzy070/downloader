import 'dotenv/config';
import { terminateAllActiveProcesses } from './adapters/ytdlp.adapter.js';
import { createApp } from './app.js';

const PORT = Number(process.env.PORT) || 3001;
const app = createApp();

const server = app.listen(PORT, () => {
  console.log(
    `[Server] Universal Video Downloader API listening on http://localhost:${PORT}`
  );
});

function gracefulShutdown(signal: string): void {
  console.log(`\n[Server] Received ${signal}. Shutting down gracefully...`);
  terminateAllActiveProcesses();

  server.close(() => {
    console.log('[Server] HTTP server closed.');
    process.exit(0);
  });

  // Force exit if connections hang beyond 5 seconds
  const forceTimer = setTimeout(() => {
    terminateAllActiveProcesses();
    process.exit(1);
  }, 5000);
  forceTimer.unref();
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
