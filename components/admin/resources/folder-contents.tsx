"use client";

import * as React from "react";
import {
  ChevronRight,
  Eye,
  EyeOff,
  File as FileIcon,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderInput,
  FolderPlus,
  Inbox,
  Loader2,
  MoreHorizontal,
  Pencil,
  Presentation,
  Search,
  SearchX,
  Trash2,
  UploadCloud,
  X,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyActions, EmptyDescription, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StatusPill } from "@/components/admin/shared/status-pill";
import { formatAdminDate } from "@/lib/admin/format";
import {
  UPLOAD_HINT,
  countFolderFiles,
  folderSize,
  formatResourceSize,
  plural,
  type AdminResourceFile,
  type AdminResourceFolder,
} from "@/lib/admin/resources";
import { cn } from "@/lib/utils";

import { dragSource, useDropTarget } from "./folder-tree";
import type { DragProps, UploadState } from "./resources-screen";

const FILE_ICONS: Record<string, LucideIcon> = {
  pdf: FileText,
  doc: FileText,
  docx: FileText,
  txt: FileText,
  xls: FileSpreadsheet,
  xlsx: FileSpreadsheet,
  csv: FileSpreadsheet,
  ppt: Presentation,
  pptx: Presentation,
  zip: FileArchive,
  png: FileImage,
  jpg: FileImage,
  jpeg: FileImage,
  webp: FileImage,
};

const iconFor = (ext: string | null) => FILE_ICONS[(ext ?? "").toLowerCase()] ?? FileIcon;

const PUBLISHED_PILL = { label: "Published", tone: "success" } as const;
const HIDDEN_PILL = { label: "Hidden", tone: "neutral" } as const;

function SubfolderCard({
  folder,
  onOpen,
  drag,
  busy,
}: {
  folder: AdminResourceFolder;
  onOpen: (id: number) => void;
  drag: DragProps;
  busy: boolean;
}) {
  const { over, handlers } = useDropTarget(drag, folder.id);
  const dragging = drag.item?.type === "folder" && drag.item.id === folder.id;
  const files = countFolderFiles(folder);

  return (
    <div
      role="button"
      tabIndex={0}
      {...dragSource(drag, { type: "folder", id: folder.id, parentId: folder.parentId })}
      {...handlers}
      onClick={() => onOpen(folder.id)}
      onKeyDown={(event) => event.key === "Enter" && onOpen(folder.id)}
      className={cn(
        "group flex cursor-pointer items-center gap-3 rounded-lg border bg-card p-3 text-left shadow-sm outline-none transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring",
        over ? "border-primary bg-primary/5 ring-2 ring-primary" : "border-border",
        dragging && "opacity-40",
      )}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Folder className="size-5" aria-hidden />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{folder.name}</span>
          {!folder.isPublished && <StatusPill {...HIDDEN_PILL} />}
        </span>
        <span className="block text-xs text-muted-foreground tabular">
          {plural(files, "file")}
          {folder.children.length > 0 && ` · ${plural(folder.children.length, "subfolder")}`}
        </span>
      </span>
      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
        aria-hidden
      />
    </div>
  );
}

