"use client";

import { Package, Wrench } from "lucide-react";

import type { ItemType } from "@/lib/inventory";

/**
 * A row's identity: the eye can tell a product from a service without reading the
 * badge. Brand tint rather than a per-type colour — type isn't a status.
 */
export function ItemTile({ type }: { type: ItemType }) {
  const Icon = type === "Service" ? Wrench : Package;
  return (
    <span
      className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"
      aria-hidden
    >
      <Icon className="size-4" />
    </span>
  );
}

/** Name over its code, the pattern every catalogue row uses. */
export function ItemIdentity({
  type,
  name,
  code,
  children,
}: {
  type: ItemType;
  name: React.ReactNode;
  code?: React.ReactNode;
  /** Extra secondary line, e.g. a sale description. */
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <ItemTile type={type} />
      <div className="min-w-0">
        <p className="truncate font-medium">{name}</p>
        {code && (
          <p className="truncate text-xs text-muted-foreground tabular">{code}</p>
        )}
        {children}
      </div>
    </div>
  );
}
