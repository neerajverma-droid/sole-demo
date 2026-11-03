"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookmarkPlus,
  Eye,
  FileText,
  Lock,
  Pencil,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { CurrencyConversionCard } from "@/components/documents/currency-conversion-card";
import { DatePicker } from "@/components/documents/date-picker";
import { Field } from "@/components/documents/field";
import { InvoiceClientSelect } from "@/components/documents/invoice-client-select";
import { DocumentLineItems } from "@/components/documents/line-items";
import { NdisLineItems } from "@/components/documents/ndis-line-items";
import { NdisNumberDialog } from "@/components/documents/ndis-number-dialog";
import { RuntimePreviewDialog } from "@/components/documents/runtime-preview-dialog";
import { SaveAsTemplateDialog } from "@/components/invoices/save-as-template-dialog";
import { SenderBlock } from "@/components/documents/sender-block";
import { TotalsPanel } from "@/components/documents/totals-panel";
import {
  AttachmentsCard,
  DepositCard,
  InvoiceNotesCard,
} from "@/components/documents/invoice-extras";
import {
  fetchClientNdisDetails,
  fetchInvoiceContacts,
  ndisClientIssue,
} from "@/lib/invoice-clients";
import {
  deleteInvoiceAttachmentApi,
  documentIssues,
  savePdfBlob,
  invoiceTotals,
  ndisIssues,
  newLineItem,
  newNdisLineItem,
  parseIsoDate,
  toIsoDate,
  type DocumentCurrency,
  type InvoiceLineItem,
} from "@/lib/invoices";
import {
  DEFAULT_QUOTE_VALIDITY,
  createQuoteDefaultApi,
  draftFromQuote,
  draftFromQuoteDefault,
  duplicateQuoteDraft,
  emptyNdisQuoteDraft,
  fetchQuotePdfBlob,
  emptyQuoteDraft,
  fetchNextQuoteNumber,
  fetchQuoteDefaultDetail,
  fetchQuoteDetail,
  templateEditorFromDetail,
  quoteDefaultValidity,
  quoteTemplateSaveIssue,
  quoteValidityDays,
  updateQuoteDefaultApi,
  type Quote,
  type QuoteDraft,
} from "@/lib/quotes";
import { isGlobalTemplateOwner } from "@/lib/invoice-templates";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { useCountryContext } from "@/hooks/use-country-context";
import {
  fetchExchangeRates,
  fetchInvoiceBranding,
  fetchInvoiceEmail,
  quoteTemplateIdFor,
} from "@/lib/invoice-context";
import { documentTax } from "@/lib/country-context";
import {
  fetchQuoteRuntimePreviewBlob,
  saveQuoteApi,
  type QuoteSubmitContext,
  type QuoteSubmitMode,
} from "@/lib/quote-submit";
import { addDays } from "@/lib/invoices";
import { cn } from "@/lib/utils";
import { useSalesSettings } from "@/lib/use-sales-settings";
import { useQuotesStore } from "@/stores/quotes";

