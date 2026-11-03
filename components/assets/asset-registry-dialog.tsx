"use client";

import * as React from "react";
import { useAtom } from "jotai";
import { Loader2, Package, Plus, Tag, type LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { assetRegistryOpenAtom } from "@/lib/atoms";
import { registryMatch } from "@/lib/assets";
import {
  useAssetRegistryQuery,
  useCreateAssetBrandMutation,
  useCreateAssetTypeMutation,
} from "@/hooks/use-asset-registry-query";
import { useAssetRegistryStore } from "@/stores/asset-registry";
import { useAssetsStore } from "@/stores/assets";
import { cn } from "@/lib/utils";

/** One row's worth of padding, shared so every row in a card sits on the same grid. */
const ROW = "px-4 py-2.5";

/**
 * The asset registry: the two lists every asset picks its make and type from.
 *
 * Management only. Adding a value while filling the form happens in the
 * dropdown itself — coming here to add one, then going back to choose it, is
 * the round trip the inline create row exists to remove. What's left is the
 * work that has nowhere else to live: fixing a spelling, and clearing out an
 * entry nobody uses.
 *
 * Each row says how many assets are on it, because that's the question a rename
 * or a delete turns on. Neither touches those assets: an asset records the make
 * it was bought as, and a list edit is a change to what gets *offered* next
 * time, not a rewrite of the register.
 *
 * Two self-contained cards rather than two labelled lists in one pane. The lists
 * are independent — a make has nothing to do with a type, and you come here to
 * fix one of them — so each carries its own header, its own count and its own
 * way in, and the eye can stop at whichever one it came for.
 */
export function AssetRegistryDialog() {
  const [open, setOpen] = useAtom(assetRegistryOpenAtom);
  useAssetRegistryQuery();
  const assets = useAssetsStore((state) => state.assets);
  const brands = useAssetRegistryStore((state) => state.brands);
  const types = useAssetRegistryStore((state) => state.types);
  const createBrand = useCreateAssetBrandMutation();
  const createType = useCreateAssetTypeMutation();

  const countBy = (field: "brand" | "assetType", value: string) =>
    assets.filter((asset) => asset[field].toLowerCase() === value.toLowerCase())
      .length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/*
        Wide enough that a name, its usage pill and its two actions sit on one
        line without crowding, and no wider: two stacked lists of short strings
        in a 5xl modal would be a room with the furniture pushed to the walls.

        A flex column with a fixed header over a scrolling body, as every other
        modal in the product — so the title stays put while a long list moves.
      */}
      <DialogContent className="flex max-h-[85svh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 space-y-1.5 border-b p-5 pr-14 text-left">
          <DialogTitle className="text-lg">Asset registry</DialogTitle>
          <DialogDescription>
            The makes and asset types the new asset form offers. Renaming and
            removing aren&apos;t supported yet — add what&apos;s missing here,
            or from the form itself.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <RegistrySection
            icon={Tag}
            title="Makes / brands"
            noun="brand"
            addPlaceholder="Add a brand…"
            emptyLabel="No brands yet. Add one above."
            values={brands}
            countFor={(value) => countBy("brand", value)}
            onAdd={createBrand}
          />
          <RegistrySection
            icon={Package}
            title="Asset types"
            noun="asset type"
            addPlaceholder="Add an asset type…"
            emptyLabel="No asset types yet. Add one above."
            values={types}
            countFor={(value) => countBy("assetType", value)}
            onAdd={createType}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RegistrySection({
  icon: Icon,
  title,
  noun,
  addPlaceholder,
  emptyLabel,
  values,
  countFor,
  onAdd,
}: {
  icon: LucideIcon;
  title: string;
  /** Names the thing in every message this list writes. */
  noun: string;
  /** Written out rather than built from the noun: "a brand", "an asset type". */
  addPlaceholder: string;
  emptyLabel: string;
  values: string[];
  countFor: (value: string) => number;
  /** Add-or-find: resolves to the existing spelling if `name` is already listed. */
  onAdd: (name: string) => Promise<string>;
}) {
  const add = async (name: string) => {
    if (registryMatch(values, name)) {
      toast.error(`${name} is already on the list`);
      return false;
    }
    try {
      await onAdd(name);
      toast.success(`${name} added`);
      return true;
    } catch {
      toast.error(`Couldn't add ${name}`);
      return false;
    }
  };

  return (
    <section className="overflow-hidden rounded-xl border border-border">
      {/* Header ---------------------------------------------------------- */}
      <div
        className={cn(
          "flex items-center gap-2.5 border-b border-border/60 px-4 py-3",
          "surface-subtle",
        )}
      >
        <span
          className="grid size-7 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"
          aria-hidden
        >
          <Icon className="size-3.5" />
        </span>
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">
          {title}
        </h3>
        {/* A bare number reads as a count beside a heading. The suffix is for
            anyone hearing it rather than seeing it, where "Makes / brands, six"
            needs the noun to land. */}
        <span className="shrink-0 text-xs text-muted-foreground tabular">
          {values.length}
          <span className="sr-only"> on this list</span>
        </span>
      </div>

      <AddRow placeholder={addPlaceholder} noun={noun} onAdd={add} />

      {/* Rows ------------------------------------------------------------ */}
      {values.length === 0 ? (
        <p className={cn(ROW, "text-center text-xs text-muted-foreground")}>
          {emptyLabel}
        </p>
      ) : (
        <ul className="divide-y divide-border/60">
          {values.map((value) => (
            <li
              key={value}
              className={cn(ROW, "flex items-center gap-3")}
            >
              <span className="min-w-0 flex-1 truncate text-sm">{value}</span>
              <InUsePill count={countFor(value)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The way in, at the top of the list where what it adds will land.
 *
 * A real form, so Enter submits the way Enter submits anywhere — the old row
 * was an Input beside a Button with a keydown handler standing in for the
 * submit a form would have given it for nothing.
 *
 * The field is bare rather than an `Input`: this is meant to read as one more
 * row until someone puts a caret in it, and a bordered box in the first slot of
 * a list of borderless rows announces itself as a form instead.
 */
function AddRow({
  placeholder,
  noun,
  onAdd,
}: {
  placeholder: string;
  noun: string;
  /** Resolves true when the value was taken, which is when the field should clear. */
  onAdd: (name: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const trimmed = draft.trim();

  const submit = async () => {
    if (!trimmed || adding) return;
    setAdding(true);
    try {
      if (await onAdd(trimmed)) setDraft("");
    } finally {
      setAdding(false);
    }
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        // The dialog is portalled out of the DOM but not out of the React tree,
        // so without this a submit here would still reach any form the caller
        // happens to have wrapped it in.
        event.stopPropagation();
        void submit();
      }}
      className={cn(
        ROW,
        // cursor-text over the whole row, because the row *is* the field — the
        // padding either side of the input is part of the target it looks like.
        "flex cursor-text items-center gap-3 border-b border-border/60",
        "motion-safe:transition-colors focus-within:bg-accent/40",
      )}
    >
      <button
        type="submit"
        disabled={!trimmed || adding}
        aria-label={adding ? `Adding ${noun}…` : `Add ${noun}`}
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded outline-none",
          "motion-safe:transition-colors focus-visible:ring-2 focus-visible:ring-ring",
          trimmed
            ? "cursor-pointer bg-primary text-primary-foreground"
            : "border border-dashed border-border text-muted-foreground",
        )}
      >
        {adding ? (
          <Loader2 className="size-3 animate-spin" aria-hidden />
        ) : (
          <Plus className="size-3" aria-hidden />
        )}
      </button>
      <input
        value={draft}
        disabled={adding}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          // Escape clears rather than closing the dialog out from under a
          // half-typed name.
          if (event.key === "Escape" && draft) {
            event.preventDefault();
            event.stopPropagation();
            setDraft("");
          }
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
      />
    </form>
  );
}

/**
 * How many assets are on this entry — the fact a rename or a delete turns on, so
 * it reads as a value rather than as a caption.
 *
 * Tinted while it's load-bearing and neutral at zero: nothing is on this one, so
 * nothing about it needs weight. Same pill either way, because a count that
 * changed shape at zero would read as two different facts.
 */
function InUsePill({ count }: { count: number }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "shrink-0 rounded-full px-2 py-0 text-[11px] font-medium tabular",
        count > 0
          ? "border-primary/20 bg-primary/10 text-primary"
          : "border-border bg-muted text-muted-foreground",
      )}
    >
      {count} in use
    </Badge>
  );
}
