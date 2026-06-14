# <img src="https://cdn.discordapp.com/avatars/1347319983256113223/ccf976b2b1943655b9360e021bd76eb1.webp?size=240" alt="EyeBOT Avatar" width="40" style="vertical-align:sub;"> EyeBOT — Discord Bot for Albion Online

**EyeBOT** is a Discord bot built with TypeScript and discord.js v14, designed to integrate Albion Online player data with Discord servers. It provides character registration, verification, automatic nickname synchronization, and comprehensive health monitoring for production deployments.

---

## Features

- **Character Registration**: Link Discord accounts to Albion Online characters
- **Character Verification**: Secure verification system via in-game mail
- **Automatic Nickname Sync**: Discord nicknames update to match Albion character names
- **Multi-Character Support**: Users can register multiple Albion characters
- **Bulk Updates**: Admin command to update all registered members at once
- **Health Monitoring**: Built-in system monitoring with heartbeat functionality
- **Database Migrations**: Version-controlled database schema management
- **Modular Architecture**: Feature-based organization for easy expansion

---

## Tech Stack

| Technology | Purpose |
|------------|---------|
| **TypeScript** | Type-safe development |
| **discord.js v14** | Discord API integration |
| **MySQL** | Data persistence |
| **Node.js** | Runtime environment |
| **Albion Online API** | Character data retrieval |

---

## Prerequisites

Before installing EyeBOT, ensure you have:

