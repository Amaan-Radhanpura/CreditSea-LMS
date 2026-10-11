import { createApp } from './app';
import { env } from './config/env';
import { connectDB, disconnectDB } from './config/db';
import { startReminderScheduler } from './modules/notifications/reminderJob';
import { logger } from './utils/logger';

async function main(): Promise<void> {
  await connectDB();
  const server = createApp().listen(env.PORT, () => logger.info(`API listening on http://localhost:${env.PORT}`));
  const stopScheduler = env.REMINDER_INTERVAL_MINUTES > 0 ? startReminderScheduler(env.REMINDER_INTERVAL_MINUTES) : () => undefined;

  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down`);
    stopScheduler();
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
