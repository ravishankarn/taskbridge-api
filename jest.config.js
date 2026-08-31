/** @type {import('jest').Config} */
module.exports = {
  passWithNoTests: true,
  projects: [
    {
      displayName: 'unit',
      preset: 'ts-jest',
      testEnvironment: 'node',
      rootDir: '.',
      testMatch: ['<rootDir>/tests/**/*.test.ts'],
      testPathIgnorePatterns: ['<rootDir>/node_modules/', '\\.integration\\.test\\.ts$'],
    },
    {
      displayName: 'integration',
      preset: 'ts-jest',
      testEnvironment: 'node',
      rootDir: '.',
      testMatch: ['<rootDir>/tests/**/*.integration.test.ts'],
      testPathIgnorePatterns: ['<rootDir>/node_modules/'],
    },
  ],
};
