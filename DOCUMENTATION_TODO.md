# Plan d'amélioration de la documentation - EyeBOT

Ce document liste toutes les améliorations de documentation à apporter au code du projet EyeBOT.

## Résumé exécutif

**Audit réalisé le:** 2026-03-29

**Fichiers analysés:** 26 fichiers TypeScript
**Fichiers bien documentés:** 3 (12%)
**Fichiers partiellement documentés:** 23 (88%)

**Problèmes identifiés:**
1. ❌ Constructeurs rarement documentés
2. ❌ Méthodes privées sans JSDoc
3. ❌ Tags @param, @returns, @throws manquants
4. ⚠️ Commentaires inline excessifs et redondants
5. ⚠️ Ordre de documentation incohérent

---

## Actions prioritaires

### 🔴 Priorité HAUTE (À faire en premier)

#### 1. Supprimer les commentaires inutiles

**Objectif:** Réduire le bruit visuel de 60-70% dans le code

**Fichiers concernés:**
- `src/core/Bot.ts` - 30+ commentaires redondants
- `src/features/tracer/commands/RegisterCommand.ts` - 40+ commentaires évidents
- `src/features/tracer/commands/UpdateAllCommand.ts` - 25+ commentaires redondants
- `src/features/tracer/commands/VerifyCommand.ts` - 20+ commentaires évidents
- `src/shared/services/HealthMonitorService.ts` - 35+ commentaires inutiles

**Exemples de commentaires à supprimer:**

```typescript
// ❌ AVANT (évident, redondant)
// Créer une instance de la commande
const command: BaseCommand = new CommandClass();

// Ajouter la commande à la collection
this.commands.set(command.name, command);

// ✅ APRÈS (code self-documenting)
const command: BaseCommand = new CommandClass();
this.commands.set(command.name, command);
```

**Règles de suppression:**
1. Supprimer les commentaires qui répètent le nom de la méthode
2. Supprimer les commentaires évidents (ex: `// Logger debug`)
3. Supprimer les commentaires qui décrivent ce que fait le code (le code doit être lisible)
4. Garder uniquement les commentaires qui expliquent **pourquoi**, pas **quoi**

---

#### 2. Documenter les constructeurs

**Fichiers à modifier:**

| Fichier | Ligne | Action |
|---------|-------|--------|
| `src/core/Bot.ts` | 20 | Documenter l'ordre d'initialisation et les dépendances |
| `src/shared/services/ServiceContainer.ts` | 16 | Documenter le pattern singleton et l'ordre de création |
| `src/shared/services/DatabaseService.ts` | 14 | Documenter la configuration du pool MySQL |
| `src/shared/services/LoggerService.ts` | - | Documenter l'initialisation optionnelle de la DB |
| `src/shared/services/HealthMonitorService.ts` | 69 | Documenter les paramètres d'environnement |
| `src/features/tracer/services/TracerService.ts` | 13 | Documenter les dépendances |
| `src/features/tracer/services/AlbionService.ts` | 12 | Documenter les constantes API |

**Template JSDoc pour constructeurs:**

```typescript
/**
 * Crée une nouvelle instance de [ClassName]
 *
 * @remarks
 * [Expliquer l'ordre d'initialisation si important]
 * [Expliquer les dépendances]
 *
 * @example
 * ```typescript
 * const service = new MyService();
 * await service.initialize();
 * ```
 */
constructor() {
  // ...
}
```

---

#### 3. Ajouter JSDoc aux méthodes publiques

**Priorité par fichier:**

##### Bot.ts (CRITIQUE)

