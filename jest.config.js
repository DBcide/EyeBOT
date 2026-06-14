/** @type {import('jest').Config} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/tests'],
    testMatch: ['**/*.test.ts', '**/*.spec.ts'],
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
    },
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.d.ts',
        // Scripts & entry point
        '!src/scripts/**',
        '!src/index.ts',
        '!src/config/**',
        // Discord orchestration (trop couplé à discord.js pour des tests unitaires)
        '!src/core/Bot.ts',
        '!src/core/BaseCommand.ts',
        '!src/core/BaseEvent.ts',
        // Commands Discord (nécessitent une interaction Discord complète)
        '!src/features/tracer/commands/**',
        // Discord embed builders (UI pure, pas de logique métier testable)
        '!src/features/tracer/utils/EmbedBuilders.ts',
        // Health monitor (timers + HTTP heartbeat)
        '!src/shared/services/HealthMonitorService.ts',
        // Singleton thin wrapper
        '!src/shared/services/ServiceContainer.ts',
        // Migrations SQL
        '!src/database/migrations/**',
        '!src/database/MigrationService.ts',
    ],
    coverageReporters: ['lcov', 'text-summary', 'text'],
    coverageDirectory: 'coverage',
};
