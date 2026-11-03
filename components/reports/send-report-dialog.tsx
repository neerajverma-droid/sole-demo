"use client";

import * as React from "react";
import { useAtom } from "jotai";
import { Check, ChevronDown, Loader2, Users, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  CONTROL_SURFACE,
  CONTROL_SURFACE_TRIGGER,
} from "@/components/ui/control-surface";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Field } from "@/components/documents/field";
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { sendReportOpenAtom } from "@/lib/atoms";
import { contactDisplayName, EMAIL_PATTERN } from "@/lib/contacts";
/**
 * What's being sent, in the terms the dialog needs it.
 *
 * A descriptor rather than a report: the dialog collects addresses and a note,
 * and the only thing it needs from the report is enough to say which one it is.
 * Taking a `PlReport` here is what stopped the Transaction Listing reusing it.
 */
export type SendableReport = {
  /** "Profit & Loss", "Transaction Listing" — names it in the title and toast. */
  title: string;
  /** The selected preset, e.g. "This financial year". */
  period: string;
  /** "1 Jul 2026 – 30 Jun 2027". */
  rangeLabel: string;
  /** ISO `YYYY-MM-DD` bounds of the exact span on screen — what the send call reports on. */
  range: { from: string; to: string };
  /** The one figure worth confirming before sending, where there is one. */
  headline?: { label: string; value: string };
};
import { useRecipientContactsQuery } from "@/hooks/use-contacts-query";
import { apiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/utils";

const FORMATS = ["PDF", "CSV"] as const;
type ReportFormat = (typeof FORMATS)[number];

/**
 * Sending the report on.
 *
 * The header stays neutral. A saturated bar across the top of a dialog that
 * exists to collect three fields spends the loudest colour on the room rather
 * than on the thing you press in it — the Send button is where the emphasis
 * belongs, and it can't compete with a header for it.
 *
 * Recipients are chips rather than a comma-separated string. It's the same data
 * either way, but a chip can be removed one at a time, and a typo shows up as one
 * wrong pill instead of hiding in the middle of a line of text.
 */
export function SendReportDialog({
  report,
  reportTypeId,
  endpoint = apiRoutes.reporting.reports,
  onSend,
  description,
}: {
  report: SendableReport;
  /** Replaces the default line under the title when a report sends differently. */
  description?: string;
  /** `sole-ocr`'s `report_type_id` for this report — e.g. `PL_REPORT_TYPE_ID`. */
  reportTypeId?: string;
  /**
   * Where the send action posts. Every report shares `POST /report` except
   * BAS, which has its own `POST /report/gst-extract` with the same
   * `action="send"` / `send_to` contract and no `report_type_id`.
   */
  endpoint?: string;
  onSend?: (payload: { recipients: string[]; note: string }) => Promise<void>;
}) {
  const [open, setOpen] = useAtom(sendReportOpenAtom);

  const [recipients, setRecipients] = React.useState<string[]>([]);
  const [draft, setDraft] = React.useState("");
  const [note, setNote] = React.useState("");
  const [format, setFormat] = React.useState<ReportFormat>("PDF");
  const [error, setError] = React.useState<string | undefined>();
  const [sending, setSending] = React.useState(false);
  const [picking, setPicking] = React.useState(false);

  const directory = useRecipientContactsQuery(open);
  const withEmail = (list: typeof directory.clients) =>
    list.filter((contact) => contact.email.trim());
  const groups = [
    { heading: "Clients", options: withEmail(directory.clients) },
    { heading: "Suppliers", options: withEmail(directory.suppliers) },
  ].filter((group) => group.options.length > 0);

  const add = (value: string) => {
    const email = value.trim();
    if (!email) return true;
    if (!EMAIL_PATTERN.test(email)) {
      setError(`${email} doesn't look like an email address`);
      return false;
    }
    // Case-insensitively, because Sam@ and sam@ are one inbox and two chips
    // would send the same report twice.
    if (
      recipients.some((entry) => entry.toLowerCase() === email.toLowerCase())
    ) {
      setError(`${email} is already on the list`);
      return false;
    }
    setRecipients((current) => [...current, email]);
    setError(undefined);
    return true;
  };

  const remove = (email: string) =>
    setRecipients((current) => current.filter((entry) => entry !== email));

  const reset = () => {
    setRecipients([]);
    setDraft("");
    setNote("");
    setFormat("PDF");
    setError(undefined);
  };

  const send = async () => {
    // A half-typed address in the field is one someone meant to include.
    if (draft.trim() && !add(draft)) return;
    const list = draft.trim() ? [...recipients, draft.trim()] : recipients;

    if (list.length === 0) {
      setError("Add at least one recipient");
      return;
    }

    setDraft("");
    setSending(true);
    try {
      /*
       * `sole-ocr`'s send action takes exactly one `send_to` per request (plus
       * two optional named roles this dialog doesn't collect) — there's no
       * batch form of it. A chip list sends as one real request per chip
       * rather than silently mailing only the first one.
       */
      if (onSend) {
        await onSend({ recipients: list, note: note.trim() });
      } else
        await Promise.all(
          list.map((email) => {
            const form = new FormData();
            if (reportTypeId) form.append("report_type_id", reportTypeId);
            form.append("action", "send");
            form.append("start_date", report.range.from);
            form.append("end_date", report.range.to);
            form.append("send_to", email);

            if (format) {
              form.append("format", format.toLowerCase());
            }
            if (note && note.trim()) {
              form.append("note", note.trim());
            }

            return api.post(endpoint, form);
          }),
        );
      toast.success(
        list.length === 1
          ? "Report sent"
          : `Report sent to ${list.length} people`,
        // No format claim here — the backend's send action emails its own
        // template regardless of the "Attach as" choice below; there's
        // nothing server-side that toggle actually reaches yet.
        { description: `${report.title} · ${report.rangeLabel}` },
      );
      setOpen(false);
      reset();
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err, "Couldn't send the report. Try again."));
    } finally {
      setSending(false);
    }
  };

  const total = recipients.length + (draft.trim() ? 1 : 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send {report.title}</DialogTitle>
          <DialogDescription>
            {description ??
              "Email this report as an attachment. Recipients get the figures as they stand now — sending doesn't give them access to your books."}
          </DialogDescription>
        </DialogHeader>

        <form
          noValidate
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          {/* What's being sent, so nobody has to remember which period was on
              screen behind the dialog. */}
          <dl className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg border border-dashed border-border surface-subtle px-3 py-2.5 text-xs">
            <dt className="text-muted-foreground">{report.period}</dt>
            <dd className="tabular text-muted-foreground">
              {report.rangeLabel}
            </dd>
            {report.headline && (
              <>
                <span className="text-muted-foreground" aria-hidden>
                  ·
                </span>
                <dt className="text-muted-foreground">
                  {report.headline.label}
                </dt>
                <dd className="font-semibold tabular">
                  {report.headline.value}
                </dd>
              </>
            )}
          </dl>

          <Field
            label="Recipients"
            required
            error={error}
            hint={
              error
                ? undefined
                : "Type an address and press Enter, or pick from your clients and suppliers."
            }
          >
            <div className="flex items-start gap-2">
              {/*
                A field that holds chips and a caret. The container carries the
                control surface and the focus ring so the two read as one input,
                which is what stops the chips looking like they're floating above
                a separate box.
              */}
              <div
                className={cn(
                  "flex min-h-9 flex-1 flex-wrap items-center gap-1.5 rounded-md px-2 py-1.5",
                  CONTROL_SURFACE,
                  "focus-within:ring-1 focus-within:ring-ring",
                  error && "border-destructive focus-within:ring-destructive",
                )}
              >
                {recipients.map((email) => (
                  <span
                    key={email}
                    className="flex max-w-full items-center gap-1 rounded-full border border-border bg-muted py-0.5 pl-2 pr-1 text-xs"
                  >
                    <span className="truncate">{email}</span>
                    <button
                      type="button"
                      onClick={() => remove(email)}
                      aria-label={`Remove ${email}`}
                      className="grid size-4 shrink-0 place-items-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <X className="size-3" aria-hidden />
                    </button>
                  </span>
                ))}

                <input
                  type="email"
                  inputMode="email"
                  value={draft}
                  onChange={(event) => {
                    setDraft(event.target.value);
                    setError(undefined);
                  }}
                  onKeyDown={(event) => {
                    // Enter and comma both commit. Enter would otherwise submit
                    // the form with the address still sitting in the field.
                    if (event.key === "Enter" || event.key === ",") {
                      event.preventDefault();
                      if (add(draft)) setDraft("");
                      return;
                    }
                    // Backspace at the start of an empty field takes the chip
                    // before the caret, as every other chips field does.
                    if (
                      event.key === "Backspace" &&
                      !draft &&
                      recipients.length > 0
                    ) {
                      remove(recipients[recipients.length - 1]);
                    }
                  }}
                  onBlur={() => {
                    if (draft.trim() && add(draft)) setDraft("");
                  }}
                  placeholder={
                    recipients.length === 0 ? "name@example.com.au" : ""
                  }
                  aria-label="Recipient email address"
                  className="min-w-[8rem] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>

              <Popover open={picking} onOpenChange={setPicking}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={picking}
                    className={cn("h-9 shrink-0", CONTROL_SURFACE_TRIGGER)}
                  >
                    <Users aria-hidden />
                    Contacts
                    <ChevronDown
                      className="text-muted-foreground"
                      aria-hidden
                    />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72 p-0">
                  <Command>
                    <CommandInput placeholder="Search clients and suppliers" />
                    <CommandList>
                      <CommandEmpty>
                        {directory.isLoading
                          ? "Loading contacts…"
                          : directory.isError
                            ? "Couldn't load your contacts."
                            : "No client or supplier with an email address."}
                      </CommandEmpty>
                      {groups.map((group) => (
                        <CommandGroup
                          key={group.heading}
                          heading={group.heading}
                        >
                          {group.options.map((contact) => {
                            const name = contactDisplayName(contact);
                            const chosen = recipients.some(
                              (entry) =>
                                entry.toLowerCase() ===
                                contact.email.toLowerCase(),
                            );

                            return (
                              <CommandItem
                                key={`${group.heading}-${contact.id}`}
                                value={`${name} ${contact.email} ${group.heading}-${contact.id}`}
                                onSelect={() => {
                                  if (chosen) remove(contact.email);
                                  else add(contact.email);
                                  setPicking(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "text-primary",
                                    !chosen && "opacity-0",
                                  )}
                                  aria-hidden
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm">
                                    {name}
                                  </span>
                                  <span className="block truncate text-xs text-muted-foreground">
                                    {contact.email}
                                  </span>
                                </span>
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      ))}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </Field>

          <Field
            label="Note"
            htmlFor="send-report-note"
            hint="Optional. Included in the email message."
          >
            <Textarea
              id="send-report-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Here's the quarter's P&L ahead of our call."
              rows={3}
            />
          </Field>

          {!onSend && (
            <Field
              label="Attach as"
              labelTip="Choose whether to attach the report as a PDF or CSV document."
            >
              <ToggleGroup
                type="single"
                value={format}
                // Radix clears a single-select toggle when the active item is
                // pressed again; there's no "no format" to send, so the current
                // one stands.
                onValueChange={(next) =>
                  next && setFormat(next as ReportFormat)
                }
                className="justify-start gap-2"
              >
                {FORMATS.map((option) => (
                  <ToggleGroupItem
                    key={option}
                    value={option}
                    variant="outline"
                    aria-label={`Attach as ${option}`}
                    className="px-4 data-[state=on]:border-primary/30 data-[state=on]:bg-primary/10 data-[state=on]:text-primary"
                  >
                    {option}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={sending || total === 0}>
              {sending && <Loader2 className="animate-spin" aria-hidden />}
              {sending ? "Sending…" : "Send"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