function FileActionButton({
  label,
  onClick,
  disabled,
  destructive,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
          className={cn("size-8 text-muted-foreground", destructive && "hover:bg-destructive/10 hover:text-destructive")}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function FileRow({
  file,
  checked,
  onCheck,
  busy,
  drag,
  onToggle,
  onRename,
  onDelete,
}: {
  file: AdminResourceFile;
  checked: boolean;
  onCheck: () => void;
  busy: boolean;
  drag: DragProps;
  onToggle: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const Icon = iconFor(file.extension);
  const dragging = drag.item?.type === "file" && drag.item.id === file.id;

  return (
    <li
      {...dragSource(drag, { type: "file", id: file.id, folderId: file.folderId })}
      className={cn(
        "group flex items-center gap-3 px-4 py-2.5 transition-colors",
        checked ? "bg-primary/5" : "hover:bg-muted/50",
        (busy || dragging) && "opacity-50",
      )}
    >
      <Checkbox checked={checked} onCheckedChange={onCheck} aria-label={`Select ${file.name}`} />
      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" aria-hidden />}
      </span>
      <div className="min-w-0 flex-1">
        <a
          href={file.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate text-sm font-medium hover:text-primary hover:underline"
        >
          {file.name}
        </a>
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground tabular">
          {file.extension && <span className="font-medium uppercase">{file.extension}</span>}
          <span>{formatResourceSize(file.size)}</span>
          {file.createdAt && <span>{formatAdminDate(file.createdAt)}</span>}
          {!file.isPublished && <StatusPill {...HIDDEN_PILL} />}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-0.5 sm:opacity-0 sm:transition-opacity sm:focus-within:opacity-100 sm:group-hover:opacity-100">
        <FileActionButton label={file.isPublished ? "Hide from public" : "Publish"} disabled={busy} onClick={onToggle}>
          {file.isPublished ? <Eye /> : <EyeOff />}
        </FileActionButton>
        <FileActionButton label="Rename" disabled={busy} onClick={onRename}>
          <Pencil />
        </FileActionButton>
        <FileActionButton label="Delete" disabled={busy} onClick={onDelete} destructive>
          <Trash2 />
        </FileActionButton>
      </div>
    </li>
  );
}

function UploadProgress({ uploads, onDismiss }: { uploads: UploadState[]; onDismiss: () => void }) {
  const uploading = uploads.some((u) => !u.error && u.progress < 100);
  return (
    <div className="space-y-2 border-b border-border p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-medium">
          {uploading && <Loader2 className="size-3.5 animate-spin" />}
          {uploading ? "Uploading…" : "Some files didn't upload"}
        </span>
        {!uploading && (
          <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
            Dismiss
          </Button>
        )}
      </div>
      <ul className="space-y-2">
        {uploads.map((u, i) => (
          <li key={`${u.name}-${i}`} className="space-y-1 text-sm">
            <div className="flex justify-between gap-3">
              <span className="truncate">{u.name}</span>
              <span className={cn("shrink-0 tabular", u.error ? "text-destructive" : "text-muted-foreground")}>
                {u.error ?? `${u.progress}%`}
              </span>
            </div>
            {!u.error && <Progress value={u.progress} className="h-1.5" />}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FolderContents({
  node,
  roots,
  path,
  onSelect,
  isFilePending,
  isFolderBusy,
  onNewFolder,
  onRenameFolder,
  onToggleFolder,
  onDeleteFolder,
  onUploadFiles,
  uploads,
  onClearUploads,
  onToggleFile,
  onRenameFile,
  onDeleteFile,
  onBulkPublish,
  onBulkMove,
  onBulkDelete,
  drag,
}: {
  /** null = the "All resources" top level. */
  node: AdminResourceFolder | null;
  roots: AdminResourceFolder[];
  path: AdminResourceFolder[];
  onSelect: (id: number | null) => void;
  isFilePending: (id: number) => boolean;
  isFolderBusy: (id: number) => boolean;
  onNewFolder: (parentId: number | null) => void;
  onRenameFolder: (folder: AdminResourceFolder) => void;
  onToggleFolder: (folder: AdminResourceFolder) => void;
  onDeleteFolder: (folder: AdminResourceFolder) => void;
  onUploadFiles: (files: FileList | File[] | null) => void;
  uploads: UploadState[];
  onClearUploads: () => void;
  onToggleFile: (file: AdminResourceFile) => void;
  onRenameFile: (file: AdminResourceFile) => void;
  onDeleteFile: (file: AdminResourceFile) => void;
  onBulkPublish: (files: AdminResourceFile[], publish: boolean) => void;
  onBulkMove: (files: AdminResourceFile[]) => void;
  onBulkDelete: (files: AdminResourceFile[]) => void;
  drag: DragProps;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dropActive, setDropActive] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState<Set<number>>(new Set());

  const folders = node ? node.children : roots;
  const files = React.useMemo(() => node?.files ?? [], [node]);

  // Selection and search belong to one folder; reset when you open another.
  React.useEffect(() => {
    setSelected(new Set());
    setQuery("");
  }, [node?.id]);

  const term = query.trim().toLowerCase();
  const visibleFiles = term ? files.filter((f) => f.name.toLowerCase().includes(term)) : files;
  const chosen = files.filter((f) => selected.has(f.id));
  const allVisibleChosen = visibleFiles.length > 0 && visibleFiles.every((f) => selected.has(f.id));
  const folderBusy = node ? isFolderBusy(node.id) : false;
  const browse = () => inputRef.current?.click();

  const toggleOne = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const isOsFileDrag = (event: React.DragEvent) => Array.from(event.dataTransfer.types).includes("Files");

  return (
    <section className="min-w-0 space-y-5">
      {/* Header: breadcrumbs, title, stats, actions */}
      <Card className="p-4 sm:p-5">
        <nav aria-label="Breadcrumb" className="mb-2 flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="rounded px-1 hover:bg-accent hover:text-foreground"
          >
            All resources
          </button>
          {path.map((crumb, i) => (
            <span key={crumb.id} className="flex items-center gap-1">
              <ChevronRight className="size-3.5" aria-hidden />
              <button
                type="button"
                onClick={() => onSelect(crumb.id)}
                aria-current={i === path.length - 1 ? "page" : undefined}
                className={cn(
                  "rounded px-1 hover:bg-accent hover:text-foreground",
                  i === path.length - 1 && "font-medium text-foreground",
                )}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </nav>

        <div className="flex flex-wrap items-center gap-3">
          <div className="mr-auto min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-lg font-semibold tracking-tight">{node ? node.name : "All resources"}</h2>
              {node && <StatusPill {...(node.isPublished ? PUBLISHED_PILL : HIDDEN_PILL)} />}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground tabular">
              {node
                ? `${plural(files.length, "file")} here · ${countFolderFiles(node)} in total · ${formatResourceSize(folderSize(node))}`
                : `${plural(roots.length, "folder")} · ${plural(
                    roots.reduce((n, r) => n + countFolderFiles(r), 0),
                    "file",
                  )}`}
            </p>
          </div>

          {node && (
            <Button type="button" onClick={browse} disabled={folderBusy}>
              <UploadCloud />
              Upload
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => onNewFolder(node ? node.id : null)}>
            <FolderPlus />
            {node ? "New subfolder" : "New folder"}
          </Button>

          {node && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="icon" aria-label="Folder actions" disabled={folderBusy}>
                  {folderBusy ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onSelect={() => onRenameFolder(node)}>
                  <Pencil />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onToggleFolder(node)}>
                  {node.isPublished ? <EyeOff /> : <Eye />}
                  {node.isPublished ? "Hide from public" : "Publish"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => onDeleteFolder(node)}
                  className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                >
                  <Trash2 />
                  Delete folder
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(event) => {
            onUploadFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </Card>

      {/* Subfolders */}
      {folders.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {node ? "Subfolders" : "Folders"}
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {folders.map((folder) => (
              <SubfolderCard
                key={folder.id}
                folder={folder}
                onOpen={onSelect}
                drag={drag}
                busy={isFolderBusy(folder.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Top level with nothing yet */}
      {!node && folders.length === 0 && (
        <Empty className="border-dashed">
          <EmptyMedia>
            <Inbox />
          </EmptyMedia>
          <EmptyTitle>No folders yet</EmptyTitle>
          <EmptyDescription>
            Create a folder, then drop files into it. Anything published shows on the public Resources page.
          </EmptyDescription>
          <EmptyActions>
            <Button onClick={() => onNewFolder(null)}>
              <FolderPlus />
              Create your first folder
            </Button>
          </EmptyActions>
        </Empty>
      )}

      {/* Files */}
      {node && (
        <Card
          onDragOver={(event) => {
            if (!isOsFileDrag(event)) return;
            event.preventDefault();
            setDropActive(true);
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropActive(false);
          }}
          onDrop={(event) => {
            if (!isOsFileDrag(event)) return;
            event.preventDefault();
            setDropActive(false);
            onUploadFiles(event.dataTransfer.files);
          }}
          className={cn("relative overflow-hidden transition-shadow", dropActive && "ring-2 ring-primary")}
        >
          {dropActive && (
            <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background/95 text-primary">
              <UploadCloud className="size-8" />
              <span className="text-sm font-medium">Drop to upload to &ldquo;{node.name}&rdquo;</span>
            </div>
          )}

          {uploads.length > 0 && <UploadProgress uploads={uploads} onDismiss={onClearUploads} />}

          {files.length === 0 ? (
            <button
              type="button"
              onClick={browse}
              className="flex w-full flex-col items-center gap-2 px-6 py-12 text-center transition-colors hover:bg-muted/50"
            >
              <span className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
                <UploadCloud className="size-5" />
              </span>
              <span className="text-sm font-medium">Drag files here, or click to browse</span>
              <span className="text-xs text-muted-foreground">{UPLOAD_HINT}</span>
            </button>
          ) : (
            <>
              {/* Toolbar: select all, then search or bulk actions */}
              <div className="flex min-h-12 flex-wrap items-center gap-3 border-b border-border px-4 py-2 surface-subtle">
                <Checkbox
                  checked={allVisibleChosen}
                  onCheckedChange={() =>
                    setSelected(allVisibleChosen ? new Set() : new Set(visibleFiles.map((f) => f.id)))
                  }
                  aria-label="Select all files"
                />
                {chosen.length > 0 ? (
                  <div className="flex flex-1 flex-wrap items-center gap-2">
                    <span className="text-sm font-medium tabular">{chosen.length} selected</span>
                    <Button type="button" variant="outline" size="sm" onClick={() => onBulkPublish(chosen, true)}>
                      <Eye />
                      Publish
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => onBulkPublish(chosen, false)}>
                      <EyeOff />
                      Hide
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => onBulkMove(chosen)}>
                      <FolderInput />
                      Move
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onBulkDelete(chosen)}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 />
                      Delete
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="ml-auto"
                      onClick={() => setSelected(new Set())}
                    >
                      Clear
                    </Button>
                  </div>
                ) : (
                  <>
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Files</span>
                    <div className="relative ml-auto w-full sm:w-64">
                      <Search
                        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                        aria-hidden
                      />
                      <Input
                        type="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search files"
                        aria-label="Search files in this folder"
                        className="h-8 pl-9 pr-8"
                      />
                      {query && (
                        <button
                          type="button"
                          aria-label="Clear search"
                          onClick={() => setQuery("")}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          <X className="size-3.5" />
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>

              {visibleFiles.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                  <SearchX className="size-5 text-muted-foreground" aria-hidden />
                  <p className="text-sm text-muted-foreground">No files match &ldquo;{query}&rdquo;.</p>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {visibleFiles.map((file) => (
                    <FileRow
                      key={file.id}
                      file={file}
                      checked={selected.has(file.id)}
                      onCheck={() => toggleOne(file.id)}
                      busy={isFilePending(file.id)}
                      drag={drag}
                      onToggle={() => onToggleFile(file)}
                      onRename={() => onRenameFile(file)}
                      onDelete={() => onDeleteFile(file)}
                    />
                  ))}
                </ul>
              )}
            </>
          )}
        </Card>
      )}
    </section>
  );
}