export function QuoteEditor({
  quoteId,
  templateId,
  duplicateId,
  variant = "general",
}: {
  quoteId?: string;
  templateId?: string;
  /** Copying an existing quote: same work, its own number and dates. */
  duplicateId?: string;
  /**
   * Which kind of blank quote to open. Only used for a new one — an existing
   * quote already knows, from its own `quote_type`.
   */
  variant?: "general" | "ndis";
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const quotes = useQuotesStore((state) => state.quotes);
  const { settings: sales } = useSalesSettings();
  const { business } = useActiveBusiness();
  const { country, loading: countryLoading, ready: countryReady } = useCountryContext();
  /** The books' currency: AUD for an Australian business, NZD for a New Zealand one. */
  const baseCurrency = country.currency;

  /** Either path loads the same record; only what's kept from it differs. */
  const sourceId = quoteId ?? duplicateId;

  const [draft, setDraft] = React.useState<QuoteDraft>(() => {
    const today = toIsoDate(new Date());
    // The number is blank until the server hands one over, below.
    const blank =
      variant === "ndis"
        ? emptyNdisQuoteDraft("", today)
        : emptyQuoteDraft("", today);
    // Notes start empty and are filled from the business's saved note below,
    // if it has one.
    return blank;
  });

  /**
   * Files picked in this session, keyed by the attachment id shown in the
   * list, so removing a row here removes the right file rather than the first
   * one that happens to share its name.
   */
  const [files, setFiles] = React.useState<{ id: string; file: File }[]>([]);
  const [numberEditable, setNumberEditable] = React.useState(false);
  const numberInputRef = React.useRef<HTMLInputElement | null>(null);

  /* ---------------------------------------------------------------- *
   * What the editor needs before it can save a real quote
   * ---------------------------------------------------------------- */

  const brandingQuery = useQuery({
    queryKey: ["invoice-branding"],
    queryFn: fetchInvoiceBranding,
  });
  const emailQuery = useQuery({
    queryKey: ["invoice-email"],
    queryFn: fetchInvoiceEmail,
  });
  const ratesQuery = useQuery({
    // Rates are per unit of the base, so a business on another base needs its own table.
    queryKey: ["exchange-rates", baseCurrency],
    queryFn: () => fetchExchangeRates(baseCurrency),
    staleTime: 60 * 60 * 1000,
  });
  const contactsQuery = useQuery({
    queryKey: ["invoice-contacts"],
    // Wrapped rather than passed by reference: React Query hands its own
    // context object to the fetcher, which the `type` parameter would now
    // swallow.
    queryFn: () => fetchInvoiceContacts(),
  });
  /*
   * The tax this quote charges: the business's custom rate from Settings, or its
   * country's standard rate on the quote date (AU 10%, NZ 15%) — the rule the
   * server applies — and whether lines can carry tax at all. Saved lines keep the
   * rate they were quoted at.
   */
  const docTax = documentTax(country, draft.issued);
  const tax = { gstPercent: docTax.rate, gstEnabled: docTax.offered };
  // Memoised: the recipient backfill below depends on it, and a fresh `[]`
  // every render would re-run that effect every render.
  const contacts = React.useMemo(
    () => contactsQuery.data ?? [],
    [contactsQuery.data],
  );
  // The server owns the sequence and skips numbers already taken, so a new
  // quote asks for its number rather than deriving one that could collide.
  const numberQuery = useQuery({
    queryKey: ["next-quote-number"],
    queryFn: fetchNextQuoteNumber,
    enabled: !quoteId,
    // Always re-asked: a number handed out and then used elsewhere would
    // otherwise be offered twice.
    staleTime: 0,
  });

  /** The quote being edited or copied, line items included. */
  const detailQuery = useQuery({
    queryKey: ["quote", sourceId],
    queryFn: () => fetchQuoteDetail(sourceId as string),
    enabled: !!sourceId,
  });

  // The list row, so the heading is right on the first paint rather than
  // after the detail lands. The detail then supplies the real line items.
  const storedQuote = quoteId
    ? quotes.find((quote) => quote.id === quoteId)
    : undefined;
  const editing = quoteId ? (detailQuery.data ?? storedQuote) : undefined;

  const [validity, setValidity] = React.useState(
    String(DEFAULT_QUOTE_VALIDITY),
  );

  // Applied once: after this the draft is the user's, and re-applying it on
  // every refetch would throw their edits away.
  const documentHydrated = React.useRef(false);
  /*
   * A copy waits for `/v2/quote-no` as well as the original: its number and
   * its custom note both come from there, as AddQuote.js's duplicate does. A
   * failed lookup doesn't hold it up — the number field is then left for the
   * person to fill.
   */
  const numberSettled = !!numberQuery.data || numberQuery.isError;
  React.useEffect(() => {
    if (!detailQuery.data || documentHydrated.current) return;
    if (duplicateId && !numberSettled) return;
    documentHydrated.current = true;
    const source = detailQuery.data;
    const next = duplicateId
      ? duplicateQuoteDraft(
          source,
          toIsoDate(new Date()),
          numberQuery.data ?? null,
        )
      : draftFromQuote(source);
    setDraft(next);
    // "Valid for" follows the document it was opened on, not the default.
    setValidity(String(quoteValidityDays(next.issued, next.expiry)));
  }, [detailQuery.data, duplicateId, numberSettled, numberQuery.data]);

  // Only ever fills a blank, so it's safe to re-run — and re-running is what
  // settles the race with the hydration above, whichever lands second.
  React.useEffect(() => {
    if (!numberQuery.data) return;
    setDraft((current) => ({
      ...current,
      number: current.number || numberQuery.data.number,
    }));
  }, [numberQuery.data]);

  /*
   * The business's saved note prefills a new quote, and nothing else does: if
   * branding has no note the field stays empty rather than being filled with
   * something the quote was never meant to carry. A quote being edited or
   * copied keeps its own note, which is why this only runs for a fresh one.
   */
  React.useEffect(() => {
    const savedNote = brandingQuery.data?.invoiceNote?.trim();
    if (!savedNote || sourceId) return;
    setDraft((current) =>
      current.notes ? current : { ...current, notes: savedNote },
    );
  }, [brandingQuery.data, sourceId]);

  // The saved from-address, for a quote that doesn't carry one of its own.
  React.useEffect(() => {
    if (!emailQuery.data) return;
    setDraft((current) =>
      current.quoteEmail ? current : { ...current, quoteEmail: emailQuery.data },
    );
  }, [emailQuery.data]);

  // Starting from a saved template: its real record, line items included.
  const templateDetailQuery = useQuery({
    queryKey: ["quote-default-detail", templateId],
    queryFn: () => fetchQuoteDefaultDetail(templateId as string),
    enabled: !!templateId && !sourceId,
  });
  /** The template's own name, for the subtitle — `category` is what it's saved under. */
  const templateName = templateDetailQuery.data?.category?.trim();
  /*
   * A template opened in the wrong editor — an NDIS one at the general route,
   * or the other way round — is moved to the right one before anything is
   * applied, so its supports never land in a table with no columns for them.
   */
  const templateEditor = templateDetailQuery.data
    ? templateEditorFromDetail(templateDetailQuery.data)
    : null;
  const wrongEditor =
    !!templateId && !!templateEditor && templateEditor !== variant;
  React.useEffect(() => {
    if (!wrongEditor || !templateId) return;
    router.replace(
      `/quotes/new/${templateEditor === "ndis" ? "ndis" : "manual"}?template=${templateId}`,
    );
  }, [wrongEditor, templateEditor, templateId, router]);
  // Applied once — after that the draft is the user's, and re-applying would
  // undo their edits every time the query refetched.
  const templateHydrated = React.useRef(false);
  React.useEffect(() => {
    if (!templateDetailQuery.data || templateHydrated.current) return;
    if (wrongEditor) return;
    templateHydrated.current = true;
    const detail = templateDetailQuery.data;
    setDraft((current) => draftFromQuoteDefault(detail, current));
    setValidity(String(quoteDefaultValidity(detail)));
  }, [templateDetailQuery.data, wrongEditor]);

  /* ---------------------------------------------------------------- *
   * The client, and what follows from it
   * ---------------------------------------------------------------- */

  const ndis = draft.ndis;

  /*
   * A client created from the picker may come back without its contact's id —
   * the create response doesn't always include one. The refetched list does,
   * so it's filled in here rather than sending an empty `selected_contact`
   * the server can't resolve to anybody.
   */
  React.useEffect(() => {
    const unresolved = (draft.recipients ?? []).some((person) => !person.id);
    if (!unresolved || !draft.clientId || contacts.length === 0) return;

    const group = contacts.filter(
      (contact) => contact.clientId === draft.clientId,
    );
    // The list can land before it includes the client just created. Nothing
    // to fill from yet, so the draft is left as it is — writing a fresh
    // recipients array anyway would re-run this effect forever.
    if (group.length === 0) return;

    setDraft((current) => {
      let changed = false;
      const recipients = (current.recipients ?? []).map((person) => {
        if (person.id) return person;
        const match =
          group.find((contact) => contact.email === person.email) ??
          group.find((contact) => contact.isPrimary) ??
          group[0];
        if (!match) return person;
        changed = true;
        return { ...person, id: match.id };
      });
      return changed ? { ...current, recipients } : current;
    });
  }, [contacts, draft.recipients, draft.clientId]);

  const ndisDetailsQuery = useQuery({
    queryKey: ["client-ndis-details", draft.clientId],
    queryFn: () => fetchClientNdisDetails(draft.clientId as string),
    enabled: ndis && !!draft.clientId,
  });

  /** The client's own currency, which is what makes conversion available. */
  const clientCurrency: DocumentCurrency | null =
    contacts.find((contact) => contact.clientId === draft.clientId)
      ?.clientCurrency ?? null;
  // Not until the country is known: the fallback context is Australian.
  const foreignClient =
    !countryLoading && !!clientCurrency && clientCurrency !== baseCurrency;

  const publishedRate = clientCurrency
    ? (ratesQuery.data?.[clientCurrency] ?? null)
    : null;
  /** What actually gets saved: the override if there is one, else today's. */
  const activeRate = draft.rateEdited
    ? (draft.exchangeRate ?? null)
    : publishedRate;
  const converting = !!draft.convertCurrency && foreignClient;
  const documentCurrency: DocumentCurrency = converting
    ? (clientCurrency as DocumentCurrency)
    : baseCurrency;

  /**
   * Switching the quote into the client's currency, or back out of it.
   *
   * Shared by the Currency column on the line items and the conversion card,
   * because they're two views of one decision — the whole document is priced
   * in one currency, so ticking any row ticks them all.
   */
  const setConvertCurrency = (value: boolean) =>
    patchSetting({
      convertCurrency: value,
      currency: value ? (clientCurrency ?? undefined) : undefined,
      // Starts from today's published rate; an override is re-entered
      // deliberately rather than carried across a switch off and on again.
      exchangeRate: value ? publishedRate : null,
      rateEdited: false,
    });

  // Swapping to a client billed in dollars has to stand the conversion down,
  // or the quote would keep a rate that no longer applies to anyone.
  React.useEffect(() => {
    if (!foreignClient && (draft.convertCurrency || draft.currency)) {
      setDraft((current) => ({
        ...current,
        convertCurrency: false,
        currency: undefined,
        exchangeRate: null,
        rateEdited: false,
      }));
    }
  }, [foreignClient, draft.convertCurrency, draft.currency]);

  /* ---------------------------------------------------------------- *
   * Validation
   * ---------------------------------------------------------------- */

  /** GST applies only where the business charges it, and Sales settings shows it. */
  const showGst = tax.gstEnabled && sales.quoteFields.gst;

  /*
   * With GST off for this document the column isn't rendered at all, so a line
   * arriving with GST already set would add tax to the totals through a switch
   * nobody can see. NDIS quotes are exempt: their GST switch is always shown,
   * because the occasional support genuinely does carry it.
   */
  React.useEffect(() => {
    if (showGst || !countryReady || ndis) return;
    setDraft((current) =>
      current.items.some((item) => item.gst)
        ? {
            ...current,
            items: current.items.map((item) => ({ ...item, gst: false })),
          }
        : current,
    );
  }, [showGst, countryReady, ndis]);

  /*
   * Only ever the verdict on the client actually selected. `ndisClientIssue`
   * checks the details it was given were fetched for this client, and the
   * fetching guard covers the refetch window — so changing client clears the
   * message instead of carrying the previous client's over.
   */
  const claimIssue =
    ndis && !ndisDetailsQuery.isFetching
      ? ndisClientIssue(ndisDetailsQuery.data, draft.clientId)
      : undefined;

  const totals = invoiceTotals(draft.items, draft.extraDiscount, tax.gstPercent);

  /**
   * Errors surface field by field, once that field has been touched — picking
   * a client shouldn't light up every other empty field on a fresh quote. A
   * save attempt reveals the lot.
   */
  const [touched, setTouched] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [attempted, setAttempted] = React.useState(false);
  const touch = (keys: string[]) =>
    setTouched((current) =>
      keys.every((key) => current.has(key))
        ? current
        : new Set([...current, ...keys]),
    );

  const fieldRefs = React.useRef<Record<string, HTMLElement | null>>({});
  const register = (key: string) => (node: HTMLElement | null) => {
    fieldRefs.current[key] = node;
  };

  const issues = [
    ...documentIssues(draft, "quote"),
    ...(ndis ? ndisIssues(draft.items) : []),
  ];
  const issueFor = (key: string) =>
    attempted || touched.has(key)
      ? issues.find((issue) => issue.key === key)?.message
      : undefined;

  const blocked = issues.length > 0 || !!claimIssue;
  /** Why the quote can't be saved yet, in one sentence. */
  const blockedReason = claimIssue ?? issues[0]?.message ?? null;

  const patch = (values: Partial<QuoteDraft>) => {
    // The client is one issue spread over three draft fields.
    touch(
      Object.keys(values).map((field) =>
        field === "clientId" || field === "clientName" || field === "recipients"
          ? "client"
          : field,
      ),
    );
    setDraft((current) => ({ ...current, ...values }));
  };

  /**
   * Settings live on the draft too, but flipping a switch isn't a field edit —
   * routing them through `patch` would reveal every validation error on a
   * pristine quote.
   */
  const patchSetting = (values: Partial<QuoteDraft>) =>
    setDraft((current) => ({ ...current, ...values }));

  const patchItem = (id: string, values: Partial<InvoiceLineItem>) => {
    touch(Object.keys(values).map((field) => `item-${id}-${field}`));
    setDraft((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.id === id ? { ...item, ...values } : item,
      ),
    }));
  };

  const removeItem = (id: string) =>
    setDraft((current) => ({
      ...current,
      // Dropping a line shifts every index above it, so a deposit pinned to
      // chosen lines would silently start covering different work.
      deposit: current.deposit?.mode === "items" ? null : current.deposit,
      items: current.items.filter((item) => item.id !== id),
    }));

  const addItem = (item: InvoiceLineItem) =>
    setDraft((current) => ({ ...current, items: [...current.items, item] }));

  const [saving, setSaving] = React.useState<QuoteSubmitMode | null>(null);
  /*
   * The participant's missing NDIS number is fixed in a dialog over the
   * editor, not by leaving it. The save that hit it is remembered, and run
   * again once the number is on file and the claim check has cleared.
   */
  const [ndisDialogOpen, setNdisDialogOpen] = React.useState(false);
  const [ndisPendingMode, setNdisPendingMode] =
    React.useState<QuoteSubmitMode | null>(null);
  const [ndisRetryMode, setNdisRetryMode] =
    React.useState<QuoteSubmitMode | null>(null);
  /** The top-of-form "Preview" button, rendering the draft without saving it. */
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = React.useState(false);

  /**
   * Everything a request to the server needs beyond the draft itself. Shared
   * by the real save and the runtime preview, since a preview is a request
   * for exactly the document save would produce.
   */
  const submitContext: QuoteSubmitContext = {
    gstPercent: tax.gstPercent,
    gstEnabled: showGst,
    templateId: quoteTemplateIdFor(brandingQuery.data, ndis),
    exchangeRate: converting ? activeRate : null,
    baseCurrency,
    files: files.map((entry) => entry.file),
    quoteId,
  };

  /** What "Save as template" sends, minus the name the dialog asks for. */
  const templateSaveInput = {
    draft,
    ndis,
    industryId: business?.industryId ?? null,
    gstPercent: tax.gstPercent,
    gstEnabled: showGst,
    renderTemplateId: submitContext.templateId,
  };

  const save = async (mode: QuoteSubmitMode) => {
    setAttempted(true);

    if (blocked) {
      // The participant's NDIS number: add it here, then carry on.
      if (claimIssue) {
        setNdisPendingMode(mode);
        setNdisDialogOpen(true);
        return;
      }
      // Never fail silently: say what's wrong, then go to it.
      if (blockedReason) toast.error(blockedReason);
      const target = issues[0] ? fieldRefs.current[issues[0].key] : null;
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        target.focus({ preventScroll: true });
      }
      return;
    }

    if (saving) return;

    setSaving(mode);
    try {
      const saved = await saveQuoteApi(draft, mode, submitContext);

      // The list, the stat cards and the next available number are all
      // downstream of this having happened.
      await queryClient.invalidateQueries({ queryKey: ["quotes"] });
      queryClient.invalidateQueries({ queryKey: ["next-quote-number"] });
      if (quoteId) {
        queryClient.invalidateQueries({ queryKey: ["quote", quoteId] });
      }

      toast.success(
        mode === "draft"
          ? `${draft.number} saved as draft`
          : mode === "send"
            ? `${draft.number} sent`
            : `${draft.number} saved`,
      );

      /*
       * Save & print hands over the real, server-rendered PDF — the same file
       * the client would receive, rendered from the record that was just
       * saved. Deliberately after the success toast and never fatal: the quote
       * is saved either way, and a failed render must not read as a failed
       * save.
       */
      if (mode === "print") {
        try {
          const blob = await fetchQuotePdfBlob({
            ...(draft as unknown as Quote),
            id: saved.id,
            status: "Draft",
            templateId: submitContext.templateId,
          });
          savePdfBlob(blob, `${draft.number || "quote"}.pdf`);
        } catch {
          toast.error("Saved, but the PDF couldn't be generated.");
        }
      }

      router.push("/quotes");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't save that quote.",
      );
    } finally {
      setSaving(null);
    }
  };

  // The latest `save`, for the retry below — it closes over this render's draft.
  const saveRef = React.useRef(save);
  React.useEffect(() => {
    saveRef.current = save;
  });
  React.useEffect(() => {
    if (!ndisRetryMode || claimIssue) return;
    setNdisRetryMode(null);
    saveRef.current(ndisRetryMode);
  }, [ndisRetryMode, claimIssue]);

  /*
   * A quote that has already been billed is finished as a document: the
   * invoice is the live record of that work from then on, and editing the
   * quote behind it would leave the two disagreeing about the same job. The
   * list disables its Edit button for these, and this is the same rule at the
   * URL — the row isn't the only way in.
   *
   * Duplicating is deliberately still open: copying a billed quote to re-quote
   * the work changes nothing about the invoice.
   */
  const convertedInvoice = quoteId ? editing?.convertedInvoice : undefined;
  if (convertedInvoice) {
    return (
      <Empty>
        <EmptyMedia>
          <Lock aria-hidden />
        </EmptyMedia>
        <div className="space-y-1">
          <EmptyTitle>
            {editing?.number} has already been invoiced
          </EmptyTitle>
          <EmptyDescription>
            It was converted to {convertedInvoice}. A converted quote is locked
            so it can&apos;t drift from the invoice raised off it — change the
            invoice instead, or duplicate the quote to re-quote the work.
          </EmptyDescription>
        </div>
        <EmptyActions>
          <Button asChild>
            <Link href="/invoices">Go to invoices</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/quotes/new/${ndis ? "ndis" : "manual"}?duplicate=${quoteId}`}>
              Duplicate this quote
            </Link>
          </Button>
        </EmptyActions>
      </Empty>
    );
  }

  return (
    <div className="space-y-[15px]">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" size="sm" asChild className="-ml-2 gap-3">
            <Link href={editing ? "/quotes" : "/quotes/new"}>
              <ArrowLeft />
              {editing
                ? `Edit ${editing.number}`
                : ndis
                  ? "New NDIS quote"
                  : "New quote"}
            </Link>
          </Button>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setSaveTemplateOpen(true)}
            >
              <BookmarkPlus />
              Save as template
            </Button>
            {/* What sole-webapp's own top-of-form button does: render the
                draft exactly as it stands, without saving anything. */}
            <Button
              type="button"
              variant="outline"
              onClick={() => setPreviewOpen(true)}
              data-usertour="quote-preview"
            >
              <Eye />
              Preview
            </Button>
          </div>
        </div>
        {templateName && (
          <p className="text-sm text-muted-foreground">
            Prefilled from the {templateName} template.
          </p>
        )}
      </div>

      <RuntimePreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        fetchBlob={() => fetchQuoteRuntimePreviewBlob(draft, submitContext)}
        title="Quote preview"
        filename={`${draft.number || "quote"}-preview.pdf`}
        description="How this quote will look once it's sent — nothing here has been saved."
      />

      <NdisNumberDialog
        open={ndisDialogOpen}
        onOpenChange={(open) => {
          setNdisDialogOpen(open);
          if (!open) setNdisPendingMode(null);
        }}
        clientId={draft.clientId}
        clientName={draft.clientName}
        details={ndisDetailsQuery.data}
        noun="quote"
        onSaved={() => {
          if (ndisPendingMode) setNdisRetryMode(ndisPendingMode);
        }}
      />

      <SaveAsTemplateDialog
        open={saveTemplateOpen}
        onOpenChange={setSaveTemplateOpen}
        noun="quote"
        itemsIssue={quoteTemplateSaveIssue(draft)}
        onCreate={(category) =>
          createQuoteDefaultApi({ ...templateSaveInput, category })
        }
        onUpdate={(id, category) =>
          updateQuoteDefaultApi(id, { ...templateSaveInput, category })
        }
        invalidateKeys={[["quote-templates"], ["quote-default-detail"]]}
        sourceTemplateId={templateId}
        sourceCategory={templateDetailQuery.data?.category}
        sourceReadOnly={isGlobalTemplateOwner(
          templateDetailQuery.data?.user_id,
        )}
      />

      {/* From / To. items-start so the shorter To card sizes to its own
          content instead of stretching into a half-empty box beside From. */}
      <div
        className="grid items-start gap-[15px] lg:grid-cols-2"
        data-usertour="quote-parties"
      >
        <SenderBlock
          fields={sales.quoteFields}
          email={draft.quoteEmail ?? ""}
          onEmailChange={(value) => patch({ quoteEmail: value })}
        />
        {/* The tour's first step points here rather than at From and To
            together: stacked on a phone the pair is taller than the screen. */}
        <FormSection
          icon={UserRound}
          title="To"
          className="space-y-3"
          tourId="quote-client"
        >
          <InvoiceClientSelect
            contacts={contacts}
            loading={contactsQuery.isLoading || detailQuery.isLoading}
            ndis={ndis}
            selection={{
              clientId: draft.clientId,
              clientName: draft.clientName,
              recipients: draft.recipients ?? [],
            }}
            onChange={(selection) => patch(selection)}
            onContactsChanged={() =>
              queryClient.invalidateQueries({ queryKey: ["invoice-contacts"] })
            }
            error={issueFor("client")}
            register={register("client")}
            showAddress={sales.quoteFields.customerAddress}
            showAbn={sales.quoteFields.customerAbn}
          />
          {/* The claim can't be lodged without it — offer the fix in place. */}
          {claimIssue && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
              <span className="text-warning">{claimIssue}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setNdisPendingMode(null);
                  setNdisDialogOpen(true);
                }}
              >
                Add NDIS number
              </Button>
            </div>
          )}
        </FormSection>
      </div>

      {/* Quote meta */}
      <FormSection
        icon={FileText}
        title="Quote details"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <Field
          label="Quote number"
          required
          error={issueFor("number")}
        >
          <div className="relative">
            <Input
              ref={(node) => {
                numberInputRef.current = node;
                register("number")(node);
              }}
              value={draft.number}
              onChange={(event) => patch({ number: event.target.value })}
              readOnly={!numberEditable}
              aria-invalid={!!issueFor("number")}
              className={cn(
                "tabular pr-10",
                !numberEditable && "bg-muted/40",
                issueFor("number") &&
                  "border-destructive focus-visible:ring-destructive",
              )}
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 size-7 -translate-y-1/2"
                  aria-label="Edit quote number"
                  onClick={() => {
                    setNumberEditable(true);
                    // readOnly only lifts on the next render.
                    requestAnimationFrame(() => numberInputRef.current?.focus());
                  }}
                >
                  <Pencil />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                You can edit the number. It&apos;s auto-generated from your
                sales settings.
              </TooltipContent>
            </Tooltip>
          </div>
        </Field>

        <Field label="Quote date" required>
          <DatePicker
            label="Quote date"
            value={draft.issued}
            onChange={(iso) =>
              patch({
                issued: iso,
                expiry: addDays(
                  iso,
                  Number(validity) || DEFAULT_QUOTE_VALIDITY,
                ),
              })
            }
          />
        </Field>

        <Field label="Valid for (days)">
          <Input
            className="tabular"
            inputMode="numeric"
            value={validity}
            onChange={(event) => {
              const next = event.target.value;
              setValidity(next);
              const days = Number(next);
              if (Number.isFinite(days) && next.trim()) {
                patch({ expiry: addDays(draft.issued, days) });
              }
            }}
          />
        </Field>

        <Field label="Quote expiry date" required>
          <DatePicker
            label="Quote expiry date"
            value={draft.expiry}
            onChange={(iso) => patch({ expiry: iso })}
            fromDate={parseIsoDate(draft.issued)}
          />
        </Field>
      </FormSection>

      <Field label="Quote description">
        <Input
          value={draft.description}
          onChange={(event) => patch({ description: event.target.value })}
          placeholder="What is this quote for?"
        />
      </Field>

      {/* Line items — supports on an NDIS quote, ordinary lines otherwise */}
      <section className="space-y-2" data-usertour="quote-line-items">
        <h2 className="text-sm font-medium">
          {ndis ? "Support items" : "Line items"}
        </h2>
        {issueFor(`item-${draft.items[0]?.id}-description`) && (
          <p className="text-xs text-destructive">
            {issueFor(`item-${draft.items[0]?.id}-description`)}
          </p>
        )}
        {ndis ? (
          <NdisLineItems
            items={draft.items}
            gstPercent={tax.gstPercent}
            onPatch={patchItem}
            onRemove={removeItem}
            onAdd={() => addItem(newNdisLineItem())}
            register={register}
            issueFor={issueFor}
            currency={documentCurrency}
            clientCurrency={clientCurrency}
            convertCurrency={!!draft.convertCurrency}
            onConvertCurrencyChange={setConvertCurrency}
          />
        ) : (
          <DocumentLineItems
            showGst={showGst}
            gstPercent={tax.gstPercent}
            items={draft.items}
            onPatch={patchItem}
            onRemove={removeItem}
            onAdd={() => addItem({ ...newLineItem(), gst: showGst })}
            register={register}
            currency={documentCurrency}
            clientCurrency={clientCurrency}
            convertCurrency={!!draft.convertCurrency}
            onConvertCurrencyChange={setConvertCurrency}
            perLineDiscountType
          />
        )}
      </section>

      {/*
       * Left is how the quote is priced and what travels with it; right is
       * what it comes to and what's being asked for up front.
       */}
      <div className="grid items-start gap-[15px] lg:grid-cols-2">
        <div className="space-y-[15px]">
          <AttachmentsCard
            files={draft.attachments ?? []}
            onChange={(value) => patchSetting({ attachments: value })}
            onFilesSelected={(picked) =>
              setFiles((current) => [...current, ...picked])
            }
            onRemoveFile={(file) => {
              // A file already on the server has to be deleted there too; one
              // picked a moment ago has only ever existed in this form.
              const local = files.some((entry) => entry.id === file.id);
              if (local) {
                setFiles((current) =>
                  current.filter((entry) => entry.id !== file.id),
                );
              } else if (quoteId) {
                deleteInvoiceAttachmentApi(file.id).catch(() =>
                  toast.error(`Couldn't remove ${file.name}.`),
                );
              }
              patchSetting({
                attachments: (draft.attachments ?? []).filter(
                  (entry) => entry.id !== file.id,
                ),
              });
            }}
          />
        </div>

        <div className="space-y-[15px]">
          {/* Just the totals, not the deposit and notes beneath: the whole
              column is taller than a phone screen, so the tour card had
              nowhere to sit beside it. */}
          <div data-usertour="quote-totals">
            <TotalsPanel
              showGst={showGst}
              gstPercent={tax.gstPercent}
              currency={documentCurrency}
              align="stretch"
              items={draft.items}
              extraDiscount={draft.extraDiscount}
              onExtraDiscountChange={(value) => patch({ extraDiscount: value })}
            />
          </div>

          {/* Only for a client actually recorded in another currency. */}
          {foreignClient && clientCurrency && (
            <CurrencyConversionCard
              currency={clientCurrency}
              baseCurrency={baseCurrency}
              enabled={!!draft.convertCurrency}
              onEnabledChange={setConvertCurrency}
              rate={activeRate}
              publishedRate={publishedRate}
              edited={!!draft.rateEdited}
              onRateChange={(value) => {
                const parsed = Number(value);
                patchSetting({
                  exchangeRate:
                    Number.isFinite(parsed) && parsed > 0 ? parsed : null,
                  rateEdited: true,
                });
              }}
              onRateReset={() =>
                patchSetting({ exchangeRate: publishedRate, rateEdited: false })
              }
              documentTotal={totals.total}
            />
          )}

          <DepositCard
            deposit={draft.deposit ?? null}
            onChange={(value) => patchSetting({ deposit: value })}
            total={totals.total}
            items={draft.items}
            gstPercent={tax.gstPercent}
            issued={draft.issued}
            currency={documentCurrency}
          />

          {/* Notes only: a quote has no saved-note toggle and no extra note.
              Whatever the record already carries for those is left untouched
              and sent back as it was. */}
          <InvoiceNotesCard
            notes={draft.notes}
            onNotesChange={(value) => patch({ notes: value })}
          />
        </div>
      </div>

      <div className="sticky bottom-0 z-10 -mb-2 flex flex-wrap items-center justify-end gap-2 border-t bg-background py-3">
        {/*
          What's still outstanding. Names the first specific problem rather
          than only counting them, and stays put after an attempt so the
          reason is still on screen once the page has scrolled to the field.
        */}
        {attempted && blocked && blockedReason && (
          <p className="mr-auto text-xs text-destructive">
            {blockedReason}
            {issues.length > 1 && (
              <span className="text-muted-foreground">
                {" "}
                · {issues.length - 1} more to fix
              </span>
            )}
          </p>
        )}

        <Button variant="outline" asChild>
          <Link href="/quotes">Cancel</Link>
        </Button>
        {/* The tour's "Save, print or send" step points here, at the
            buttons, not the full-width bar they sit in. */}
        <div
          className="flex flex-wrap items-center gap-2"
          data-usertour="quote-save-actions"
        >
          <Button
            variant="outline"
            onClick={() => save("draft")}
            disabled={!!saving}
          >
            {saving === "draft" ? "Saving…" : "Save as draft"}
          </Button>
          <Button
            variant="outline"
            onClick={() => save("print")}
            disabled={!!saving}
          >
            {saving === "print" ? "Saving…" : "Save & print"}
          </Button>
          <Button onClick={() => save("send")} disabled={!!saving}>
            {saving === "send" ? "Sending…" : "Save & send"}
          </Button>
        </div>
      </div>
    </div>
  );
}
