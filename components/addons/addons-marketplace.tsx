"use client";

import * as React from "react";
import { useAtom, useSetAtom } from "jotai";
import { Check, Search } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AddonCartBar } from "@/components/addons/addon-cart-bar";
import { AddonOverview } from "@/components/addons/addon-overview";
import { selectedAddonsAtom, toggleSelectedAddonAtom } from "@/lib/atoms";
import { addonsByGroup, type Addon } from "@/lib/addons";
import { cn } from "@/lib/utils";
import { useAddons } from "@/hooks/use-addons";
import { RemoveAddonDialog } from "@/components/addons/remove-addon-dialog";
import { addonMonthlyPrice } from "@/lib/addon-entitlements";


export function AddonsMarketplace({
  selected,
  onSelect,
}: {
  selected: Addon;
  onSelect: (id: string) => void;
}) {
  const {
    activeIds: added,
    remove: removeAddon,
    busy,
    catalogue,
    subscription,
  } = useAddons();
 
  const [cart] = useAtom(selectedAddonsAtom);
  const toggleSelected = useSetAtom(toggleSelectedAddonAtom);
  const [query, setQuery] = React.useState("");

  const groups = addonsByGroup(query);

  const toggle = (addon: Addon) => toggleSelected(addon.id);
  const [removing, setRemoving] = React.useState<Addon | null>(null);

  const confirmRemove = async () => {
    const addon = removing;
    if (!addon) return;

    try {
      await removeAddon(addon.id);
      setRemoving(null);
      toast(`${addon.name} removed`, {
        description:
          "It's off your plan from the next invoice. You can add it back any time.",
      });
    } catch (error) {
      toast.error("Couldn't remove that", {
        description:
          error instanceof Error
            ? error.message
            : "Your plan hasn't changed. Try again in a moment.",
      });
    }
  };

  const remove = (addon: Addon) => setRemoving(addon);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="grid min-h-0 flex-1 overflow-hidden md:grid-cols-[17rem_minmax(0,1fr)]">
        <div className="flex min-h-0 flex-col gap-3  border-b p-4 md:border-b-0 md:border-r">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search add-ons"
              aria-label="Search add-ons"
              className="h-9 pl-9"
            />
          </div>

          <div className="md:hidden">
            <Select value={selected.id} onValueChange={onSelect}>
              <SelectTrigger aria-label="Choose an add-on">
                <SelectValue placeholder="Choose an add-on" />
              </SelectTrigger>
              <SelectContent>
                {groups.map((entry) => (
                  <SelectGroup key={entry.group.key}>
                    <SelectLabel>{entry.group.label}</SelectLabel>
                    {entry.addons.map((addon) => (
                      <SelectItem key={addon.id} value={addon.id}>
                        {addon.name}
                        {added.includes(addon.id) ? " · Added" : ""}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="hidden min-h-0 flex-1 overflow-y-auto md:block">
            {groups.length === 0 ? (
              <p className="px-1 py-6 text-center text-sm text-muted-foreground">
                No add-on matches that.
              </p>
            ) : (
              <div className="space-y-2">
                {groups.map((entry) => (
                  <div key={entry.group.key} className="space-y-1">
                    <p className=" pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {entry.group.label}
                    </p>
                    <ul className="space-y-1">
                      {entry.addons.map((addon) => (
                        <li key={addon.id}>
                          <RailRow
                            addon={addon}
                            price={addonMonthlyPrice(
                              addon,
                              catalogue,
                              subscription?.planInterval ?? "monthly",
                            )}
                            active={addon.id === selected.id}
                            added={added.includes(addon.id)}
                            inCart={cart.includes(addon.id)}
                            onSelect={() => onSelect(addon.id)}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex min-h-0 flex-col ">
          <AddonOverview
            key={selected.id}
            addon={selected}
            added={added.includes(selected.id)}
            selected={cart.includes(selected.id)}
            onToggleSelect={() => toggle(selected)}
            onRemove={() => remove(selected)}
          />
        </div>
      </div>

      {/* Spans both columns, pinned under them. Renders nothing on an empty
          cart — see `AddonCartBar`. */}
      <AddonCartBar />

      <RemoveAddonDialog
        addon={removing}
        busy={busy}
        onConfirm={() => void confirmRemove()}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}

function RailRow({
  addon,
  price,
  active,
  added,
  inCart,
  onSelect,
}: {
  addon: Addon;
  /** From the price list, not the card — see `addonMonthlyPrice`. */
  price: number;
  active: boolean;
  added: boolean;
  /** Chosen but not paid for. Only ever true while `added` is false. */
  inCart: boolean;
  onSelect: () => void;
}) {
  const Icon = addon.icon;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-lg p-2.5 text-left outline-none",
        "motion-safe:transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-primary/[0.07] ring-1 ring-inset ring-primary/25"
          : "hover:bg-accent/60",
      )}
    >
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-md",
          active
            ? "bg-primary/15 text-primary"
            : "bg-muted text-muted-foreground",
        )}
        aria-hidden
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              "truncate text-sm",
              active ? "font-semibold" : "font-medium",
            )}
          >
            {addon.name}
          </span>
          {/* On the plan, or in the cart — never both, and the rail is where
              someone checks what they've ticked without opening each one. */}
          {added ? (
            <Badge
              variant="success"
              className="shrink-0 gap-0.5 px-1.5 py-0 text-[10px]"
            >
              <Check className="size-2.5" aria-hidden />
              Added
            </Badge>
          ) : (
            inCart && (
              <Badge
                variant="outline"
                className="shrink-0 gap-0.5 border-transparent bg-primary/10 px-1.5 py-0 text-[10px] font-medium text-primary"
              >
                <Check className="size-2.5" aria-hidden />
                Selected
              </Badge>
            )
          )}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {addon.subtext}
        </span>
      </span>
      <span className="shrink-0 text-xs text-muted-foreground tabular">
        ${price}
        {addon.priceUnit ? `/${addon.priceUnit}` : ""}
      </span>
    </button>
  );
}
