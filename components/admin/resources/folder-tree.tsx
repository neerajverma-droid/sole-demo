"use client";

import * as React from "react";
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  EyeOff,
  Folder,
  FolderOpen,
  FolderPlus,
  Home,
  Loader2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { countFolderFiles, type AdminResourceFolder, type DragItem } from "@/lib/admin/resources";
import { cn } from "@/lib/utils";

import type { DragProps } from "./resources-screen";

/** Marks our own drags, so a file dragged in from the desktop isn't mistaken for a move. */
export const DND_TYPE = "application/x-sole-resource";

const rowBase =
  "group flex cursor-pointer items-center gap-1.5 rounded-md py-1.5 pr-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring";
const rowState = (selected: boolean, over: boolean) =>
  over
    ? "bg-primary/10 ring-2 ring-primary"
    : selected
      ? "bg-primary/10 font-medium text-primary"
      : "text-foreground/80 hover:bg-accent hover:text-foreground";

/** Shared drop-target behaviour for a folder row (or the top level when `targetId` is null). */
export function useDropTarget(drag: DragProps, targetId: number | null) {
  const [over, setOver] = React.useState(false);
  const droppable = drag.item !== null && drag.canDrop(drag.item, targetId);
  return {
    over: over && droppable,
    handlers: {
      onDragOver: (event: React.DragEvent) => {
        if (!droppable) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: (event: React.DragEvent) => {
        setOver(false);
        if (!droppable || !drag.item) return;
        event.preventDefault();
        drag.onMove(drag.item, targetId);
      },
    },
  };
}

export function dragSource(drag: DragProps, item: DragItem) {
  return {
    draggable: true,
    onDragStart: (event: React.DragEvent) => {
      event.dataTransfer.setData(DND_TYPE, item.type);
      event.dataTransfer.effectAllowed = "move";
      drag.setItem(item);
    },
    onDragEnd: () => drag.setItem(null),
  };
}

function TreeRow({
  node,
  depth,
  selectedId,
  onSelect,
  expanded,
  onToggle,
  drag,
  isFolderBusy,
}: {
  node: AdminResourceFolder;
  depth: number;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  expanded: Set<number>;
  onToggle: (id: number) => void;
  drag: DragProps;
  isFolderBusy: (id: number) => boolean;
}) {
  const isOpen = expanded.has(node.id);
  const hasChildren = node.children.length > 0;
  const { over, handlers } = useDropTarget(drag, node.id);
  const dragging = drag.item?.type === "folder" && drag.item.id === node.id;
  const FolderIcon = isOpen && hasChildren ? FolderOpen : Folder;

  return (
    <>
      <div
        role="treeitem"
        tabIndex={0}
        aria-selected={selectedId === node.id}
        aria-expanded={hasChildren ? isOpen : undefined}
        {...dragSource(drag, { type: "folder", id: node.id, parentId: node.parentId })}
        {...handlers}
        onClick={() => onSelect(node.id)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onSelect(node.id);
          if (event.key === "ArrowRight" && hasChildren && !isOpen) onToggle(node.id);
          if (event.key === "ArrowLeft" && isOpen) onToggle(node.id);
        }}
        className={cn(rowBase, rowState(selectedId === node.id, over), dragging && "opacity-40")}
        style={{ paddingLeft: 6 + depth * 16 }}
      >
        <button
          type="button"
          tabIndex={-1}
          aria-label={isOpen ? "Collapse" : "Expand"}
          className={cn(
            "grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-foreground/5",
            !hasChildren && "invisible",
          )}
          onClick={(event) => {
            event.stopPropagation();
            onToggle(node.id);
          }}
        >
          {isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </button>
        <FolderIcon className="size-4 shrink-0" aria-hidden />
        <span className="truncate">{node.name}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5 pl-2">
          {isFolderBusy(node.id) && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
          {!node.isPublished && <EyeOff className="size-3 text-muted-foreground" aria-label="Hidden" />}
          <span className="rounded-full bg-muted px-1.5 text-[11px] font-medium text-muted-foreground tabular">
            {countFolderFiles(node)}
          </span>
        </span>
      </div>
      {isOpen &&
        node.children.map((child) => (
          <TreeRow
            key={child.id}
            node={child}
            depth={depth + 1}
            selectedId={selectedId}
            onSelect={onSelect}
            expanded={expanded}
            onToggle={onToggle}
            drag={drag}
            isFolderBusy={isFolderBusy}
          />
        ))}
    </>
  );
}

function ToolbarButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={label} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function FolderTree({
  tree,
  loading,
  refreshing,
  selectedId,
  onSelect,
  expanded,
  onToggle,
  onExpandAll,
  onCollapseAll,
  onNewFolder,
  drag,
  isFolderBusy,
}: {
  tree: AdminResourceFolder[];
  loading: boolean;
  refreshing: boolean;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  expanded: Set<number>;
  onToggle: (id: number) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onNewFolder: (parentId: number | null) => void;
  drag: DragProps;
  isFolderBusy: (id: number) => boolean;
}) {
  const root = useDropTarget(drag, null);

  return (
    <aside className="flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm lg:sticky lg:top-4 lg:max-h-[calc(100svh-6rem)]">
      <div className="flex items-center gap-1 border-b border-border px-3 py-2 surface-subtle">
        <span className="mr-auto flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Folders
          {refreshing && !loading && <Loader2 className="size-3 animate-spin" />}
        </span>
        <ToolbarButton label="Expand all" onClick={onExpandAll}>
          <ChevronsUpDown />
        </ToolbarButton>
        <ToolbarButton label="Collapse all" onClick={onCollapseAll}>
          <ChevronsDownUp />
        </ToolbarButton>
        <ToolbarButton label="New top-level folder" onClick={() => onNewFolder(null)}>
          <FolderPlus />
        </ToolbarButton>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2" role="tree" aria-label="Resource folders">
        <div
          role="treeitem"
          tabIndex={0}
          aria-selected={selectedId === null}
          {...root.handlers}
          onClick={() => onSelect(null)}
          onKeyDown={(event) => event.key === "Enter" && onSelect(null)}
          className={cn(rowBase, "mb-1 px-2", rowState(selectedId === null, root.over))}
        >
          <Home className="size-4 shrink-0" aria-hidden />
          All resources
        </div>

        {loading ? (
          <div className="space-y-2 p-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        ) : tree.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">No folders yet.</p>
        ) : (
          tree.map((node) => (
            <TreeRow
              key={node.id}
              node={node}
              depth={0}
              selectedId={selectedId}
              onSelect={onSelect}
              expanded={expanded}
              onToggle={onToggle}
              drag={drag}
              isFolderBusy={isFolderBusy}
            />
          ))
        )}
      </div>
      <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
        Drag folders or files onto a folder to move them.
      </p>
    </aside>
  );
}
