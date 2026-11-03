"use client";

import { CircleCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRulesStore } from "@/stores/rules";

/** Reports what the simulated sync matched, per the handoff's success state. */
export function SyncResultDialog() {
  const lastSync = useRulesStore((state) => state.lastSync);
  const setLastSync = useRulesStore((state) => state.setLastSync);
  const clearSyncResult = () => setLastSync(null);

  const matched = lastSync?.matched ?? 0;

  return (
    <Dialog
      open={lastSync !== null}
      onOpenChange={(open) => !open && clearSyncResult()}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader className="items-center text-center">
          <span
            className="grid size-12 place-items-center rounded-full bg-success/10 text-success [&_svg]:size-6"
            aria-hidden
          >
            <CircleCheck />
          </span>
          <DialogTitle>Sync complete</DialogTitle>
        </DialogHeader>

        <p className="text-center text-sm text-muted-foreground">
          <span className="font-medium text-foreground tabular">
            {matched} {matched === 1 ? "transaction" : "transactions"}
          </span>{" "}
          matched {lastSync ? `“${lastSync.ruleName}”` : "your rules"}.
          {matched === 0 && " Nothing needed recategorising."}
        </p>

        <DialogFooter>
          <Button className="w-full" onClick={clearSyncResult}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
