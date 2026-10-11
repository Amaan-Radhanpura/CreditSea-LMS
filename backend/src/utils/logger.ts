import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.NODE_ENV === 'test' ? 'silent' : isDev ? 'debug' : 'info',
  transport: isDev && process.env.NODE_ENV !== 'test' ? { target: 'pino-pretty', options: { colorize: true } } : undefined,
  redact: ['req.headers.authorization', 'req.headers.cookie', 'password', 'passwordHash'],
});
