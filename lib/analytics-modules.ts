import { MIGRATION_HREF } from "@/lib/migrations";

export const MIGRATIONS_MODULE = "Migrations";
export const BULK_ORIGIN_PARAM = "from";
export const BULK_ORIGIN_MIGRATIONS = "migrations";

export type ModuleContext = {
  module_name: string;
  sub_module_name: string;
};

/**
 * Whether this importer was opened from the Data Migration Center. Its steps
 * open the module's own importer page (`/invoices/bulk?from=migrations`), so
 * the path alone says "Invoices"; the `from` parameter is what says Migrations.
 */
function openedFromMigrations(): boolean {
  return (
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get(BULK_ORIGIN_PARAM) ===
      BULK_ORIGIN_MIGRATIONS
  );
}

export function bulkModuleContext(
  pathname: string,
  section: string,
): ModuleContext {
  return pathname.startsWith(MIGRATION_HREF) || openedFromMigrations()
    ? { module_name: MIGRATIONS_MODULE, sub_module_name: section }
    : { module_name: section, sub_module_name: section };
}

export function bulkTransactionsContext(): ModuleContext {
  const fromMigrations = openedFromMigrations();
  return {
    module_name: fromMigrations ? MIGRATIONS_MODULE : "Transactions",
    sub_module_name: "Transactions",
  };
}

export function sectionName(nounPlural: string): string {
  return nounPlural.charAt(0).toUpperCase() + nounPlural.slice(1);
}
