"use client";

import * as React from "react";
import { Check, ChevronDown, Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { CONTROL_SURFACE_TRIGGER } from "@/components/ui/control-surface";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Required } from "@/components/documents/field";
import { apiErrorMessage } from "@/lib/api-error";
import { createFundApi, fundCreateLabel, fundNameError } from "@/lib/super";
import { cn } from "@/lib/utils";
import { useSuperStore } from "@/stores/super";
import { useFundsQuery } from "@/hooks/use-funds-query";

/**
 * Fund picker reading straight from the super store, modelled on the client
 * combobox so the two read the same way.
 *
 * Funds are only ever made here. There is no funds page and no modal — the
 * dropdown has two faces: the list of saved funds, and a Create New Fund panel
 * that takes its place when there's a fund to add. Cancel goes back to the
 * list, so creating one never costs you the dropdown you were in.
 */
export function FundCombobox({
  fundId,
  fundName,
  onSelect,
  error,
}: {
  fundId: string;
  /** Snapshot name, shown when the fund has since been renamed or removed. */
  fundName: string;
  onSelect: (values: { fundId: string; fundName: string }) => void;
  error?: string;
}) {
  const fundsQuery = useFundsQuery();
  const funds = useSuperStore((state) => state.funds);
  const addFund = useSuperStore((state) => state.addFund);

  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  /** Which face the dropdown is showing. */
  const [creating, setCreating] = React.useState(false);
  const [draftName, setDraftName] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | undefined>();
  const nameRef = React.useRef<HTMLInputElement>(null);

  const selected = funds.find((fund) => fund.id === fundId);
  const triggerLabel = selected?.name ?? fundName ?? "";

  const trimmed = query.trim();
  const matches = trimmed
    ? funds.filter((fund) =>
        fund.name.toLowerCase().includes(trimmed.toLowerCase()),
      )
    : funds;

  const draftTrimmed = draftName.trim();
  /** Reuses the fund rule, so the panel and the rest of Super agree. */
  const nameError = draftTrimmed
    ? fundNameError(draftTrimmed, funds)
    : undefined;
  const canSave = !!draftTrimmed && !nameError && !saving;

  const reset = () => {
    setQuery("");
    setCreating(false);
    setDraftName("");
    setSaveError(undefined);
  };

  const choose = (values: { fundId: string; fundName: string }) => {
    onSelect(values);
    setOpen(false);
    reset();
  };

  /** Opens the panel with whatever was typed already in the field. */
  const startCreating = () => {
    setDraftName(query.trim());
    setCreating(true);
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setSaveError(undefined);
    try {
      const fund = await createFundApi(draftTrimmed);
      addFund(fund);
      choose({ fundId: fund.id, fundName: fund.name });
    } catch (error) {
      setSaveError(apiErrorMessage(error, "Couldn't create that fund. Try again."));
    } finally {
      setSaving(false);
    }
  };

  // The panel's field takes focus as it appears, so a name can be typed
  // straight away rather than after a hunt for the box.
  React.useEffect(() => {
    if (creating) nameRef.current?.focus();
  }, [creating]);

  return (
    <div className="space-y-2">
      <Label className="block" htmlFor="contribution-fund">
        Fund name
        <Required />
      </Label>

      <Popover
        // `modal`: inside a dialog, the dialog's scroll lock swallowed the
        // wheel over this portaled list. A modal popover takes its own lock,
        // which lets the list scroll — in a dialog or out of one.
        modal
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <PopoverTrigger asChild>
          <Button
            id="contribution-fund"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-invalid={!!error}
            className={cn(
              "w-full justify-between font-normal",
              CONTROL_SURFACE_TRIGGER,
              !triggerLabel && "text-muted-foreground",
              error && "border-destructive focus-visible:ring-destructive",
            )}
          >
            {triggerLabel || "Select a fund"}
            <ChevronDown className="size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>

        <PopoverContent
          className="w-[--radix-popover-trigger-width] p-0"
          align="start"
        >
          {creating ? (
            <CreateFundPanel
              inputRef={nameRef}
              name={draftName}
              onNameChange={setDraftName}
              error={nameError ?? saveError}
              canSave={canSave}
              saving={saving}
              onCancel={() => {
                setCreating(false);
                setDraftName("");
                setSaveError(undefined);
              }}
              onSave={save}
            />
          ) : (
            /* Filtering is ours, so cmdk's own is off — otherwise the create
               row would be filtered out along with the list. */
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Search or add fund"
                value={query}
                onValueChange={setQuery}
              />
              <CommandList>
                {fundsQuery.isLoading ? (
                  <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Loading funds…
                  </div>
                ) : (
                  <>
                    {matches.length === 0 && (
                      <p className="py-6 text-center text-sm text-muted-foreground">
                        No funds found
                      </p>
                    )}
                    <CommandGroup>
                      {matches.map((fund) => (
                        <CommandItem
                          key={fund.id}
                          value={fund.id}
                          onSelect={() =>
                            choose({ fundId: fund.id, fundName: fund.name })
                          }
                        >
                          <Check
                            className={cn(
                              "size-4",
                              fund.id === fundId ? "opacity-100" : "opacity-0",
                            )}
                          />
                          {fund.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </>
                )}

                {/*
                  A CommandItem rather than a button below the list: cmdk's
                  arrow navigation reaches it and Enter activates it, which a
                  sibling button can't offer. `onMouseDown` with the default
                  prevented is what makes the pointer path reliable — the
                  press would otherwise pull focus out of the command input
                  and the resulting blur could close the popover before the
                  click ever landed.
                */}
                <CommandGroup className="border-t border-border">
                  <CommandItem
                    value="__create-fund"
                    onSelect={startCreating}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      startCreating();
                    }}
                    className="gap-2.5 p-2.5"
                  >
                    <span
                      className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10"
                      aria-hidden
                    >
                      <Plus className="size-4 text-primary" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {fundCreateLabel(query)}
                    </span>
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          )}
        </PopoverContent>
      </Popover>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/**
 * The Create New Fund card. One field, because a fund is only ever a name here
 * — the ABN, USI and member number a real fund carries have nowhere to be used
 * yet, and asking for them would be asking for work with no payoff.
 */
function CreateFundPanel({
  inputRef,
  name,
  onNameChange,
  error,
  canSave,
  saving,
  onCancel,
  onSave,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  name: string;
  onNameChange: (value: string) => void;
  error?: string;
  canSave: boolean;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <form
      className="space-y-4 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <p className="text-sm font-semibold tracking-tight">Create New Fund</p>

      <div className="space-y-2">
        <Label htmlFor="new-fund-name" className="block">
          Fund Name
        </Label>
        <Input
          id="new-fund-name"
          ref={inputRef}
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="Enter fund name"
          aria-invalid={!!error}
          aria-describedby={error ? "new-fund-name-error" : undefined}
          className={cn(
            error && "border-destructive focus-visible:ring-destructive",
          )}
        />
        {error && (
          <p id="new-fund-name-error" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </Button>
        {/* Faint until there's a name worth saving. */}
        <Button type="submit" size="sm" disabled={!canSave}>
          {saving && <Loader2 className="animate-spin" />}
          Save
        </Button>
      </div>
    </form>
  );
}