```typescript
/**
 * Démarre le bot et initialise tous les composants
 *
 * @remarks
 * Séquence d'initialisation:
 * 1. Connexion à la base de données
 * 2. Chargement des commandes (auto-discovery)
 * 3. Chargement des événements (auto-discovery)
 * 4. Connexion à Discord
 * 5. Démarrage du health monitor
 *
 * @throws {Error} Si la connexion à la base de données échoue
 * @throws {Error} Si le token Discord est invalide
 *
 * @example
 * ```typescript
 * const bot = new Bot();
 * await bot.start();
 * ```
 */
public async start(): Promise<void>

/**
 * Récupère l'ID du personnage Albion principal d'un utilisateur Discord
 *
 * @param discordId - L'ID Discord de l'utilisateur
 * @returns L'ID du personnage Albion (is_main = 1) ou du premier personnage, null si aucun
 *
 * @remarks
 * Priorise les personnages marqués comme "main", sinon retourne le premier par date d'enregistrement
 */
private async getUserMainAlbionId(discordId: string): Promise<string | null>

/**
 * Enregistre le gestionnaire d'interactions Discord pour router les commandes
 *
 * @remarks
 * - Filtre les interactions pour ne traiter que les commandes slash
 * - Log automatiquement toutes les commandes (succès et erreur)
 * - Capture l'albion_character_id de l'utilisateur pour les logs
 * - Gère les erreurs avec réponse utilisateur appropriée
 */
private registerInteractionHandler(): void

/**
 * Charge automatiquement toutes les commandes depuis le dossier features/
 *
 * @remarks
 * Structure attendue: `features/<feature>/commands/<CommandName>Command.ts`
 * Chaque fichier doit exporter une classe default qui étend BaseCommand
 *
 * @throws {Error} Si un fichier de commande a une structure invalide
 */
private async loadCommands(): Promise<void>

/**
 * Arrête proprement le bot et libère toutes les ressources
 *
 * @param reason - La raison de l'arrêt (pour les logs)
 *
 * @remarks
 * Séquence d'arrêt:
 * 1. Arrêt du health monitor
 * 2. Déconnexion Discord
 * 3. Fermeture de la connexion DB
 *
 * Tous les logs d'arrêt sont écrits en base avant la fermeture
 */
public async shutdown(reason: string): Promise<void>
```

---

##### DatabaseService.ts (CRITIQUE)

```typescript
/**
 * Exécute une requête SQL avec paramètres
 *
 * @param sql - La requête SQL avec placeholders (?)
 * @param params - Les paramètres à insérer dans la requête
 * @returns Le résultat brut de la requête
 *
 * @throws {Error} Si la requête échoue (contrainte, syntaxe, timeout)
 *
 * @remarks
 * Utilise le pool de connexions pour gérer automatiquement les connexions
 * Les erreurs SQL sont loggées mais propagées pour que l'appelant puisse les gérer
 *
 * @example
 * ```typescript
 * const result = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
 * ```
 */
public async query<T = any>(sql: string, params?: any[]): Promise<T>

/**
 * Commence une transaction de base de données
 *
 * @returns Une connexion dédiée pour la transaction
 *
 * @remarks
 * IMPORTANT: Toujours appeler commit() ou rollback() pour libérer la connexion
 *
 * @example
 * ```typescript
 * const connection = await db.beginTransaction();
 * try {
 *   await connection.execute('INSERT ...');
 *   await db.commit(connection);
 * } catch (error) {
 *   await db.rollback(connection);
 *   throw error;
 * }
 * ```
 */
public async beginTransaction(): Promise<mysql.PoolConnection>
```

---

##### TracerService.ts (CRITIQUE)

```typescript
/**
 * Enregistre un nouveau personnage Albion pour un utilisateur Discord
 *
 * @param userData - Les données du personnage à enregistrer
 * @param userData.discordId - L'ID Discord de l'utilisateur
 * @param userData.albionId - L'ID du personnage Albion
 * @param userData.albionName - Le pseudo du personnage Albion
 * @param userData.killFame - La kill fame du personnage
 * @param userData.deathFame - La death fame du personnage
 * @param userData.guildName - Le nom de la guilde (optionnel)
 * @param userData.allianceName - Le nom de l'alliance (optionnel)
 * @param userData.isMain - Si c'est le personnage principal (optionnel)
 *
 * @returns L'ID du personnage enregistré
 *
 * @remarks
 * - Si le personnage existe déjà pour cet utilisateur, ses stats sont mises à jour
 * - Si is_main = true, tous les autres personnages de l'utilisateur sont marqués is_main = false
 * - La transaction est automatique (rollback en cas d'erreur)
 *
 * @throws {Error} Si l'insertion/update échoue
 *
 * @example
 * ```typescript
 * await tracerService.registerUser({
 *   discordId: '123456789',
 *   albionId: 'abc123',
 *   albionName: 'PlayerName',
 *   killFame: 1000000,
 *   deathFame: 50000,
 *   isMain: true
 * });
 * ```
 */
public async registerUser(userData: RegisterUserData): Promise<void>

/**
 * Vérifie un personnage comme appartenant exclusivement à un utilisateur
 *
 * @param albionId - L'ID du personnage Albion à vérifier
 * @param discordId - L'ID Discord du propriétaire
 *
 * @returns Le nombre de revendications dupliquées supprimées
 *
 * @remarks
 * **IMPORTANT:** Cette action est destructive
 * - Marque le personnage comme vérifié (is_verified = 1)
 * - Supprime TOUTES les autres revendications de ce personnage par d'autres utilisateurs
 * - Opération atomique via transaction
 *
 * @throws {Error} Si le personnage n'existe pas
 * @throws {Error} Si la transaction échoue
 *
 * @example
 * ```typescript
 * const duplicatesRemoved = await tracerService.verifyCharacter('abc123', '123456789');
 * console.log(`${duplicatesRemoved} doublons supprimés`);
 * ```
 */
public async verifyCharacter(albionId: string, discordId: string): Promise<number>
```

