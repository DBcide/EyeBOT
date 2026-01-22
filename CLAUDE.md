# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

EyeBOT is a Discord bot for Albion Online that handles character registration, verification, and nickname synchronization. Built with TypeScript, discord.js v14, and MySQL.

## Common Commands

```bash
# Development
npm run dev          # Run with ts-node (auto-reload)
npm run build        # Compile TypeScript to dist/
npm run watch        # Compile in watch mode

# Production
npm start            # Run compiled bot from dist/

# Database
npm run migrate              # Run pending migrations
npm run migrate:rollback     # Rollback last migration
npm run migrate:list         # List executed migrations

# Discord
npm run register     # Register slash commands with Discord API
```

## Architecture

### Core Framework (`src/core/`)

- **Bot.ts**: Main orchestrator that auto-loads commands and events from feature directories
- **BaseCommand.ts**: Abstract class all commands must extend (requires `name`, `description`, `buildCommand()`, `execute()`)
- **BaseEvent.ts**: Abstract class for Discord events

### Feature-Based Organization (`src/features/`)

Each feature is a self-contained module with its own:
- `commands/` - Slash command implementations
- `events/` - Discord event handlers (optional)
- `services/` - Business logic
- `models/` - TypeScript interfaces
- `utils/` - Feature-specific utilities

Commands and events are auto-discovered by the Bot class - just add files to the appropriate directories.

### Shared Services (`src/shared/services/`)

Singleton pattern via `ServiceContainer.getInstance()`:
- **DatabaseService**: MySQL connection pool wrapper
- **LoggerService**: Colored console logging
- **HealthMonitorService**: System metrics and heartbeat

### Database Layer (`src/database/`)

- Migrations follow naming: `YYYYMMDD_HHMMSS_description.ts`
- Each migration exports a `migration` object with `up()` and `down()` methods
- Must be registered in `migrations/index.ts`

## Adding a New Command

1. Create `src/features/<feature>/commands/MyCommand.ts`:
```typescript
import { BaseCommand } from '../../../core/BaseCommand';
import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';

export default class MyCommand extends BaseCommand {
    public name = 'mycommand';
    public description = 'Description';

    public buildCommand(): SlashCommandBuilder {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description);
    }

    public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        await interaction.reply('Response');
    }
}
```
2. Run `npm run build && npm run register`

## Adding a Database Migration

1. Create `src/database/migrations/YYYYMMDD_HHMMSS_description.ts`
2. Export `migration` object with `name`, `up(connection)`, and `down(connection)` methods
3. Add to exports in `src/database/migrations/index.ts`
4. Run `npm run migrate`

## External APIs

- **Albion Online API**: Used in `AlbionService.ts` for character data retrieval
- Rate limiting: batch processing with delays to avoid 429 errors

## Environment Variables

Required in `.env`:
- `DISCORD_TOKEN`, `CLIENT_ID` - Discord bot credentials
- `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT` - MySQL connection
- `GUILD_ID` (optional) - For guild-specific command registration during development
