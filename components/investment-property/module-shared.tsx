"use client";

import * as React from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { Loader2, MoreHorizontal } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyActions, EmptyDescription, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Shimmer } from "@/components/ui/shimmer";
import { MoneyInput } from "@/components/planner/money-input";
import { useCountryContext } from "@/hooks/use-country-context";
import { apiErrorMessage } from "@/lib/api-error";
import { formatCountryMoney } from "@/lib/country-context";
import type { PropertyStatus } from "@/lib/investment-property";
import { cn } from "@/lib/utils";

export function useRetained<T>(value: T | null): T | null {
  const ref = React.useRef<T | null>(value);
  if (value !== null) ref.current = value;
  return value ?? ref.current;
}

export function ModuleCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-4 rounded-lg border border-border bg-card p-5 shadow-sm", className)}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
      </header>
      {children}
    </section>
  );
}

export function ModuleEmpty({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <Empty className="border-0 py-10 shadow-none">
      <EmptyMedia>{icon}</EmptyMedia>
      <div className="space-y-1">
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </div>
      {action && <EmptyActions>{action}</EmptyActions>}
    </Empty>
  );
}

export function Loadable<T>({
  query,
  skeletonClassName = "h-40",
  children,
}: {
  query: UseQueryResult<T>;
  skeletonClassName?: string;
  children: (data: T) => React.ReactNode;
}) {
  if (query.data !== undefined) {
    return (
      <div
        aria-busy={query.isPlaceholderData}
        className={cn(query.isPlaceholderData && "opacity-60 transition-opacity")}
      >
        {children(query.data)}
      </div>
    );
  }

  if (query.isError) {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm"
      >
        <span className="text-destructive">
          {apiErrorMessage(query.error, "Couldn't load this section.")}
        </span>
        <Button variant="outline" size="sm" onClick={() => query.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  return <Shimmer className={cn("w-full rounded-md", skeletonClassName)} />;
}

export function ConfirmDeleteDialog({
  open,
  title,
  description,
  confirmLabel,
  pending,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const shownDescription = useRetained(description || null);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{shownDescription ?? description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={pending}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            {pending && <Loader2 className="animate-spin" />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  pending,
  onSubmit,
  size = "md",
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  submitLabel: string;
  pending: boolean;
  onSubmit: () => void;
  size?: "sm" | "md" | "lg";
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className={cn(size === "sm" && "max-w-md", size === "md" && "max-w-xl", size === "lg" && "max-w-2xl")}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
          noValidate
        >
          <div className="max-h-[60vh] space-y-4 overflow-y-auto px-1 py-1">{children}</div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RowMenu({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" aria-label={label}>
          <MoreHorizontal className="size-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function useFieldErrors<K extends string>(issues: { key: K; message: string }[]) {
  const [attempted, setAttempted] = React.useState(false);
  const [touched, setTouched] = React.useState<Partial<Record<K, boolean>>>({});

  const error = (key: K): string | undefined =>
    attempted || touched[key] ? issues.find((issue) => issue.key === key)?.message : undefined;
  const touch = (...keys: K[]) =>
    setTouched((current) => ({ ...current, ...Object.fromEntries(keys.map((key) => [key, true])) }));
  const attempt = (): boolean => {
    setAttempted(true);
    return issues.length === 0;
  };

  return { error, touch, attempt };
}

export function invalidClass(message: string | undefined): string {
  return message ? "border-destructive focus-visible:ring-destructive" : "";
}

export function PropertyStatusBadge({ status }: { status: PropertyStatus }) {
  return (
    <Badge variant={status === "active" ? "success" : "secondary"} className="capitalize">
      {status}
    </Badge>
  );
}

export function usePropertyMoney(): (value: number) => string {
  const { country } = useCountryContext();
  return React.useCallback((value: number) => formatCountryMoney(country, value), [country]);
}

export function useCurrencySymbol(): string {
  const { country } = useCountryContext();
  return React.useMemo(() => {
    try {
      const parts = new Intl.NumberFormat(country.locale || "en-AU", {
        style: "currency",
        currency: country.currency || "AUD",
        currencyDisplay: "narrowSymbol",
      }).formatToParts(0);
      return parts.find((part) => part.type === "currency")?.value ?? "$";
    } catch {
      return "$";
    }
  }, [country.locale, country.currency]);
}

export function PropertyMoneyInput(props: Omit<React.ComponentProps<typeof MoneyInput>, "prefix">) {
  const symbol = useCurrencySymbol();
  return <MoneyInput {...props} prefix={symbol} />;
}
