# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

EyeBOT is a Discord bot built with TypeScript and discord.js v14 for the Albion Online community. It enables Discord users to register and verify their Albion Online characters, with automatic nickname updates and character tracking.

## Development Commands

### Build and Run
```bash
npm run build          # Compile TypeScript to dist/
npm run dev            # Run bot directly with ts-node (development) — type "exit" to stop cleanly
npm start              # Run compiled bot from dist/
npm run watch          # Watch mode - recompile on changes
npm run clean          # Clean dist/ directory (Windows-specific)
```

### Discord Commands
```bash
npm run register       # Register slash commands with Discord API
```

### Code generators (dev only, see "Code generators" below)
```bash
npm run create                  # Interactive: choose feature / embed / component / command
npm run create:feature          # Same, one generator (also create:embed, create:component, create:command)
npm run -s create -- --spec -   # Non-interactive: JSON spec (object or array) on stdin — preferred for AI
npm run -s create -- --help embed   # Spec format of a generator (--example: full example spec)
npm run typecheck:tools         # Type check tools/ (also run by CI)
```

### Tests
```bash
npm test                   # Run all tests
npm run test:coverage      # Run tests with LCOV coverage report (used by SonarCloud)
```

### Database Migrations
```bash
npm run migrate                # Run all pending migrations
npm run migrate:rollback       # Rollback last migration
npm run migrate:list           # List all executed migrations
```

## Architecture

### Core Framework (src/core/)

The bot uses a plugin-based architecture with automatic command/event discovery:

- **Bot.ts**: Main orchestrator that initializes the Discord client and loads features
  - Auto-discovers commands from `src/features/*/commands/*.ts`
  - Auto-discovers events from `src/features/*/events/*.ts`
  - Handles interaction routing to appropriate command handlers

- **ConsoleCommands.ts**: Terminal commands while the bot runs (`exit`/`stop`/`quit`, `help`), only when
  stdin is a TTY. Shutdown goes through `gracefulShutdown()` in index.ts, which uses
  `shared/utils/exitGracefully.ts` (no immediate `process.exit()`: it crashes Node on Windows
  while sockets are closing)

- **BaseCommand.ts**: Abstract class for slash commands
  - All commands must extend this and implement `name`, `description`, `buildCommand()`, and `execute()`

- **BaseEvent.ts**: Abstract class for Discord events
  - All events must extend this and implement `name`, `once`, and `execute()`

### Feature Organization (src/features/)

Each feature is self-contained in its own directory with the structure:
```
features/
  └── tracer/              # Feature name
      ├── commands/        # Slash commands for this feature
      ├── components/      # Select menus / buttons builders (translated)
      ├── embeds/          # Embed builders (translated), one file per command
      ├── events/          # Discord event handlers (optional)
      ├── handlers/        # Interaction flows shared by several commands (NOT in commands/:
      │                    #   Bot.ts loads every file there as a slash command)
      ├── locales/         # fr.json (reference) + one JSON per supported language
      ├── models/          # TypeScript interfaces/types
      ├── services/        # Business logic
      ├── utils/           # Feature-specific utilities
      └── translations.ts  # Typed translation catalog of the feature (e.g. `tracerTranslations`)
```

**Current features:**
- **tracer** - Albion Online character registration and verification
- **settings** - User preferences (`/language`)
- **system** - Discord lifecycle events (guild join/leave, client errors)

### Internationalisation (src/shared/i18n/)

User-facing texts never live in code: they are in `locales/<lang>.json` files, per feature.
Only the language chosen by each user is stored in DB (`user_preferences` table).

- **locales.ts**: `LOCALES` (supported languages + matching Discord locales), `DEFAULT_LOCALE` (`fr`)
- **TranslationCatalog.ts**: `TranslationCatalog<T>` class
  - `forLocale(locale)` → returns a `translate(key, params)` function bound to that language
  - `defaultText(key)` → text in the default language (slash command descriptions)
  - `discordLocalizations(key)` → `{ 'en-US': …, 'en-GB': … }` for `setDescriptionLocalizations()`
- **index.ts**: common catalog (`commonTranslations`, `common.*` keys) and `createFeatureTranslations()` helper
- **LocaleService** (`services.locale`): resolves the language — `/language` preference → Discord client
  locale (`interaction.locale`) → `DEFAULT_LOCALE`. Cached in memory, never throws.

