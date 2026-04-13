import { Migration } from '../Migration';
import { CreateTracerUsersTable } from './20260104_000001_create_tracer_users_table';
import { AddIsVerifiedToTracerUsers } from './20260104_000002_add_is_verified_to_tracer_users';
import { RemoveUniqueConstraintAlbionId } from './20260122_000003_remove_unique_constraint_albion_id';
import { CreateCommandLogsTable } from './20260326_000004_create_command_logs_table';
import { CreateSystemLogsTable } from './20260326_000005_create_system_logs_table';
import { CreateEventLogsTable } from './20260326_000006_create_event_logs_table';
import { CreateVouchGuildSettingsTable } from './20260413_000007_create_vouch_guild_settings_table';
import { CreateVouchRequirementsTable } from './20260413_000008_create_vouch_requirements_table';
import { CreateVouchesTable } from './20260413_000009_create_vouches_table';

/**
 * Liste de toutes les migrations dans l'ordre chronologique
 * Les migrations sont exécutées dans cet ordre
 */
export const migrations: Migration[] = [
    CreateTracerUsersTable,
    AddIsVerifiedToTracerUsers,
    RemoveUniqueConstraintAlbionId,
    CreateCommandLogsTable,
    CreateSystemLogsTable,
    CreateEventLogsTable,
    CreateVouchGuildSettingsTable,
    CreateVouchRequirementsTable,
    CreateVouchesTable,
];
