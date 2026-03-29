# Guide des Migrations de Base de Données

Ce document explique comment utiliser le système de migrations pour gérer les changements de schéma de la base de données.

## Première utilisation

Si vous démarrez avec une **nouvelle base de données vide**, exécutez simplement :

```bash
npm run migrate
```

Cela créera toutes les tables nécessaires avec la structure la plus récente.

## Si vous avez déjà une base de données existante

Si vous avez déjà une table `tracer_users` en production, vous devez :

1. **Vérifier l'état actuel de votre table** pour voir quelles colonnes existent déjà
2. **Marquer les migrations déjà appliquées** manuellement dans la base de données
3. **Exécuter uniquement les nouvelles migrations**

### Étape 1 : Marquer les migrations existantes

Si votre table `tracer_users` existe déjà SANS la colonne `is_verified`, exécutez cette requête SQL directement dans votre base de données :

```sql
-- Créer la table de suivi des migrations
CREATE TABLE IF NOT EXISTS migrations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Marquer la première migration comme déjà exécutée
INSERT INTO migrations (name) VALUES ('20260104_000001_create_tracer_users_table');
```

### Étape 2 : Exécuter les nouvelles migrations

Ensuite, exécutez :

```bash
npm run migrate
```

Cela ajoutera uniquement la colonne `is_verified` sans recréer la table.

## Commandes disponibles

### Exécuter les migrations

```bash
npm run migrate
```

- Exécute toutes les migrations qui n'ont pas encore été appliquées
- Chaque migration s'exécute dans une transaction (rollback automatique en cas d'erreur)
- Les migrations déjà exécutées sont ignorées

### Lister les migrations exécutées

```bash
npm run migrate:list
```

Affiche toutes les migrations qui ont été appliquées avec leur date d'exécution.

### Annuler la dernière migration

```bash
npm run migrate:rollback
```

⚠️ **Attention** : Cette commande annule la dernière migration exécutée. Utilisez avec précaution en production !

## Structure d'une migration

Chaque migration doit implémenter deux méthodes :

- **`up()`** : Applique les changements (CREATE, ALTER, INSERT, etc.)
- **`down()`** : Annule les changements (DROP, DELETE, etc.)

### Exemple de migration

```typescript
import { Migration } from '../Migration';
import mysql from 'mysql2/promise';

export const AddColumnExample: Migration = {
    name: '20260104_120000_add_column_example',

    async up(connection: mysql.PoolConnection): Promise<void> {
        await connection.execute(`
            ALTER TABLE tracer_users
            ADD COLUMN new_column VARCHAR(100) DEFAULT NULL;
        `);
    },

    async down(connection: mysql.PoolConnection): Promise<void> {
        await connection.execute(`
            ALTER TABLE tracer_users
            DROP COLUMN new_column;
        `);
    }
};
```

## Créer une nouvelle migration

1. Créez un nouveau fichier dans `src/database/migrations/` avec le format :
   ```
   YYYYMMDD_HHMMSS_description.ts
   ```

2. Implémentez l'interface `Migration` avec les méthodes `up()` et `down()`

3. Ajoutez votre migration à `src/database/migrations/index.ts` :
   ```typescript
   import { MyNewMigration } from './20260104_120000_my_new_migration';

   export const migrations: Migration[] = [
       CreateTracerUsersTable,
       AddIsVerifiedToTracerUsers,
       MyNewMigration, // Ajoutez ici
   ];
   ```

4. Exécutez `npm run migrate`

## Migrations actuelles

### 1. `20260104_000001_create_tracer_users_table`

Crée la table `tracer_users` avec :
- Champs de base : `id`, `discord_id`, `albion_id`, `albion_name`
- Statistiques : `kill_fame`, `death_fame`
- Informations de guilde : `guild_name`, `alliance_name`
- Métadonnées : `is_main`, `registered_at`, `updated_at`
- Index sur `discord_id` et `albion_id`

### 2. `20260104_000002_add_is_verified_to_tracer_users`

Ajoute la colonne `is_verified` (BOOLEAN, défaut: 0) pour le système de vérification :
- `is_verified = false` : Le compte peut être lié à plusieurs comptes Discord
- `is_verified = true` : Le compte est vérifié et lié à un seul propriétaire

## Bonnes pratiques

1. **Toujours tester les migrations en développement** avant de les exécuter en production
2. **Créer un backup de la base de données** avant d'exécuter des migrations en production
3. **Ne jamais modifier une migration déjà exécutée** - créez une nouvelle migration à la place
4. **Utiliser des transactions** - le système le fait automatiquement
5. **Écrire une méthode `down()` fonctionnelle** pour pouvoir annuler les changements si nécessaire

## En cas de problème

Si une migration échoue :

1. Le système effectue automatiquement un rollback de la transaction
2. La migration n'est pas marquée comme exécutée
3. Corrigez le problème dans le code de la migration
4. Réexécutez `npm run migrate`

Si vous devez corriger manuellement :

```sql
-- Voir les migrations exécutées
SELECT * FROM migrations ORDER BY executed_at DESC;

-- Supprimer une entrée de migration (pour la réexécuter)
DELETE FROM migrations WHERE name = 'nom_de_la_migration';
```
