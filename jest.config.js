// Simple Jest config without Next.js
module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/__tests__/simple/*.test.js',
    '**/__tests__/*.test.ts',
    '**/__tests__/*.test.js',
    '**/__tests__/**/*.test.ts',
    '**/__tests__/**/*.test.js'
  ],
  testTimeout: 30000, // Increased for video processing
  clearMocks: true,
  collectCoverage: false,
  preset: 'ts-jest',
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
}