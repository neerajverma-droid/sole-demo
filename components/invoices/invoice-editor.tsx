"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookmarkPlus,
  Eye,
  FileText,
  Pencil,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useUnsavedChanges } from "@/components/ui/unsaved-changes";
import { CurrencyConversionCard } from "@/components/documents/currency-conversion-card";
import { DatePicker } from "@/components/documents/date-picker";
import { Field } from "@/components/documents/field";
import { InvoiceClientSelect } from "@/components/documents/invoice-client-select";
import { DocumentLineItems } from "@/components/documents/line-items";
import { NdisLineItems } from "@/components/documents/ndis-line-items";
import { InvoiceRuntimePreviewDialog } from "@/components/invoices/invoice-runtime-preview-dialog";
import { AddAddressDialog } from "@/components/invoices/add-address-dialog";
import { AddBankDetailsDialog } from "@/components/invoices/add-bank-details-dialog";
import { InvoiceReadyDialog } from "@/components/invoices/invoice-ready-dialog";
import { SaveAsTemplateDialog } from "@/components/invoices/save-as-template-dialog";
import { NdisNumberDialog } from "@/components/documents/ndis-number-dialog";
import { SenderBlock } from "@/components/documents/sender-block";
import { TotalsPanel } from "@/components/documents/totals-panel";
import {
  AttachmentsCard,
  DepositCard,
  FollowUpReminderRow,
  InvoiceNotesCard,
  PaymentDetailsCard,
  PaymentMethodCard,
  RepeatingInvoiceRow,
  ToggleRow,
} from "@/components/documents/invoice-extras";
import {
  createInvoiceDefaultApi,
  draftFromInvoiceDefault,
  fetchInvoiceDefaultDetail,
  isGlobalTemplateOwner,
  templateSaveIssue,
  updateInvoiceDefaultApi,
} from "@/lib/invoice-templates";
import {
  fetchExchangeRates,
  fetchInvoiceBranding,
  fetchInvoiceEmail,
  fetchInvoicePaymentRails,
  updateSolePaySettingsApi,
  fetchNextInvoiceNumber,
  templateIdFor,
  DEFAULT_PAYMENT_RAILS,
} from "@/lib/invoice-context";
import {
  fetchClientNdisDetails,
  fetchInvoiceContacts,
  ndisClientIssue,
  primaryContactFor,
} from "@/lib/invoice-clients";
import {
  saveInvoiceApi,
  type InvoiceSubmitContext,
  type InvoiceSubmitMode,
} from "@/lib/invoice-submit";
import {
  DEFAULT_PAYMENT_TERMS,
  addDays,
  daysBetween,
  deleteInvoiceAttachmentApi,
  documentIssues,
  draftFromInvoice,
  emptyInvoiceDraft,
  emptyNdisDraft,
  fetchInvoiceDetail,
  fetchInvoicePdfBlob,
  invoiceTotals,
  ndisIssues,
  newLineItem,
  lineItemFromCatalogue,
  newNdisLineItem,
  parseIsoDate,
  savePdfBlob,
  newAttachmentId,
  toIsoDate,
  type DocumentCurrency,
  type InvoiceDraft,
  type InvoiceLineItem,
  type InvoiceSeed,
} from "@/lib/invoices";
import { apiErrorMessage } from "@/lib/api-error";
import { activeBusiness, useBusinessesStore } from "@/stores/businesses";
import { cn } from "@/lib/utils";
import { useSalesSettings } from "@/lib/use-sales-settings";
import {
  invoiceDraftFromExpense,
  lineItemFromExpense,
  type Expense,
} from "@/lib/expenses";
import { fetchQuoteDetail, invoiceDraftFromQuote } from "@/lib/quotes";
import {
  hasBusinessAddress,
  updateBusinessShowBankDetailsApi,
} from "@/lib/businesses";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { useCountryContext } from "@/hooks/use-country-context";
import { bankFieldsPhrase, documentTax, hasRequiredBankFields } from "@/lib/country-context";
import { useExpensesStore } from "@/stores/expenses";
import { useQuotesStore } from "@/stores/quotes";
import { useInventoryStore } from "@/stores/inventory";
import { useCaptureStore } from "@/stores/capture";
import { sessionUserId, useSessionStore } from "@/stores/session";

