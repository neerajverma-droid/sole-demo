"use client";

import * as React from "react";
import { Check, Folder, FolderInput, Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { filterFolderOptions, flattenFolders, plural, type AdminResourceFile, type AdminResourceFolder } from "@/lib/admin/resources";
import { cn } from "@/lib/utils";

export type MoveFilesDraft = {
  files: AdminResourceFile[];
  /** The folder they're in now, which can't be the destination. */
  fromFolderId: number;
};

/**
 * Pick a folder for the selected files.
 *
 * A list rather than a drag, because the point of moving files in bulk is that
 * the destination may be several levels down a tree that doesn't fit on screen.
 * The search matches the full path ("Small Business / Templates"), so typing any
 * part of where it goes finds it.
 */
export function MoveFilesDialog({
  draft,
  roots,
  onClose,
  onConfirm,
}: {
  draft: MoveFilesDraft | null;
  roots: AdminResourceFolder[];
  onClose: () => void;
  /** Runs the move; the dialog stays open, busy, until it settles. */
  onConfirm: (folderId: number) => Promise<void>;
}) {
  const [target, setTarget] = React.useState<number | null>(null);
  const [search, setSearch] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  // A fresh pick each time it opens.
  React.useEffect(() => {
    if (draft) {
      setTarget(null);
      setSearch("");
    }
  }, [draft]);

  const options = React.useMemo(() => flattenFolders(roots), [roots]);
  const term = search.trim();
  const visible = filterFolderOptions(options, term);

  const confirm = async () => {
    if (target === null || busy) return;
    setBusy(true);
    try {
      await onConfirm(target);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={draft !== null} onOpenChange={(open) => !open && !busy && onClose()}>
      {/* A grid with one auto-sized column would let a long folder path stretch the dialog. */}
      <DialogContent className="grid-cols-[minmax(0,1fr)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderInput className="size-5 text-primary" aria-hidden />
            Move {draft ? plural(draft.files.length, "file") : "files"}
          </DialogTitle>
          <DialogDescription>Choose the folder to move them into.</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search folders"
            aria-label="Search folders"
            className="pl-9"
          />
        </div>

        <div
          role="radiogroup"
          aria-label="Destination folder"
          className="max-h-64 min-w-0 overflow-y-auto rounded-lg border border-border"
        >
          {visible.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">No folders match &ldquo;{search}&rdquo;.</p>
          ) : (
            visible.map((option) => {
              const current = option.id === draft?.fromFolderId;
              const chosen = option.id === target;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={chosen}
                  disabled={current || busy}
                  onClick={() => setTarget(option.id)}
                  // Indent by depth when browsing; the full path stands in for it when searching.
                  style={{ paddingLeft: term ? undefined : `${0.75 + option.depth * 1}rem` }}
                  className={cn(
                    "flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                    "hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent",
                    chosen && "bg-primary/10 font-medium text-primary",
                  )}
                >
                  <Folder className="size-4 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{term ? option.path : option.name}</span>
                  {current && <span className="shrink-0 text-xs text-muted-foreground">Current folder</span>}
                  {chosen && <Check className="size-4 shrink-0" aria-hidden />}
                </button>
              );
            })
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={confirm} disabled={target === null || busy}>
            {busy && <Loader2 className="animate-spin" />}
            {busy ? "Moving…" : draft ? `Move ${plural(draft.files.length, "file")}` : "Move"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
