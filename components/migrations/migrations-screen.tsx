"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useSetAtom } from "jotai";
import { ArrowRight, Check, ChevronRight, Database } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { BulkUploadDialog } from "@/components/contacts/bulk-upload-dialog";
import { InvoiceBulkUploadDialog } from "@/components/invoices/bulk-upload-dialog";
import { ExpenseBulkUploadDialog } from "@/components/expenses/bulk-upload-dialog";
import { AssetBulkUploadDialog } from "@/components/assets/asset-bulk-upload-dialog";
import {
  assetBulkOpenAtom,
  bulkUploadOpenAtom,
  expenseBulkOpenAtom,
  invoiceBulkOpenAtom,
} from "@/lib/atoms";
import {
  MIGRATION_STEPS,
  type MigrationDialogId,
  type MigrationStep,
  type MigrationStepId,
} from "@/lib/migrations";
import { useMigrationsHydrated } from "@/lib/use-migrations-hydrated";
import { cn } from "@/lib/utils";
import { useMigrationsStore } from "@/stores/migrations";

/**
 * The Data Migration Center.
 *
 * A hub rather than a wizard. Everything it opens already exists somewhere in
 * the product — the transactions CSV importer, the contacts bulk upload, the
 * asset document capture — and each of those is reachable from its own screen
 * by someone who knows it's there. What nobody has is the list: five jobs, in
 * an order that saves rework, with the ones already done marked off.
 *
 * So this page owns no import logic. It routes to flows and reports what
 * they've brought in, and the moment a flow is built for a step that currently
 * has none, this page changes by one line in `MIGRATION_STEPS`.
 */
export function MigrationsScreen() {
  const router = useRouter();

  /**
   * One setter per importer, keyed the way `MIGRATION_STEPS` names them, so
   * adding a sixth step is a line in that list plus a line here rather than
   * another branch in `open`.
   */
  const openDialog: Record<MigrationDialogId, (open: boolean) => void> = {
    contacts: useSetAtom(bulkUploadOpenAtom),
    invoices: useSetAtom(invoiceBulkOpenAtom),
    expenses: useSetAtom(expenseBulkOpenAtom),
    assets: useSetAtom(assetBulkOpenAtom),
  };

  /*
   * The counts arrive an effect after mount, like every persisted store here.
   * Gated rather than read through: rendering the un-hydrated empty set would
   * show every step as not-started for a tick, so a returning account would
   * watch four green rows appear a frame after the page drew.
   */
  const hydrated = useMigrationsHydrated();
  const imported = useMigrationsStore((state) => state.imported);

  const countFor = (id: MigrationStepId): number =>
    hydrated ? (imported[id] ?? 0) : 0;

  /**
   * The first step with nothing imported, which is the one to lead with.
   *
   * Only one row is loud at a time. Five identical bars is a list with no
   * opinion, and the whole value of putting these in an order is lost if the
   * page then declines to say where to start.
   */
  const nextStep = MIGRATION_STEPS.find((step) => countFor(step.id) === 0);

  const open = (step: MigrationStep) => {
    if (step.target.kind === "route") {
      router.push(step.target.href);
      return;
    }
    openDialog[step.target.dialog](true);
  };

  return (
    // `isolate` so the wash below resolves against this wrapper rather than
    // climbing to the root stacking context and hiding behind the page bed.
    <div className="relative isolate mx-auto w-full max-w-3xl space-y-6">
      <PageWash />

      {/*
        The hero.

        The gradient is the business card's, token for token — indigo easing
        into the warm accent, money in to money out. It's the mark this product
        uses wherever something needs to read as "your business", and a
        migration centre is exactly that: everything you already have, arriving.

        A wash rather than a fill. At these alphas the heading keeps the normal
        foreground colour and its contrast, which is what lets the same treatment
        work in both themes without a second set of text colours — the tokens
        themselves flip, so nothing here has to.
      */}
      <div className="overflow-hidden rounded-2xl border border-chart-in/15 bg-gradient-to-br from-chart-in/[0.10] via-chart-in/[0.05] to-chart-out/[0.08]">
        {/* The same 1px seam the business card wears along its top edge. */}
        <div
          className="h-px w-full bg-gradient-to-r from-chart-in via-chart-in/60 to-chart-out"
          aria-hidden
        />
        <div className="space-y-1.5 px-6 py-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Data Migration Center
          </h1>
          <p className="text-sm text-muted-foreground">
            Import all your existing data so you&apos;re up and running.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex-row items-start gap-3 space-y-0">
          {/* The one place the gradient is at full strength, so the card is
              tied to the hero above it by a mark rather than by a wash. */}
          <span
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-chart-in to-chart-out text-white"
            aria-hidden
          >
            <Database className="size-5" />
          </span>
          <div className="min-w-0 space-y-1">
            <h2 className="text-base font-semibold">
              Sequential Migration Flow
            </h2>
            <p className="text-sm text-muted-foreground">
              Follow these steps in the recommended order for the cleanest setup
            </p>
          </div>
        </CardHeader>

        <CardContent className="space-y-2" data-usertour="migration-steps">
          {MIGRATION_STEPS.map((step) => (
            <StepRow
              key={step.id}
              step={step}
              count={countFor(step.id)}
              next={step.id === nextStep?.id}
              onOpen={() => open(step)}
            />
          ))}
        </CardContent>
      </Card>

      {/* Said once, under the list, because the numbered badges imply an order
          that has to be obeyed and it doesn't. */}
      <p className="text-center text-xs text-muted-foreground">
        The order is a recommendation, not a rule — start wherever your data is.
      </p>

      {/*
        The four importers, mounted here rather than linked to.

        Each is a dialog driven by its own atom, so it opens wherever it's
        mounted — which means a step runs in place instead of sending someone
        to another screen and leaving them there afterwards. All four are the
        same `BulkImportDialog`; only the spec differs.
      */}
      <BulkUploadDialog />
      <InvoiceBulkUploadDialog />
      <ExpenseBulkUploadDialog />
      <AssetBulkUploadDialog />
    </div>
  );
}