- **Node.js** v22 or higher ([Download](https://nodejs.org/))
- **npm** (comes with Node.js)
- **MySQL / MariaDB** ([Download](https://dev.mysql.com/downloads/mysql/))
- **Discord Bot Token** ([Create a bot](https://discord.com/developers/applications))
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

Create a `.env` file in the project root:

```bash
# Copy the example below and fill in your values
```

```env
# ================================
# Discord Configuration
# ================================
# Your Discord bot token (from https://discord.com/developers/applications)
DISCORD_TOKEN=your_discord_bot_token_here

# Your Discord application client ID
CLIENT_ID=your_client_id_here

# (Optional) Your Discord guild/server ID for testing
GUILD_ID=your_guild_id_here

# ================================
# Database Configuration
# ================================
# MySQL database host
DB_HOST=localhost

# MySQL username
DB_USER=root

# MySQL password (leave empty if no password)
DB_PASSWORD=your_password_here

# Database name (will be created during setup)
DB_NAME=eyebot

# MySQL port (default: 3306)
DB_PORT=3306

# ================================
# Health Monitoring (Optional)
# ================================
# How often to collect system metrics (milliseconds)
HEALTH_MONITOR_INTERVAL_MS=10000

# How often to send heartbeat requests (milliseconds)
HEARTBEAT_INTERVAL_MS=60000

# URL to send heartbeat POST requests (prevents host shutdown)
HEARTBEAT_URL=https://your-monitoring-endpoint.com/heartbeat
```

**Where to find these values:**

| Variable | How to Obtain |
|----------|---------------|
| `DISCORD_TOKEN` | 1. Go to [Discord Developer Portal](https://discord.com/developers/applications)<br>2. Select your application<br>3. Go to "Bot" tab<br>4. Click "Reset Token" and copy the new token |
| `CLIENT_ID` | Found in "General Information" tab of your Discord application |
| `GUILD_ID` | Right-click your Discord server → "Copy Server ID" (requires Developer Mode enabled) |
| `DB_*` | Your MySQL installation credentials |
| `HEARTBEAT_URL` | Your monitoring service endpoint (e.g., UptimeRobot, custom server) |

### 4. Set Up the Database

Create the database in MySQL:

```sql
CREATE DATABASE eyebot CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Or use the MySQL command line:

```bash
mysql -u root -p -e "CREATE DATABASE eyebot CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

### 5. Run Database Migrations

```bash
npm run migrate
```

This will create all necessary tables:
- `migrations` - Migration tracking
- `tracer_users` - Albion character registrations

### 6. Register Discord Commands

```bash
npm run register
```

This registers all slash commands with Discord's API.

### 7. Build the Project

```bash
npm run build
```

### 8. Start the Bot

**Development Mode** (with auto-reload):
```bash
npm run dev
```

**Production Mode**:
```bash
npm start
```

**With PM2** (recommended for production):
```bash
pm2 start ecosystem.config.js
```

---

## Available Commands

### User Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/register <pseudo>` | Register your Albion Online character | `/register MyCharName` |
| `/update` | Update your character information from Albion API | `/update` |
| `/verify <character>` | Verify a character (admin only) | `/verify PlayerName` |

### Admin Commands

| Command | Permission Required | Description |
|---------|---------------------|-------------|
| `/updateall` | Manage Nicknames | Updates all registered members' nicknames from Albion API |
| `/verify` | Administrator | Verifies a user's Albion character claim |

---

## NPM Scripts

### Development
```bash
npm run dev          # Run bot with ts-node (development)
npm run watch        # Compile TypeScript in watch mode
npm run build        # Compile TypeScript to dist/
npm run clean        # Clean dist/ directory
```

### Production
```bash
npm start            # Run compiled bot from dist/
```

### Database
```bash
npm run migrate              # Run all pending migrations
npm run migrate:rollback     # Rollback last migration
npm run migrate:list         # List executed migrations
```

### Discord
```bash
npm run register     # Register slash commands with Discord API
```

---

## Health Monitoring & Heartbeat

EyeBOT includes a comprehensive health monitoring system designed to prevent shutdown by hosting providers that terminate idle processes (e.g., O2Switch).

### Monitored Metrics

**System Metrics:**
- CPU usage (%)
- Memory usage (total, used, percentage)
- Heap memory (Node.js)
- Process uptime
- System load averages

**Discord Metrics:**
- Number of guilds
- Total users across all guilds
- Channel count
- WebSocket ping (latency)
- Connection status

### Heartbeat System

When `HEARTBEAT_URL` is configured, the bot sends periodic POST requests with the following JSON payload:

```json
{
  "timestamp": "2025-01-05T10:30:00.000Z",
  "status": "healthy",
  "uptime": 3600,
  "memory": {
    "percentage": "45.23",
    "used": "512.00 MB"
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

**Headers sent:**
```
Content-Type: application/json
User-Agent: EyeBOT-HealthMonitor/1.0
```

### Configuring Heartbeat

1. **Set environment variables:**
   ```env
   HEARTBEAT_URL=https://your-endpoint.com/heartbeat
   HEARTBEAT_INTERVAL_MS=60000  # Send every 60 seconds
   ```

2. **Use with monitoring services:**
   - **UptimeRobot**: Create HTTP monitor pointing to your endpoint
   - **Pingdom**: Set up transaction check
   - **Custom server**: Create endpoint that receives POST requests

3. **Example Node.js heartbeat receiver:**
   ```javascript
   app.post('/heartbeat', (req, res) => {
     console.log('Heartbeat received:', req.body);
     // Store metrics, trigger alerts, etc.
     res.status(200).send('OK');
   });
   ```

### Log Output

Metrics are logged every 10 seconds (configurable):

```
📊 Health | CPU: 12.34% | RAM: 45.67% | Heap: 89.12 MB/256.00 MB | Uptime: 1h 23m 45s | Guilds: 5 | Users: 1250 | Ping: 45ms
```

**Alerts are triggered when:**
- CPU usage > 80%
- Memory usage > 80%

---

## Project Structure

```
EyeBOT/
├── src/
│   ├── core/                    # Core bot framework
│   │   ├── Bot.ts              # Main bot orchestrator
│   │   ├── BaseCommand.ts      # Abstract command class
│   │   └── BaseEvent.ts        # Abstract event class
│   │
│   ├── features/               # Feature modules
│   │   └── tracer/            # Albion character tracking
│   │       ├── commands/      # Slash commands
│   │       ├── models/        # TypeScript interfaces
│   │       ├── services/      # Business logic
│   │       └── utils/         # Utilities
│   │
│   ├── shared/                # Shared services
│   │   └── services/
│   │       ├── DatabaseService.ts        # MySQL wrapper
│   │       ├── LoggerService.ts          # Logging
│   │       ├── HealthMonitorService.ts   # Health monitoring
│   │       └── ServiceContainer.ts       # DI container
│   │
│   ├── database/              # Database layer
│   │   ├── migrations/        # Schema migrations
│   │   ├── Migration.ts       # Migration interface
│   │   └── MigrationService.ts
│   │
│   ├── scripts/               # Utility scripts
│   │   ├── register-commands.ts
│   │   ├── run-migrations.ts
│   │   ├── rollback-migration.ts
│   │   └── list-migrations.ts
│   │
│   └── index.ts               # Entry point
│
├── dist/                      # Compiled JavaScript (generated)
├── .env                       # Environment variables (not in git)
├── package.json
├── tsconfig.json
└── README.md                  # This file
```

---

## Database Schema

### `tracer_users` Table

Stores Albion Online character registrations.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT (PK) | Auto-incrementing ID |
| `discord_id` | VARCHAR(20) | Discord user ID |
| `albion_id` | VARCHAR(255) | Albion character ID |
| `albion_name` | VARCHAR(255) | Albion character name |
| `kill_fame` | BIGINT | Character kill fame |
| `death_fame` | BIGINT | Character death fame |
| `guild_name` | VARCHAR(255) | Guild name (nullable) |
| `alliance_name` | VARCHAR(255) | Alliance name (nullable) |
| `is_main` | TINYINT(1) | Main character flag |
| `is_verified` | TINYINT(1) | Verification status |
| `registered_at` | TIMESTAMP | Registration timestamp |
| `updated_at` | TIMESTAMP | Last update timestamp |

---

## Development

### Adding a New Command

1. Create `src/features/<feature>/commands/MyCommand.ts`:
   ```typescript
   import { BaseCommand } from '../../../core/BaseCommand';
   import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';

   export default class MyCommand extends BaseCommand {
       public name = 'mycommand';
       public description = 'My command description';

       public buildCommand(): SlashCommandBuilder {
           return new SlashCommandBuilder()
               .setName(this.name)
               .setDescription(this.description);
       }

       public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
           await interaction.reply('Hello!');
       }
   }
   ```

2. Build and register:
   ```bash
   npm run build
   npm run register
   ```

### Adding a Database Migration

1. Create `src/database/migrations/YYYYMMDD_HHMMSS_description.ts`:
   ```typescript
   import { Migration } from '../Migration';
   import mysql from 'mysql2/promise';

   export const migration: Migration = {
       name: '20250105_120000_add_new_table',

       async up(connection: mysql.PoolConnection): Promise<void> {
           await connection.query(`
               CREATE TABLE my_table (
                   id INT AUTO_INCREMENT PRIMARY KEY,
                   name VARCHAR(255) NOT NULL
               );
           `);
       },

       async down(connection: mysql.PoolConnection): Promise<void> {
           await connection.query('DROP TABLE my_table');
       }
   };
   ```

2. Export in `src/database/migrations/index.ts`
3. Run: `npm run migrate`

---

## Production Deployment

### With PM2 (Recommended)

1. Install PM2 globally:
   ```bash
   npm install -g pm2
   ```

2. Create `ecosystem.config.js`:
   ```javascript
   module.exports = {
     apps: [{
       name: 'eyebot',
       script: './dist/index.js',
       instances: 1,
       autorestart: true,
       watch: false,
       max_memory_restart: '1G',
       env: {
         NODE_ENV: 'production'
       }
     }]
   };
   ```

3. Start:
   ```bash
   pm2 start ecosystem.config.js
   ```

4. Useful PM2 commands:
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
| **MINOR** | New backward-compatible feature | `1.0.0` → `1.1.0` |
| **PATCH** | Bug fix or minor correction | `1.0.0` → `1.0.1` |

**Database changes:**
- Adding a nullable column or a new table → **MINOR**
- Removing/renaming a column or changing its type → **MAJOR**

The rule: if the previous version of the code can still run against the new database without crashing → MINOR. If it would crash → MAJOR.

### CI/CD (GitHub Actions)

The project uses a two-workflow CI/CD pipeline:

- **CI** (`ci.yml`): Automatically triggered on every push and PR to `main`. Runs `npm ci` + `npm run build` to validate the TypeScript compiles correctly. PRs cannot be merged if this check fails.

- **Release & Deploy** (`release.yml`): Manually triggered via GitHub Actions UI. Enter the version number (e.g. `1.1.0`) and the workflow will:
  1. Create a git tag and GitHub Release
  2. Pull the latest code on the production server
  3. Build and restart the bot via PM2

**Release workflow:**
1. Merge all features to `main` via PRs
2. Update `version` in `package.json` in a final PR
3. Go to **Actions → Release & Deploy → Run workflow** and enter the version
4. The bot restarts automatically in production

---

## Troubleshooting

### Bot doesn't respond to commands

1. Check bot is online in Discord
2. Verify slash commands are registered: `npm run register`
3. Check bot has proper permissions in your server
4. Review logs for errors

### Database connection fails

1. Verify MySQL is running: `mysql --version`
2. Check `.env` credentials are correct
3. Ensure database exists: `SHOW DATABASES;`
4. Test connection: `npm run migrate:list`

### Commands not appearing in Discord

1. Re-register commands: `npm run register`
2. Wait up to 1 hour for global commands to propagate
3. Use `GUILD_ID` in `.env` for instant testing (guild-specific commands)

### Health monitor not sending heartbeats

1. Check `HEARTBEAT_URL` is set in `.env`
2. Verify endpoint is accessible: `curl -X POST <HEARTBEAT_URL>`
3. Check logs for heartbeat errors
4. Ensure firewall allows outbound HTTP requests

---

## API Rate Limits

The bot implements automatic rate limiting for the Albion Online API:

- **Batch processing**: `/updateall` processes 5 users at a time
- **Delays**: 1 second between batches to avoid 429 errors
- **Error handling**: Graceful degradation on API failures

---

## License

**Public Project**

- **Author**: [DBcide](https://github.com/DBcide) (Olivier Français)
- **Contact**: contact@dbcide.fr
- Commercial use prohibited without authorization
- Modification and redistribution prohibited without authorization
- Attribution required for any authorized use
- See [LICENSE.txt](./LICENSE.txt) for full details

---

## Support

For issues, questions, or feature requests:

1. Check existing documentation (README.md)
2. Review troubleshooting section above
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
      <img src="https://img.shields.io/badge/Node.js-16+-green.svg" alt="Node.js">
    </a>
  </p>
</div>
