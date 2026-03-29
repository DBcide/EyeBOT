# Plan de Test - EyeBOT

Ce document décrit la stratégie complète de test pour le projet EyeBOT, incluant les tests unitaires, d'intégration et end-to-end.

## Table des matières

1. [Vue d'ensemble](#vue-densemble)
2. [Configuration de l'environnement de test](#configuration-de-lenvironnement-de-test)
3. [Tests unitaires](#tests-unitaires)
4. [Tests d'intégration](#tests-dintégration)
5. [Tests end-to-end](#tests-end-to-end)
6. [Tests de performance](#tests-de-performance)
7. [Couverture de code](#couverture-de-code)
8. [CI/CD](#cicd)

---

## Vue d'ensemble

### Objectifs
- Assurer la fiabilité du système de logging
- Garantir le bon fonctionnement des commandes Discord
- Valider l'intégration avec l'API Albion
- Vérifier la gestion des erreurs et des cas limites

### Stack de test recommandée
- **Framework de test** : Jest
- **Mocking** : Jest built-in mocks
- **Coverage** : Jest coverage (nyc/istanbul)
- **E2E** : Supertest pour les endpoints HTTP (si applicable)
- **Discord.js mocking** : @discord-test/mock ou création de mocks personnalisés

---

## Configuration de l'environnement de test

### 1. Installation des dépendances

```bash
npm install --save-dev jest @types/jest ts-jest
npm install --save-dev @discord-test/mock # Pour mocker discord.js
```

### 2. Configuration Jest (jest.config.js)

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/scripts/**',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
```

### 3. Scripts package.json

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:unit": "jest --testPathPattern=unit",
    "test:integration": "jest --testPathPattern=integration",
    "test:e2e": "jest --testPathPattern=e2e"
  }
}
```

### 4. Base de données de test

- Créer une base de données MySQL dédiée aux tests
- Utiliser des transactions pour isoler les tests
- Créer un script de setup/teardown pour les fixtures

**Fichier `.env.test`:**
```env
DB_HOST=localhost
DB_USER=test_user
DB_PASSWORD=test_password
DB_NAME=eyebot_test
DB_PORT=3306
DISCORD_TOKEN=test_token
CLIENT_ID=test_client_id
GUILD_ID=test_guild_id
```

---

## Tests unitaires

Les tests unitaires vérifient le comportement de méthodes isolées sans dépendances externes.

### 1. Services à tester

#### DatabaseService (`src/shared/services/DatabaseService.ts`)

**Méthodes testables:**

| Méthode | Priorité | Cas de test |
|---------|----------|-------------|
| `query()` | HAUTE | ✅ Requête réussie<br>✅ Erreur SQL<br>✅ Timeout connexion |
| `select()` | HAUTE | ✅ Résultats multiples<br>✅ Tableau vide<br>✅ Erreur format |
| `selectOne()` | HAUTE | ✅ Un résultat<br>✅ Aucun résultat<br>✅ Plusieurs résultats |
| `insert()` | HAUTE | ✅ Insertion réussie<br>✅ Contrainte unique violée<br>✅ Retour insertId |
| `execute()` | HAUTE | ✅ UPDATE/DELETE réussi<br>✅ Retour affectedRows |
| `beginTransaction()` | HAUTE | ✅ Transaction ouverte<br>✅ Pool saturé |
| `commit()` | HAUTE | ✅ Commit réussi<br>✅ Connection released |
| `rollback()` | HAUTE | ✅ Rollback réussi<br>✅ Connection released |

**Exemple de test:**
```typescript
// tests/unit/services/DatabaseService.test.ts
import { DatabaseService } from '@/shared/services/DatabaseService';

describe('DatabaseService', () => {
  let dbService: DatabaseService;

  beforeEach(() => {
    dbService = new DatabaseService();
  });

  describe('selectOne', () => {
    it('should return one result when data exists', async () => {
      // Mock pool.execute to return test data
      // Assert result
    });

    it('should return null when no data exists', async () => {
      // Mock empty result
      // Assert null
    });
  });
});
```

---

#### LoggerService (`src/shared/services/LoggerService.ts`)

**Méthodes testables:**

| Méthode | Priorité | Cas de test |
|---------|----------|-------------|
| `info()` | MOYENNE | ✅ Log console<br>✅ Log DB avec catégorie<br>✅ Log DB sans connexion (graceful) |
| `success()` | MOYENNE | ✅ Format de message correct<br>✅ Écriture DB |
| `warn()` | MOYENNE | ✅ Niveau warn correct<br>✅ Catégorie applied |
| `error()` | HAUTE | ✅ Error object serialized<br>✅ Stack trace captured<br>✅ Context enriched |
| `debug()` | BASSE | ✅ Production skip<br>✅ Dev logging |
| `writeToDatabase()` | HAUTE | ✅ Insert réussi<br>✅ DB error ne crash pas<br>✅ JSON serialization |

---

#### TracerService (`src/features/tracer/services/TracerService.ts`)

**Méthodes testables:**

| Méthode | Priorité | Cas de test |
|---------|----------|-------------|
| `isUserRegistered()` | HAUTE | ✅ Utilisateur enregistré<br>✅ Utilisateur non enregistré<br>✅ Erreur DB |
| `getRegisteredUsers()` | HAUTE | ✅ Plusieurs personnages<br>✅ Aucun personnage<br>✅ Tri par date |
| `getCharacterByAlbionId()` | HAUTE | ✅ Personnage trouvé<br>✅ Personnage non trouvé |
| `isCharacterAlreadyRegistered()` | HAUTE | ✅ Déjà enregistré par user<br>✅ Non enregistré<br>✅ Enregistré par autre user |
| `isCharacterVerified()` | HAUTE | ✅ Vérifié<br>✅ Non vérifié |
| `isCharacterVerifiedByOther()` | HAUTE | ✅ Vérifié par autre<br>✅ Vérifié par même user<br>✅ Non vérifié |
| `getUnverifiedClaimCount()` | MOYENNE | ✅ Count correct<br>✅ Exclusion du user actuel |
| `registerUser()` | HAUTE | ✅ Nouveau personnage<br>✅ Update si existant<br>✅ Transaction rollback on error |
| `updateCharacter()` | HAUTE | ✅ Update stats<br>✅ is_main mis à jour<br>✅ Timestamps updated |
| `countUserCharacters()` | MOYENNE | ✅ Count correct<br>✅ Zéro si aucun |
| `verifyCharacter()` | HAUTE | ✅ Verification réussie<br>✅ Duplicates supprimés<br>✅ Transaction atomique |
| `getAllClaimsForCharacter()` | MOYENNE | ✅ Tous les claims retournés<br>✅ Tri par date |

**Business logic critique à tester:**
- Logique de personnage principal (is_main)
- Suppression des duplicates lors de la vérification
- Contraintes de vérification (un seul verified owner)

---

#### AlbionService (`src/features/tracer/services/AlbionService.ts`)

**Méthodes testables:**

| Méthode | Priorité | Cas de test |
|---------|----------|-------------|
| `searchPlayer()` | HAUTE | ✅ Joueurs trouvés<br>✅ Aucun joueur<br>✅ API timeout<br>✅ Rate limit (429)<br>✅ API error (500) |
| `getPlayerDetailsById()` | HAUTE | ✅ Détails retournés<br>✅ Joueur non trouvé (404)<br>✅ API timeout<br>✅ Rate limit |
| `fetchWithTimeout()` | HAUTE | ✅ Fetch réussi<br>✅ Timeout abort<br>✅ Network error |
| `formatFame()` | MOYENNE | ✅ Milliards (B)<br>✅ Millions (M)<br>✅ Milliers (K)<br>✅ < 1000 |

**API Mocking requis:**
- Mock fetch global
- Simulate API responses
- Test error handling

---

#### HealthMonitorService (`src/shared/services/HealthMonitorService.ts`)

**Méthodes testables:**

| Méthode | Priorité | Cas de test |
|---------|----------|-------------|
| `getSystemMetrics()` | MOYENNE | ✅ Métriques CPU/RAM correctes<br>✅ Load average calculé |
| `calculateCpuUsage()` | MOYENNE | ✅ Pourcentage < 100%<br>✅ Delta calculation correct |
| `getDiscordMetrics()` | MOYENNE | ✅ Guilds/users count<br>✅ Websocket ping<br>✅ Client non ready |
| `formatBytes()` | BASSE | ✅ B, KB, MB, GB, TB<br>✅ Zero bytes |
| `formatUptime()` | BASSE | ✅ Jours, heures, minutes<br>✅ Zero uptime |
| `getAverageMetrics()` | MOYENNE | ✅ Moyenne calculée<br>✅ Historique vide |

---

#### DatabaseLoggingService (`src/shared/services/DatabaseLoggingService.ts`)

**Méthodes testables:**

| Méthode | Priorité | Cas de test |
|---------|----------|-------------|
| `logCommand()` | HAUTE | ✅ Log inséré<br>✅ Options JSON sérializées<br>✅ Erreur DB ne crash pas |
| `logSystem()` | HAUTE | ✅ Log système inséré<br>✅ Context JSON correct |
| `logEvent()` | HAUTE | ✅ Event inséré<br>✅ Details JSON correct |
| `getRecentCommandLogs()` | MOYENNE | ✅ Limit appliquée<br>✅ Tri DESC correct |
| `getCommandStats()` | MOYENNE | ✅ Stats agrégées<br>✅ Période days correcte<br>✅ Group by command_name |
| `cleanOldLogs()` | BASSE | ✅ Vieux logs supprimés<br>✅ Logs récents préservés |

---

### 2. Utilitaires à tester

#### DiscordUtils (`src/features/tracer/utils/DiscordUtils.ts`)

| Méthode | Priorité | Cas de test |
|---------|----------|-------------|
| `updateMemberNickname()` | HAUTE | ✅ Nickname updated<br>✅ Permission denied<br>✅ Member null<br>✅ Nickname trop long (>32 chars) |

---

#### ErrorHandlers (`src/features/tracer/utils/ErrorHandlers.ts`)

| Méthode | Priorité | Cas de test |
|---------|----------|-------------|
| `getAlbionApiErrorMessage()` | HAUTE | ✅ Timeout error<br>✅ Rate limit error<br>✅ Generic error<br>✅ Error string<br>✅ Unknown error |

---

#### EmbedBuilders (`src/features/tracer/utils/EmbedBuilders.ts`)

| Méthode | Priorité | Cas de test |
|---------|----------|-------------|
| Toutes les méthodes | MOYENNE | ✅ Embed structure correcte<br>✅ Champs requis présents<br>✅ Couleurs correctes<br>✅ Formatting correct |

---

#### GuildUtils (`src/features/tracer/utils/GuildUtils.ts`)

| Méthode | Priorité | Cas de test |
|---------|----------|-------------|
| `buildGuildTag()` | BASSE | ✅ [GUILD]<br>✅ Guild null → null<br>✅ Alliance included |

---

### 3. Database Migrations

#### MigrationService (`src/database/MigrationService.ts`)

**Méthodes testables:**

| Méthode | Priorité | Cas de test |
|---------|----------|-------------|
| `runMigrations()` | HAUTE | ✅ Migrations exécutées en ordre<br>✅ Migrations déjà faites skippées<br>✅ Rollback sur erreur<br>✅ Migration enregistrée |
| `rollbackLastMigration()` | HAUTE | ✅ Dernière migration annulée<br>✅ Aucune migration → warning<br>✅ Migration introuvable → error |
| `listExecutedMigrations()` | BASSE | ✅ Liste affichée<br>✅ Tri chronologique |

---

## Tests d'intégration

Les tests d'intégration vérifient l'interaction entre plusieurs composants.

### 1. Database → Services

**Scénarios à tester:**

#### TracerService + DatabaseService
```typescript
// tests/integration/tracer-database.test.ts

describe('TracerService Integration', () => {
  let db: DatabaseService;
  let tracer: TracerService;

  beforeAll(async () => {
    // Setup test database
    db = new DatabaseService();
    await db.testConnection();
    tracer = new TracerService();
  });

  afterEach(async () => {
    // Clean test data
    await db.execute('DELETE FROM tracer_users WHERE discord_id LIKE "test_%"');
  });

  it('should register and verify a character', async () => {
    // 1. Register character
    await tracer.registerUser({...});

    // 2. Verify registration
    const isRegistered = await tracer.isUserRegistered('test_user_123');
    expect(isRegistered).toBe(true);

    // 3. Verify character
    await tracer.verifyCharacter('albion_id', 'test_user_123');

    // 4. Check verification status
    const isVerified = await tracer.isCharacterVerified('albion_id');
    expect(isVerified).toBe(true);
  });
});
```

---

#### LoggerService + DatabaseService

```typescript
describe('Logger + Database Integration', () => {
  it('should write logs to database', async () => {
    const logger = serviceContainer.logger;

    logger.info('Test log', 'test-category');

    // Wait for async write
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify log in database
    const logs = await db.select('SELECT * FROM system_logs WHERE category = ?', ['test-category']);
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0].message).toBe('Test log');
  });
});
```

---

### 2. AlbionService + External API

**Tests avec mocking de l'API:**

```typescript
describe('AlbionService API Integration', () => {
  let albionService: AlbionService;

  beforeEach(() => {
    albionService = new AlbionService();
    // Mock fetch globally
    global.fetch = jest.fn();
  });

  it('should handle rate limiting gracefully', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
    });

    await expect(albionService.searchPlayer('test')).rejects.toThrow('Rate limit');
  });
});
```

---

### 3. Command Execution Flow

**Test du flow complet d'une commande:**

```typescript
describe('RegisterCommand Integration', () => {
  it('should register a character end-to-end', async () => {
    // 1. Mock Discord interaction
    const interaction = createMockInteraction({
      commandName: 'register',
      options: [{ name: 'pseudo', value: 'TestPlayer' }],
    });

    // 2. Mock Albion API
    mockAlbionSearchResponse([{ Id: 'test_id', Name: 'TestPlayer' }]);

    // 3. Execute command
    const command = new RegisterCommand();
    await command.execute(interaction);

    // 4. Verify database entry
    const users = await db.select('SELECT * FROM tracer_users WHERE albion_id = ?', ['test_id']);
    expect(users.length).toBe(1);

    // 5. Verify command log
    const logs = await db.select('SELECT * FROM command_logs WHERE command_name = ?', ['register']);
    expect(logs[0].status).toBe('success');
  });
});
```

---

## Tests end-to-end

Les tests E2E simulent des interactions utilisateur complètes.

### 1. Bot Lifecycle

```typescript
describe('Bot Lifecycle E2E', () => {
  it('should start, connect, and shutdown gracefully', async () => {
    const bot = new Bot();

    // Start bot
    await bot.start();

    // Verify database connection
    expect(bot.services.database.isConnectionActive()).toBe(true);

    // Verify commands loaded
    expect(bot.commands.size).toBeGreaterThan(0);

    // Shutdown
    await bot.shutdown('test');

    // Verify clean shutdown
    expect(bot.services.database.isConnectionActive()).toBe(false);
  });
});
```

---

### 2. Full User Journey

**Scénario: Utilisateur enregistre et vérifie son personnage**

```typescript
describe('User Registration Journey E2E', () => {
  it('should complete registration and verification flow', async () => {
    // 1. User executes /register
    // 2. Bot searches Albion API
    // 3. User confirms character
    // 4. Bot sends verification instructions
    // 5. Admin executes /verify
    // 6. User updates character with /update
    // 7. Verify all logs are present
  });
});
```

---

## Tests de performance

### 1. Database Query Performance

```typescript
describe('Database Performance', () => {
  it('should handle 100 concurrent queries', async () => {
    const queries = Array(100).fill(null).map(() =>
      db.select('SELECT * FROM tracer_users LIMIT 10')
    );

    const start = Date.now();
    await Promise.all(queries);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(5000); // 5 secondes max
  });
});
```

---

### 2. UpdateAll Performance

```typescript
describe('UpdateAll Performance', () => {
  it('should update 100 members in reasonable time', async () => {
    // Setup 100 test members
    // Execute updateall
    // Measure time
    // Assert < 60 seconds
  });
});
```

---

## Couverture de code

### Objectifs de couverture

| Type | Minimum | Objectif |
|------|---------|----------|
| Statements | 80% | 90% |
| Branches | 70% | 85% |
| Functions | 80% | 90% |
| Lines | 80% | 90% |

### Exclusions

- Fichiers d'index
- Scripts CLI
- Migrations (testées via integration tests)
- Mocks et types

### Commandes

```bash
# Générer rapport de couverture
npm run test:coverage

# Voir rapport HTML
open coverage/lcov-report/index.html
```

---

## CI/CD

### GitHub Actions Workflow

**Fichier `.github/workflows/test.yml`:**

```yaml
name: Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      mysql:
        image: mysql:8.0
        env:
          MYSQL_ROOT_PASSWORD: root
          MYSQL_DATABASE: eyebot_test
        ports:
          - 3306:3306
        options: >-
          --health-cmd="mysqladmin ping"
          --health-interval=10s
          --health-timeout=5s
          --health-retries=3

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run migrations
        run: npm run migrate
        env:
          DB_HOST: 127.0.0.1
          DB_USER: root
          DB_PASSWORD: root
          DB_NAME: eyebot_test

      - name: Run unit tests
        run: npm run test:unit

      - name: Run integration tests
        run: npm run test:integration

      - name: Generate coverage report
        run: npm run test:coverage

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
        with:
          file: ./coverage/coverage-final.json
```

---

## Priorisation des tests

### Phase 1 (Critique - 2 semaines)
1. **DatabaseService** - Tests unitaires
2. **TracerService** - Tests unitaires + intégration
3. **LoggerService** - Tests unitaires
4. **AlbionService** - Tests unitaires avec mocks API

### Phase 2 (Important - 2 semaines)
1. **Commands** - Tests d'intégration pour register, update, verify
2. **MigrationService** - Tests d'intégration
3. **DatabaseLoggingService** - Tests unitaires + intégration

### Phase 3 (Nice-to-have - 1 semaine)
1. **HealthMonitorService** - Tests unitaires
2. **Utilities** - Tests unitaires
3. **E2E** - Scénarios complets utilisateur

### Phase 4 (Performance - 1 semaine)
1. Tests de charge
2. Tests de stress
3. Optimisation based on results

---

## Checklist de mise en place

- [ ] Installer Jest et dépendances
- [ ] Créer jest.config.js
- [ ] Configurer base de données de test
- [ ] Créer structure de dossiers tests/
- [ ] Implémenter tests DatabaseService
- [ ] Implémenter tests TracerService
- [ ] Implémenter tests LoggerService
- [ ] Implémenter tests AlbionService
- [ ] Implémenter tests Commands
- [ ] Configurer CI/CD
- [ ] Atteindre 80% de couverture
- [ ] Documenter tests dans README
- [ ] Créer badge de couverture

---

## Ressources

### Documentation
- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Testing Discord.js Bots](https://discordjs.guide/testing-your-bot.html)
- [MySQL Testing Best Practices](https://dev.mysql.com/doc/dev/mysql-server/latest/PAGE_MYSQL_TEST_RUN.html)

### Outils recommandés
- **Jest Runner** (VS Code extension)
- **Coverage Gutters** (VS Code extension)
- **Wallaby.js** (Live testing)

---

## Maintenance des tests

### Principes
1. **Tests rapides** : Unit tests < 100ms, Integration < 1s
2. **Tests isolés** : Pas de dépendances entre tests
3. **Tests lisibles** : Arrange, Act, Assert pattern
4. **Tests maintenables** : DRY avec helpers/fixtures
5. **Tests significatifs** : Tester behavior, pas implementation

### Révision
- Tests exécutés avant chaque commit (pre-commit hook)
- CI/CD bloque les PR si tests échouent
- Couverture requise pour merge vers main
- Tests mis à jour avec chaque feature

---

**Document créé le:** 2026-03-29
**Dernière mise à jour:** 2026-03-29
**Responsable:** Équipe de développement EyeBOT
