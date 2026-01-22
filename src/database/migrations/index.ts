import { Migration } from '../Migration';
import { CreateTracerUsersTable } from './20260104_000001_create_tracer_users_table';
import { AddIsVerifiedToTracerUsers } from './20260104_000002_add_is_verified_to_tracer_users';
import { RemoveUniqueConstraintAlbionId } from './20260122_000003_remove_unique_constraint_albion_id';

/**
 * Liste de toutes les migrations dans l'ordre chronologique
 * Les migrations sont exécutées dans cet ordre
 */
export const migrations: Migration[] = [
    CreateTracerUsersTable,
    AddIsVerifiedToTracerUsers,
    RemoveUniqueConstraintAlbionId,
];
