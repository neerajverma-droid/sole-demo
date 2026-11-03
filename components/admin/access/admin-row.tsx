"use client";

import * as React from "react";
import { ChevronDown, ShieldOff } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Highlight } from "@/components/contacts/highlight";
import { StatusPill } from "@/components/admin/shared/status-pill";
import { FeatureChecklist } from "@/components/admin/access/feature-checklist";
import { useSetFeaturesMutation } from "@/hooks/use-admin-users-query";
import { apiErrorMessage } from "@/lib/api-error";
import { formatAdminDate } from "@/lib/admin/format";
import {
  GRANTABLE_FEATURE_KEYS,
  adminDisplayName,
  adminInitials,
  featureLabel,
  grantedCount,
  type AdminUser,
} from "@/lib/admin/admin-users";
import { cn } from "@/lib/utils";

/**
 * One delegated admin: who they are and what they can open, collapsed to a
 * summary line and opened to the checklist.
 *
 * Each tick is saved as it's made, as in the old screen — there's no Save
 * button to forget. A tick only shows once the server has agreed, with a
 * spinner in its place meanwhile, so the list never claims a grant that
 * didn't happen.
 */
export function AdminRow({
  admin,
  search,
  onRevokeAll,
}: {
  admin: AdminUser;
  search: string;
  onRevokeAll: (admin: AdminUser) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState<string[]>([]);
  const setFeatures = useSetFeaturesMutation();

  const name = adminDisplayName(admin);
  const count = grantedCount(admin.features);
  const total = GRANTABLE_FEATURE_KEYS.length;

  const toggle = (keys: string[], grant: boolean) => {
    if (keys.length === 0) return;
    setPending((current) => [...current, ...keys]);
    setFeatures.mutate(
      { userId: admin.id, keys, grant },
      {
        onError: (error) =>
          toast.error(
            apiErrorMessage(error, grant ? "That access couldn't be granted." : "That access couldn't be removed."),
          ),
        onSettled: () => setPending((current) => current.filter((key) => !keys.includes(key))),
      },
    );
  };

  /** The first few grants by name, so the closed row says more than a number. */
  const summary = admin.features
    .filter((key) => GRANTABLE_FEATURE_KEYS.includes(key))
    .slice(0, 3)
    .map(featureLabel)
    .join(", ");

  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <li className="border-b border-border last:border-b-0">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-3 px-4 py-3 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <span
              className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
              aria-hidden
            >
              {adminInitials(admin)}
            </span>

            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                <Highlight text={name} query={search} />
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {name !== admin.email && (
                  <>
                    <Highlight text={admin.email} query={search} />
                    {" · "}
                  </>
                )}
                Added {formatAdminDate(admin.createdAt)}
              </span>
            </span>

            <span className="hidden min-w-0 max-w-xs truncate text-xs text-muted-foreground lg:block">
              {summary}
              {count > 3 && ` +${count - 3} more`}
            </span>

            <StatusPill
              label={count === 0 ? "No access" : `${count} of ${total} sections`}
              tone={count === 0 ? "warning" : "info"}
            />

            <ChevronDown
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform duration-150",
                open && "rotate-180",
              )}
              aria-hidden
            />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="space-y-4 border-t border-border bg-muted/20 px-4 py-4">
            <FeatureChecklist
              idPrefix={`admin-${admin.id}`}
              value={admin.features}
              pending={pending}
              onChange={toggle}
            />
            <div className="flex justify-end border-t border-border pt-4">
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => onRevokeAll(admin)}
                disabled={count === 0 || pending.length > 0}
                title={count === 0 ? "This admin has no access to remove." : undefined}
              >
                <ShieldOff />
                Remove all access
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </li>
    </Collapsible>
  );
}
