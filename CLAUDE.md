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
      └── i18n.ts          # Typed translation catalog of the feature
```

**Current features:**
- **tracer** - Albion Online character registration and verification
- **settings** - User preferences (`/language`)
- **system** - Discord lifecycle events (guild join/leave, client errors)

### Internationalisation (src/shared/i18n/)

User-facing texts never live in code: they are in `locales/<lang>.json` files, per feature.
Only the language chosen by each user is stored in DB (`user_preferences` table).

- **locales.ts**: `LOCALES` (supported languages + matching Discord locales), `DEFAULT_LOCALE` (`fr`)
- **I18n.ts**: `I18n<T>` class — `for(locale)` returns `t(key, params)`, `default(key)`, `localizations(key)`
- **index.ts**: common catalog (`common.*` keys) and `createFeatureI18n()` helper
- **LocaleService** (`services.locale`): resolves the language — `/language` preference → Discord client
  locale (`interaction.locale`) → `DEFAULT_LOCALE`. Cached in memory, never throws.

Rules:
- Keys are type-checked: `TranslationKey<T>` is derived from the `fr.json` type, so a typo is a compile error
- Each feature declares `const catalogs: Record<Locale, Messages> = { fr, en }`: a missing language
  or a missing key in a JSON file is a compile error
- Placeholders use `{name}`; a JSON array value is joined with `\n` (one line per element)
- Logs stay in French (developer-facing), only user-facing texts are translated

**Adding a language**: add an entry to `LOCALES`, add `<code>.json` in `shared/i18n/locales/` and in
each feature's `locales/`, run `npm run build` (fix reported missing keys) then `npm run register`.

### Embeds and components

- Embeds are built by pure functions in `features/<feature>/embeds/`: `build<Name>Embed(t, data)` → `EmbedBuilder`
  (no DB/API access, no business logic). Inputs use view types (`CharacterView`) built by `embeds/mappers.ts`.
- Select menus follow the same pattern in `components/`.
- Colors come from `shared/embeds/EmbedColors.ts`; helpers (`truncateField`, `discordDate`) from `shared/embeds/EmbedUtils.ts`.
- discord.js `EmbedBuilder` is used to build; `Embed` is the read-only class of received embeds — do not subclass either.

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

1. Create file in `src/features/<feature>/commands/<CommandName>Command.ts`
2. Export default class extending BaseCommand
3. Implement required abstract methods
4. Command auto-loads on bot startup
5. Run `npm run register` to register with Discord

Example structure:
```typescript
export default class MyCommand extends BaseCommand {
    public name = 'mycommand';
    public description = myI18n.default('commands.mycommand.description');

    public buildCommand(): SlashCommandBuilder {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .setDescriptionLocalizations(myI18n.localizations('commands.mycommand.description'));
    }

    public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const t = myI18n.for(await this.resolveLocale(interaction));
        await interaction.reply({ embeds: [buildMyEmbed(t, data)] });
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

## Windows Compatibility Note

The project includes Windows-specific commands (e.g., `npm run clean` uses `rmdir /S /Q`). When adding new file operations in package.json scripts, ensure Windows compatibility or use cross-platform tools.
