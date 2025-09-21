// Simple Jest config without Next.js
module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/__tests__/simple/*.test.js'
  ],
  testTimeout: 10000,
  clearMocks: true,
  collectCoverage: false,
}