export function InvoiceEditor({
  invoiceId,
  templateId,
  itemId,
  expenseId,
  expense,
  quoteId,
  duplicateId,
  seed,
  variant = "general",
  embedded = false,
  onClose,
  onSaved,
}: {
  invoiceId?: string;
  templateId?: string;
  /** A catalogue item to open with, from Products & services → Add to invoice. */
  itemId?: string;
  /** An expense being on-charged, from Expenses → Convert to invoice. */
  expenseId?: string;
  /**
   * The same expense, handed over directly rather than looked up by id —
   * what the expenses list's own Convert to invoice dialog passes, since the
   * listing is paginated server-side and the store `expenseId` resolves
   * against generally doesn't hold the row.
   */
  expense?: Expense;
  /** An accepted quote being invoiced, from Quotes → Convert to invoice. */
  quoteId?: string;
  /**
   * An existing invoice being copied. Unlike `invoiceId` this creates a new
   * document: the client, lines and settings come across, but the number and
   * dates are fresh and the attachments don't follow.
   */
  duplicateId?: string;
  /**
   * Lines raised from another module (KM Tracker's Convert to invoice),
   * treated the way an on-charged expense is: a new invoice opens with them
   * and their client, a chosen draft (`invoiceId`) gets them appended, and
   * the account's GST default leaves them alone.
   */
  seed?: InvoiceSeed;
  /**
   * Which kind of blank invoice to open. Only used for a new one — an existing
   * invoice already knows, from whether its lines carry support numbers.
   */
  variant?: "general" | "ndis";
  /**
   * Rendered inside a dialog instead of on its own page. The dialog owns the
   * title and the close control, so the page heading and the "Invoices" back
   * button are left off, and leaving goes through `onClose` rather than a
   * route change.
   */
  embedded?: boolean;
  /** Cancel, or the guarded back action, when embedded. */
  onClose?: () => void;
  /**
   * Called instead of navigating to the list once an invoice is saved, so the
   * host can record what it was raised for — the expenses list uses it to
   * mark the expense invoiced.
   */
  onSaved?: (saved: { id: string; number: string }) => void | Promise<void>;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  /*
   * `user_id` first, not `id`. The profile endpoint returns `user_id`
   * (`buildUserProfile` in sole-ocr's auth.service.js); `id` is declared
   * optional on the session shape and never actually arrives, so reading it
   * alone type-checks cleanly and resolves null on every render. Same
   * `.user_id ?? .id` fallback the other seven readers of this store use.
   */
  const userId = useSessionStore((state) => sessionUserId(state.user));

  // Which fields this document type shows, plus the saved invoice note.
  const { settings: sales } = useSalesSettings();

  const catalogueItem = useInventoryStore((state) =>
    itemId ? state.items.find((item) => item.id === itemId) : undefined,
  );
  const storedExpense = useExpensesStore((state) =>
    expenseId
      ? state.expenses.find((entry) => entry.id === expenseId)
      : undefined,
  );
  const sourceExpense = expense ?? storedExpense;
  const linkExpenseInvoice = useExpensesStore((state) => state.linkInvoice);
  /*
   * The quote being converted, as the list already has it — enough to open the
   * editor on the right client and description immediately. Its line items are
   * the list's single stand-in, though, so the real ones are fetched below and
   * replace them once they land.
   */
  const sourceQuote = useQuotesStore((state) =>
    quoteId ? state.quotes.find((quote) => quote.id === quoteId) : undefined,
  );

  /* ---------------------------------------------------------------- *
   * The business, and everything the server has to tell us before an
   * invoice can be raised on it.
   * ---------------------------------------------------------------- */

  /*
   * The open business's profile, read from the store: the businesses list
   * already returns the full record — industry, NDIS number, bank account and
   * address included — so the editor has all of it without a request of its
   * own.
   */
  const {
    business: businessProfile,
    ready: businessReady,
    error: businessError,
  } = useActiveBusiness();
  // Which bank fields the client pays into is the business's country's call:
  // a BSB and account number in Australia, one account number in New Zealand.
  const { country, loading: countryLoading, ready: countryReady } = useCountryContext();
  /** The books' currency: AUD for an Australian business, NZD for a New Zealand one. */
  const baseCurrency = country.currency;

  const brandingQuery = useQuery({
    queryKey: ["invoice-branding"],
    queryFn: fetchInvoiceBranding,
  });
  const numberQuery = useQuery({
    queryKey: ["next-invoice-number"],
    queryFn: fetchNextInvoiceNumber,
    // The server's next number is only right for a document that doesn't have
    // one; an invoice being edited keeps its own.
    enabled: !invoiceId,
    // Always re-asked: a number handed out and then used elsewhere would
    // otherwise be offered twice.
    staleTime: 0,
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
  const railsQuery = useQuery({
    queryKey: ["invoice-payment-rails", userId],
    queryFn: () => fetchInvoicePaymentRails(userId),
  });
  const contactsQuery = useQuery({
    queryKey: ["invoice-contacts"],
    // Wrapped rather than passed by reference: React Query hands its own
    // context object to the fetcher, which the `type` parameter would now
    // swallow.
    queryFn: () => fetchInvoiceContacts(),
  });

  /*
   * SolePay's payment method and "Automate payments?" are account settings,
   * saved the moment they change (as sole-webapp does). The local overrides
   * keep the card showing the choice while the save and refetch land, so the
   * payload built in between already uses it.
   */
  const [solePayOverrides, setSolePayOverrides] = React.useState<{
    paymentType?: string;
    automate?: boolean;
  }>({});
  const [savingSolePay, setSavingSolePay] = React.useState(false);
  const rails = React.useMemo(() => {
    const base = railsQuery.data ?? DEFAULT_PAYMENT_RAILS;
    return {
      ...base,
      paymentType: solePayOverrides.paymentType ?? base.paymentType,
      payrixAutomate: solePayOverrides.automate ?? base.payrixAutomate,
    };
  }, [railsQuery.data, solePayOverrides]);

  const saveSolePaySetting = async (settings: {
    paymentType?: string;
    automate?: boolean;
  }) => {
    if (!userId) return;
    const previous = solePayOverrides;
    setSolePayOverrides((current) => ({ ...current, ...settings }));
    setSavingSolePay(true);
    try {
      await updateSolePaySettingsApi(userId, {
        paymentMethod: settings.paymentType,
        automate: settings.automate,
      });
      await queryClient.invalidateQueries({
        queryKey: ["invoice-payment-rails"],
      });
    } catch (error) {
      setSolePayOverrides(previous);
      toast.error(apiErrorMessage(error, "Couldn't update SolePay."));
    } finally {
      setSavingSolePay(false);
    }
  };
  // Memoised because the recipient backfill effect below depends on it — a
  // fresh `[]` every render would re-run that effect every render.
  const contacts = React.useMemo(
    () => contactsQuery.data ?? [],
    [contactsQuery.data],
  );

  /* ---------------------------------------------------------------- *
   * The draft
   * ---------------------------------------------------------------- */

  // Files the seed brings along (Time Tracker's timesheet PDF), attached as if
  // they'd just been picked: listed now, uploaded with the save.
  const [seedFiles] = React.useState(() =>
    (seed?.files ?? []).map((file) => ({ id: newAttachmentId(), file })),
  );
  const seedAttachments = React.useMemo(
    () => seedFiles.map(({ id, file }) => ({ id, name: file.name, size: file.size })),
    [seedFiles],
  );

  // Seeded once: re-deriving would discard edits on every store change. The
  // server's number and any template arrive async, through the hydration
  // effects below, so the first paint never waits on them.
  const [draft, setDraft] = React.useState<InvoiceDraft>(() => {
    const today = toIsoDate(new Date());
    if (variant === "ndis") return emptyNdisDraft("", today);

    const blank = emptyInvoiceDraft("", today);
    // Converting an accepted quote: the same work, now billed.
    if (sourceQuote) return invoiceDraftFromQuote(sourceQuote, blank);
    // On-charging an expense: open with it as the single line, carrying the
    // same payload sole-webapp hands its own invoice form.
    if (sourceExpense) {
      return invoiceDraftFromExpense(sourceExpense, blank) ?? blank;
    }
    if (seed) {
      return {
        ...blank,
        clientId: seed.clientId,
        clientName: seed.clientName,
        recipients: [],
        description: seed.description,
        items: seed.items.length > 0 ? seed.items : blank.items,
        attachments: seedAttachments,
      };
    }
    // Arrived from a catalogue item: open with it as the first line.
    return catalogueItem
      ? {
          ...blank,
          description: catalogueItem.name,
          items: [lineItemFromCatalogue(catalogueItem)],
        }
      : blank;
  });

  /**
   * Files picked in this session, keyed by the attachment id shown in the
   * list, so removing a row here removes the right file rather than the first
   * one that happens to share its name.
   */
  const [files, setFiles] = React.useState<{ id: string; file: File }[]>(seedFiles);
  const [numberEditable, setNumberEditable] = React.useState(false);
  const numberInputRef = React.useRef<HTMLInputElement | null>(null);

  /**
   * Errors surface field by field, once that field has been touched — picking
   * a client shouldn't light up every other empty field on a fresh invoice.
   * A save attempt reveals the lot.
   */
  const [touchedFields, setTouchedFields] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [attempted, setAttempted] = React.useState(false);
  const touchFields = (keys: string[]) =>
    setTouchedFields((current) =>
      keys.every((key) => current.has(key))
        ? current
        : new Set([...current, ...keys]),
    );
  const [saving, setSaving] = React.useState<InvoiceSubmitMode | null>(null);
  const savingRef = React.useRef(false);
  /*
   * The participant's missing NDIS number is fixed in a dialog over the
   * editor, not by leaving it. The save that hit it is remembered, and run
   * again once the number is on file and the claim check has cleared.
   */
  const [ndisDialogOpen, setNdisDialogOpen] = React.useState(false);
  const [ndisPendingMode, setNdisPendingMode] =
    React.useState<InvoiceSubmitMode | null>(null);
  const [ndisRetryMode, setNdisRetryMode] =
    React.useState<InvoiceSubmitMode | null>(null);
  /** The top-of-form "Preview" button, rendering the draft without saving it. */
  const [previewOpen, setPreviewOpen] = React.useState(false);
  /** The inline "add your bank details" dialog, opened from the banner or on a blocked Save. */
  const [bankDetailsOpen, setBankDetailsOpen] = React.useState(false);
  /** Same, for the business address — see `missingAddress` below. */
  const [addressDetailsOpen, setAddressDetailsOpen] = React.useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = React.useState(false);
  /** Opens the list's PDF viewer on a particular invoice, after Save & print. */

  /**
   * Whether there's anything a Cancel or a back button would lose. Separate
   * from `touchedFields`: that exists to gate *validation*, so a settings-only
   * change (a switch, a deposit) deliberately leaves it alone — but the same
   * change is real work all the same, and this tracks it regardless of which
   * patch helper made it. Hydration never touches it: every effect below
   * writes through `setDraft` directly, not through these helpers.
   */
  const [touched, setTouched] = React.useState(false);
  const {
    guard,
    guardNavigate,
    dialog: unsavedChangesDialog,
  } = useUnsavedChanges(touched);

  /**
   * Leaving the form. On its own page that's the invoice list; in a dialog
   * it's whatever opened it, since there is nowhere to navigate to.
   */
  const leave =
    embedded && onClose ? guard(onClose) : guardNavigate("/invoices");
  // The arrow steps back to the chooser a new invoice came from; an existing
  // one has no chooser behind it, so it returns to the list.
  const goBack =
    embedded && onClose
      ? leave
      : guardNavigate(invoiceId ? "/invoices" : "/invoices/new");

  const patch = (values: Partial<InvoiceDraft>) => {
    // The client is one issue spread over three draft fields.
    touchFields(
      Object.keys(values).map((field) =>
        field === "clientId" || field === "clientName" || field === "recipients"
          ? "client"
          : field,
      ),
    );
    setTouched(true);
    setDraft((current) => ({ ...current, ...values }));
  };

  /**
   * Settings live on the draft too, but flipping a switch isn't a field edit —
   * routing them through `patch` would reveal every validation error on a
   * pristine invoice.
   */
  const patchSetting = (values: Partial<InvoiceDraft>) => {
    setTouched(true);
    setDraft((current) => ({ ...current, ...values }));
  };

  const patchItem = (id: string, values: Partial<InvoiceLineItem>) => {
    touchFields(Object.keys(values).map((field) => `item-${id}-${field}`));
    setTouched(true);
    setDraft((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.id === id ? { ...item, ...values } : item,
      ),
    }));
  };

  const removeItem = (id: string) => {
    setTouched(true);
    setDraft((current) => ({
      ...current,
      // Dropping a line shifts every index above it, so a deposit pinned to
      // chosen lines would silently start covering different work.
      deposit: current.deposit?.mode === "items" ? null : current.deposit,
      items: current.items.filter((item) => item.id !== id),
    }));
  };

  const addItem = (item: InvoiceLineItem) => {
    setTouched(true);
    setDraft((current) => ({ ...current, items: [...current.items, item] }));
  };

  /*
   * The tax this invoice charges: the business's custom rate from Settings, or its
   * country's standard rate on the issue date (AU 10%, NZ 15%) — the same rule the
   * server applies — and whether lines can carry tax at all (registered, and not
   * switched off in Settings). Saved lines keep the rate they were charged at.
   */
  const docTax = documentTax(country, draft.issued);
  const tax = { gstPercent: docTax.rate, gstEnabled: docTax.offered };

  /* ---------------------------------------------------------------- *
   * Hydration. Each source applies once, guarded — the effects run after
   * the first paint, and must never overwrite something typed in between.
   * ---------------------------------------------------------------- */

  // An existing invoice's full record — either the one being edited or the one
  // being copied. The list's own copy carries only a placeholder line; the real
  // breakdown comes from here.
  const sourceId = invoiceId ?? duplicateId;
  const detailQuery = useQuery({
    queryKey: ["invoice", sourceId],
    queryFn: () => fetchInvoiceDetail(sourceId as string),
    enabled: !!sourceId,
  });
  const detailHydrated = React.useRef(false);
  React.useEffect(() => {
    if (!detailQuery.data || detailHydrated.current) return;
    detailHydrated.current = true;

    const loaded = draftFromInvoice(detailQuery.data);
    const today = toIsoDate(new Date());
    // A copy is a new document: it keeps the client, the work and the
    // settings, but its own number and dates, and it starts unsent with no
    // attachments — those belong to the invoice it was copied from.
    const terms = Math.max(0, daysBetween(loaded.issued, loaded.due));

    setDraft({
      ...loaded,
      ...(duplicateId
        ? {
            // Whichever of this and the number lookup lands second wins,
            // since that effect only fills a number that's still blank.
            number: numberQuery.data?.number ?? "",
            issued: today,
            due: addDays(today, terms || DEFAULT_PAYMENT_TERMS),
            attachments: [],
            // A copy is priced today: its lines take the current rate, not the
            // one the original was charged at.
            items: loaded.items.map((item) => ({ ...item, gstPercent: undefined })),
          }
        : {}),
      // Adding work to an existing draft rather than raising a new invoice:
      // the draft keeps everything it already had and the expense joins it as
      // one more line, which is what sole-webapp's own "Use this" does when it
      // appends `initialData.items` to the invoice it loaded.
      ...(sourceExpense && invoiceId
        ? { items: [...loaded.items, lineItemFromExpense(sourceExpense)] }
        : {}),
      ...(seed && invoiceId
        ? {
            items: [...loaded.items, ...seed.items],
            attachments: [...loaded.attachments, ...seedAttachments],
          }
        : {}),
    });
    setTerms(String(terms || DEFAULT_PAYMENT_TERMS));
  }, [
    detailQuery.data,
    duplicateId,
    numberQuery.data,
    sourceExpense,
    seed,
    seedAttachments,
    invoiceId,
  ]);

  /*
   * The quote's full record. Converting has to bill the work that was quoted,
   * line by line — the list row carries only a total collapsed into one
   * placeholder line, so without this an accepted quote for six items became a
   * one-line invoice.
   */
  const quoteDetailQuery = useQuery({
    queryKey: ["quote", quoteId],
    queryFn: () => fetchQuoteDetail(quoteId as string),
    enabled: !!quoteId,
  });
  const quoteHydrated = React.useRef(false);
  React.useEffect(() => {
    if (!quoteDetailQuery.data || quoteHydrated.current) return;
    quoteHydrated.current = true;
    setDraft((current) =>
      invoiceDraftFromQuote(quoteDetailQuery.data, current),
    );
  }, [quoteDetailQuery.data]);

  /*
   * A document read by Create invoice → Upload invoice. The chooser leaves the
   * reading in a store (it's a different route) and it's taken exactly once
   * here, only for a blank general invoice — never over one being edited,
   * copied or converted. Mirrors sole-webapp's `convertExtractedDataToFormData`:
   * the document's own number, dates, lines and notes, with today and the usual
   * terms standing in for a date it couldn't read.
   */
  const captureTaken = React.useRef(false);
  const [capturedClientName, setCapturedClientName] = React.useState("");
  React.useEffect(() => {
    if (captureTaken.current) return;
    captureTaken.current = true;
    if (invoiceId || duplicateId || variant !== "general") return;
    const captured = useCaptureStore.getState().takeInvoice();
    if (!captured) return;

    const { fields, confidence } = captured;
    const issued = fields.issued || toIsoDate(new Date());
    const due = fields.due || addDays(issued, DEFAULT_PAYMENT_TERMS);
    setDraft((current) => ({
      ...current,
      number: fields.number || current.number,
      issued,
      due,
      description: fields.description || current.description,
      notes: fields.notes || current.notes,
      items: fields.items.length > 0 ? fields.items : current.items,
    }));
    setTerms(
      String(
        Math.max(0, daysBetween(issued, due)) || DEFAULT_PAYMENT_TERMS,
      ),
    );
    setCapturedClientName(fields.clientName);
    toast.success(
      `Invoice data extracted with ${Math.round(confidence * 100)}% confidence`,
      { description: "Review the pre-filled details before you save." },
    );
  }, [invoiceId, duplicateId, variant]);

  // The read client name, matched to one of the business's real clients once
  // their list lands — an invoice needs a client id, not a label.
  React.useEffect(() => {
    if (!capturedClientName || !contactsQuery.isSuccess) return;
    const needle = capturedClientName.trim().toLowerCase();
    setCapturedClientName("");
    const group = contacts.filter(
      (contact) => contact.clientName.trim().toLowerCase() === needle,
    );
    const match = group.find((contact) => contact.isPrimary) ?? group[0];
    if (!match) {
      toast.info(`"${capturedClientName}" isn't one of your clients yet`, {
        description: "Pick or add the client to continue.",
      });
      return;
    }
    setDraft((current) =>
      current.clientId
        ? current
        : {
            ...current,
            clientId: match.clientId,
            clientName: match.clientName || match.name,
            recipients: [
              { id: match.id, name: match.name, email: match.email },
            ],
          },
    );
  }, [capturedClientName, contactsQuery.isSuccess, contacts]);

  // Starting from a saved template: its real record, items included.
  const templateDetailQuery = useQuery({
    queryKey: ["invoice-default-detail", templateId],
    queryFn: () => fetchInvoiceDefaultDetail(templateId as string),
    enabled: !!templateId && !invoiceId,
  });
  const templateHydrated = React.useRef(false);
  React.useEffect(() => {
    if (!templateDetailQuery.data || templateHydrated.current) return;
    templateHydrated.current = true;
    const detail = templateDetailQuery.data;
    setDraft((current) => ({
      ...current,
      ...draftFromInvoiceDefault(
        detail,
        variant === "ndis",
        current.number,
        current.issued,
      ),
      // The template supplies the document; the invoice-level settings
      // (recipients, currency, reminders) stay as the blank draft had them.
      recipients: current.recipients,
      invoiceEmail: current.invoiceEmail,
    }));
    if (detail.payment_term) setTerms(String(detail.payment_term));
  }, [templateDetailQuery.data, variant]);

  // The server's next number, and the standing note from Branding that
  // prefills a new invoice — the same field sole-webapp seeds a brand-new
  // invoice's note from. Deliberately not ref-guarded: both only ever fill a
  // blank, so it's safe to re-run, and re-running is what settles the race
  // with the duplicate hydration above and with each other, whichever order
  // the three lookups land in.
  React.useEffect(() => {
    if (!numberQuery.data) return;
    setDraft((current) => ({
      ...current,
      number: current.number || numberQuery.data.number,
    }));
  }, [numberQuery.data]);

  /*
   * Prefilled from Branding's own saved note, and nowhere else. Sales
   * settings' "Custom Invoice Notes" field looks like a second source but
   * isn't one — that screen is still a local, unwired mock seeded with
   * placeholder copy, so treating it as a fallback here meant an account
   * with no branding note saved still got that placeholder text stamped
   * onto every new invoice as if it were real. No branding note means this
   * field opens blank, matching what the account has actually configured.
   */
  React.useEffect(() => {
    if (!brandingQuery.data && !numberQuery.data) return;
    setDraft((current) => ({
      ...current,
      notes:
        current.notes ||
        brandingQuery.data?.invoiceNote ||
        numberQuery.data?.note ||
        "",
    }));
  }, [brandingQuery.data, numberQuery.data]);

  // The address the copy is sent from, and whether GST starts switched on.
  const emailHydrated = React.useRef(false);
  React.useEffect(() => {
    if (emailQuery.data === undefined || emailHydrated.current) return;
    emailHydrated.current = true;
    setDraft((current) => ({
      ...current,
      invoiceEmail: current.invoiceEmail || emailQuery.data,
    }));
  }, [emailQuery.data]);

  // A blank general invoice's first line follows the business's GST setting.
  const gstHydrated = React.useRef(false);
  React.useEffect(() => {
    if (!countryReady || gstHydrated.current) return;
    // A document that arrives with its own lines — an existing invoice, a
    // copy, a template, or an expense being on-charged — already says what
    // GST each line carries. An on-charged expense in particular is billed
    // flat, GST off, because its amount already includes whatever GST was
    // paid; letting the account default switch it back on would bill the
    // client that GST a second time.
    if (invoiceId || templateId || duplicateId || sourceExpense || seed) return;
    gstHydrated.current = true;
    if (variant === "ndis") return;
    setDraft((current) => ({
      ...current,
      items: current.items.map((item) => ({
        ...item,
        gst: tax.gstEnabled,
      })),
    }));
  }, [
    countryReady,
    tax.gstEnabled,
    invoiceId,
    templateId,
    duplicateId,
    variant,
    sourceExpense,
    seed,
  ]);

  /*
   * Whether bank details print is a setting of the business, not of one
   * invoice: the server renders every preview, PDF and email from the
   * business's `show_bank_detail_invoice`. So the switch shows that value —
   * on a saved invoice too — and follows it if the business list refreshes.
   */
  const businesses = useBusinessesStore((state) => state.businesses);
  const activeId = useBusinessesStore((state) => state.activeId);
  const patchBusiness = useBusinessesStore((state) => state.patchBusiness);
  const business = activeBusiness({ businesses, activeId });
  const businessShowsBankDetails = business?.showBankDetailsOnInvoice;
  React.useEffect(() => {
    if (businessShowsBankDetails === undefined) return;
    setDraft((current) =>
      current.showBankDetails === businessShowsBankDetails
        ? current
        : { ...current, showBankDetails: businessShowsBankDetails },
    );
  }, [businessShowsBankDetails]);

  /**
   * Saves as it's flipped — the preview reads it from the server, not from
   * the draft. Flipped back if the save fails, so the switch never claims a
   * state that isn't stored.
   */
  const toggleBankDetails = async (show: boolean) => {
    patchSetting({ showBankDetails: show });
    if (!business) return;
    try {
      await updateBusinessShowBankDetailsApi(business.id, show);
      patchBusiness(business.id, { showBankDetailsOnInvoice: show });
    } catch (error) {
      patchSetting({ showBankDetails: !show });
      toast.error(
        apiErrorMessage(error, "Couldn't update the bank details setting."),
      );
    }
  };

  /* ---------------------------------------------------------------- *
   * Payment terms — the gap between the two dates, kept as its own field
   * so it can be typed either way round.
   * ---------------------------------------------------------------- */

  const [terms, setTerms] = React.useState(String(DEFAULT_PAYMENT_TERMS));

  /* ---------------------------------------------------------------- *
   * The client, and what follows from it
   * ---------------------------------------------------------------- */

  const ndis = draft.ndis;

  /*
   * A seeded client arrives without anyone to address it to. Once the contact
   * list lands, its primary contact becomes the recipient — the same person
   * sole-webapp's KM tracker preselected (`clientDetail.primaryContact`).
   */
  const seedRecipientsHydrated = React.useRef(false);
  React.useEffect(() => {
    if (seedRecipientsHydrated.current || !seed?.clientId || invoiceId) return;
    if (contacts.length === 0) return;
    seedRecipientsHydrated.current = true;
    const primary = primaryContactFor(contacts, seed.clientId);
    if (!primary) return;
    setDraft((current) =>
      current.clientId === seed.clientId && (current.recipients ?? []).length === 0
        ? {
            ...current,
            clientName: current.clientName || primary.clientName,
            recipients: [
              { id: primary.id, name: primary.name, email: primary.email },
            ],
          }
        : current,
    );
  }, [contacts, seed, invoiceId]);

  /*
   * A client created from the picker may come back without its contact's id —
   * the create response doesn't always include one. The refetched list does,
   * so it's filled in here rather than sending an empty `selected_contact`
   * that the server can't resolve to anybody.
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
  const ndisDetails = ndisDetailsQuery.data;

  /** The client's own currency, which is what makes conversion available. */
  const clientCurrency: DocumentCurrency | null =
    contacts.find((contact) => contact.clientId === draft.clientId)
      ?.clientCurrency ?? null;
  // Not until the country is known: the fallback context is Australian, and a
  // New Zealand business would otherwise see its NZD clients as foreign for a moment.
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
   * Switching the invoice into the client's currency, or back out of it.
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
  // or the invoice would keep a rate that no longer applies to anyone.
  React.useEffect(() => {
    /*
     * Only once the client list has actually settled. `foreignClient` reads
     * off `contacts`, which starts empty before `contactsQuery` resolves —
     * so on an invoice being edited or duplicated, `draft.currency` can
     * arrive from the loaded record (via the detail-hydration effect) before
     * the contact it belongs to has loaded, making `foreignClient` false for
     * a client who genuinely is foreign. Acting on that here wiped a
     * multicurrency invoice's currency the instant it was opened, before its
     * own client had even loaded — no toggle, no rate cleared on purpose,
     * just gone.
     */
    if (!contactsQuery.isSuccess && !contactsQuery.isError) return;
    if (!foreignClient && (draft.convertCurrency || draft.currency)) {
      setDraft((current) => ({
        ...current,
        convertCurrency: false,
        currency: undefined,
        exchangeRate: null,
        rateEdited: false,
      }));
    }
  }, [
    foreignClient,
    draft.convertCurrency,
    draft.currency,
    contactsQuery.isSuccess,
    contactsQuery.isError,
  ]);

  /* ---------------------------------------------------------------- *
   * Validation
   * ---------------------------------------------------------------- */

  /** GST applies only where the business charges it. */
  const showGst = tax.gstEnabled && sales.invoiceFields.gst;

  /*
   * With GST off for this document the column isn't rendered at all, so a line
   * arriving with GST already set — from a template, or an invoice raised while
   * GST was still on — would add tax to the totals through a switch nobody can
   * see. Clearing it here keeps the table, the totals and the payload saying
   * the same thing. NDIS claims are exempt: their GST switch is always shown,
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

  const bank = {
    // The account holder falls back to the business's own name, which is what
    // it is for a sole trader who never filled the field in separately.
    accountName:
      businessProfile?.bank.accountHolder || businessProfile?.name || "",
    bsb: businessProfile?.bank.bsb ?? "",
    accountNumber: businessProfile?.bank.accountNumber ?? "",
  };
  // The reference product refuses to raise an invoice without these, and for
  // good reason: the client would get a bill with no way to pay it. Only
  // asserted once the profile has actually loaded — and never on a failed
  // lookup, which must not be the thing that blocks invoicing.
  const missingBankDetails =
    businessReady && !businessError && !hasRequiredBankFields(country, bank);
  // Same reasoning, for the address: a tax invoice isn't valid without one,
  // so it blocks the same way a missing bank account does.
  const missingAddress =
    businessReady &&
    !businessError &&
    !(businessProfile && hasBusinessAddress(businessProfile));

  /*
   * Only ever the verdict on the client actually selected. `ndisClientIssue`
   * checks that the details it was given were fetched for this client, and
   * the fetching guard covers the refetch window — so changing client clears
   * the message instead of carrying the previous client's over.
   */
  const claimIssue =
    ndis && !ndisDetailsQuery.isFetching
      ? ndisClientIssue(ndisDetails, draft.clientId)
      : undefined;

  const issues = [
    ...documentIssues(draft),
    ...(ndis ? ndisIssues(draft.items) : []),
  ];
  const issueFor = (key: string) =>
    attempted || touchedFields.has(key)
      ? issues.find((issue) => issue.key === key)?.message
      : undefined;

  const totals = invoiceTotals(
    draft.items,
    draft.extraDiscount,
    tax.gstPercent,
  );

  /*
   * A foreign-currency invoice with no rate to convert it back to AUD can't
   * be saved — without this, the payload builder would send the client's own
   * figures unconverted as the AUD total while still flagging the invoice as
   * multicurrency, which is wrong regardless of whether the rate is missing
   * because it hasn't loaded yet or because the lookup failed outright.
   */
  const currencyIssue =
    converting && !(activeRate && activeRate > 0)
      ? "Enter the exchange rate for this invoice before saving."
      : undefined;

  const blocked =
    issues.length > 0 ||
    missingBankDetails ||
    missingAddress ||
    !!claimIssue ||
    !!currencyIssue;

  /** Why the invoice can't be saved yet, in one sentence. */
  const blockedReason = claimIssue
    ? claimIssue
    : missingAddress
      ? "Add your business address in Business details before raising an invoice."
      : missingBankDetails
        ? `Add your ${bankFieldsPhrase(country)} in Business details before raising an invoice.`
        : currencyIssue
          ? currencyIssue
          : (issues[0]?.message ?? null);

  /* ---------------------------------------------------------------- *
   * Saving
   * ---------------------------------------------------------------- */

  /**
   * Focus targets, registered by every validated field. Used to take the
   * person to the first thing that needs attention — on a form this long the
   * offending field is usually scrolled off screen, and a footer hint alone
   * reads as a button that simply doesn't work.
   */
  const fieldRefs = React.useRef<Record<string, HTMLElement | null>>({});
  const register = (key: string) => (node: HTMLElement | null) => {
    fieldRefs.current[key] = node;
  };

  /**
   * Everything a request to the server needs beyond the draft itself. Shared
   * by the real save and the runtime preview, since a preview is a request
   * for exactly the document that save would produce — the same template,
   * the same rate, the same attachments — just not written anywhere.
   */
  const submitContext: InvoiceSubmitContext = {
    gstPercent: tax.gstPercent,
    gstEnabled: showGst,
    templateId: templateIdFor(brandingQuery.data, ndis),
    rails,
    exchangeRate: converting ? activeRate : null,
    baseCurrency,
    files: files.map((entry) => entry.file),
    invoiceId,
    projectId: seed?.projectId ?? null,
  };

  /** What "Save as template" sends, minus the name the dialog asks for. */
  const templateSaveInput = {
    draft,
    ndis,
    industryId: businessProfile?.industryId ?? null,
    gstPercent: tax.gstPercent,
    gstEnabled: showGst,
    renderTemplateId: submitContext.templateId,
  };

  const save = async (mode: InvoiceSubmitMode) => {
    setAttempted(true);

    if (blocked) {
      // The address and bank details are the two blockers with somewhere
      // better to go than a toast — straight into the form that fixes them.
      if (missingAddress) {
        setAddressDetailsOpen(true);
        return;
      }
      if (missingBankDetails) {
        setBankDetailsOpen(true);
        return;
      }
      // Likewise the participant's NDIS number: add it here, then carry on.
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

    // `saving` is render state, so two clicks inside one frame would both
    // see it unset — the ref closes that gap and guarantees one invoice.
    if (saving || savingRef.current) return;
    savingRef.current = true;

    setSaving(mode);
    try {
      const saved = await saveInvoiceApi(draft, mode, submitContext);

      // The list, the dashboard's totals and the next available number are all
      // downstream of this having happened.
      await queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["next-invoice-number"] });
      if (invoiceId) {
        queryClient.invalidateQueries({ queryKey: ["invoice", invoiceId] });
      }

      // Record the on-charge, so the expense stops offering to convert again.
      if (sourceExpense) linkExpenseInvoice(sourceExpense.id, saved.id);

      // The host gets first refusal on what happens next — the expenses
      // dialog marks the expense invoiced here and closes itself.
      if (onSaved) await onSaved({ id: saved.id, number: draft.number });

      toast.success(
        mode === "draft"
          ? `${draft.number} saved as draft`
          : mode === "send"
            ? `${draft.number} sent`
            : `${draft.number} saved`,
      );

      /*
       * Save & print downloads the real, server-rendered PDF of the invoice
       * just saved — the same file the client would receive — as sole-webapp
       * does, rather than opening a viewer. Never fatal: the invoice is saved
       * either way, and a failed render must not read as a failed save.
       */
      if (mode === "print") {
        try {
          const blob = await fetchInvoicePdfBlob({
            id: saved.id,
            templateId: submitContext.templateId,
          });
          savePdfBlob(blob, `${draft.number || "invoice"}.pdf`);
        } catch (error) {
          toast.error(
            apiErrorMessage(error, "Saved, but the PDF couldn't be generated."),
          );
        }
      }
      // Nothing left to lose — the navigation below shouldn't ask about it.
      setTouched(false);
      // A dialog has already been handed the result and closed itself; only
      // the full-page editor has a list to return to.
      if (!onSaved) router.push("/invoices");
    } catch (error) {
      // The server's own reason ("…already exists", a validation message),
      // not axios's "Request failed with status code 400".
      toast.error(apiErrorMessage(error, "Couldn't save that invoice."));
    } finally {
      savingRef.current = false;
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

  const editing = !!invoiceId;
  const loadingDocument = !!sourceId && detailQuery.isLoading;

  return (
    <div className="space-y-[15px]">
      {/* The unskippable gate: nothing to mount conditionally on here — it
          reads the same business profile this screen does and renders
          nothing once address + bank are both on file. */}
      <InvoiceReadyDialog />

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {!embedded ? (
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2 gap-3"
              onClick={goBack}
            >
              <ArrowLeft />
              {editing
                ? `Edit ${draft.number || "invoice"}`
                : ndis
                  ? "New NDIS invoice"
                  : "New invoice"}
            </Button>
          ) : (
            <span />
          )}

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
              data-usertour="invoice-preview"
            >
              <Eye />
              Preview
            </Button>
          </div>
        </div>
        {templateDetailQuery.data?.category && (
          <p className="text-sm text-muted-foreground">
            Prefilled from the {templateDetailQuery.data.category} template.
          </p>
        )}
      </div>

      <InvoiceRuntimePreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        draft={draft}
        context={submitContext}
      />

      <NdisNumberDialog
        open={ndisDialogOpen}
        onOpenChange={(open) => {
          setNdisDialogOpen(open);
          if (!open) setNdisPendingMode(null);
        }}
        clientId={draft.clientId}
        clientName={draft.clientName}
        details={ndisDetails}
        noun="invoice"
        onSaved={() => {
          if (ndisPendingMode) setNdisRetryMode(ndisPendingMode);
        }}
      />

      <SaveAsTemplateDialog
        open={saveTemplateOpen}
        onOpenChange={setSaveTemplateOpen}
        noun="invoice"
        itemsIssue={templateSaveIssue(draft)}
        onCreate={(category) =>
          createInvoiceDefaultApi({ ...templateSaveInput, category })
        }
        onUpdate={(id, category) =>
          updateInvoiceDefaultApi(id, { ...templateSaveInput, category })
        }
        invalidateKeys={[["invoice-defaults"]]}
        sourceTemplateId={templateId}
        sourceCategory={templateDetailQuery.data?.category}
        sourceReadOnly={isGlobalTemplateOwner(
          templateDetailQuery.data?.user_id,
        )}
      />

      {/* Nothing can be raised until the invoice has a return address. */}
      {missingAddress && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-destructive">
            Add your business address before raising an invoice
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            A tax invoice has to carry it — without one this isn&apos;t a valid
            invoice.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => setAddressDetailsOpen(true)}
          >
            Add address
          </Button>
        </div>
      )}

      {/* Nothing can be raised until the client has a way to pay. */}
      {missingBankDetails && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-destructive">
            Add your bank details before raising an invoice
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Your bank details print on the invoice — without your{" "}
            {bankFieldsPhrase(country)} the client has no way to pay it.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => setBankDetailsOpen(true)}
          >
            Add bank details
          </Button>
        </div>
      )}

      {businessProfile && (
        <>
          <AddAddressDialog
            open={addressDetailsOpen}
            onOpenChange={setAddressDetailsOpen}
            businessId={businessProfile.id}
          />
          <AddBankDetailsDialog
            open={bankDetailsOpen}
            onOpenChange={setBankDetailsOpen}
            businessId={businessProfile.id}
          />
        </>
      )}

      {/* From / To. items-start so the shorter To card sizes to its own
          content instead of stretching into a half-empty box beside From. */}
      <div
        className="grid items-start gap-[15px] lg:grid-cols-2"
        data-usertour="invoice-parties"
      >
        <SenderBlock
          fields={sales.invoiceFields}
          email={draft.invoiceEmail ?? ""}
          onEmailChange={(value) => patch({ invoiceEmail: value })}
        />
        {/* The tour's first step points here rather than at From and To
            together: stacked on a phone the pair is taller than the screen. */}
        <FormSection
          icon={UserRound}
          title="To"
          className="space-y-2"
          tourId="invoice-client"
        >
          <InvoiceClientSelect
            contacts={contacts}
            loading={contactsQuery.isLoading || loadingDocument}
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
            showAddress={sales.invoiceFields.customerAddress}
            showAbn={sales.invoiceFields.customerAbn}
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

      {/* Invoice meta */}
      <FormSection
        icon={FileText}
        title="Invoice details"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <Field
          label="Invoice number"
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
              placeholder={numberQuery.isLoading ? "Loading…" : undefined}
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
                  aria-label="Edit invoice number"
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

        <Field label="Invoice date" required>
          <DatePicker
            label="Invoice date"
            value={draft.issued}
            onChange={(iso) =>
              patch({
                issued: iso,
                due: addDays(iso, Number(terms) || DEFAULT_PAYMENT_TERMS),
              })
            }
          />
        </Field>

        <Field label="Payment terms (days)">
          <Input
            className="tabular"
            inputMode="numeric"
            value={terms}
            onChange={(event) => {
              const next = event.target.value;
              setTerms(next);
              const days = Number(next);
              if (Number.isFinite(days) && next.trim()) {
                patch({ due: addDays(draft.issued, days) });
              }
            }}
          />
        </Field>

        <Field label="Due date" required>
          <DatePicker
            label="Due date"
            value={draft.due}
            onChange={(iso) => {
              patch({ due: iso });
              setTerms(String(Math.max(0, daysBetween(draft.issued, iso))));
            }}
            fromDate={parseIsoDate(draft.issued)}
          />
        </Field>
      </FormSection>

      <Field label="Invoice description">
        <Input
          value={draft.description}
          onChange={(event) => patch({ description: event.target.value })}
          placeholder="What is this invoice for?"
        />
      </Field>

      {/* Line items — supports on an NDIS claim, ordinary lines otherwise */}
      <section className="space-y-2" data-usertour="invoice-line-items">
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
       * Settings, payments and totals. Left is how the invoice behaves and how
       * it gets paid; right is what it comes to and what travels with it.
       */}
      <div className="grid items-start gap-[15px] lg:grid-cols-2">
        <div className="space-y-[15px]">
          <FollowUpReminderRow
            enabled={draft.followUpReminder}
            onEnabledChange={(value) =>
              patchSetting({ followUpReminder: value })
            }
            days={draft.followUpDays ?? ""}
            onDaysChange={(value) => patchSetting({ followUpDays: value })}
            note={draft.followUpNote ?? ""}
            onNoteChange={(value) => patchSetting({ followUpNote: value })}
            notifyClient={draft.followUpNotifyClient ?? false}
            onNotifyClientChange={(value) =>
              patchSetting({ followUpNotifyClient: value })
            }
            dueDate={draft.due}
          />
          <ToggleRow
            label="Send reminder on overdue"
            description="Chases the invoice for you the day it passes its due date."
            tip="Automatically send a reminder to your client when the invoice is overdue."
            checked={draft.overdueReminder}
            onChange={(value) => patchSetting({ overdueReminder: value })}
          />
          <RepeatingInvoiceRow
            enabled={draft.repeating}
            onEnabledChange={(value) => patchSetting({ repeating: value })}
            frequency={draft.repeatFrequency}
            onFrequencyChange={(value) =>
              patchSetting({ repeatFrequency: value })
            }
            reviewBeforeSending={draft.reviewBeforeSending}
            onReviewChange={(value) =>
              patchSetting({ reviewBeforeSending: value })
            }
            startDate={draft.repeatStart ?? addDays(draft.issued, 1)}
            onStartDateChange={(value) => patchSetting({ repeatStart: value })}
            occurrences={draft.repeatOccurrences ?? ""}
            onOccurrencesChange={(value) =>
              patchSetting({ repeatOccurrences: value })
            }
            tagLine={draft.repeatTagLine ?? ""}
            onTagLineChange={(value) => patchSetting({ repeatTagLine: value })}
          />

          <PaymentDetailsCard
            bank={bank}
            showOnInvoice={draft.showBankDetails !== false}
            onShowOnInvoiceChange={(value) => void toggleBankDetails(value)}
          />
          <PaymentMethodCard
            rails={rails}
            stripeEnabled={!!draft.stripeEnabled}
            onStripeChange={(value) => patchSetting({ stripeEnabled: value })}
            solePayEnabled={draft.solePayEnabled ?? rails.payrixAutomate}
            onSolePayChange={(value) => {
              patchSetting({ solePayEnabled: value });
              void saveSolePaySetting({ automate: value });
            }}
            paymentType={rails.paymentType}
            onPaymentTypeChange={(value) =>
              void saveSolePaySetting({ paymentType: value })
            }
            savingPaymentType={savingSolePay}
          />
        </div>

        <div className="space-y-[15px]">
          {/* Just the totals, not the deposit, files and notes beneath: the
              whole column is taller than any screen, so the tour card had
              nowhere to sit beside it. */}
          <div data-usertour="invoice-totals">
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
            deposit={draft.deposit}
            onChange={(value) => patchSetting({ deposit: value })}
            total={totals.total}
            items={draft.items}
            gstPercent={tax.gstPercent}
            issued={draft.issued}
            currency={documentCurrency}
          />

          <AttachmentsCard
            files={draft.attachments}
            onChange={(value) => patchSetting({ attachments: value })}
            onFilesSelected={(picked) => {
              setTouched(true);
              setFiles((current) => [...current, ...picked]);
            }}
            onRemoveFile={(file) => {
              // A file already on the server has to be deleted there too; one
              // picked a moment ago has only ever existed in this form.
              const local = files.some((entry) => entry.id === file.id);
              if (local) {
                setFiles((current) =>
                  current.filter((entry) => entry.id !== file.id),
                );
              } else if (invoiceId) {
                deleteInvoiceAttachmentApi(file.id).catch(() =>
                  toast.error(`Couldn't remove ${file.name}.`),
                );
              }
              patchSetting({
                attachments: draft.attachments.filter(
                  (entry) => entry.id !== file.id,
                ),
              });
            }}
          />

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

        <Button variant="outline" onClick={leave}>
          Cancel
        </Button>
        {/* The tour's "Save, print or send" step points here, at the
            buttons, not the full-width bar they sit in. */}
        <div
          className="flex flex-wrap items-center gap-2"
          data-usertour="invoice-save-actions"
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
            {saving === "send"
              ? "Sending…"
              : editing
                ? "Save & send"
                : "Save & send"}
          </Button>
        </div>
      </div>

      {unsavedChangesDialog}
    </div>
  );
}