---

##### AlbionService.ts (CRITIQUE)

```typescript
/**
 * Recherche des joueurs Albion par pseudo
 *
 * @param playerName - Le pseudo à rechercher (recherche partielle supportée par l'API)
 * @returns Un tableau de joueurs correspondant à la recherche
 *
 * @throws {Error} Si l'API timeout (>10s)
 * @throws {Error} Si rate limit atteint (429)
 * @throws {Error} Si erreur API (5xx)
 *
 * @remarks
 * L'API Albion supporte la recherche partielle (ex: "player" trouve "player123", "myplayer", etc.)
 * Le timeout est fixé à 10 secondes
 *
 * @example
 * ```typescript
 * const players = await albionService.searchPlayer('PlayerName');
 * if (players.length > 0) {
 *   console.log(`Trouvé: ${players[0].Name}`);
 * }
 * ```
 */
public async searchPlayer(playerName: string): Promise<AlbionPlayer[]>

/**
 * Effectue une requête fetch avec timeout automatique
 *
 * @param url - L'URL à fetch
 * @param timeoutMs - Le timeout en millisecondes (défaut: 10000)
 * @returns La réponse HTTP
 *
 * @throws {Error} Si le timeout est atteint ('Request timeout')
 * @throws {Error} Si erreur réseau
 *
 * @remarks
 * Utilise AbortController pour annuler la requête après le timeout
 * Le timeout est nettoyé automatiquement après succès/échec
 */
private async fetchWithTimeout(url: string, timeoutMs?: number): Promise<Response>
```

---

### 🟡 Priorité MOYENNE (À faire ensuite)

#### 1. Documenter les méthodes privées complexes

**Fichiers concernés:**
- `src/shared/services/HealthMonitorService.ts` - Toutes les méthodes privées
- `src/features/tracer/commands/RegisterCommand.ts` - Méthodes privées
- `src/features/tracer/commands/UpdateCommand.ts` - Méthodes privées
- `src/features/tracer/commands/UpdateAllCommand.ts` - Méthodes privées

**Critères "méthode complexe":**
- Plus de 20 lignes
- Logique métier non triviale
- Manipulation de données
- Interactions avec API externes

---

#### 2. Ajouter des exemples @example

**Méthodes nécessitant des exemples:**
- Toutes les méthodes de `DatabaseService`
- Toutes les méthodes de `TracerService`
- `AlbionService.formatFame()`
- `GuildUtils.buildGuildTag()`
- Toutes les méthodes de `EmbedBuilders`

---

#### 3. Ajouter les tags @throws

**Méthodes nécessitant @throws:**
- Toutes les méthodes qui font des requêtes DB
- Toutes les méthodes qui font des requêtes HTTP
- `Bot.start()`, `Bot.shutdown()`
- `MigrationService.runMigrations()`, `rollbackLastMigration()`

---

### 🟢 Priorité BASSE (Nice to have)

#### 1. Ajouter @deprecated si applicable

Identifier les méthodes obsolètes ou à remplacer et les marquer.

#### 2. Ajouter @see pour liens entre méthodes

Exemple:
```typescript
/**
 * @see {@link verifyCharacter} pour la vérification d'un personnage
 */
public async registerUser(...)
```

#### 3. Standardiser le format des JSDoc

