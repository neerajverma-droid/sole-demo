"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, FileText, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Shimmer } from "@/components/ui/shimmer";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { InvoicePdfDialog } from "@/components/shared/invoice-pdf-dialog";
import {
  draftInvoicesQueryKey,
  fetchDraftInvoices,
  type DraftInvoiceSummary,
} from "@/lib/invoice-drafts";
import { formatInvoiceDate, invoiceMoney } from "@/lib/invoices";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ *
 * Column widths
 *
 * `table-fixed` is what makes these binding, and what keeps the dialog free
 * of a horizontal scrollbar: an `auto` table measures its content and treats
 * a declared width as a suggestion, so one long client name or note pushed
 * the row past the modal and the whole table started sliding sideways.
 *
 * All six are percentages rather than pixels so the same shares hold at the
 * dialog's mobile width (`w-[96vw]`) as at its desktop one — a fixed pixel
 * column is exactly what reintroduces the overflow on a narrow screen. Under
 * `table-fixed` only the first row is measured, so each width has to be on
 * the header *and* its body cells.
 * ------------------------------------------------------------------ */

/** With a Client column (the account-wide listing). Sums to 100. */
const WIDE = {
  number: "w-[13%]",
  date: "w-[14%]",
  client: "w-[15%]",
  description: "w-[16%]",
  amount: "w-[15%]",
  action: "w-[27%]",
};

/** Without one (scoped to a client) — its share goes to the description. */
const NARROW = {
  number: "w-[15%]",
  date: "w-[15%]",
  client: "",
  description: "w-[25%]",
  amount: "w-[16%]",
  action: "w-[29%]",
};

/**
 * The step before raising a new invoice: the drafts that already exist, so
 * work can be added to one instead of starting a fifth half-finished invoice
 * for the same client.
 *
 * Shared because every "convert this to an invoice" path needs it and they
 * differ only in scope, exactly as sole-webapp's own `DraftInvoicesDrawer`
 * does. Pass a `clientId` and it lists that client's drafts — what time
 * entries and km trips do, since both already know who they're billed to.
 * Leave it out and it lists every draft on the account, with a Client column,
 * which is what an expense needs: an expense has a supplier, and who it gets
 * on-charged to isn't decided until the invoice is written.
 *
 * The dialog owns the fetch rather than taking rows as a prop, so callers
 * can't drift on how a draft is shaped. A caller that has to decide whether
 * to show it at all reads the same query — `draftInvoicesQueryKey` — and gets
 * the cached result rather than a second request.
 */
