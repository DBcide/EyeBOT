# <img src="https://cdn.discordapp.com/avatars/1347319983256113223/ccf976b2b1943655b9360e021bd76eb1.webp?size=240" alt="EyeBOT Avatar" width="40" style="vertical-align:sub;"> EyeBOT — Discord Bot for Albion Online

**EyeBOT** is a Discord bot built with TypeScript and discord.js v14, designed to integrate Albion Online player data with Discord servers. It provides character registration, verification, automatic nickname synchronization, multi-language replies and health monitoring for production deployments.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Available Commands](#available-commands)
- [NPM Scripts](#npm-scripts)
- [Translations](#translations)
- [Contributing a New Language (e.g. Spanish)](#contributing-a-new-language-eg-spanish)
- [Testing](#testing)
- [Logging](#logging)
- [Health Monitoring & Heartbeat](#health-monitoring--heartbeat)
- [Project Structure](#project-structure)
- [Database Schema](#database-schema)
- [Development](#development)
- [Production Deployment](#production-deployment)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Features

- **Character Registration**: Link Discord accounts to Albion Online characters
- **Character Verification**: Secure verification system via in-game mail
- **Automatic Nickname Sync**: Discord nicknames update to `[GUILD] CharacterName`
- **Multi-Character Support**: Users can register multiple Albion characters
- **Multi-Server**: Registrations are global — running `/register` again on another server refreshes the character and renames the member there
- **Bulk Updates**: Admin command to update all registered members at once
- **Multi-Language**: Replies in French or English (per user), easy to extend — see [Translations](#translations)
- **Health Monitoring**: Built-in system monitoring with heartbeat functionality
- **Database Logging**: Commands, Discord events and system logs stored in MySQL
- **Database Migrations**: Version-controlled database schema management
- **Modular Architecture**: Feature-based organization for easy expansion

---

## Tech Stack

| Technology | Purpose |
|------------|---------|
| **TypeScript** | Type-safe development (translation keys are type-checked too) |
| **discord.js v14** | Discord API integration |
| **MySQL / MariaDB** | Data persistence (`mysql2` driver) |
| **Node.js 18+** | Runtime environment (production runs Node 22) |
| **Jest** + `ts-jest` | Unit and snapshot tests |
| **Albion Online API** | Character data retrieval |

---

## Prerequisites

Before installing EyeBOT, ensure you have:

- **Node.js** v18 or higher ([Download](https://nodejs.org/)) — required by discord.js 14 and the global `fetch` used for the Albion API
- **npm** (comes with Node.js)
- **MySQL 5.7+ or MariaDB** ([MySQL](https://dev.mysql.com/downloads/mysql/) / [MariaDB](https://mariadb.org/download/))
- **A Discord application with a bot** ([Developer Portal](https://discord.com/developers/applications)), configured as follows:
  - **Bot → Privileged Gateway Intents → Server Members Intent: ON** (needed to fetch members and rename them; without it the bot fails to log in with *"Used disallowed intents"*)
  - Bot permissions on your server: **Manage Nicknames**, **Send Messages**, **Embed Links**
  - The bot's role must be **above** the members it renames (Discord never lets a bot rename the server owner)
- **Git** (optional, for cloning)

---

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/DBcide/EyeBOT.git
cd EyeBOT
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the project root (it is git-ignored — never commit it):

```env
# ================================
# Discord Configuration
# ================================
# Your Discord bot token (from https://discord.com/developers/applications)
DISCORD_TOKEN=your_discord_bot_token_here

# Your Discord application client ID
CLIENT_ID=your_client_id_here

# Server where slash commands are registered (required by `npm run register`)
GUILD_ID=your_guild_id_here

# ================================
# Database Configuration
# ================================
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password_here
DB_NAME=eyebot
DB_PORT=3306

# ================================
# Runtime (Optional)
# ================================
# "production" hides debug logs (including the periodic health metrics line)
NODE_ENV=development

# ================================
# Health Monitoring (Optional)
# ================================
# How often to collect system metrics (milliseconds, default 10000)
HEALTH_MONITOR_INTERVAL_MS=10000

# How often to send heartbeat requests (milliseconds, default 60000)
HEARTBEAT_INTERVAL_MS=60000

# URL to send heartbeat POST requests (heartbeat disabled if empty)
HEARTBEAT_URL=https://your-monitoring-endpoint.com/heartbeat

# Process memory limit in MB used for the memory alert (default 1024, keep in sync with ecosystem.config.js)
MAX_MEMORY_MB=1024
```

**Where to find these values:**

| Variable | How to Obtain |
|----------|---------------|
| `DISCORD_TOKEN` | 1. Go to [Discord Developer Portal](https://discord.com/developers/applications)<br>2. Select your application<br>3. Go to "Bot" tab<br>4. Click "Reset Token" and copy the new token |
| `CLIENT_ID` | Found in "General Information" tab of your Discord application |
| `GUILD_ID` | Right-click your Discord server → "Copy Server ID" (requires Developer Mode enabled) |
| `DB_*` | Your MySQL / MariaDB credentials |
| `HEARTBEAT_URL` | Your monitoring service endpoint (e.g., UptimeRobot, custom server) |

### 4. Set Up the Database

Create the database:

```sql
CREATE DATABASE eyebot CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Or from the command line:

```bash
mysql -u root -p -e "CREATE DATABASE eyebot CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

### 5. Run Database Migrations

```bash
npm run migrate
```

This creates all tables: `migrations` (tracking), `tracer_users`, `user_preferences`, `command_logs`, `system_logs` and `event_logs`. See [Database Schema](#database-schema).

### 6. Register Discord Commands

```bash
npm run register
```

Commands are registered **on the server given by `GUILD_ID`** (guild commands appear instantly). Run it again whenever a command, its options or a translation of its description changes.

### 7. Start the Bot

**Development** (runs TypeScript directly with ts-node, no auto-reload — restart after each change):
```bash
npm run dev
```

**Production** (compile, then run the JavaScript from `dist/`):
```bash
npm run build
npm start
```

**With PM2** (recommended for production, uses the provided `ecosystem.config.js`):
```bash
pm2 start ecosystem.config.js
```

**Console commands:** while the bot runs in a terminal (`npm run dev` or `npm start`), type `exit` (or `stop` / `quit`) then Enter for a clean shutdown (same as Ctrl+C), or `help` to list console commands. They are disabled under PM2 (no interactive terminal).

---

## Available Commands

Command **names** are the same in every language; their **descriptions** are shown in the user's Discord language.

### User Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/register <pseudo>` | Register your Albion Online character. If several players match, a menu lets you pick one. If the character is already linked to your account, it is updated like `/update` (useful when you join another server using EyeBOT). | `/register MyCharName` |
| `/update` | Refresh your character from the Albion API and rename you on this server (menu if you have several characters) | `/update` |
| `/language <language>` | Choose the bot's reply language, or "Automatic" to follow your Discord language | `/language English` |

### Admin Commands

| Command | Who can use it | Description |
|---------|----------------|-------------|
| `/updateall` | Members with **Manage Nicknames** | Refreshes every registered member of the server from the Albion API and renames them (5 at a time, with live progress) |
| `/verify <discord_id> <personnage>` | **Bot owner only** (Discord ID hard-coded in `VerifyCommand.ts`) | Verifies a character after receiving the in-game mail: locks it to that Discord account and removes other users' claims |

---

## NPM Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Run the bot with ts-node (development) |
| `npm run build` | Compile TypeScript to `dist/` (also checks every translation file) |
| `npm start` | Run the compiled bot from `dist/` |
| `npm run watch` | Compile in watch mode |
| `npm run clean` | Delete `dist/` (Windows command) |
| `npm run register` | Register slash commands on the `GUILD_ID` server |
| `npm run migrate` | Run all pending migrations |
| `npm run migrate:rollback` | Roll back the last migration |
| `npm run migrate:list` | List executed migrations |
| `npm test` | Run all tests |
| `npm run test:coverage` | Run tests with LCOV coverage report (used by SonarCloud) |
| `npm run download:assets` | Download Albion weapon images into `assets/` (interactive) |

---

## Translations

EyeBOT answers each user in their own language. The language is chosen in this order:

1. the language picked with **`/language`** (stored in the `user_preferences` table),
2. otherwise the **language of the user's Discord client** (e.g. an English Discord client gets English),
3. otherwise **French** (the default language).

When the bot sends a DM to another user (e.g. the verification notice of `/verify`), it uses **that user's** saved language.

**Currently supported:** 🇫🇷 French (`fr`, reference language) · 🇬🇧 English (`en`)

How it works:

- Texts never live in the code: they are in **JSON files, one per language and per feature** (`locales/<code>.json`).
- `fr.json` is the **reference**: TypeScript derives the list of valid keys from it. A typo in a key, a missing language or a key missing in a translation **fails the build**, so an incomplete translation can never reach production.
- Values can contain **placeholders** like `{name}`, replaced at runtime. A value written as an **array** is joined with line breaks (one array item = one line of the embed).
- Slash command descriptions are translated by Discord itself, based on each user's client language.
- Logs stay in French: they are meant for developers, not for players.

---

## Contributing a New Language (e.g. Spanish)

Adding a language only requires JSON files and three small code edits. **No database change** is needed. The TypeScript compiler tells you exactly what is still missing at each step.

> Before starting, please open an issue or contact the author (see [License](#license)): the license requires authorization for modifications.

### Step 1 — Declare the language

In `src/shared/i18n/locales.ts`, add an entry to `LOCALES`:

```ts
export const LOCALES = {
    fr: { label: 'Français', discordLocales: [DiscordLocale.French] },
    en: { label: 'English', discordLocales: [DiscordLocale.EnglishUS, DiscordLocale.EnglishGB] },
    es: { label: 'Español', discordLocales: [DiscordLocale.SpanishES, DiscordLocale.SpanishLATAM] },
} as const satisfies Record<string, { label: string; discordLocales: readonly DiscordLocale[] }>;
```

- **Key** (`es`): short language code, stored in the database (10 characters max).
- **`label`**: name shown in the `/language` menu, written **in the language itself** so that everyone can find it.
- **`discordLocales`**: the Discord client languages that should automatically get this translation. The available values are listed in discord.js' `Locale` enum (they match [Discord's locale codes](https://discord.com/developers/docs/reference#locales), e.g. `es-ES`, `es-419`).

Now run `npm run build`. It fails with three errors — **that's expected**, they list the files to complete:

```
src/features/settings/translations.ts  error TS2741: Property 'es' is missing in type ...
src/features/tracer/translations.ts    error TS2741: Property 'es' is missing in type ...
src/shared/i18n/index.ts               error TS2741: Property 'es' is missing in type ...
```

### Step 2 — Create the translation files

Create one `es.json` next to each existing `fr.json`, starting from a **copy of `fr.json`**:

| File to create | Texts it contains |
|----------------|-------------------|
| `src/shared/i18n/locales/es.json` | Messages shared by all commands (generic error, "this menu is not for you", timeout) |
| `src/features/tracer/locales/es.json` | `/register`, `/update`, `/updateall`, `/verify`: replies, embeds, select menus, Albion API errors, command descriptions |
| `src/features/settings/locales/es.json` | `/language`: description and confirmations |

### Step 3 — Register the files in their catalogs

In each of the three files reported at step 1, import the new file and add it to the catalog object:

```ts
import fr from './locales/fr.json';
import en from './locales/en.json';
import es from './locales/es.json';                                  // ← new

const catalogs: Record<Locale, TracerMessages> = { fr, en, es };    // ← add es
```

| File | Object to complete |
|------|--------------------|
| `src/shared/i18n/index.ts` | `commonCatalogs` |
| `src/features/tracer/translations.ts` | `catalogs` |
| `src/features/settings/translations.ts` | `catalogs` |

`npm run build` now compiles (the Spanish files still contain French text at this point).

### Step 4 — Translate the values

Translate **only the values**, never the keys. Rules to keep the bot working:

| Keep exactly as is | Example |
|--------------------|---------|
| Every **key** and the file structure | `"register": { "error": "…" }` |
| **Placeholders** in braces — rename nothing, you can move them in the sentence | `{pseudo}`, `{count}`, `{verifier}`, `{discordId}` |
| **Discord mentions and markdown** | `<@{discordId}>`, `**bold**`, `` `code` `` |
| **Command names** (they are not translated) | `/register`, `/update` |
| **Arrays** (one item = one line of the embed); empty strings `""` are blank lines | `"description": ["Line 1", "", "Line 3"]` |
| The **emoji** at the start of messages | `❌`, `✅`, `⚠️` |

Discord limits to respect (a longer text makes Discord reject the command or the message):

| Keys | Maximum length |
|------|----------------|
| `commands.*` (command and option descriptions, `commands.language.auto`) | **100 characters** |
| `*.selection.optionLabel` / `*.selection.optionDescription` (menu options, after placeholders are filled) | **100 characters** |

Albion game terms such as *Kill Fame* / *Death Fame* may stay in English if that is what players use in your language.

> A key forgotten in `es.json` is reported by `npm run build` with an explicit message, e.g.
> `Property '"error"' is missing in type ...` under `Types of property '"register"' are incompatible`.

### Step 5 — Check

```bash
npm run build     # every key of fr.json exists in es.json
npm test          # all tests still pass (French snapshots must not change)
```

Then try it on your test server:

```bash
npm run register  # adds "Español" to /language and Spanish command descriptions
npm run dev
```

In Discord, run `/language Español`, then `/register`, `/update`… and check every reply. Users whose Discord client is set to Spanish get it automatically.

### Step 6 — Open the pull request

Checklist:

- [ ] `src/shared/i18n/locales.ts` — language declared
- [ ] 3 × `es.json` created and fully translated (no French left)
- [ ] 3 catalogs updated (`index.ts`, `tracer/translations.ts`, `settings/translations.ts`)
- [ ] `npm run build` and `npm test` pass
- [ ] Tested in Discord with `/language`
- [ ] This README: language added to *Currently supported* in [Translations](#translations)

### Adding a new text (for feature developers)

When a feature needs a new message, add its key to **`fr.json` first**, then to **every other language file** (the build lists the ones you forgot), and use it through the feature's catalog:

```ts
const translate = tracerTranslations.forLocale(await this.resolveLocale(interaction));
await interaction.editReply({ content: translate('register.playerNotFound', { pseudo }) });
```

---

## Testing

EyeBOT has a full test suite built with **Jest** and `ts-jest`, run by the CI on every push and pull request (line coverage ≈ 99 %).

### Test Structure

Tests mirror the `src/` directory layout:

```
tests/
├── architecture.test.ts        # Source rules (e.g. no "@/" imports in src/)
├── setup.ts                    # Global setup: no DB lookup for the user language (defaults to fr)
├── features/
│   └── tracer/
│       ├── commands/           # RegisterCommand, UpdateAllCommand, UpdateCommand, VerifyCommand
│       ├── embeds/             # RegisterEmbeds, UpdateEmbeds, VerifyEmbeds (snapshot tests)
│       ├── handlers/           # CharacterUpdateHandler
│       ├── services/           # AlbionService, CharacterSyncService, TracerService
│       └── utils/              # DiscordUtils, ErrorHandlers, GuildUtils
└── shared/
    ├── embeds/                 # EmbedUtils
    ├── i18n/                   # TranslationCatalog, locales, common catalog
    └── services/               # DatabaseService, DatabaseLoggingService, LocaleService, LoggerService
```

### Conventions

- `[positif]` labels mark happy-path cases; `[extrême]` labels mark edge cases and error scenarios.
- External dependencies (discord.js, mysql2, Albion API HTTP calls) are mocked; commands and services receive their dependencies through optional constructor parameters.
- Assertions use the **French** texts (no language set in the mocks → default language).
- Error paths are tested too: a failing Discord reply (expired interaction, missing permission) must be logged once and never crash the bot.
- Embed snapshots live in `tests/features/tracer/embeds/__snapshots__/`. A snapshot diff means **a text seen by players changed**: if it is intended, update them with:
  ```bash
  npx jest --updateSnapshot
  ```

---

## Logging

Every log is printed in the console (colored) **and** written to the `system_logs` table. In addition:

- every slash command execution is stored in `command_logs` (user, server, options, status, error message),
- Discord events (bot added to / removed from a server) are stored in `event_logs`.

Debug logs (including the periodic health metrics line) are hidden when `NODE_ENV=production`.

---

## Health Monitoring & Heartbeat

EyeBOT includes a health monitoring system, started automatically once the bot is connected to Discord. It can also prevent hosting providers that stop idle processes from shutting the bot down.

### Monitored Metrics

**System:** process CPU usage, process memory (RSS, heap), server memory, uptime, load average.
**Discord:** number of servers, total members, channels, WebSocket ping, connection status.

### Heartbeat System

When `HEARTBEAT_URL` is set, the bot sends a POST request every `HEARTBEAT_INTERVAL_MS` (retried 3 times with 1 s / 2 s backoff) with this JSON payload:

```json
{
  "timestamp": "2026-01-05T10:30:00.000Z",
  "status": "healthy",
  "uptime": 3600,
  "memory": {
    "systemPercentage": "45.23",
    "processHeapUsed": "89.12 MB",
    "processHeapTotal": "128.00 MB",
    "processRSS": "180.50 MB",
    "processRSSPercentage": "17.63",
    "maxMemoryMB": 1024
  },
  "cpu": {
    "usage": "12.50"
  },
  "discord": {
    "guilds": 5,
    "users": 1250,
    "ping": 45,
    "status": "READY"
  }
}
```

`uptime` is the bot process uptime in seconds; `discord` is `null` if the client is not ready.

**Headers sent:**
```
Content-Type: application/json
User-Agent: EyeBOT-HealthMonitor/1.0
```

**Example Node.js heartbeat receiver:**
```javascript
app.post('/heartbeat', (req, res) => {
  console.log('Heartbeat received:', req.body);
  res.status(200).send('OK');
});
```

### Log Output

Every `HEALTH_MONITOR_INTERVAL_MS` (debug level, hidden in production):

```
Health | CPU: 1.20% | Process RSS: 17.63% (180.50 MB/1024MB) | Heap: 89.12 MB/128.00 MB | Server RAM: 45.23% | Uptime: 1h 23m 45s | Guilds: 5 | Users: 1250 | Ping: 45ms
```

**Warnings are logged when:**
- the process CPU usage exceeds 80 %,
- the process memory (RSS) exceeds 80 % of `MAX_MEMORY_MB` (risk of a PM2 restart).

---

## Project Structure

```
EyeBOT/
├── src/
│   ├── core/                        # Core bot framework
│   │   ├── Bot.ts                   # Orchestrator: auto-loads commands/events, routes interactions
│   │   ├── BaseCommand.ts           # Abstract slash command class
│   │   ├── BaseEvent.ts             # Abstract Discord event class
│   │   └── ConsoleCommands.ts       # Terminal commands (exit, help)
│   │
│   ├── features/                    # One folder per feature
│   │   ├── tracer/                  # Albion character registration & verification
│   │   │   ├── commands/            # /register, /update, /updateall, /verify (auto-loaded)
│   │   │   ├── components/          # Select menus
│   │   │   ├── embeds/              # Embed builders (one file per command)
│   │   │   ├── handlers/            # Flows shared by several commands
│   │   │   ├── locales/             # fr.json, en.json…
│   │   │   ├── models/              # TypeScript interfaces
│   │   │   ├── services/            # Albion API, database access, synchronization
│   │   │   ├── utils/               # Nickname, guild tag, fame formatting, API errors
│   │   │   └── translations.ts      # Typed translation catalog of the feature
│   │   ├── settings/                # /language
│   │   └── system/                  # Discord events (server joined/left, client errors)
│   │
│   ├── shared/
│   │   ├── embeds/                  # Shared colors and embed helpers
│   │   ├── i18n/                    # Translation engine, supported languages, common texts
│   │   ├── services/                # Database, logger, DB logging, language, health monitor, container
│   │   └── utils/                   # Clean process exit
│   │
│   ├── database/                    # Migration system and migrations
│   ├── scripts/                     # register-commands, run/rollback/list migrations
│   └── index.ts                     # Entry point
│
├── tests/                           # Test suite (mirrors src/)
├── assets/                          # Albion item images
├── .github/workflows/               # CI and Release & Deploy
├── ecosystem.config.js              # PM2 configuration
├── jest.config.js
├── sonar-project.properties         # SonarCloud configuration
├── CLAUDE.md                        # Detailed architecture and coding rules
├── MIGRATIONS.md                    # Migration guide
├── package.json
└── tsconfig.json
```

---

## Database Schema

| Table | Purpose |
|-------|---------|
| `tracer_users` | Albion characters linked to Discord accounts |
| `user_preferences` | Language chosen with `/language` |
| `command_logs` | Every slash command execution |
| `system_logs` | Application logs |
| `event_logs` | Discord events (server joined / left) |
| `migrations` | Executed migrations (managed automatically) |

### `tracer_users`

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT (PK) | Auto-incrementing ID |
| `discord_id` | VARCHAR(20) | Discord user ID |
| `albion_id` | VARCHAR(50) | Albion character ID (not unique: several users may claim an unverified character) |
| `albion_name` | VARCHAR(100) | Albion character name |
| `kill_fame` | BIGINT | Character kill fame |
| `death_fame` | BIGINT | Character death fame |
| `guild_name` | VARCHAR(100) | Guild name (nullable) |
| `alliance_name` | VARCHAR(100) | Alliance name (nullable) |
| `is_main` | BOOLEAN | Main character flag |
| `is_verified` | BOOLEAN | Verified (locked to this Discord account) |
| `registered_at` | TIMESTAMP | Registration timestamp |
| `updated_at` | TIMESTAMP | Last update timestamp |

### `user_preferences`

No row for a user = automatic mode (Discord client language).

| Column | Type | Description |
|--------|------|-------------|
| `discord_id` | VARCHAR(20) (PK) | Discord user ID |
| `locale` | VARCHAR(10) | Language code (`fr`, `en`…) |
| `created_at` / `updated_at` | TIMESTAMP | Timestamps |

---

## Development

See [CLAUDE.md](./CLAUDE.md) for the detailed architecture and coding rules (logging, naming, SonarCloud rules).

> **Imports:** always use **relative** imports in `src/` (`../../../core/BaseCommand`). The `@/` alias only works in tests: in `src/` it compiles but the command fails to load at runtime. `tests/architecture.test.ts` blocks it.

### Adding a New Command

1. Add the texts to the feature's `locales/fr.json` (and every other language):
   ```json
   "commands": {
     "mycommand": { "description": "Ma commande" }
   },
   "mycommand": { "hello": "Bonjour {name} !" }
   ```

2. Create `src/features/<feature>/commands/MyCommand.ts` (any file in a `commands/` folder is loaded automatically):
   ```typescript
   import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
   import { BaseCommand } from '../../../core/BaseCommand';
   import { tracerTranslations } from '../translations';

   export default class MyCommand extends BaseCommand {
       public name = 'mycommand';
       public description = tracerTranslations.defaultText('commands.mycommand.description');

       public buildCommand(): SlashCommandBuilder {
           return new SlashCommandBuilder()
               .setName(this.name)
               .setDescription(this.description)
               .setDescriptionLocalizations(tracerTranslations.discordLocalizations('commands.mycommand.description'));
       }

       public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
           const translate = tracerTranslations.forLocale(await this.resolveLocale(interaction));
           await interaction.reply(translate('mycommand.hello', { name: interaction.user.username }));
       }
   }
   ```

   Embeds go in the feature's `embeds/` folder as pure functions: `buildMyEmbed(translate, data)`.

3. Register and run:
   ```bash
   npm run register
   npm run dev
   ```

### Adding a Database Migration

1. Create `src/database/migrations/YYYYMMDD_HHMMSS_description.ts`:
   ```typescript
   import { Migration } from '../Migration';
   import mysql from 'mysql2/promise';

   export const CreateMyTable: Migration = {
       name: '20260105_120000_create_my_table',

       async up(connection: mysql.PoolConnection): Promise<void> {
           await connection.execute(`
               CREATE TABLE IF NOT EXISTS my_table (
                   id INT AUTO_INCREMENT PRIMARY KEY,
                   name VARCHAR(255) NOT NULL
               ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
           `);
       },

       async down(connection: mysql.PoolConnection): Promise<void> {
           await connection.execute('DROP TABLE IF EXISTS my_table');
       }
   };
   ```

2. Add it at the end of the array in `src/database/migrations/index.ts`
3. Run: `npm run migrate`

Note: MySQL commits table changes (`CREATE` / `ALTER` / `DROP`) immediately, so keep migrations idempotent (`IF EXISTS` / `IF NOT EXISTS`). See [MIGRATIONS.md](./MIGRATIONS.md).

---

## Production Deployment

### With PM2

1. Install PM2 globally:
   ```bash
   npm install -g pm2
   ```

2. Build and start with the provided `ecosystem.config.js` (1 instance, auto-restart, restart above 1 GB, logs in `./logs/`):
   ```bash
   npm run build
   pm2 start ecosystem.config.js
   ```

3. Useful PM2 commands:
   ```bash
   pm2 status           # Check status
   pm2 logs eyebot      # View logs
   pm2 restart eyebot   # Restart bot
   pm2 stop eyebot      # Stop bot
   pm2 delete eyebot    # Remove from PM2
   ```

### Versioning

This project follows **Semantic Versioning (SemVer)** — format `MAJOR.MINOR.PATCH`:

| Segment | When to increment | Example |
|---------|-------------------|---------|
| **MAJOR** | Breaking change — old code would break on the new version | `1.0.0` → `2.0.0` |
| **MINOR** | New backward-compatible feature (e.g. a new language) | `1.0.0` → `1.1.0` |
| **PATCH** | Bug fix or minor correction | `1.0.0` → `1.0.1` |

**Database changes:**
- Adding a nullable column or a new table → **MINOR**
- Removing/renaming a column or changing its type → **MAJOR**

The rule: if the previous version of the code can still run against the new database without crashing → MINOR. If it would crash → MAJOR.

### CI/CD (GitHub Actions)

- **CI** (`ci.yml`): triggered on every push and pull request to `main` and `develop`. Runs `npm install`, `npm run build`, `npm run test:coverage` and a SonarCloud analysis. Pull requests to `main` cannot be merged if it fails.

- **Release & Deploy** (`release.yml`): triggered manually from the GitHub Actions UI with a version number (e.g. `1.1.0`). It runs on the production server and:
  1. creates the git tag and the GitHub Release,
  2. pulls `main`, installs dependencies (`npm ci`), builds, removes dev dependencies,
  3. restarts the bot with PM2.

**Release workflow:**
1. Merge all features to `main` via pull requests
2. Update `version` in `package.json` in a final PR
3. **If the release adds a migration, run `npm run migrate` on the server** — migrations are not run automatically
4. If commands or their descriptions changed, run `npm run register`
5. Go to **Actions → Release & Deploy → Run workflow** and enter the version

---

## Troubleshooting

### The bot does not log in: "Used disallowed intents"

Enable **Server Members Intent** in the Developer Portal (Bot → Privileged Gateway Intents).

### Commands do not appear in Discord

1. Run `npm run register` and check it prints the expected commands
2. Check `GUILD_ID` is the server you are looking at (commands are registered on that server only)
3. Restart your Discord client if the list looks cached

### A command is missing at startup

Check the startup logs for `Erreur lors du chargement de <File>.js`. The usual cause is an `@/...` import in `src/` (see [Development](#development)) — `npm test` reports it.

### Nicknames are not updated

1. Check the bot has the **Manage Nicknames** permission
2. Check the bot's role is **above** the member's highest role
3. The server owner can never be renamed by a bot

### `/language` fails to save

The `user_preferences` table is probably missing: run `npm run migrate`.

### Database connection fails

1. Check MySQL / MariaDB is running
2. Check the `DB_*` values in `.env`
3. Ensure the database exists: `SHOW DATABASES;`
4. Test the connection: `npm run migrate:list`

### Health monitor not sending heartbeats

1. Check `HEARTBEAT_URL` is set in `.env` (a warning is logged at startup when it is missing)
2. Verify the endpoint is reachable: `curl -X POST <HEARTBEAT_URL>`
3. Look for `Heartbeat échoué` in the logs
4. Ensure the firewall allows outbound HTTPS requests

---

## API Rate Limits

The bot limits its calls to the Albion Online API:

- **Batch processing**: `/updateall` processes 5 members at a time
- **Delays**: 1 second between batches to avoid HTTP 429 errors
- **Timeout**: 10 seconds per request
- **Error handling**: one failing member never stops the others; failures are listed in the final summary

---

## License

**EyeBOT is source-available, not open source.** Summary of [LICENSE.txt](./LICENSE.txt) (the license file prevails):

- **Personal, non-commercial use**: allowed, with attribution to the author
- **Commercial use**: prohibited without written authorization
- **Modification, redistribution, forks and derivative works**: prohibited without written authorization
- Copyright notices and attribution must be kept

- **Author**: [DBcide](https://github.com/DBcide) (Olivier Français)
- **Contact** (authorizations, contributions, questions): contact@dbcide.fr

---

## Support

For issues, questions, or feature requests:

1. Check this README and [CLAUDE.md](./CLAUDE.md)
2. Review the [Troubleshooting](#troubleshooting) section
3. Contact: contact@dbcide.fr

---

## Acknowledgments

- **discord.js** - Discord API wrapper
- **Albion Online** - Game data API
- **OVH** - VPS hosting platform

---

<div align="center">
  <p>Made with ❤️ for the Albion Online community</p>
  <p>
    <a href="https://discord.js.org/">
      <img src="https://img.shields.io/badge/discord.js-v14-blue.svg" alt="discord.js">
    </a>
    <a href="https://www.typescriptlang.org/">
      <img src="https://img.shields.io/badge/TypeScript-5.9-blue.svg" alt="TypeScript">
    </a>
    <a href="https://nodejs.org/">
      <img src="https://img.shields.io/badge/Node.js-18+-green.svg" alt="Node.js">
    </a>
  </p>
</div>
