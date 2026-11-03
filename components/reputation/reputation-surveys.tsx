"use client";

import * as React from "react";
import { Copy, Loader2, MoreHorizontal, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TablePagination } from "@/components/ui/table-pagination";
import { TonePill } from "@/components/reputation/reputation-ui";
import { paginate } from "@/lib/products";
import {
  createReputationSurvey,
  deleteReputationSurvey,
  reputationErrorMessage,
  updateReputationSurvey,
} from "@/lib/reputation-api";
import { duplicateSurveyPayload, type ReputationSurvey } from "@/lib/reputation";

export function ReputationSurveysTab({
  surveys,
  loading,
  onCreate,
  onEdit,
  onChanged,
}: {
  surveys: ReputationSurvey[];
  loading: boolean;
  onCreate: () => void;
  onEdit: (survey: ReputationSurvey) => void;
  onChanged: () => Promise<unknown>;
}) {
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);
  const [toggling, setToggling] = React.useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<ReputationSurvey | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const paged = paginate(surveys, page, pageSize);

  const toggle = async (survey: ReputationSurvey) => {
    const next = survey.status === "active" ? "draft" : "active";
    setToggling(survey.id);
    try {
      await updateReputationSurvey(survey.id, { status: next });
      await onChanged();
      toast.success(next === "active" ? "Survey activated" : "Survey paused");
    } catch (error) {
      toast.error(reputationErrorMessage(error, "Failed to update the survey status"));
    } finally {
      setToggling(null);
    }
  };

  const duplicate = async (survey: ReputationSurvey) => {
    try {
      await createReputationSurvey(duplicateSurveyPayload(survey));
      await onChanged();
      toast.success("Survey duplicated");
    } catch (error) {
      toast.error(reputationErrorMessage(error, "Failed to duplicate the survey"));
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteReputationSurvey(pendingDelete.id);
      await onChanged();
      toast.success("Survey deleted");
      setPendingDelete(null);
    } catch (error) {
      toast.error(reputationErrorMessage(error, "Failed to delete the survey"));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-[640px] text-sm text-muted-foreground">
          Build the survey clients answer after a high-rated job. Each survey has one question — the client&apos;s
          answer is captured before they&apos;re sent to leave a Google review.
        </p>
        <Button onClick={onCreate} className="shrink-0">
          <Plus />
          New survey
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <Table className="min-w-[760px]">
          <TableHeader>
            <TableRow>
              <TableHead className="px-4">Survey</TableHead>
              <TableHead>Question</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="px-4 text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 3 }, (_, index) => (
                <TableRow key={index}>
                  <TableCell className="px-4" colSpan={4}>
                    <Skeleton className="h-8 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : surveys.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={4}>
                  <Empty className="border-0 py-10 shadow-none">
                    <EmptyTitle>No surveys yet</EmptyTitle>
                    <EmptyDescription>Select “New survey” to create the one clients answer after a job.</EmptyDescription>
                  </Empty>
                </TableCell>
              </TableRow>
            ) : (
              paged.rows.map((survey) => (
                <TableRow key={survey.id}>
                  <TableCell className="px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                        <Star className="size-4" aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{survey.name || "Untitled survey"}</p>
                        <p className="truncate text-xs text-muted-foreground">{survey.description || "No description"}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[280px]">
                    <p className="truncate text-sm italic text-muted-foreground">{survey.question || "No question set"}</p>
                  </TableCell>
                  <TableCell>
                    <TonePill tone={survey.status === "active" ? "success" : "neutral"}>
                      <span className={survey.status === "active" ? "size-1.5 rounded-full bg-success" : "size-1.5 rounded-full bg-muted-foreground"} />
                      {survey.status === "active" ? "Active" : "Inactive"}
                    </TonePill>
                  </TableCell>
                  <TableCell className="px-4">
                    <div className="flex items-center justify-end gap-2">
                      {toggling === survey.id && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />}
                      <Switch
                        checked={survey.status === "active"}
                        disabled={toggling === survey.id}
                        onCheckedChange={() => void toggle(survey)}
                        aria-label={survey.status === "active" ? `Pause ${survey.name}` : `Activate ${survey.name}`}
                      />
                      <Button variant="outline" size="sm" onClick={() => onEdit(survey)}>
                        <Pencil />
                        Edit
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8" aria-label={`More for ${survey.name}`}>
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => void duplicate(survey)}>
                            <Copy />
                            Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={() => setPendingDelete(survey)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {!loading && surveys.length > 0 && (
          <div className="border-t border-border px-4 py-3">
            <TablePagination
              page={paged}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
              label="surveys"
            />
          </div>
        )}
      </div>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && !deleting && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete survey?</AlertDialogTitle>
            <AlertDialogDescription>
              “{pendingDelete?.name}” will be permanently deleted. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <Button variant="destructive" disabled={deleting} onClick={() => void confirmDelete()}>
              {deleting && <Loader2 className="animate-spin" />}
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