Rules:
- Keys are type-checked: `TranslationKey<T>` is derived from the `fr.json` type, so a typo is a compile error
- Each feature declares `const catalogs: Record<Locale, Messages> = { fr, en }`: a missing language
  or a missing key in a JSON file is a compile error
- Placeholders use `{name}`; a JSON array value is joined with `\n` (one line per element)
- Logs stay in French (developer-facing), only user-facing texts are translated
- **Naming**: the translation function is always called `translate` (never `t`); when two languages are
  involved in the same function, name them by recipient (`translateForClicker`, `translateForTarget`)

**Adding a language**: add an entry to `LOCALES`, add `<code>.json` in `shared/i18n/locales/` and in
each feature's `locales/`, run `npm run build` (fix reported missing keys) then `npm run register`.

### Embeds and components

- Embeds are built by pure functions in `features/<feature>/embeds/`: `build<Name>Embed(translate, data)` → `EmbedBuilder`
  (no DB/API access, no business logic). Inputs use view types (`CharacterView`) built by `embeds/mappers.ts`.
- Select menus follow the same pattern in `components/`.
- Colors come from `shared/embeds/EmbedColors.ts`; helpers (`truncateField`, `discordDate`) from `shared/embeds/EmbedUtils.ts`.
- discord.js `EmbedBuilder` is used to build; `Embed` is the read-only class of received embeds — do not subclass either.
- New embeds / components are scaffolded with the generators (see "Code generators").

### Code generators (tools/generators/) — use them instead of writing boilerplate