export function DraftInvoicesDialog({
  open,
  onOpenChange,
  clientId,
  clientName,
  onUseInvoice,
  onCreateNew,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Narrows to one client's drafts. Omitted lists the whole account's. */
  clientId?: string | null;
  /** Shown under the title when scoped to a client. */
  clientName?: string | null;
  /** Add the work to this existing draft. */
  onUseInvoice: (draft: DraftInvoiceSummary) => void;
  /** Start a fresh invoice instead. */
  onCreateNew: () => void;
}) {
  const query = useQuery({
    queryKey: draftInvoicesQueryKey(clientId),
    queryFn: () => fetchDraftInvoices(clientId),
    enabled: open,
  });

  /** The row whose PDF is being looked at, if any. */
  const [preview, setPreview] = React.useState<DraftInvoiceSummary | null>(
    null,
  );

  const drafts = query.data ?? [];
  // Only the account-wide listing can say who each draft is for; a
  // client-scoped one is already a single client's, named in the header.
  const showClient = !clientId;
  const col = showClient ? WIDE : NARROW;
  /** Every column but the action one, which has its own placeholder. */
  const placeholderCells = showClient
    ? [col.number, col.date, col.client, col.description, col.amount]
    : [col.number, col.date, col.description, col.amount];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[85svh] w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>Existing draft invoices</DialogTitle>
            <DialogDescription>
              {clientId
                ? `${clientName || "This client"} already has draft invoices — add this to one of them, or start a new invoice.`
                : "You have draft invoices — add this to one of them, or start a new invoice."}
            </DialogDescription>
          </DialogHeader>

          {/* `overflow-x-hidden` rather than the `auto` the y-axis rule would
              otherwise imply: the table is sized to fit, so any stray pixel is
              a rounding error, not something worth a scrollbar. */}
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-6 py-4">
            {query.isError ? (
              <Empty>
                <EmptyMedia>
                  <FileText aria-hidden />
                </EmptyMedia>
                <EmptyTitle>Couldn&apos;t load your drafts</EmptyTitle>
                <EmptyDescription>
                  {query.error instanceof Error
                    ? query.error.message
                    : "Something went wrong. You can still start a new invoice below."}
                </EmptyDescription>
              </Empty>
            ) : !query.isLoading && drafts.length === 0 ? (
              <Empty>
                <EmptyMedia>
                  <FileText aria-hidden />
                </EmptyMedia>
                <EmptyTitle>No draft invoices</EmptyTitle>
                <EmptyDescription>
                  There&apos;s nothing to add this to yet — start a new invoice
                  below.
                </EmptyDescription>
              </Empty>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border">
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead className={col.number}>Invoice #</TableHead>
                      <TableHead className={col.date}>Date</TableHead>
                      {showClient && (
                        <TableHead className={col.client}>Client</TableHead>
                      )}
                      <TableHead className={col.description}>
                        Description
                      </TableHead>
                      <TableHead className={cn(col.amount, "text-right")}>
                        Amount
                      </TableHead>
                      <TableHead className={cn(col.action, "text-right")}>
                        Action
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody
                    {...(query.isLoading ? { "aria-hidden": true } : {})}
                  >
                    {query.isLoading
                      ? Array.from({ length: 4 }).map((_, index) => (
                          <TableRow key={`draft-skeleton-${index}`}>
                            {placeholderCells.map((width, cellIndex) => (
                              <TableCell key={cellIndex} className={width}>
                                <Shimmer className="h-4 w-full max-w-20" />
                              </TableCell>
                            ))}
                            <TableCell className={col.action}>
                              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                <Shimmer className="h-8 rounded-md" />
                                <Shimmer className="h-8 rounded-md" />
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      : drafts.map((draft) => (
                          <TableRow key={draft.id}>
                            <TableCell className={col.number}>
                              {/* Stacked rather than side by side: on one line
                                  the badge took enough of a narrow column that
                                  the number itself was the part that got cut. */}
                              <div className="space-y-1">
                                <TruncatedText
                                  text={draft.number}
                                  className="font-medium"
                                />
                                <Badge variant="secondary">Draft</Badge>
                              </div>
                            </TableCell>
                            <TableCell
                              className={cn(
                                col.date,
                                "truncate tabular text-muted-foreground",
                              )}
                            >
                              {draft.date ? formatInvoiceDate(draft.date) : "—"}
                            </TableCell>
                            {showClient && (
                              <TableCell
                                className={cn(
                                  col.client,
                                  "text-muted-foreground",
                                )}
                              >
                                <TruncatedText
                                  text={draft.clientName || "—"}
                                />
                              </TableCell>
                            )}
                            <TableCell
                              className={cn(
                                col.description,
                                "text-muted-foreground",
                              )}
                            >
                              <TruncatedText
                                text={draft.description || "—"}
                              />
                            </TableCell>
                            <TableCell
                              className={cn(
                                col.amount,
                                "truncate text-right font-medium tabular",
                              )}
                            >
                              {invoiceMoney(draft.total)}
                            </TableCell>
                            <TableCell className={col.action}>
                              {/* A two-column grid rather than a flex row: it
                                  gives both buttons exactly half the cell, so
                                  they match each other on every row instead of
                                  each sizing to its own label. Stacked below
                                  `sm`, where the dialog is only as wide as the
                                  viewport and two of them can't sit side by
                                  side without clipping. */}
                              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                <ViewDraftButton
                                  draft={draft}
                                  onView={() => setPreview(draft)}
                                />
                                <Button
                                  size="sm"
                                  className="w-full"
                                  onClick={() => onUseInvoice(draft)}
                                >
                                  Use this
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <DialogFooter className="border-t px-6 py-4">
            <Button className="w-full" onClick={onCreateNew}>
              <Plus />
              Create new invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* The real PDF, from the same viewer the invoices list uses. */}
      <InvoicePdfDialog
        open={preview !== null}
        onOpenChange={(next) => !next && setPreview(null)}
        invoice={preview ?? undefined}
        receipt={false}
      />
    </>
  );
}

/**
 * Opens the draft's real PDF.
 *
 * Labelled rather than icon-only: it sits beside "Use this", and two controls
 * where only one is named reads as one button and one piece of chrome.
 *
 * A draft with no template can't be rendered, and follows `MenuAction`'s rule
 * for that — disabled with the reason on hover, never hidden, so the pair of
 * buttons doesn't change shape from row to row.
 */
function ViewDraftButton({
  draft,
  onView,
}: {
  draft: DraftInvoiceSummary;
  onView: () => void;
}) {
  const button = (
    <Button
      variant="outline"
      size="sm"
      className="w-full"
      onClick={onView}
      disabled={!draft.templateId}
    >
      <Eye />
      View
    </Button>
  );

  if (draft.templateId) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* The wrapper takes the hover: a disabled button fires no events. */}
        <span className="inline-flex w-full">{button}</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-56">
        This draft has no template to render a preview from
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * One line of text that may not fit its column.
 *
 * The cell widths are fixed, so a long client name or note is cut off — and a
 * row you can't read the whole of is only useful if there's a way to see the
 * rest. The tooltip appears on hover for exactly the values that are actually
 * cut off: measured rather than guessed from a character count, since where a
 * string runs out of room depends on the column's real width, which changes
 * with the viewport and with whether the Client column is showing at all.
 *
 * A native `title` would have been the one-line version, but it fires on every
 * value whether it's truncated or not, and hangs a second, differently-styled
 * tooltip off rows that already read fine.
 */
function TruncatedText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const [truncated, setTruncated] = React.useState(false);

  React.useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const measure = () =>
      setTruncated(element.scrollWidth > element.clientWidth);
    measure();

    // Re-measured on resize: the same name fits at the dialog's desktop width
    // and doesn't at its mobile one.
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text]);

  const span = (
    <span ref={ref} className={cn("block truncate", className)}>
      {text}
    </span>
  );

  if (!truncated) return span;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{span}</TooltipTrigger>
      <TooltipContent side="top" className="max-w-72 break-words">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
