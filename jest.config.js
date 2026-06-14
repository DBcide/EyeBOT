/** @type {import('jest').Config} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    testMatch: ['**/*.test.ts', '**/*.spec.ts'],
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.d.ts',
        '!src/scripts/**',
        '!src/index.ts',
    ],
    coverageReporters: ['lcov', 'text-summary'],
    coverageDirectory: 'coverage',
};