Choisir un format cohérent:
- Ordre des tags: @param, @returns, @throws, @remarks, @example
- Capitalisation des descriptions
- Point final ou non dans les descriptions

---

## Template JSDoc standard

Voici le template à utiliser pour documenter une méthode:

```typescript
/**
 * Description courte en une ligne (impératif: "Enregistre", "Récupère", etc.)
 *
 * Description longue optionnelle si nécessaire
 * Peut s'étendre sur plusieurs lignes
 *
 * @param paramName - Description du paramètre
 * @param optionalParam - Description (optionnel)
 * @returns Description du retour
 *
 * @throws {ErrorType} Description de quand l'erreur est lancée
 *
 * @remarks
 * Informations complémentaires importantes
 * - Points clés
 * - Comportements spéciaux
 * - Side effects
 *
 * @example
 * ```typescript
 * const result = await method(param1, param2);
 * console.log(result);
 * ```
 *
 * @see {@link OtherMethod} pour une méthode liée
 */
public async method(paramName: string, optionalParam?: number): Promise<ReturnType>
```

---

## Checklist par fichier

### src/core/

- [ ] **Bot.ts**
  - [ ] Supprimer 30+ commentaires redondants
  - [ ] Documenter constructor
  - [ ] Documenter start()
  - [ ] Documenter getUserMainAlbionId()
  - [ ] Documenter registerInteractionHandler()
  - [ ] Documenter loadCommands()
  - [ ] Documenter loadEvents()
  - [ ] Documenter shutdown()

- [x] **BaseCommand.ts** - Bien documenté ✅
- [x] **BaseEvent.ts** - Bien documenté ✅

---

### src/shared/services/

- [ ] **ServiceContainer.ts**
  - [ ] Supprimer commentaire ligne 20
  - [ ] Documenter constructor avec ordre d'init
  - [ ] Ajouter @returns sur getInstance()

- [ ] **DatabaseService.ts**
  - [ ] Supprimer commentaires évidents
  - [ ] Documenter constructor (pool config)
  - [ ] Ajouter @param, @returns, @throws sur toutes les méthodes
  - [ ] Ajouter @example sur query(), select(), insert()
  - [ ] Documenter transaction lifecycle

- [ ] **LoggerService.ts**
  - [ ] Supprimer commentaires inline
  - [ ] Documenter setDatabaseService()
  - [ ] Améliorer JSDoc des méthodes publiques
  - [ ] Ajouter @example
  - [ ] Documenter méthodes privées

- [ ] **HealthMonitorService.ts**
  - [ ] Supprimer 35+ commentaires évidents
  - [ ] Documenter constructor (env vars)
  - [ ] Documenter toutes les méthodes privées
  - [ ] Ajouter @returns sur getters

- [ ] **DatabaseLoggingService.ts**
  - [ ] Supprimer commentaires répétitifs
  - [ ] Documenter constructor
  - [ ] Ajouter @param et @returns sur toutes les méthodes
  - [ ] Documenter cleanOldLogs() (stratégie archivage)

---

### src/database/

- [x] **Migration.ts** - Bien documenté ✅

- [ ] **MigrationService.ts**
  - [ ] Supprimer commentaires debug
  - [ ] Documenter constructor
  - [ ] Documenter méthodes privées
  - [ ] Ajouter @param, @returns, @throws sur méthodes publiques
  - [ ] Ajouter @example sur runMigrations()

---

### src/features/tracer/services/

- [ ] **TracerService.ts**
  - [ ] Supprimer commentaires évidents (20+)
  - [ ] Documenter constructor
  - [ ] Ajouter JSDoc complet sur TOUTES les méthodes publiques
  - [ ] Ajouter @param, @returns, @throws
  - [ ] Ajouter @example sur registerUser(), verifyCharacter()
  - [ ] Ajouter @remarks sur verifyCharacter() (action destructive)

- [ ] **AlbionService.ts**
  - [ ] Supprimer commentaires redondants
  - [ ] Documenter constructor (API config)
  - [ ] Documenter fetchWithTimeout()
  - [ ] Ajouter @throws détaillés sur searchPlayer(), getPlayerDetailsById()
  - [ ] Ajouter @example sur formatFame()

---

### src/features/tracer/commands/

