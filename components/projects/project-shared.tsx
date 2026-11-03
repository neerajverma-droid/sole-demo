"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

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
import { useCountryContext } from "@/hooks/use-country-context";
import { useDeleteProjectMutation } from "@/hooks/use-projects-query";
import { apiErrorMessage } from "@/lib/api-error";
import { formatCountryMoney } from "@/lib/country-context";
import {
  projectInitials,
  projectStatusLabel,
  type ProjectStatus,
} from "@/lib/projects";
import { cn } from "@/lib/utils";

export const PROJECTS_ROOT = "/projects";
export const PROJECT_SETTINGS_HREF = "/projects/settings";

export function projectHref(id: string): string {
  return `${PROJECTS_ROOT}/${id}`;
}

/** Money in the business's own currency — the same formatter the property module uses. */
export function useProjectMoney(): (value: number) => string {
  const { country } = useCountryContext();
  return React.useCallback((value: number) => formatCountryMoney(country, value), [country]);
}

const STATUS_VARIANT: Record<ProjectStatus, "secondary" | "warning" | "success"> = {
  draft: "secondary",
  inprogress: "warning",
  closed: "success",
};

export function ProjectStatusBadge({
  status,
  className,
}: {
  status: ProjectStatus;
  className?: string;
}) {
  return (
    <Badge variant={STATUS_VARIANT[status]} className={cn("whitespace-nowrap", className)}>
      {projectStatusLabel(status)}
    </Badge>
  );
}

/**
 * Solid tiles under white initials, picked by id so a project keeps its colour.
 * The server's own `color` is a random light tint meant for a dark label, which
 * white initials can't sit on.
 */
const AVATAR_COLORS = [
  "bg-green-600",
  "bg-primary",
  "bg-amber-600",
  "bg-sky-500",
  "bg-violet-600",
];

function avatarColor(id: string): string {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = id.charCodeAt(index) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function ProjectAvatar({
  id,
  name,
  className,
}: {
  id: string;
  name: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-md text-sm font-semibold text-white",
        avatarColor(id),
        className,
      )}
    >
      {projectInitials(name)}
    </span>
  );
}

export type ProjectTarget = { id: string; name: string };

/** "Delete Project?" — the old list's ConfirmationDialog, kept open until the request lands. */
export function DeleteProjectDialog({
  project,
  onOpenChange,
  onDeleted,
}: {
  project: ProjectTarget | null;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}) {
  const deleteProject = useDeleteProjectMutation();

  const confirm = () => {
    if (!project) return;
    deleteProject.mutate(project.id, {
      onSuccess: () => {
        toast.success("Project deleted successfully");
        onOpenChange(false);
        onDeleted?.();
      },
      onError: (error) =>
        toast.error(apiErrorMessage(error, "An error occurred while deleting the project")),
    });
  };

  return (
    <AlertDialog
      open={project !== null}
      onOpenChange={(open) => !open && !deleteProject.isPending && onOpenChange(false)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete project?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes “{project?.name}”. This action can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteProject.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={deleteProject.isPending}
            onClick={(event) => {
              event.preventDefault();
              confirm();
            }}
          >
            {deleteProject.isPending && <Loader2 className="animate-spin" />}
            Delete project
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
