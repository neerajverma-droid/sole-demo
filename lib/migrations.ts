import {
  Building2,
  FileText,
  Landmark,
  Package,
  Receipt,
  type LucideIcon,
} from "lucide-react";

/**
 * The migration centre — bringing an existing business's records across.
 *
 * Five steps in the order that costs the least rework. Transactions first
 * because everything else reconciles against them; contacts next because an
 * invoice needs someone to be addressed to; then the documents themselves; and
 * assets last, since nothing depends on them.
 *
 * Recommended, not enforced. The order saves work, it doesn't protect
 * anything — a business whose assets are the only thing it has in a
 * spreadsheet should be able to start there, and a flow that locked steps
 * behind each other would be inventing a dependency the data doesn't have.
 */

export const MIGRATION_HREF = "/migrations";

export type MigrationStepId =
  | "transactions"
  | "contacts"
  | "invoices"
  | "expenses"
  | "assets";

/**
 * How a step opens, which is the whole reason this list is data rather than
 * five hard-coded rows.
 *
 * - `route` — the flow already lives on its own page. Navigate to it.
 * - `dialog` — the flow is a modal driven by an atom. The page mounts it and
 *   flips the atom, so the step opens in place rather than bouncing through
 *   the screen that normally hosts it.
 *
 * There is no longer a `placeholder` kind: every step now opens a real
 * importer, so a row that couldn't do anything has nothing left to say.
 */
export type MigrationDialogId =
  | "contacts"
  | "invoices"
  | "expenses"
  | "assets";

export type MigrationTarget =
  | { kind: "route"; href: string }
  | { kind: "dialog"; dialog: MigrationDialogId };

export type MigrationStep = {
  id: MigrationStepId;
  /** 1–5, shown in the badge. Position in the list, not a priority. */
  order: number;
  title: string;
  description: string;
  icon: LucideIcon;
  /** The noun the count is reported in — "142 imported" needs no unit, but
   *  the placeholder copy and the aria labels do. */
  noun: string;
  target: MigrationTarget;
};

export const MIGRATION_STEPS: MigrationStep[] = [
  {
    id: "transactions",
    order: 1,
    title: "Bank Transactions",
    description: "Import your bank transaction history",
    icon: Landmark,
    noun: "transactions",
    // The CSV wizard at /transactions/bulk — a real importer, reused whole.
    target: { kind: "route", href: "/transactions/bulk" },
  },
  {
    id: "contacts",
    order: 2,
    title: "Clients & Suppliers",
    description: "Import your client and supplier contacts",
    icon: Building2,
    noun: "contacts",
    // `BulkUploadDialog`, which reads `bulkUploadOpenAtom` and so can be
    // mounted anywhere that wants it.
    target: { kind: "dialog", dialog: "contacts" },
  },
  {
    id: "invoices",
    order: 3,
    title: "Invoices",
    description: "Import your client invoices and billing history",
    icon: FileText,
    noun: "invoices",
    // `InvoiceBulkUploadDialog` — the same importer Contacts uses, driven by
    // `invoiceBulkOpenAtom`.
    target: { kind: "dialog", dialog: "invoices" },
  },
  {
    id: "expenses",
    order: 4,
    title: "Expenses",
    description: "Import your business expenses and receipts",
    icon: Receipt,
    noun: "expenses",
    // `ExpenseBulkUploadDialog`, driven by `expenseBulkOpenAtom`.
    target: { kind: "dialog", dialog: "expenses" },
  },
  {
    id: "assets",
    order: 5,
    title: "Assets",
    description: "Import your company assets and equipment",
    icon: Package,
    noun: "assets",
    // `AssetBulkUploadDialog`, driven by `assetBulkOpenAtom`. This used to
    // send people to /assets/new/upload, which captures one asset from one
    // document — a different job from bringing a register across.
    target: { kind: "dialog", dialog: "assets" },
  },
];

/** The step a given flow reports against, so a caller names it once. */
export function migrationStep(id: MigrationStepId): MigrationStep {
  return MIGRATION_STEPS.find((step) => step.id === id) ?? MIGRATION_STEPS[0];
}