- [ ] **RegisterCommand.ts**
  - [ ] Supprimer 40+ commentaires évidents
  - [ ] Documenter constructor
  - [ ] Documenter toutes les méthodes privées
  - [ ] Simplifier la méthode execute() (trop longue)

- [ ] **UpdateCommand.ts**
  - [ ] Supprimer commentaires redondants
  - [ ] Documenter constructor
  - [ ] Documenter showCharacterSelection()
  - [ ] Documenter updateCharacter()

- [ ] **UpdateAllCommand.ts**
  - [ ] Supprimer 25+ commentaires évidents
  - [ ] Documenter constructor (config batch)
  - [ ] Documenter toutes les méthodes privées
  - [ ] Ajouter @param, @returns

- [ ] **VerifyCommand.ts**
  - [ ] Supprimer commentaires évidents
  - [ ] Documenter constructor
  - [ ] Ajouter commentaire sur OWNER_ID hardcodé
  - [ ] Refactoriser execute() en sous-méthodes documentées

---

### src/features/tracer/utils/

- [ ] **DiscordUtils.ts**
  - [ ] Ajouter @param, @returns, @throws

- [ ] **ErrorHandlers.ts**
  - [ ] Ajouter @param, @returns

- [x] **EmbedBuilders.ts** - Bien documenté ✅

- [ ] **GuildUtils.ts**
  - [ ] Ajouter @param, @returns
  - [ ] Ajouter @example montrant la transformation

---

## Estimation du travail

### Par priorité:

| Priorité | Fichiers | Tâches | Temps estimé |
|----------|----------|--------|--------------|
| 🔴 HAUTE | 8 | Supprimer commentaires + JSDoc public | 8-12 heures |
| 🟡 MOYENNE | 12 | JSDoc privées + @example | 6-8 heures |
| 🟢 BASSE | 6 | @deprecated, @see, standardisation | 2-4 heures |
| **TOTAL** | **26** | **~350 méthodes** | **16-24 heures** |

### Planning recommandé:

**Semaine 1:**
- Jour 1-2: Supprimer tous les commentaires inutiles
- Jour 3-4: Documenter constructeurs et méthodes publiques critiques
- Jour 5: Documenter Bot.ts, DatabaseService.ts

**Semaine 2:**
- Jour 1-2: Documenter TracerService.ts, AlbionService.ts
- Jour 3-4: Documenter les Commands
- Jour 5: Relecture et standardisation

---

## Validation

### Critères de validation:

- [ ] Tous les constructeurs sont documentés
- [ ] Toutes les méthodes publiques ont JSDoc complet
- [ ] Tags @param présents pour tous les paramètres
- [ ] Tags @returns présents pour tous les retours non-void
- [ ] Tags @throws présents pour les méthodes qui peuvent errorer
- [ ] Au moins 1 @example par service principal
- [ ] Moins de 50 commentaires inline dans tout le projet
- [ ] Tous les TODO/FIXME commentaires sont trackés ou résolus

### Outils de validation:

```bash
# Installer ESLint plugin pour JSDoc
npm install --save-dev eslint-plugin-jsdoc

# Vérifier la documentation
npm run lint:jsdoc
```

**Configuration ESLint (.eslintrc.js):**
```javascript
module.exports = {
  plugins: ['jsdoc'],
  rules: {
    'jsdoc/require-jsdoc': ['error', {
      publicOnly: true,
      require: {
        FunctionDeclaration: true,
        MethodDefinition: true,
        ClassDeclaration: true,
      },
    }],
    'jsdoc/require-param': 'error',
    'jsdoc/require-returns': 'error',
    'jsdoc/require-param-type': 'off', // TypeScript provides types
    'jsdoc/require-returns-type': 'off', // TypeScript provides types
  },
};
```

---

## Références

### Documentation standards:
- [TypeScript JSDoc Reference](https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html)
- [JSDoc Official Documentation](https://jsdoc.app/)
- [TSDoc Standard](https://tsdoc.org/)

### Bonnes pratiques:
- [Google JavaScript Style Guide](https://google.github.io/styleguide/jsguide.html#jsdoc)
- [Clean Code Comments](https://github.com/ryanmcdermott/clean-code-javascript#comments)

---

**Document créé le:** 2026-03-29
**Dernière mise à jour:** 2026-03-29
**Responsable:** Équipe de développement EyeBOT
