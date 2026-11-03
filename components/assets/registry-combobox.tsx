"use client";

import * as React from "react";
import { useSetAtom } from "jotai";
import { Check, ChevronDown, Loader2, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CONTROL_SURFACE_TRIGGER } from "@/components/ui/control-surface";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Required } from "@/components/documents/field";
import { assetRegistryOpenAtom } from "@/lib/atoms";
import { registryMatch } from "@/lib/assets";
import { cn } from "@/lib/utils";

/**
 * A picker over one of the asset registry's lists.
 *
 * The same shape as `ClientCombobox` — searchable, with a create row pinned to
 * the foot of the dropdown — because it's the same job on a simpler record: a
 * list of names rather than contacts. Kept separate rather than generalised
 * over both: the client picker carries an id, a snapshot name, a create dialog
 * and an address block, and none of that survives the trip to a list of
 * strings.
 *
 * Adding happens inline. Typing a make that isn't on the list turns the create
 * row into `Add "Bosch"`, and choosing it writes to the registry and fills the
 * field in one go — the dialog beneath is for tidying the list up afterwards,
 * not for getting a value into this field.
 */
export function RegistryCombobox({
  label,
  value,
  options,
  onChange,
  onCreate,
  placeholder,
  searchPlaceholder,
  emptyHint,
  createLabel,
  error,
  required,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (next: string) => void;
  /** Writes to the registry and resolves to the stored spelling. */
  onCreate: (next: string) => Promise<string>;
  placeholder: string;
  searchPlaceholder: string;
  emptyHint: string;
  /** The create row's resting label, e.g. "Add new brand". */
  createLabel: string;
  error?: string;
  required?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const openRegistry = useSetAtom(assetRegistryOpenAtom);
  const searchRef = React.useRef<HTMLInputElement>(null);

  const needle = query.trim().toLowerCase();
  const matches = needle
    ? options.filter((option) => option.toLowerCase().includes(needle))
    : options;

  const trimmed = query.trim();
  const rowLabel = trimmed ? `Add "${trimmed}"` : createLabel;

  const choose = (next: string) => {
    onChange(next);
    setOpen(false);
    setQuery("");
  };

  const [creating, setCreating] = React.useState(false);
  /*
   * The create row with nothing typed in the search box. Clicking it used to
   * only move focus up to the search field, which — when that field was already
   * focused, as it is on open — changed nothing on screen, so the button read
   * as broken. It now opens a field of its own to type the new name into.
   */
  const [naming, setNaming] = React.useState(false);
  const [name, setName] = React.useState("");

  const create = async (raw: string) => {
    const wanted = raw.trim();
    if (!wanted || creating) return;
    // Typing a name that already exists should select it, not duplicate it.
    const existing = registryMatch(options, wanted);
    if (existing) {
      choose(existing);
      return;
    }
    setCreating(true);
    try {
      choose(await onCreate(wanted));
    } finally {
      setCreating(false);
    }
  };

  const onCreateRowClick = () => {
    if (!trimmed) {
      setNaming(true);
      return;
    }
    void create(trimmed);
  };

  const stopNaming = () => {
    setNaming(false);
    setName("");
  };

  return (
    <div className="space-y-2">
      <Label className="block">
        {label}
        {required && <Required />}
      </Label>

      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setQuery("");
            stopNaming();
          }
        }}
      >
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-invalid={!!error}
            className={cn(
              "w-full justify-between font-normal",
              CONTROL_SURFACE_TRIGGER,
              !value && "text-muted-foreground",
              error && "border-destructive focus-visible:ring-destructive",
            )}
          >
            {value || placeholder}
            <ChevronDown className="size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>

        <PopoverContent
          className="w-[--radix-popover-trigger-width] p-0"
          align="start"
        >
          <Command shouldFilter={false}>
            <CommandInput
              ref={searchRef}
              placeholder={searchPlaceholder}
              value={query}
              onValueChange={(next) => {
                setQuery(next);
                if (next) stopNaming();
              }}
            />
            <CommandList>
              {/*
                A plain row, not CommandEmpty — that gates on cmdk's internal
                filtered count, which we've turned off in favour of our own.
              */}
              {matches.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {emptyHint}
                </p>
              )}
              {matches.length > 0 && (
                <CommandGroup>
                  {matches.map((option) => (
                    <CommandItem
                      key={option}
                      value={option}
                      onSelect={() => choose(option)}
                    >
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {option}
                      </span>
                      {option === value && (
                        <Check className="size-4 shrink-0" />
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>

            {/*
              Outside CommandList so cmdk can never filter it away — the row
              stays put whatever has been typed.
            */}
            {naming && !trimmed ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  // Portalled out of the DOM, not out of the React tree: don't
                  // let this submit reach the asset form wrapped around us.
                  event.stopPropagation();
                  void create(name);
                }}
                className="flex items-center gap-2 border-t border-border p-2.5"
              >
                <input
                  autoFocus
                  value={name}
                  disabled={creating}
                  onChange={(event) => setName(event.target.value)}
                  onKeyDown={(event) => {
                    // The cmdk root listens for Enter and the arrows to pick a
                    // list row; typed in here they belong to this field alone.
                    event.stopPropagation();
                    if (event.key === "Escape") {
                      // Back to the list rather than closing the popover.
                      event.preventDefault();
                      stopNaming();
                    }
                  }}
                  placeholder={`Name the new ${label.toLowerCase()}`}
                  aria-label={`New ${label.toLowerCase()} name`}
                  className="h-8 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={!name.trim() || creating}
                >
                  {creating ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    "Add"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  aria-label="Cancel"
                  disabled={creating}
                  onClick={stopNaming}
                >
                  <X className="size-4" />
                </Button>
              </form>
            ) : (
              <button
                type="button"
                onClick={onCreateRowClick}
                disabled={creating}
                className="flex w-full items-center gap-2.5 border-t border-border p-2.5 text-left outline-none transition-colors hover:bg-accent focus-visible:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span
                  className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10"
                  aria-hidden
                >
                  {creating ? (
                    <Loader2 className="size-4 animate-spin text-primary" />
                  ) : (
                    <Plus className="size-4 text-primary" />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {creating ? "Adding…" : rowLabel}
                </span>
              </button>
            )}
          </Command>
        </PopoverContent>
      </Popover>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {/* For renaming and removing. Adding is the row inside the dropdown —
          this is the way out to the list itself, not the way to fill in the
          field, so it's a quiet link rather than a second button. */}
      <button
        type="button"
        onClick={() => openRegistry(true)}
        className="rounded text-xs text-muted-foreground underline-offset-2 outline-none transition-colors hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      >
        Manage registry
      </button>
    </div>
  );
}