**For Claude / any AI agent: to create a feature, an embed, a component (buttons / select menu) or a slash
command, ALWAYS use the generator with a JSON spec instead of writing the files by hand.** One call writes the
builder, the texts in every `locales/*.json` (emojis escaped, same shape in every language), the exports, the
types, the `<Feature>Translator` type and a Jest test — then only the business logic remains to be written by hand
(dynamic parts, commands' `execute()`).

```bash
npm run -s create -- --help component           # spec format (read it instead of the generator sources)
npm run -s create -- --spec - --dry-run <<'JSON' # validate + list files, writes nothing
[{ "type": "feature", "name": "encyclopedia" },
 { "type": "embed", "feature": "encyclopedia", "file": "Item", "name": "ItemDetails", "summary": "…", "title": "{name}" }]
JSON
npm run -s create -- --spec - <<'JSON'           # same spec, writes the files (add --json for a JSON result)
…
JSON
npm test                                         # records the new snapshots (CI never writes snapshots)
```

- Spec = one object (`type`: feature | embed | component | command) or an array (batch, processed in order: a feature
  created in `[0]` is visible to `[1]`). All errors are returned at once with their path (`[1].title.en : …`),
  exit code 1, nothing written. Unknown properties are errors (typos).
- Texts: `"fr text"`, `["line 1", "line 2"]` or `{ "fr": …, "en": …, "es": … }`. Missing languages get the French
  text and are listed as "to translate" (texts without letters such as `"{price}"` are not). `{placeholder}` →
  typed property of `data` (`"placeholders": { "count": "number" }`, default string).
- Every result is built with the real discord.js builders in every language before writing (Discord limits).
- A feature that does not exist is created with its full architecture; `.gitkeep` files are removed as soon as a
  folder receives a real file.
- Outputs: **feature** → `commands/ components/ embeds/ events/ handlers/ models/ services/ utils/` (.gitkeep),
  `locales/*.json` (`{}`), `translations.ts`. **embed** → `embeds/<File>Embeds.ts`, `embeds/types.ts` (`<Name>EmbedData`),
  `embeds/index.ts`, new `EmbedColors` entry. **component** → `components/<File>.ts` (default `SelectMenus` / `Buttons`)
  with exported custom IDs (`<NAME>_SELECT_ID`, `<NAME>_BUTTON_IDS`) to filter collectors; select options fixed or
  `"options": "dynamic"` (`data.options`, 25 max). **command** → `commands/<Name>Command.ts` (texts under
  `commands.<name>.*` + Discord localizations, required options first, `permission`, `guildOnly`, `ephemeral`,
  default `<name>.reply`). Each one also gets its test in `tests/features/<feature>/…`.

Internals (`tools/`, versioned but **never deployed**):
- `tsc` only compiles `src/` (`rootDir`); `release.yml` runs `git sparse-checkout set --no-cone '/*' '!/tools/' '!/tests/tools/'`
  on the server, so git never writes them there. Never import `tools/` from `src/`. Tests live in `tests/tools/`.
- Node built-ins + devDependencies only (no lock file regeneration). `tools/tsconfig.json` extends the root config;
  scripts run `ts-node -T` (fast), types are checked by `npm run typecheck:tools` (CI).
- `tools/generators/index.ts` (CLI: interactive or `--spec`), one folder per generator implementing
  `shared/generator.ts` (`interactive`, `fromInput`, `preview`, `plan`), and `shared/`: `FileChangeSet` (planned
  writes, keeps each file's CRLF/LF, `.gitkeep` cleanup), `text` (translated texts, locale writes), `input` (JSON
  spec reader), `Prompter` (terminal questions, works with piped stdin), `localeJson`, `sourceEdit`.

### Service Layer (src/shared/services/)

- **ServiceContainer.ts**: Singleton container for shared services
  - Access via `ServiceContainer.getInstance()`
  - Provides: `database` (DatabaseService), `logger` (LoggerService), `dbLogger` (DatabaseLoggingService),
    `locale` (LocaleService)
  - Features must use these shared instances (never `new DatabaseService()`: each one opens its own MySQL pool)

- **DatabaseService.ts**: MySQL connection pool wrapper
  - Methods: `query()`, `select()`, `selectOne()`, `insert()`, `execute()`
  - Transaction support: `beginTransaction()`, `commit()`, `rollback()`
  - Auto-reconnection and connection pooling (max 10 connections)

- **LoggerService.ts**: Centralized logging with color-coded output

#### Logging conventions
- **No emojis in log messages** (emojis are only for user-facing Discord texts in `locales/*.json`)
- **Emojis are written as escape sequences, never raw**: `❌` / `🔒` (surrogate pair) in JSON,
  `'\u{1F512}'` in TypeScript; keep the `️` variation selector (e.g. `⚠️`). Discord
  `:shortcodes:` are not converted in bot messages. `tests/architecture.test.ts` fails on a raw emoji in `src/`.
  Snapshot files (`.snap`) are generated by Jest and keep the rendered characters.
- **Log an error once, where it is handled** — never "log then rethrow". Services
  (TracerService, AlbionService, DatabaseService, MigrationService) throw without logging; the
  command / handler / script that catches the error logs it. `DatabaseService.query()` attaches the
  failing SQL to the error (`error.sql`), printed by `logger.error()`.
- **Each event is logged by the component that performs it** (e.g. `HealthMonitorService.stop()`
  logs "Health Monitor arrêté"): callers must not log the same step again.

- **HealthMonitorService.ts**: System and bot health monitoring
  - Tracks CPU usage, memory usage, process uptime
  - Monitors Discord metrics (guilds, users, websocket ping)
  - Sends periodic heartbeats to prevent host shutdown (e.g., O2Switch)
  - Maintains metrics history (last 10 minutes by default)
  - Configurable intervals via environment variables
  - Automatically started when bot connects to Discord

### Database Migrations (src/database/)

Migrations use a custom system (not an ORM):

- **Migration.ts**: Interface defining `up()` and `down()` methods
- **MigrationService.ts**: Tracks executed migrations in `migrations` table
- **migrations/index.ts**: Exports ordered array of all migrations
- Each migration file exports a `Migration` object with:
  - `name`: Unique identifier (format: `YYYYMMDD_HHMMSS_description`)
  - `up(connection)`: Apply changes using raw SQL
  - `down(connection)`: Revert changes

Migrations run in transactions and are automatically tracked.

### Commands Registration

Slash commands must be registered with Discord before use:
1. Commands are auto-loaded by Bot.ts from each feature's `commands/` folder
2. Run `npm run register` to push command definitions to Discord API
3. The script (src/scripts/register-commands.ts) reads all commands and calls `buildCommand()` on each

## Environment Variables

Required `.env` configuration:
```
# Discord Configuration
DISCORD_TOKEN=<bot-token>
CLIENT_ID=<discord-application-id>

# Database Configuration
DB_HOST=<mysql-host>
DB_USER=<mysql-user>
DB_PASSWORD=<mysql-password>
DB_NAME=<database-name>
DB_PORT=<mysql-port>  # Optional, defaults to 3306

# Health Monitoring (Optional)
HEALTH_MONITOR_INTERVAL_MS=10000      # Metrics collection interval (default: 10 seconds)
HEARTBEAT_INTERVAL_MS=60000           # Heartbeat send interval (default: 60 seconds)
HEARTBEAT_URL=<url-to-send-heartbeat> # Optional: URL to POST heartbeat data
MAX_MEMORY_MB=1024                    # Max memory limit in MB (default: 1024, must match ecosystem.config.js)
```

## Key Patterns

### Creating a New Command

Prefer `npm run -s create -- --spec -` with a `"type": "command"` spec (see "Code generators"); by hand:

1. Create file in `src/features/<feature>/commands/<CommandName>Command.ts`
2. Export default class extending BaseCommand
3. Implement required abstract methods
4. Command auto-loads on bot startup
5. Run `npm run register` to register with Discord

Example structure:
```typescript
export default class MyCommand extends BaseCommand {
    public name = 'mycommand';
    public description = myTranslations.defaultText('commands.mycommand.description');

    public buildCommand(): SlashCommandBuilder {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .setDescriptionLocalizations(myTranslations.discordLocalizations('commands.mycommand.description'));
    }

    public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const translate = myTranslations.forLocale(await this.resolveLocale(interaction));
        await interaction.reply({ embeds: [buildMyEmbed(translate, data)] });
    }
}
```

### Creating a New Event

1. Create file in `src/features/<feature>/events/<EventName>Event.ts`
2. Export default class extending BaseEvent
3. Set `name` to Discord.js event name (e.g., "ready", "guildMemberAdd")
4. Set `once: true` for one-time events, `false` for recurring
5. Event auto-loads on bot startup

### Database Operations

Always use DatabaseService methods (never raw mysql2):
```typescript
const services = ServiceContainer.getInstance();
const result = await services.database.selectOne<User>(
    'SELECT * FROM users WHERE id = ?',
    [userId]
);
```

For transactions, use connection-based methods from MigrationService pattern.

## Project-Specific Details

### Tracer Feature

Manages Albion Online character verification:
- Users can register multiple characters via `/register <pseudo>`
- Registrations are global (not per Discord server). `/register` on a character already linked to the
  user runs the `/update` flow instead (refresh stats + rename on the current server), via
  `handlers/CharacterUpdateHandler`. The API → DB → nickname sequence lives in
  `services/CharacterSyncService` (shared by /register, /update and /updateall).
- Characters can be "claimed" by multiple users but only one can be "verified"
- Verification requires in-game mail to "DBcide" with Discord ID
- Verified characters are locked to that Discord account
- Auto-updates Discord nicknames to match Albion character names

### AlbionService

Interacts with Albion Online public API:
- Character search: `searchPlayer(name)` returns matching players
- Player details: `getPlayerDetails(id)` returns full stats
- Fame formatting utilities for display

### Health Monitoring

The bot includes automatic health monitoring to:
- Prevent shutdown by hosting providers (e.g., O2Switch) that terminate idle processes
- Track system performance (CPU, memory, heap usage)
- Monitor Discord connection health (ping, guild count, user count)
- Send periodic heartbeats to external monitoring services

**Key features:**
- Logs metrics every 10 seconds (configurable)
- Warns when CPU > 80% or Memory > 80%
- Maintains 10-minute rolling history of metrics
- Optional HTTP heartbeat endpoint for external monitoring
- Automatically started when bot connects to Discord

**Accessing metrics programmatically:**
```typescript
const bot = new Bot();
// After bot starts, access via bot's healthMonitor property
const currentMetrics = bot['healthMonitor'].getCurrentMetrics();
const avgMetrics = bot['healthMonitor'].getAverageMetrics();
```

## Testing

### Framework

Tests use **Jest** with `ts-jest` for TypeScript support.

- Config: `jest.config.js` — preset `ts-jest`, environment `node`, roots in `tests/`
- Path alias `@/` maps to `src/` in tests
- Coverage reports: `lcov` (for SonarCloud), `text`, `text-summary`

### Structure

Tests mirror the `src/` directory layout:

```
tests/
├── features/
│   └── tracer/
│       ├── commands/        # RegisterCommand, UpdateAllCommand, UpdateCommand, VerifyCommand
│       ├── embeds/          # RegisterEmbeds, UpdateEmbeds, VerifyEmbeds (snapshots)
│       ├── handlers/        # CharacterUpdateHandler
│       ├── services/        # AlbionService, CharacterSyncService, TracerService
│       └── utils/           # DiscordUtils, ErrorHandlers, GuildUtils
├── shared/
│   ├── embeds/              # EmbedUtils
│   ├── i18n/                # TranslationCatalog, locales, common catalog
│   └── services/            # DatabaseService, DatabaseLoggingService, LocaleService, LoggerService
├── tools/generators/        # Dev CLIs (not deployed): feature / embed / component / command, wizards + JSON specs
└── setup.ts                 # Global setup: no DB lookup for the user language (defaults to fr)
```

### Conventions

- Test descriptions use `[positif]` for happy paths and `[extrême]` for edge cases/errors.
- External dependencies (Discord.js, mysql2, Albion API) are always mocked at the module level.
- `embeds/RegisterEmbeds.test.ts` uses **Jest snapshot testing** — run `jest --updateSnapshot` to update snapshots intentionally.
  The French snapshots must stay identical when refactoring: a diff there means a user-facing text changed.
- Commands and services accept their dependencies as optional constructor parameters (DI for tests);
  without parameters they use the shared `ServiceContainer` instances.
- Messages asserted in tests are the French texts (`interaction.locale` is unset in mocks → default `fr`).
- Mocked collectors must await async handlers and expose `stop()`; the `end` event receives a reason
  (`'time'` triggers the timeout message, `'selected'` does not).
- Error paths are tested, not just happy paths: a failing Discord reply (expired interaction,
  missing permissions) must be logged once and never become an unhandled rejection.
- To test the real `LocaleService` (mocked globally by `setup.ts`), call `jest.restoreAllMocks()` in `beforeEach`.
- Coverage target: keep lines ≥ 99 % and branches ≥ 90 % (current: 99.4 % / 90.1 %).

### Coverage Exclusions

The following are excluded from coverage (thin wrappers or tightly coupled to Discord runtime):

- `src/index.ts`, `src/scripts/**`
- `src/core/Bot.ts`, `src/core/BaseCommand.ts`, `src/core/BaseEvent.ts`
- `src/shared/services/HealthMonitorService.ts`, `src/shared/services/ServiceContainer.ts`
- `src/database/migrations/**`, `src/database/MigrationService.ts`

## Windows Compatibility Note

The project includes Windows-specific commands (e.g., `npm run clean` uses `rmdir /S /Q`). When adding new file operations in package.json scripts, ensure Windows compatibility or use cross-platform tools.

### Cross-platform `package-lock.json`

`package-lock.json` is generated on the **Linux production server** (not on the Windows dev machine) to ensure it includes Linux-specific optional dependencies (e.g. `@emnapi/*`). This allows `npm ci --ignore-scripts` to work identically on the CI runner and the prod server.

**When adding new dependencies:** run `npm install` locally to update `package.json`, push the change, then SSH into the prod server and run `npm install --ignore-scripts` on the `fix/linux-lockfile` branch to regenerate the lock file for Linux before merging.

## CI/CD Pipeline

### Workflows (.github/workflows/)

- **ci.yml** — Triggered on every push/PR to `main` and `develop`. Runs on GitHub-hosted `ubuntu-latest`. Steps: `npm install` + `npm run build` + `npm run typecheck:tools` + `npm run test:coverage` + SonarCloud scan. Must pass before merging. Uses `npm install` instead of `npm ci` due to cross-platform lock file incompatibilities (Windows dev machine → Linux CI). Uses `fetch-depth: 0` on checkout so SonarCloud has full git history for SCM blame.
- **release.yml** — Triggered manually via `workflow_dispatch`. Runs on the **self-hosted runner** (OVH VPS). Steps: create git tag → create GitHub Release → `git sparse-checkout` (excludes `tools/`, `tests/tools/`) → `git fetch + git reset --hard origin/main` → `npm ci --ignore-scripts` → `npm run build` → `npm prune --omit=dev` → `pm2 restart eyebot`.

### Security: pin GitHub Actions to full commit SHA
Never use mutable tags (`@v4`, `@v2`) for GitHub Actions dependencies — the tag can be moved to malicious code. Always pin to the full commit SHA with the version as a comment:
```yaml
uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5  # v4
```

### Versioning workflow (no CLI required)
1. Update `version` in `package.json` in a PR and merge to `main`
2. Go to GitHub → Actions → Release & Deploy → Run workflow → enter version (e.g. `1.1.0`)
3. The workflow creates the git tag, GitHub Release, and deploys to prod automatically

Version format: `MAJOR.MINOR.PATCH` — left = most impactful change.

### Branch protection on `main`
- All changes to `main` must go through a PR
- `Build & Type Check` CI status check must pass
- Force pushes blocked
- The CI workflow (`ci.yml`) runs on `ubuntu-latest` (GitHub-hosted), NOT on the self-hosted runner — this avoids supply chain risks from fork PRs on a public repo

### Required GitHub secrets
- `PAT_TOKEN` — Personal Access Token with `repo` scope, used by the release workflow to push git tags to the protected `main` branch

## Production Server (OVH VPS)

- **OS**: Debian 12 (Trixie)
- **Location**: `~/eyebot/`
- **Process manager**: PM2 (`pm2 restart eyebot`, `pm2 logs eyebot`)
- **SSH port**: 52855 (non-default, configured per OVH security guide)
- **Database**: MariaDB, user `eyebot`, database `eyebot`
- **GitHub Actions runner**: self-hosted, installed at `~/actions-runner/`, running as systemd service
- **Node.js**: v22 via nvm (`~/.nvm`)
- **Migrations**: run manually — no automated migration in CI/CD until a database backup system is in place

## Code Quality Rules (SonarCloud)

This project uses SonarCloud (free tier, public repo) for automatic analysis on every push/PR to `main`.

### Patterns to follow

**Always mark class members as `readonly` if never reassigned:**
```typescript
private readonly logger: LoggerService;
private readonly services: ServiceContainer;
```

**Use optional chaining instead of double null checks:**
```typescript
// Wrong
if (!error || !error.message) { ... }
// Correct
if (!error?.message) { ... }
```

**Avoid negated conditions with else — put positive case first:**
```typescript
// Wrong
if (!response.ok) { warn(...) } else { debug(...) }
// Correct
if (response.ok) { debug(...) } else { warn(...) }
```

**Always handle caught exceptions — include the error in the log:**
```typescript
// Wrong
} catch (dmError) {
    this.logger.warn('Could not send DM');
}
// Correct
} catch (dmError) {
    const errorMessage = dmError instanceof Error ? dmError.message : String(dmError);
    this.logger.warn(`Could not send DM: ${errorMessage}`);
}
```

**Never use the `@/` path alias in `src/`** — it only exists for Jest (`tsconfig` "paths" are not rewritten by `tsc`).
In `src/`, always use relative imports: an `@/` import compiles but crashes at runtime with
`Cannot find module '@/...'` and Bot.ts silently skips the command. IDEs (WebStorm "optimize imports") may
add it automatically. `tests/architecture.test.ts` fails the build if it happens.

**Keep function nesting ≤ 4 levels deep** — extract callbacks into named functions.

**Keep cognitive complexity ≤ 15 per function** — extract complex conditions and loops into smaller functions.

**Never add redundant type assertions** on discord.js builder chains — TypeScript already infers the correct type:
```typescript
// Wrong
return new SlashCommandBuilder().setName(this.name).setDescription(this.description) as SlashCommandBuilder;
// Correct
return new SlashCommandBuilder().setName(this.name).setDescription(this.description);
```

Note: all logger methods take `(message: string, category?: string, context?: any)` — e.g.
`logger.warn('Could not send DM', 'tracer')`, `logger.error('Update failed', 'tracer', error)`.
In tests, assert the category too: `expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('…'), 'tracer')`.

**Redundant cast exception:** a builder that adds options (`addStringOption`…) returns
`SlashCommandOptionsOnlyBuilder`, so `as SlashCommandBuilder` is still required there to match `BaseCommand.buildCommand()`.
