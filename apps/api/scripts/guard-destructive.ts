/**
 * Guard for destructive DB scripts (db:reset, db:seed).
 *
 * Refuses to run when NODE_ENV=production unless ALLOW_DESTRUCTIVE_DB=true is
 * set explicitly. Prevents wiping or re-seeding a live database by accident.
 */
import "dotenv/config";

export function assertNonProductionDb(action: string) {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DESTRUCTIVE_DB !== "true") {
    console.error(
      `Refusing to ${action}: NODE_ENV=production. This would modify or wipe live data.\n` +
        "If you really intend this (e.g. a fresh staging DB), take a backup and re-run with ALLOW_DESTRUCTIVE_DB=true."
    );
    process.exit(1);
  }
}

if (require.main === module) assertNonProductionDb("reset the database");