/**
 * One step, in one of three states.
 *
 * Done recedes, next leads, the rest wait. The difference is carried by the
 * badge and the border rather than by size or position — the list has to stay
 * a list, and a row that grew when it became current would make the page jump
 * every time something finished.
 */
function StepRow({
  step,
  count,
  next,
  onOpen,
}: {
  step: MigrationStep;
  /** Items imported so far. Zero means the step hasn't run. */
  count: number;
  /** The first step with nothing imported — the one to do now. */
  next: boolean;
  onOpen: () => void;
}) {
  const done = count > 0;
  const Icon = step.icon;

  return (
    <button
      type="button"
      onClick={onOpen}
      // For the Usertour walkthroughs: which step this is, and where it's up
      // to, so the first-visit tour can wait for someone who hasn't started.
      data-usertour={`migration-step-${step.id}`}
      data-migration-state={done ? "done" : next ? "next" : "todo"}
      aria-label={
        done
          ? `${step.title} — ${count} imported. Import more.`
          : `${step.title} — ${step.description}`
      }
      className={cn(
        "flex w-full items-center gap-3.5 rounded-[14px] border p-4 text-left outline-none",
        "motion-safe:transition-colors motion-safe:duration-150",
        "focus-visible:ring-2 focus-visible:ring-ring",
        done
          ? // Quietest of the three: the work is behind you, and a finished row
            // shouldn't compete with the one still asking. A whisper of the
            // success token and nothing else — no gradient, because a finished
            // job isn't the thing to look at.
            "border-success/20 bg-success/[0.04] hover:bg-success/[0.07]"
          : next
            ? // The only gradient in the list, which is what makes it mean
              // "start here". A stronger border than the rest carries the same
              // message at a glance for anyone the fill is too subtle for.
              //
              // Indigo into violet, both in the brand family — no warm stop.
              // The hero above keeps the indigo-to-warm mark because it's
              // saying "your business, arriving"; a row saying "do this next"
              // is an action, and the warm end read as a status it doesn't
              // have.
              "border-chart-in/35 bg-gradient-to-r from-primary/[0.10] via-primary/[0.06] to-violet-500/[0.08] hover:from-primary/[0.14] hover:via-primary/[0.09] hover:to-violet-500/[0.12]"
            : // Flat and neutral, deliberately. Four highlighted rows would be
              // no highlight at all.
              "border-border bg-card hover:bg-muted/40",
      )}
    >
      {/*
        The number, or a tick once it's done. Same square either way, so the
        rows stay in a column as steps complete rather than shuffling sideways.
      */}
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold tabular",
          done
            ? "bg-success text-success-foreground"
            : next
              ? // Gradient only here, where it reinforces a state — the other
                // badges are flat, so this one reads as the live one. Same
                // indigo-into-violet as the row it sits in.
                "bg-gradient-to-br from-primary to-violet-500 text-white"
              : "bg-muted text-muted-foreground",
        )}
        aria-hidden
      >
        {done ? <Check className="size-4" /> : step.order}
      </span>

      <Icon
        className={cn(
          "size-5 shrink-0",
          done
            ? "text-success"
            : next
              ? "text-chart-in"
              : "text-muted-foreground",
        )}
        aria-hidden
      />

      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">{step.title}</span>
          {next && (
            <Badge
              variant="outline"
              className="shrink-0 rounded-full border-chart-in/25 bg-chart-in/10 px-2 py-0 text-[11px] font-medium text-chart-in"
            >
              Start here
            </Badge>
          )}
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {step.description}
        </span>
      </span>

      {/* The count is the payoff, so it sits where the chevron would and takes
          its place — a done row has nothing left to point at. */}
      {done ? (
        <span className="shrink-0 whitespace-nowrap text-xs font-medium text-success tabular">
          {count} imported
        </span>
      ) : next ? (
        <ArrowRight className="size-4 shrink-0 text-chart-in" aria-hidden />
      ) : (
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
      )}
    </button>
  );
}

/**
 * A faint tint behind the page, in the hero's two colours.
 *
 * The onboarding screens do this with drifting blobs; these don't move. That
 * screen is a moment and can afford weather in the background — this one is a
 * list of jobs someone is working through, and something breathing behind a
 * task list is something to look at instead of the task list.
 *
 * `-z-10` under an `isolate`d parent, and `pointer-events-none` so nothing here
 * can take a click meant for a step.
 */
function PageWash() {
  return (
    <div
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      aria-hidden
    >
      <div className="absolute -left-24 -top-16 size-64 rounded-full bg-chart-in/[0.07] blur-3xl dark:bg-chart-in/[0.10]" />
      <div className="absolute -right-20 top-1/3 size-72 rounded-full bg-chart-out/[0.05] blur-3xl dark:bg-chart-out/[0.08]" />
    </div>
  );
}
