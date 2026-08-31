// Provides required env vars for config/env.ts validation during test runs.
process.env.NODE_ENV ??= 'test';
process.env.JWT_SECRET ??= 'test-jwt-secret-do-not-use-in-production';
process.env.LOG_LEVEL ??= 'error';
