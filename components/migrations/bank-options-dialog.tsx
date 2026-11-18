"use client";

import { useRouter } from "next/navigation";
import { useSetAtom } from "jotai";
import { ChevronRight, CloudUpload, Plus } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { connectBankIntroOpenAtom } from "@/lib/atoms";

/**
 * "How do you want to bring your bank transactions across?"
 *
 * The old migration page asked this before anything else on the Bank
 * Transactions step: connect a bank feed (recommended) or upload a file. Both
 * paths already exist here — the connect flow is mounted globally with the top
 * bar and opens from `connectBankIntroOpenAtom`, and the file importer is the
 * wizard at /transactions/bulk — so this is only the fork between them.
 *
 * Connecting goes through the consent explainer, as every other "add bank
 * account" entry point does.
 */
export function BankOptionsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const openConnectIntro = useSetAtom(connectBankIntroOpenAtom);

  const connect = () => {
    onOpenChange(false);
    openConnectIntro(true);
  };

  const upload = () => {
    onOpenChange(false);
    router.push("/transactions/bulk?from=migrations");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 sm:max-w-lg">
        <DialogHeader className="items-center text-center sm:text-center">
          <span
            className="mb-2 grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-chart-in to-chart-out text-white"
            aria-hidden
          >
            <CloudUpload className="size-7" />
          </span>
          <DialogTitle className="text-xl">Bank Transaction Setup</DialogTitle>
          <DialogDescription>
            Choose how you want to handle your bank transactions
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <OptionRow
            icon={Plus}
            title="Connect Bank Account"
            description="Automatically sync transactions from your bank (Recommended)"
            onClick={connect}
            data-usertour="migration-bank-connect"
          />
          <OptionRow
            icon={CloudUpload}
            title="Upload Transaction File"
            description="Import transactions from Excel or CSV file"
            onClick={upload}
            data-usertour="migration-bank-upload"
          />
        </div>

        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function OptionRow({
  icon: Icon,
  title,
  description,
  onClick,
  ...rest
}: {
  icon: typeof Plus;
  title: string;
  description: string;
  onClick: () => void;
  "data-usertour"?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-4 rounded-[14px] border border-border bg-card p-4 text-left outline-none motion-safe:transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
      {...rest}
    >
      <span
        className="grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-violet-500 text-white"
        aria-hidden
      >
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {description}
        </span>
      </span>
      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden
      />
    </button>
  );
}
