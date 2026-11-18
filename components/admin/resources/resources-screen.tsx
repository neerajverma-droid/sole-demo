"use client";

import * as React from "react";
import { FolderOpen, FolderPlus, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Empty, EmptyActions, EmptyDescription, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { PageHeader } from "@/components/layout/page-header";
import { useAdminResourcesQuery, useRefreshResources } from "@/hooks/use-admin-resources-query";
import { apiErrorMessage } from "@/lib/api-error";
import {
  canDropOn,
  collectFolderIds,
  createResourceFolder,
  deleteResourceFile,
  deleteResourceFolder,
  findFolder,
  findFolderPath,
  moveResourceFiles,
  plural,
  updateResourceFile,
  updateResourceFolder,
  uploadResourceFile,
  type AdminResourceFile,
  type AdminResourceFolder,
  type DragItem,
} from "@/lib/admin/resources";

import { FolderContents } from "./folder-contents";
import { FolderTree } from "./folder-tree";
import { MoveFilesDialog, type MoveFilesDraft } from "./move-files-dialog";
import { ResourceDialog, type ResourceDialogState } from "./resource-dialogs";

export type UploadState = { name: string; progress: number; error: string | null };

/** Everything a draggable row or drop target needs. */
export type DragProps = {
  item: DragItem | null;
  setItem: (item: DragItem | null) => void;
  canDrop: (item: DragItem, targetId: number | null) => boolean;
  onMove: (item: DragItem, targetId: number | null) => void;
};

type FolderAction = "rename" | "publish" | "delete" | "move";

const EMPTY_TREE: AdminResourceFolder[] = [];

/**
 * Super admin › Resources: nestable folders of downloadable files. Anything
 * published here shows on the public /resource page.
 */
export function ResourcesScreen() {
  const query = useAdminResourcesQuery();
  const refresh = useRefreshResources();
  const tree = query.data ?? EMPTY_TREE;

  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const [expanded, setExpanded] = React.useState<Set<number>>(new Set());
  const [uploads, setUploads] = React.useState<UploadState[]>([]);
  const [dialog, setDialog] = React.useState<ResourceDialogState | null>(null);
  const [dragItem, setDragItem] = React.useState<DragItem | null>(null);
  const [moveDraft, setMoveDraft] = React.useState<MoveFilesDraft | null>(null);
  // In-flight actions, keyed "folder:<id>:<action>" or "file:<id>", driving each row's spinner.
  const [pending, setPending] = React.useState<Set<string>>(new Set());

  const selected = selectedId !== null ? findFolder(tree, selectedId) : null;
  const path = selectedId !== null ? findFolderPath(tree, selectedId) : [];

  // A folder that's gone (deleted, or moved away by someone else) can't stay open.
  React.useEffect(() => {
    if (query.isSuccess && selectedId !== null && !findFolder(tree, selectedId)) setSelectedId(null);
  }, [tree, query.isSuccess, selectedId]);

  const markPending = (keys: string[], on: boolean) =>
    setPending((prev) => {
      const next = new Set(prev);
      keys.forEach((key) => (on ? next.add(key) : next.delete(key)));
      return next;
    });

  const isFilePending = (id: number) => pending.has(`file:${id}`);
  const isFolderBusy = (id: number) =>
    (["rename", "publish", "delete", "move"] as FolderAction[]).some((a) => pending.has(`folder:${id}:${a}`));

  /**
   * Run an action, toast the outcome, then refetch the tree. Never throws, so
   * a dialog can always close once it's done. `keys` show a spinner on the
   * rows involved until both the call and the refetch finish.
   */
  const run = async (action: () => Promise<unknown>, success: string | null, keys: string[] = []) => {
    markPending(keys, true);
    try {
      await action();
      if (success) toast.success(success);
    } catch (error) {
      toast.error(apiErrorMessage(error, "That didn't work. Try again."));
    } finally {
      await refresh();
      markPending(keys, false);
    }
  };

  /* ── Navigation ─────────────────────────────────────────────────────── */

  const select = (id: number | null) => {
    setSelectedId(id);
    if (id !== null) {
      // Opening a folder reveals it in the tree.
      setExpanded((prev) => {
        const next = new Set(prev);
        findFolderPath(tree, id).forEach((f) => next.add(f.id));
        return next;
      });
    }
  };

  const toggle = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /* ── Folder actions ─────────────────────────────────────────────────── */

  const newFolder = (parentId: number | null) =>
    setDialog({
      mode: "name",
      title: parentId ? "New subfolder" : "New folder",
      description: "New folders are published straight away. Hide one from its menu if it isn't ready.",
      label: "Folder name",
      confirmLabel: "Create",
      maxLength: 150,
      onSubmit: (name) =>
        run(async () => {
          const created = await createResourceFolder({ name, parentId });
          if (parentId) setExpanded((prev) => new Set(prev).add(parentId));
          setSelectedId(created.id);
        }, "Folder created"),
    });

  const renameFolder = (folder: AdminResourceFolder) =>
    setDialog({
      mode: "name",
      title: "Rename folder",
      description: "Its public link changes to match the new name.",
      label: "Folder name",
      initialValue: folder.name,
      confirmLabel: "Rename",
      maxLength: 150,
      onSubmit: (name) =>
        run(() => updateResourceFolder(folder.id, { name }), "Folder renamed", [`folder:${folder.id}:rename`]),
    });

  const toggleFolder = (folder: AdminResourceFolder) =>
    run(
      () => updateResourceFolder(folder.id, { isPublished: !folder.isPublished }),
      folder.isPublished ? "Folder hidden from the public page" : "Folder published",
      [`folder:${folder.id}:publish`],
    );

  const removeFolder = (folder: AdminResourceFolder) =>
    setDialog({
      mode: "confirm",
      title: `Delete "${folder.name}"?`,
      description: "This also deletes every subfolder and file inside it, and they disappear from the public page.",
      confirmLabel: "Delete folder",
      onSubmit: () =>
        run(
          async () => {
            await deleteResourceFolder(folder.id);
            if (selectedId === folder.id) setSelectedId(folder.parentId);
          },
          "Folder deleted",
          [`folder:${folder.id}:delete`],
        ),
    });

  /* ── File actions ───────────────────────────────────────────────────── */

  const toggleFile = (file: AdminResourceFile) =>
    run(() => updateResourceFile(file.id, { isPublished: !file.isPublished }), null, [`file:${file.id}`]);

  const renameFile = (file: AdminResourceFile) =>
    setDialog({
      mode: "name",
      title: "Rename file",
      description: "This is the name visitors see. The download itself doesn't change.",
      label: "File name",
      initialValue: file.name,
      confirmLabel: "Rename",
      maxLength: 255,
      onSubmit: (name) => run(() => updateResourceFile(file.id, { name }), "File renamed", [`file:${file.id}`]),
    });

  const removeFile = (file: AdminResourceFile) =>
    setDialog({
      mode: "confirm",
      title: `Delete "${file.name}"?`,
      confirmLabel: "Delete file",
      onSubmit: () => run(() => deleteResourceFile(file.id), "File deleted", [`file:${file.id}`]),
    });

  const bulkPublish = (files: AdminResourceFile[], publish: boolean) =>
    run(
      () => Promise.all(files.map((f) => updateResourceFile(f.id, { isPublished: publish }))),
      `${plural(files.length, "file")} ${publish ? "published" : "hidden"}`,
      files.map((f) => `file:${f.id}`),
    );

  /** Opens the destination picker; the move itself happens when one is chosen. */
  const bulkMove = (files: AdminResourceFile[]) => {
    if (selected) setMoveDraft({ files, fromFolderId: selected.id });
  };

  /**
   * One request for the whole selection, so it either all moves or none does.
   * Failures are toasted by `run`, and the dialog closes either way: the
   * selection is stale after an error, and the tree has just refetched.
   */
  const confirmMove = async (folderId: number) => {
    const draft = moveDraft;
    if (!draft) return;
    const destination = findFolder(tree, folderId);
    await run(
      () => moveResourceFiles(draft.files.map((f) => f.id), folderId),
      `${plural(draft.files.length, "file")} moved to "${destination?.name ?? "the folder"}"`,
      draft.files.map((f) => `file:${f.id}`),
    );
    setExpanded((prev) => new Set(prev).add(folderId));
    setMoveDraft(null);
  };

  const bulkDelete = (files: AdminResourceFile[]) =>
    setDialog({
      mode: "confirm",
      title: `Delete ${plural(files.length, "file")}?`,
      description:
        files
          .slice(0, 5)
          .map((f) => f.name)
          .join(", ") + (files.length > 5 ? ` and ${files.length - 5} more` : ""),
      confirmLabel: "Delete files",
      onSubmit: () =>
        run(
          () => Promise.all(files.map((f) => deleteResourceFile(f.id))),
          `${plural(files.length, "file")} deleted`,
          files.map((f) => `file:${f.id}`),
        ),
    });

  /* ── Drag and drop: move folders and files ──────────────────────────── */

  const canDrop = (item: DragItem, targetId: number | null) => canDropOn(tree, item, targetId);

  const move = (item: DragItem, targetId: number | null) => {
    setDragItem(null);
    if (!canDrop(item, targetId)) return;
    if (targetId !== null) setExpanded((prev) => new Set(prev).add(targetId));

    if (item.type === "file") {
      void run(() => updateResourceFile(item.id, { folderId: targetId as number }), "File moved", [`file:${item.id}`]);
    } else {
      void run(() => updateResourceFolder(item.id, { parentId: targetId }), "Folder moved", [
        `folder:${item.id}:move`,
      ]);
    }
  };

  const drag: DragProps = { item: dragItem, setItem: setDragItem, canDrop, onMove: move };

  /* ── Upload ─────────────────────────────────────────────────────────── */

  const upload = async (fileList: FileList | File[] | null) => {
    const files = Array.from(fileList ?? []);
    if (!files.length || !selected) return;
    const folderId = selected.id;
    setUploads(files.map((f) => ({ name: f.name, progress: 0, error: null })));

    // One request per file, so each has its own progress bar and one failure doesn't sink the rest.
    const results = await Promise.all(
      files.map(async (file, i) => {
        const patch = (change: Partial<UploadState>) =>
          setUploads((prev) => prev.map((u, idx) => (idx === i ? { ...u, ...change } : u)));
        try {
          await uploadResourceFile(folderId, file, (progress) => patch({ progress }));
          patch({ progress: 100 });
          return true;
        } catch (error) {
          patch({ error: apiErrorMessage(error, "Upload failed") });
          return false;
        }
      }),
    );
    await refresh();

    const done = results.filter(Boolean).length;
    if (done) toast.success(`${plural(done, "file")} uploaded`);
    // Keep only the failures on screen, so they can be read and dismissed.
    setUploads((prev) => prev.filter((u) => u.error));
  };

  /* ── Render ─────────────────────────────────────────────────────────── */

  return (
    <div className="space-y-[15px]">
      <PageHeader
        icon={FolderOpen}
        title="Resources"
        description="Folders and files shown on the public Resources page. Drag items onto a folder to move them."
      >
        <Button onClick={() => newFolder(null)}>
          <FolderPlus />
          New folder
        </Button>
      </PageHeader>

      {query.isError ? (
        <Empty>
          <EmptyMedia>
            <TriangleAlert />
          </EmptyMedia>
          <EmptyTitle>Couldn&apos;t load resources</EmptyTitle>
          <EmptyDescription>{apiErrorMessage(query.error, "The resources request didn't complete.")}</EmptyDescription>
          <EmptyActions>
            <Button onClick={() => query.refetch()} disabled={query.isFetching}>
              {query.isFetching ? "Trying again…" : "Try again"}
            </Button>
          </EmptyActions>
        </Empty>
      ) : (
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
          <FolderTree
            tree={tree}
            loading={query.isLoading}
            refreshing={query.isFetching}
            selectedId={selectedId}
            onSelect={select}
            expanded={expanded}
            onToggle={toggle}
            onExpandAll={() => setExpanded(new Set(collectFolderIds(tree)))}
            onCollapseAll={() => setExpanded(new Set())}
            onNewFolder={newFolder}
            drag={drag}
            isFolderBusy={isFolderBusy}
          />

          <FolderContents
            node={selected}
            roots={tree}
            path={path}
            onSelect={select}
            isFilePending={isFilePending}
            isFolderBusy={isFolderBusy}
            onNewFolder={newFolder}
            onRenameFolder={renameFolder}
            onToggleFolder={toggleFolder}
            onDeleteFolder={removeFolder}
            onUploadFiles={upload}
            uploads={uploads}
            onClearUploads={() => setUploads([])}
            onToggleFile={toggleFile}
            onRenameFile={renameFile}
            onDeleteFile={removeFile}
            onBulkPublish={bulkPublish}
            onBulkMove={bulkMove}
            onBulkDelete={bulkDelete}
            drag={drag}
          />
        </div>
      )}

      <ResourceDialog dialog={dialog} onClose={() => setDialog(null)} />
      <MoveFilesDialog draft={moveDraft} roots={tree} onClose={() => setMoveDraft(null)} onConfirm={confirmMove} />
    </div>
  );
}
