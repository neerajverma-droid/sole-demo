"use client";

import * as React from "react";
import { Loader2, Receipt } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Shimmer } from "@/components/ui/shimmer";
import {
  HUG_COLUMN,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TablePagination } from "@/components/ui/table-pagination";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProjectMoney } from "@/components/projects/project-shared";
import { ProjectExpenseForm } from "@/components/projects/detail/expenses/project-expense-form";
import {
  useAssignExpensesToProjectMutation,
  useProjectExpenseJobsQuery,
  useUnassignedExpensesQuery,
} from "@/hooks/use-project-expenses-query";
import { apiErrorMessage } from "@/lib/api-error";
import { formatExpenseDate } from "@/lib/expenses";
import { pageInfo } from "@/lib/project-expenses";

type Mode = "assign" | "manual";

const NO_JOB = "none";

/**
 * "Create New Expense" — sole-webapp's `CreationDialog` with its two tabs:
 * pick existing expenses that aren't on any project yet and file them here,
 * or write a new one straight onto the project. Both can go under one of the
 * project's jobs, and the first job is picked to start with, as before.
 */
export function AddProjectExpenseDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [mode, setMode] = React.useState<Mode>("assign");
  const [jobId, setJobId] = React.useState<string | null>(null);
  const jobsQuery = useProjectExpenseJobsQuery(projectId, open);
  const jobs = React.useMemo(() => jobsQuery.data ?? [], [jobsQuery.data]);

  // sole-webapp preselects the first (default) job once the list arrives.
  const jobSeeded = React.useRef(false);
  React.useEffect(() => {
    if (jobSeeded.current || jobs.length === 0) return;
    jobSeeded.current = true;
    setJobId(jobs[0].id);
  }, [jobs]);

  const close = () => onOpenChange(false);

  const jobPicker = jobs.length > 0 && (
    <div className="space-y-1.5">
      <Label htmlFor="project-expense-job">Assign to job</Label>
      <Select value={jobId ?? NO_JOB} onValueChange={(value) => setJobId(value === NO_JOB ? null : value)}>
        <SelectTrigger id="project-expense-job" className="w-full sm:w-72">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_JOB}>No job</SelectItem>
          {jobs.map((job) => (
            <SelectItem key={job.id} value={job.id}>
              {job.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92svh] w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>Add expense</DialogTitle>
          <DialogDescription>
            File existing expenses under this project, or record a new one.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={mode}
          onValueChange={(value) => setMode(value as Mode)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="px-6 pt-4">
            <TabsList>
              <TabsTrigger value="assign">Assign existing</TabsTrigger>
              <TabsTrigger value="manual">Create manually</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="assign" className="mt-0 min-h-0 flex-1 overflow-y-auto px-6 py-4">
            {open && mode === "assign" && (
              <AssignExisting projectId={projectId} jobId={jobId} jobPicker={jobPicker} onDone={close} />
            )}
          </TabsContent>

          <TabsContent value="manual" className="mt-0 min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-4">
            {jobPicker}
            {open && mode === "manual" && (
              <ProjectExpenseForm
                projectId={projectId}
                projectJobId={jobId}
                onDone={close}
                onCancel={close}
              />
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function AssignExisting({
  projectId,
  jobId,
  jobPicker,
  onDone,
}: {
  projectId: string;
  jobId: string | null;
  jobPicker: React.ReactNode;
  onDone: () => void;
}) {
  const money = useProjectMoney();
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);
  /** Ids, so a pick survives paging — sole-webapp keeps its selection across pages too. */
  const [selected, setSelected] = React.useState<string[]>([]);

  const query = useUnassignedExpensesQuery(projectId, page, pageSize, true);
  const assign = useAssignExpensesToProjectMutation(projectId);
  const rows = query.data?.expenses ?? [];
  const total = query.data?.total ?? 0;

  const pageIds = rows.map((row) => row.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));
  const someOnPage = pageIds.some((id) => selected.includes(id));

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  const toggleAll = () =>
    setSelected((current) =>
      allOnPage
        ? current.filter((id) => !pageIds.includes(id))
        : [...new Set([...current, ...pageIds])],
    );

  const submit = () => {
    assign.mutate(
      { expenseIds: selected, projectJobId: jobId },
      {
        onSuccess: ({ message }) => {
          toast.success(message);
          onDone();
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Something went wrong")),
      },
    );
  };

  return (
    <div className="space-y-4">
      {jobPicker}

      {query.isLoading ? (
        <div className="space-y-2" aria-hidden>
          {Array.from({ length: 6 }, (_, index) => (
            <Shimmer key={index} className="h-10 w-full rounded-md" />
          ))}
        </div>
      ) : query.isError ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {apiErrorMessage(query.error, "Couldn't load your expenses. Try again.")}
        </p>
      ) : rows.length === 0 ? (
        <Empty className="border-dashed shadow-none">
          <EmptyMedia>
            <Receipt />
          </EmptyMedia>
          <EmptyTitle>Nothing to assign</EmptyTitle>
          <EmptyDescription>
            Every expense is already on a project. Create one manually instead.
          </EmptyDescription>
        </Empty>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={HUG_COLUMN}>
                    <Checkbox
                      checked={allOnPage ? true : someOnPage ? "indeterminate" : false}
                      onCheckedChange={toggleAll}
                      aria-label="Select all on this page"
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className={HUG_COLUMN}>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className={`${HUG_COLUMN} text-right`}>Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const checked = selected.includes(row.id);
                  return (
                    <TableRow
                      key={row.id}
                      data-state={checked ? "selected" : undefined}
                      className="cursor-pointer"
                      onClick={() => toggle(row.id)}
                    >
                      <TableCell className={HUG_COLUMN} onClick={(event) => event.stopPropagation()}>
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggle(row.id)}
                          aria-label={`Select ${row.description || "expense"}`}
                        />
                      </TableCell>
                      <TableCell className="max-w-64 truncate font-medium">
                        {row.description || "—"}
                      </TableCell>
                      <TableCell className={`${HUG_COLUMN} tabular`}>
                        {row.date ? formatExpenseDate(row.date) : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{row.category || "Other"}</TableCell>
                      <TableCell className={`${HUG_COLUMN} text-right font-medium tabular`}>
                        {money(row.amount)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <TablePagination
            page={pageInfo(page, pageSize, total)}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
            label="expenses"
          />
        </>
      )}

      <div className="flex items-center justify-end gap-3 border-t pt-4">
        {selected.length > 0 && (
          <p className="mr-auto text-xs text-muted-foreground tabular">
            {selected.length} selected
          </p>
        )}
        <Button onClick={submit} disabled={selected.length === 0 || assign.isPending}>
          {assign.isPending && <Loader2 className="animate-spin" />}
          Assign to project
        </Button>
      </div>
    </div>
  );
}
