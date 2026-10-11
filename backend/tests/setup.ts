// Runs before any test module is imported, so config/env.ts sees these values.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-that-is-definitely-longer-than-32-chars';
process.env.MONGODB_URI = 'mongodb://set-by-mongodb-memory-server';
