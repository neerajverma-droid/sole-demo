"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Eye,
  FileCheck2,
  Loader2,
  Save,
  Send,
  Trash2,
  TriangleAlert,
} from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Shimmer } from "@/components/ui/shimmer";
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
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Field } from "@/components/documents/field";
import { DeleteProposalDialog } from "@/components/proposals/delete-proposal-dialog";
import { EditorImageUploadContext } from "@/components/proposals/rich-text-editor";
import { ProposalPreviewPanel } from "@/components/proposals/proposal-preview-panel";
import {
  NotificationStep,
  TermsStep,
  ThankYouStep,
  type SenderOption,
} from "@/components/proposals/steps/content-steps";
import { DocumentsStep } from "@/components/proposals/steps/documents-step";
import { GeneralStep } from "@/components/proposals/steps/general-step";
import { IntroductionStep } from "@/components/proposals/steps/introduction-step";
import { PaymentStep } from "@/components/proposals/steps/payment-step";
import { ServicesStep } from "@/components/proposals/steps/services-step";
import { SectionTemplatePicker } from "@/components/proposals/steps/section-template-picker";
import { ProposalComments } from "@/components/proposals/proposal-comments-sheet";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { useAccountIdentity } from "@/hooks/use-account-identity";
import { useCountryContext } from "@/hooks/use-country-context";
import { useInvalidateProposals } from "@/hooks/use-proposals-query";
import { apiErrorMessage } from "@/lib/api-error";
import { documentTax } from "@/lib/country-context";
import { fetchExchangeRates, fetchInvoiceTaxSettings } from "@/lib/invoice-context";
import {
  autoFillSection,
  draftBlocker,
  introBlocksFromTemplate,
  introductionIsBlank,
  termsIsBlank,
  thankYouIsUntouched,
  type SectionKind,
  missingRequiredSteps,
  isHiddenInTemplateMode,
  nextVisibleStep,
  templateModeProgress,
  termsBodyFromTemplate,
  thankYouFromTemplate,
  visibleStages,
} from "@/lib/proposal-builder-logic";
import {
  refreshTemplate,
  templateQueryOptions,
  uploadTemplateImageApi,
} from "@/lib/proposal-templates";
import {
  SEND_MESSAGES,
  builderStateFromProposal,
  createProposalApi,
  defaultNotification,
  documentsStepSave,
  emptyGeneral,
  fetchProposalDetail,
  generalStepSave,
  initialIntroBlocks,
  introductionStepSave,
  mapDocuments,
  mergeValues as buildMergeValues,
  notificationStepSave,
  paymentStepSave,
  proposalReadiness,
  renderMergeTags,
  saveProposalStepApi,
  saveProposalTemplateApi,
  templateAsProposal,
  updateProposalTemplateApi,
  sendProposalApi,
  servicesStepSave,
  stepProgress,
  termsStepSave,
  thankYouStepSave,
  updateProposalApi,
  uploadProposalDocumentApi,
  uploadProposalImageApi,
  DEFAULT_PAYMENT_METHOD,
  DEFAULT_SIGNATURE,
  DEFAULT_TERMS,
  DEFAULT_THANK_YOU,
  PROPOSAL_STEP_KEYS,
  type ApiProposal,
  type BuilderState,
  type PreviewData,
  type ProposalStep,
  type StepSave,
  fetchTemplatesOfType,
  newBlockId,
  type ProposalTemplate,
} from "@/lib/proposals";
import { cn } from "@/lib/utils";

const STEP_HINTS: Record<ProposalStep, { empty: string; optional?: boolean }> = {
  General: { empty: "No client has been selected" },
  Services: { empty: "No services added" },
  Payments: { empty: "Not required to sign" },
  Introduction: { empty: "Empty - Load from template" },
  "Add. Docs.": { empty: "No documents added", optional: true },
  "Terms & Sign": { empty: "Confirmation of agreement for services between client and business" },
  Notification: { empty: "No recipients added" },
  "Thank You": { empty: "Shown after the proposal is accepted" },
};

const READINESS_TONE: Record<string, string> = {
  muted: "text-muted-foreground",
  success: "text-success",
  warning: "text-warning",
  info: "text-primary",
  danger: "text-destructive",
};

function blankState(): BuilderState {
  return {
    general: emptyGeneral(),
    client: null,
    services: [],
    customRate: null,
    payment: { payment_required: false, pay_method: DEFAULT_PAYMENT_METHOD },
    introduction: {
      message_from: "",
      blocks: initialIntroBlocks(),
      signature: { ...DEFAULT_SIGNATURE },
    },
    documents: [],
    terms: { ...DEFAULT_TERMS },
    thankYou: { ...DEFAULT_THANK_YOU },
    notification: defaultNotification(),
    currentStep: "General",
  };
}

/** The kinds whose templates a step can be filled from. */
const SECTION_TEMPLATE_KINDS = ["INTRODUCTION", "TERMS", "THANK_YOU"] as const;

export function ProposalBuilder({
  proposalId: initialId,
  template,
  focusThreadId = null,
}: {
  proposalId?: string;
  /** A comment thread to open on arrival (`?comments=<id>`, from a notification). */
  focusThreadId?: string | null;
  /**
   * Template mode, as sole-pm's `?mode=template`: building a whole-proposal
   * template rather than a proposal — no client, no proposal row; each step
   * just moves on, and the last one saves the template. `id` edits one of
   * your own.
   */
  template?: { id: string | null };
}) {
  const router = useRouter();
  const templateMode = Boolean(template);
  const templateId = template?.id ?? null;
  const exitUrl = templateMode ? "/proposals/templates" : "/proposals";
  const invalidate = useInvalidateProposals();
  const queryClient = useQueryClient();

  // The Introduction, Terms & Sign and Thank You steps each offer a Template
  // dropdown. Load all three lists now, in parallel, into the cache those
  // dropdowns read — so they're ready when a step opens, not fetched then.
  React.useEffect(() => {
    for (const kind of SECTION_TEMPLATE_KINDS) {
      void queryClient.prefetchQuery({
        queryKey: ["proposal-templates", kind],
        queryFn: () => fetchTemplatesOfType(kind),
      });
    }
  }, [queryClient]);
  const { business } = useActiveBusiness();
  const identity = useAccountIdentity();
  const { country } = useCountryContext();

  const [proposalId, setProposalId] = React.useState<string | null>(initialId ?? null);
  const [proposal, setProposal] = React.useState<ApiProposal | null>(null);
  const [state, setState] = React.useState<BuilderState>(blankState);
  const [openStep, setOpenStep] = React.useState<ProposalStep | null>("General");
  // The step a comment asked for, kept so the proposal loading afterwards doesn't override it.
  const requestedStep = React.useRef<ProposalStep | null>(null);
  const [saving, setSaving] = React.useState<ProposalStep | null>(null);
  const [sending, setSending] = React.useState(false);
  const [previewing, setPreviewing] = React.useState(false);
  const [rateEdited, setRateEdited] = React.useState(false);
  const [leaveOpen, setLeaveOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [templateOpen, setTemplateOpen] = React.useState(false);
  // Bumped when saved content lands, so the rich-text editors reseed.
  const [contentVersion, setContentVersion] = React.useState(0);

  /* ----- loading an existing proposal, once ----- */
  const detailQuery = useQuery({
    queryKey: ["proposal-detail", initialId ?? null],
    queryFn: () => fetchProposalDetail(initialId as string),
    enabled: Boolean(initialId),
    staleTime: Infinity,
  });
  const seeded = React.useRef(false);
  const previousCurrency = React.useRef("AUD");
  React.useEffect(() => {
    if (seeded.current || !detailQuery.data) return;
    seeded.current = true;
    const loaded = builderStateFromProposal(detailQuery.data);
    previousCurrency.current = (loaded.general.currency_code || "AUD").toUpperCase();
    setProposal(detailQuery.data);
    setState(loaded);
    // A comment's step (asked for before the proposal finished loading) wins
    // over the step it was last saved on.
    setOpenStep(requestedStep.current ?? loaded.currentStep);
    setRateEdited(loaded.customRate != null);
    setContentVersion((version) => version + 1);
  }, [detailQuery.data]);

  /* ----- template mode: the template being edited, and progress kept locally ----- */
  const [templateMeta, setTemplateMeta] = React.useState<{ name: string; description: string } | null>(null);
  const [templateDone, setTemplateDone] = React.useState<ProposalStep[]>([]);
  const templateQuery = useQuery({
    ...templateQueryOptions(templateId ?? ""),
    enabled: templateMode && Boolean(templateId),
  });
  const templateSeeded = React.useRef(false);
  React.useEffect(() => {
    if (templateSeeded.current || !templateQuery.data) return;
    templateSeeded.current = true;
    const loaded = templateQuery.data;
    if (loaded.type !== "PROPOSAL" || loaded.isSystem) {
      toast.error(loaded.isSystem ? "System templates can't be edited. Duplicate it to make your own copy." : "Template not found.");
      router.replace("/proposals/templates");
      return;
    }
    const builderState = builderStateFromProposal(templateAsProposal(loaded));
    previousCurrency.current = (builderState.general.currency_code || "AUD").toUpperCase();
    setState({ ...builderState, client: null, currentStep: "General" });
    setRateEdited(builderState.customRate != null);
    setTemplateMeta({ name: loaded.name, description: loaded.description });
    setContentVersion((version) => version + 1);
  }, [templateQuery.data, router]);
  React.useEffect(() => {
    if (!templateQuery.isError) return;
    toast.error(apiErrorMessage(templateQuery.error, "Template not found."));
    router.replace("/proposals/templates");
  }, [templateQuery.isError, templateQuery.error, router]);

  const loading =
    (Boolean(initialId) && !seeded.current && detailQuery.isLoading) ||
    (templateMode && Boolean(templateId) && !templateSeeded.current && templateQuery.isLoading);

  /* ----- auto-fill: blank sections start from Sole's system templates ----- */
  // As sole-pm's builder: a new proposal (or one whose section is still
  // empty) opens with the Introduction, Terms & Sign and Thank You already
  // written. Never over anything typed or saved; the dropdown shows which.
  const [autoPicked, setAutoPicked] = React.useState<Partial<Record<SectionKind, string>>>({});
  const stateRef = React.useRef(state);
  stateRef.current = state;
  const autoFilled = React.useRef(false);
  const readyToAutoFill =
    !loading && (!initialId || seeded.current) && !(templateMode && templateId);
  React.useEffect(() => {
    if (!readyToAutoFill || autoFilled.current) return;
    autoFilled.current = true;

    const fill = async (kind: SectionKind, isBlank: () => boolean, apply: (template: ProposalTemplate) => boolean) => {
      const used = await autoFillSection(kind, {
        isBlank,
        apply,
        // Both from the cache when already loaded.
        fetchList: (type) =>
          queryClient.fetchQuery({ queryKey: ["proposal-templates", type], queryFn: () => fetchTemplatesOfType(type) }),
        fetchTemplate: (id) => queryClient.fetchQuery(templateQueryOptions(id)),
      });
      if (used) setAutoPicked((picked) => ({ ...picked, [kind]: used.id }));
    };

    void fill(
      "INTRODUCTION",
      () => introductionIsBlank(stateRef.current.introduction),
      (template) => {
        const blocks = introBlocksFromTemplate(template, newBlockId);
        setState((prev) =>
          introductionIsBlank(prev.introduction) ? { ...prev, introduction: { ...prev.introduction, blocks } } : prev,
        );
        setContentVersion((version) => version + 1);
        return true;
      },
    );
    void fill(
      "TERMS",
      () => termsIsBlank(stateRef.current.terms),
      (template) => {
        const body = termsBodyFromTemplate(template);
        setState((prev) => (termsIsBlank(prev.terms) ? { ...prev, terms: { ...prev.terms, body } } : prev));
        setContentVersion((version) => version + 1);
        return true;
      },
    );
    void fill(
      "THANK_YOU",
      () => thankYouIsUntouched(stateRef.current.thankYou),
      (template) => {
        const thankYou = thankYouFromTemplate(template);
        if (!thankYou) return false;
        setState((prev) =>
          thankYouIsUntouched(prev.thankYou) ? { ...prev, thankYou: { ...prev.thankYou, ...thankYou } } : prev,
        );
        return true;
      },
    );
  }, [readyToAutoFill, queryClient]);

  /* ----- context: tax, exchange rates, sender, firm ----- */
  const taxQuery = useQuery({ queryKey: ["invoice-tax-settings"], queryFn: fetchInvoiceTaxSettings });
  const taxWord = documentTax(country).word || "GST";
  const tax = {
    percent: taxQuery.data?.gstPercent ?? 10,
    name: taxWord,
    enabledByDefault: taxQuery.data?.gstEnabled ?? false,
  };

  const currency = (state.general.currency_code || "AUD").toUpperCase();
  const multicurrency = currency !== "AUD";
  const ratesQuery = useQuery({
    queryKey: ["exchange-rates", "AUD"],
    queryFn: () => fetchExchangeRates("AUD"),
    enabled: multicurrency,
  });
  const publishedRate = ratesQuery.data?.[currency] ?? null;
  const activeRate = rateEdited && state.customRate != null ? state.customRate : publishedRate;

  // A rate overridden for one currency doesn't carry over to another. The
  // seed below moves this ref along with the loaded currency, so restoring a
  // saved custom rate isn't immediately undone here.
  React.useEffect(() => {
    if (previousCurrency.current === currency) return;
    previousCurrency.current = currency;
    setRateEdited(false);
    setState((prev) => ({ ...prev, customRate: null }));
  }, [currency]);

  const senders: SenderOption[] = React.useMemo(() => {
    if (!identity.email) return [];
    const label = identity.name && identity.name !== identity.email
      ? `${identity.name} (${identity.email})`
      : identity.email;
    return [{ label, value: identity.email }];
  }, [identity.email, identity.name]);

  // "Message from" defaults to the signed-in user once known.
  React.useEffect(() => {
    if (!identity.email || loading) return;
    setState((prev) => ({
      ...prev,
      introduction: prev.introduction.message_from
        ? prev.introduction
        : { ...prev.introduction, message_from: identity.email },
      notification: prev.notification.message_from
        ? prev.notification
        : { ...prev.notification, message_from: identity.email },
    }));
  }, [identity.email, loading]);

  const firm = {
    name: business?.name || "",
    email: business?.email || identity.email || "",
    phone: business?.countryCode && business?.mobile ? `${business.countryCode}${business.mobile}` : "",
  };
  const mergeValues = buildMergeValues(state.client, firm, { name: state.general.proposal_name });

  // The backend sends content as stored, so any {{tag}} still unresolved
  // (typed before a client was picked, or the seeded email) resolves here.
  const resolve = (html: string) => renderMergeTags(html, mergeValues);
  const resolved = {
    introduction: {
      ...state.introduction,
      blocks: state.introduction.blocks.map((block) =>
        block.type === "text" ? { ...block, editorHtml: resolve(block.editorHtml ?? "") } : block,
      ),
    },
    terms: { ...state.terms, body: resolve(state.terms.body) },
    notification: {
      ...state.notification,
      subject: resolve(state.notification.subject),
      email_body: resolve(state.notification.email_body),
    },
  };

  const previewBusiness: PreviewData["business"] = proposal?.business
    ? {
        name: proposal.business.name || business?.name || "",
        logo: proposal.business.logo || business?.logo || "",
        bank: proposal.business.bank
          ? {
              account_holder: proposal.business.bank.account_holder || "",
              bsb: proposal.business.bank.bsb || "",
              account_number: proposal.business.bank.account_number || "",
            }
          : null,
      }
    : {
        name: business?.name || "",
        logo: business?.logo || "",
        bank: business?.bank
          ? {
              account_holder: business.bank.accountHolder,
              bsb: business.bank.bsb,
              account_number: business.bank.accountNumber,
            }
          : null,
      };

  const preview: PreviewData = {
    general: { ...state.general, issued_at: proposal?.sent_at || proposal?.created_at },
    business: previewBusiness,
    services: state.services,
    payment: state.payment,
    introduction: resolved.introduction,
    documents: state.documents,
    terms: resolved.terms,
    thankYou: state.thankYou,
    notification: resolved.notification,
    client: state.client,
    exchange: { is_multicurrency: multicurrency, exchange_rate: activeRate },
    proposalNumber: proposal?.proposal_number ?? null,
    sender: { name: identity.name || firm.name, email: firm.email },
  };

  /* ----- persistence ----- */

  /** Creates the draft the first time anything needs a proposal id. */
  // The create in flight, shared — two quick actions on a brand-new proposal
  // (Preview twice, or Preview then an upload) must not create two drafts.
  const draftRequest = React.useRef<Promise<string> | null>(null);
  const ensureDraft = React.useCallback(async (): Promise<string> => {
    if (proposalId) return proposalId;
    // Nothing is created without General's required fields — whichever step,
    // upload or preview asked first. Steps can still be filled in any order.
    const blocker = draftBlocker(state.general);
    if (blocker) {
      setOpenStep("General");
      throw new Error(blocker);
    }
    if (!draftRequest.current) {
      draftRequest.current = createProposalApi(state.general, state.client)
        .then((created) => {
          const id = String(created.id);
          setProposalId(id);
          setProposal(created);
          // Swaps the URL without remounting the builder mid-edit.
          window.history.replaceState(null, "", `/proposals/${id}`);
          invalidate();
          return id;
        })
        .catch((error) => {
          draftRequest.current = null;
          throw error;
        });
    }
    return draftRequest.current;
  }, [invalidate, proposalId, state.general, state.client]);

  // Whichever way a step opens — its header, Next, a preview tab — the list
  // scrolls to it, so its fields are in view rather than somewhere below.
  const stepsRef = React.useRef<HTMLDivElement>(null);
  // Bumped to scroll again to a step that's already open (a comment on it was clicked).
  const [scrollRequest, setScrollRequest] = React.useState(0);
  React.useEffect(() => {
    if (!openStep) return;
    const frame = requestAnimationFrame(() => {
      stepsRef.current
        ?.querySelector<HTMLElement>(`[data-proposal-step="${openStep}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [openStep, scrollRequest]);

  // A client comment's page: open the step it's edited in and bring it into view.
  const openStepFromComment = React.useCallback((step: ProposalStep) => {
    requestedStep.current = step;
    setOpenStep(step);
    setScrollRequest((count) => count + 1);
  }, []);

  // A preview tab opens its step. Steps can be filled in any order: saving
  // any of them creates the draft first if there isn't one yet.
  const selectStepFromPreview = (step: ProposalStep) => {
    if (templateMode && isHiddenInTemplateMode(step)) return;
    setOpenStep(step);
  };

  const goNext = (step: ProposalStep) => {
    const next = nextVisibleStep(step, templateMode);
    if (next) setOpenStep(next);
  };

  const markTemplateStep = (step: ProposalStep) => {
    setTemplateDone((done) => (done.includes(step) ? done : [...done, step]));
    goNext(step);
  };

  const runStep = async (
    step: ProposalStep,
    build: () => StepSave,
    success: string,
    failure: string,
    after?: (saved: ApiProposal | null) => void,
  ) => {
    // A template has no proposal behind it: a step's save just ticks it off.
    if (templateMode) {
      markTemplateStep(step);
      return;
    }
    setSaving(step);
    try {
      const id = await ensureDraft();
      const saved = await saveProposalStepApi(id, PROPOSAL_STEP_KEYS[step], build());
      if (saved) setProposal(saved);
      after?.(saved);
      // Notification is the last step: saving it finishes the proposal — back to
      // the list, but only once every required step is complete. Otherwise
      // it stays, says what's missing, and opens the first of them.
      if (step === "Notification") {
        await invalidate();
        const missing = missingRequiredSteps(saved ?? proposal);
        if (missing.length) {
          toast.warning(`Notification saved. Still required before finishing: ${missing.join(", ")}.`);
          setOpenStep(missing[0]);
          return;
        }
        toast.success(success);
        router.push("/proposals");
        return;
      }
      invalidate();
      goNext(step);
      toast.success(success);
    } catch (error) {
      toast.error(apiErrorMessage(error, failure));
    } finally {
      setSaving(null);
    }
  };

  const saveGeneral = async () => {
    if (templateMode) {
      markTemplateStep("General");
      return;
    }
    setSaving("General");
    try {
      let id = proposalId;
      if (id) {
        await updateProposalApi(id, state.general, state.client);
      } else {
        id = await ensureDraft();
      }
      const saved = await saveProposalStepApi(id, "GENERAL", generalStepSave(state.general, state.client));
      if (saved) setProposal(saved);
      invalidate();
      goNext("General");
      toast.success("General section saved");
    } catch (error) {
      toast.error(apiErrorMessage(error, "Failed to save general section"));
    } finally {
      setSaving(null);
    }
  };

  const saveServices = () => {
    if (multicurrency && !(Number(activeRate) > 0)) {
      toast.error(`No exchange rate available for ${currency} — set a custom rate before saving`);
      return;
    }
    runStep(
      "Services",
      () => servicesStepSave(state.services, { multicurrency, rate: activeRate, edited: rateEdited }),
      "Services saved",
      "Failed to save services",
    );
  };

  const saveDocuments = () => {
    if (state.documents.some((document) => !document.name.trim())) {
      toast.error("Each document needs a name");
      return;
    }
    runStep(
      "Add. Docs.",
      () => documentsStepSave(state.documents),
      "Documents saved",
      "Failed to save documents",
      // The save recreates every document row — re-sync the fresh ids.
      (saved) => saved && setState((prev) => ({ ...prev, documents: mapDocuments(saved.documents) })),
    );
  };

  const uploadImage = async (blockId: string, file: File) => {
    const patch = (fields: Record<string, unknown>) =>
      setState((prev) => ({
        ...prev,
        introduction: {
          ...prev.introduction,
          blocks: prev.introduction.blocks.map((block) =>
            block.id === blockId ? { ...block, ...fields } : block,
          ),
        },
      }));
    patch({ imageUploading: true });
    try {
      const url = templateMode ? await uploadTemplateImageApi(file) : await uploadProposalImageApi(await ensureDraft(), file);
      patch(url ? { imageUrl: url, imageName: file.name, imageUploading: false } : { imageUploading: false });
    } catch (error) {
      patch({ imageUploading: false });
      toast.error(apiErrorMessage(error, "Failed to upload image"));
    }
  };

  // The editor toolbar's Insert → Image, into the same proposal content bucket.
  const uploadEditorImage = React.useCallback(
    async (file: File) =>
      templateMode ? uploadTemplateImageApi(file) : uploadProposalImageApi(await ensureDraft(), file),
    [ensureDraft, templateMode],
  );

  const uploadDocument = React.useCallback(
    async (file: File) => uploadProposalDocumentApi(await ensureDraft(), file),
    [ensureDraft],
  );

  const send = async () => {
    setSending(true);
    try {
      const id = await ensureDraft();
      const result = await sendProposalApi(id);
      if (result.proposal) setProposal(result.proposal);
      // The client link is always copied, whether or not the email went out.
      if (result.responseUrl) navigator.clipboard?.writeText(result.responseUrl).catch(() => {});
      const message = SEND_MESSAGES[result.outcome];
      (message.warning ? toast.warning : toast.success)(message.message);
      await invalidate();
      router.push("/proposals");
    } catch (error) {
      toast.error(apiErrorMessage(error, "Failed to send proposal"));
    } finally {
      setSending(false);
    }
  };

  // The preview tab loads the proposal itself, so the only request here is
  // creating the draft when there isn't one yet.
  const openPreview = async () => {
    if (previewing) return;
    setPreviewing(true);
    try {
      const id = await ensureDraft();
      window.open(`/proposals/${id}/preview`, "_blank", "noopener");
    } catch (error) {
      toast.error(apiErrorMessage(error, "Failed to open proposal preview"));
    } finally {
      setPreviewing(false);
    }
  };

  /* ----- render ----- */

  if (initialId && detailQuery.isError) {
    return (
      <div className="grid h-dvh place-items-center p-4">
        <Empty>
          <EmptyMedia>
            <TriangleAlert aria-hidden />
          </EmptyMedia>
          <div className="space-y-1">
            <EmptyTitle>Couldn&apos;t load this proposal</EmptyTitle>
            <EmptyDescription>{apiErrorMessage(detailQuery.error, "It may have been deleted.")}</EmptyDescription>
          </div>
          <EmptyActions>
            <Button variant="outline" size="sm" onClick={() => detailQuery.refetch()}>
              Try again
            </Button>
            <Button size="sm" onClick={() => router.push("/proposals")}>
              Back to proposals
            </Button>
          </EmptyActions>
        </Empty>
      </div>
    );
  }

  const readiness = proposalReadiness(proposal);
  const progress = templateMode ? templateModeProgress(templateDone) : stepProgress(proposal);
  const stages = visibleStages(templateMode);
  // The required steps still open other than Notification — what stands
  // between this proposal and Save & finish.
  const stepsBeforeFinish = missingRequiredSteps(proposal).filter((step) => step !== "Notification");
  const editorKey = `v${contentVersion}`;

  /* ----- filling a step from a saved template (the steps' "Template" dropdown) ----- */
  // Each replaces only that step's content; the editors remount to show it.
  const applyIntroTemplate = (template: ProposalTemplate) => {
    const blocks = introBlocksFromTemplate(template, newBlockId);
    setState((prev) => ({ ...prev, introduction: { ...prev.introduction, blocks } }));
    setContentVersion((version) => version + 1);
    toast.success(`Introduction filled from “${template.name}”.`);
  };

  const applyTermsTemplate = (template: ProposalTemplate) => {
    setState((prev) => ({ ...prev, terms: { ...prev.terms, body: termsBodyFromTemplate(template) } }));
    setContentVersion((version) => version + 1);
    toast.success(`Terms filled from “${template.name}”.`);
  };

  const applyEmailTemplate = (template: ProposalTemplate) => {
    setState((prev) => ({
      ...prev,
      notification: {
        ...prev.notification,
        subject: template.subject || prev.notification.subject,
        email_body: template.html,
        // The template's files replace the step's; any added here can be added again.
        attachments: template.attachments,
      },
    }));
    setContentVersion((version) => version + 1);
    toast.success(`Email filled from “${template.name}”.`);
  };

  const applyThankYouTemplate = (template: ProposalTemplate) => {
    const thankYou = thankYouFromTemplate(template);
    if (!thankYou) {
      toast.error("That template has no heading or message to use.");
      return;
    }
    setState((prev) => ({ ...prev, thankYou: { ...prev.thankYou, ...thankYou } }));
    toast.success(`Thank-you screen filled from “${template.name}”.`);
  };

  const renderStep = (step: ProposalStep) => {
    const busy = saving === step;
    switch (step) {
      case "General":
        return (
          <GeneralStep
            general={state.general}
            client={state.client}
            loading={loading}
            saving={busy}
            templateMode={templateMode}
            onChange={(patch) => setState((prev) => ({ ...prev, general: { ...prev.general, ...patch } }))}
            onClientChange={(client) => setState((prev) => ({ ...prev, client }))}
            onSave={saveGeneral}
          />
        );
      case "Services":
        return (
          <ServicesStep
            services={state.services}
            onChange={(services) => setState((prev) => ({ ...prev, services }))}
            onSave={saveServices}
            saving={busy}
            currency={currency}
            tax={tax}
            multicurrency={multicurrency}
            rate={activeRate}
            publishedRate={publishedRate}
            rateEdited={rateEdited}
            onRateChange={(rate) => {
              setRateEdited(true);
              setState((prev) => ({ ...prev, customRate: rate }));
            }}
            onRateReset={() => {
              setRateEdited(false);
              setState((prev) => ({ ...prev, customRate: null }));
            }}
          />
        );
      case "Payments":
        return (
          <PaymentStep
            payment={state.payment}
            bank={previewBusiness.bank}
            onChange={(payment) => setState((prev) => ({ ...prev, payment }))}
            saving={busy}
            onSave={() =>
              runStep("Payments", () => paymentStepSave(state.payment), "Payments saved", "Failed to save payments")
            }
          />
        );
      case "Introduction":
        return (
          <IntroductionStep
            key={editorKey}
            data={state.introduction}
            onChange={(updater) => setState((prev) => ({ ...prev, introduction: updater(prev.introduction) }))}
            onImageUpload={uploadImage}
            saving={busy}
            senders={senders}
            mergeValues={mergeValues}
            templatePicker={
              <SectionTemplatePicker kind="INTRODUCTION" selectedId={autoPicked.INTRODUCTION} onApply={applyIntroTemplate} />
            }
            onBack={() => setOpenStep("General")}
            onSave={() =>
              runStep(
                "Introduction",
                () => introductionStepSave(resolved.introduction),
                "Introduction saved",
                "Failed to save introduction",
              )
            }
          />
        );
      case "Add. Docs.":
        return (
          <DocumentsStep
            proposalId={proposalId}
            documents={state.documents}
            onChange={(documents) => setState((prev) => ({ ...prev, documents }))}
            onUpload={uploadDocument}
            onSave={saveDocuments}
            saving={busy}
          />
        );
      case "Terms & Sign":
        return (
          <TermsStep
            terms={state.terms}
            editorKey={editorKey}
            mergeValues={mergeValues}
            templatePicker={
              <SectionTemplatePicker kind="TERMS" selectedId={autoPicked.TERMS} onApply={applyTermsTemplate} />
            }
            saving={busy}
            onChange={(patch) => setState((prev) => ({ ...prev, terms: { ...prev.terms, ...patch } }))}
            onSave={() => runStep("Terms & Sign", () => termsStepSave(resolved.terms), "Terms saved", "Failed to save terms")}
          />
        );
      case "Notification":
        return (
          <NotificationStep
            notification={state.notification}
            editorKey={editorKey}
            mergeValues={mergeValues}
            senders={senders}
            clientEmail={state.client?.email}
            templatePicker={
              <SectionTemplatePicker kind="EMAIL" emailCategory="PROPOSAL_SENT" onApply={applyEmailTemplate} />
            }
            saving={busy}
            onChange={(patch) =>
              setState((prev) => ({ ...prev, notification: { ...prev.notification, ...patch } }))
            }
            submitLabel={templateMode ? "Save Template" : "Save & finish"}
            // Finishing needs every other required step done first.
            finishBlockedBy={templateMode ? [] : stepsBeforeFinish}
            onSave={() =>
              templateMode
                ? (markTemplateStep("Notification"), setTemplateOpen(true))
                : runStep(
                    "Notification",
                    () => notificationStepSave(resolved.notification),
                    "Proposal saved",
                    "Failed to save notification settings",
                  )
            }
          />
        );
      case "Thank You":
        return (
          <ThankYouStep
            data={state.thankYou}
            saving={busy}
            templatePicker={
              <SectionTemplatePicker kind="THANK_YOU" selectedId={autoPicked.THANK_YOU} onApply={applyThankYouTemplate} />
            }
            onChange={(patch) => setState((prev) => ({ ...prev, thankYou: { ...prev.thankYou, ...patch } }))}
            onSave={() =>
              runStep("Thank You", () => thankYouStepSave(state.thankYou), "Thank you saved", "Failed to save thank you")
            }
          />
        );
    }
  };

  let stepNumber = 0;

  return (
    <EditorImageUploadContext.Provider value={uploadEditorImage}>
    <div className="relative flex h-dvh flex-col overflow-hidden">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background px-4 py-3 md:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            className="shrink-0"
            aria-label={templateMode ? "Back to templates" : "Back to proposals"}
            onClick={() => setLeaveOpen(true)}
          >
            <ArrowLeft />
          </Button>
          <span className="hidden shrink-0 text-sm font-semibold sm:inline">
            {templateMode
              ? templateId
                ? "Edit proposal template"
                : "New proposal template"
              : proposalId
                ? "Edit proposal"
                : "New proposal"}
          </span>
          <Input
            value={state.general.proposal_name}
            aria-label="Proposal name"
            className="h-8 w-full max-w-[25rem]"
            onChange={(event) =>
              setState((prev) => ({ ...prev, general: { ...prev.general, proposal_name: event.target.value } }))
            }
          />
        </div>

        {templateMode ? (
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" disabled={loading} onClick={() => setTemplateOpen(true)}>
              <Save />
              Save template &amp; exit
            </Button>
          </div>
        ) : (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  "flex items-center gap-2 rounded-full px-2 py-1 text-sm font-medium hover:bg-muted",
                  READINESS_TONE[readiness.tone],
                )}
                aria-label={`${readiness.label}${readiness.issues ? ` — ${readiness.issues} ${readiness.issues === 1 ? "issue" : "issues"}` : ""}. Step checklist`}
              >
                <span className="size-1.5 rounded-full bg-current" />
                {/* Phones: the dot and the count; the checklist says the rest. */}
                <span className="hidden lg:inline">{readiness.label}</span>
                {readiness.issues > 0 && (
                  <Badge variant="warning" className="lg:ml-1">
                    {readiness.issues}
                    <span className="hidden lg:inline">&nbsp;{readiness.issues === 1 ? "issue" : "issues"}</span>
                  </Badge>
                )}
                <ChevronDown className="size-3.5 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-2">
              <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Step checklist
              </p>
              {progress.map((item) => (
                <button
                  key={item.step}
                  type="button"
                  onClick={() => setOpenStep(item.step)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted disabled:opacity-50",
                    openStep === item.step && "bg-muted",
                  )}
                >
                  {item.status === "completed" ? (
                    <CheckCircle2 className="size-4 shrink-0 text-success" />
                  ) : (
                    <Circle
                      className={cn("size-4 shrink-0", item.isRequired ? "text-warning" : "text-muted-foreground/50")}
                    />
                  )}
                  <span className="flex-1">{item.step}</span>
                  <Badge
                    variant={item.isRequired ? "outline" : "secondary"}
                    className={cn(
                      "px-1.5 py-0 text-[10px] font-medium",
                      item.isRequired && "border-warning/30 bg-warning/10 text-warning",
                    )}
                  >
                    {item.isRequired ? "Required" : "Optional"}
                  </Badge>
                </button>
              ))}
            </PopoverContent>
          </Popover>

          {proposal?.status === "accepted" && proposal.signed_pdf_url && (
            <Button variant="outline" size="sm" asChild>
              <a href={proposal.signed_pdf_url} target="_blank" rel="noopener noreferrer">
                <FileCheck2 />
                View signed proposal
              </a>
            </Button>
          )}
          {/* The client's comments from the public link — only a saved proposal has any. */}
          {proposalId && (
            <ProposalComments proposalId={proposalId} focusThreadId={focusThreadId} onOpenStep={openStepFromComment} />
          )}
          <Button variant="outline" size="sm" aria-label="Preview" disabled={previewing} onClick={openPreview}>
            {previewing ? <Loader2 className="animate-spin" /> : <Eye />}
            <span className="hidden sm:inline">{previewing ? "Opening..." : "Preview"}</span>
          </Button>
          {/* Icon-only on phones, so every action still fits. */}
          <Button variant="outline" size="sm" aria-label="Save as template" onClick={() => setTemplateOpen(true)}>
            <Save />
            <span className="hidden sm:inline">Save as template</span>
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8 text-destructive"
            aria-label="Delete proposal"
            onClick={() => (proposalId ? setDeleteOpen(true) : router.push("/proposals"))}
          >
            <Trash2 />
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={readiness.ready ? -1 : 0}>
                <Button size="sm" disabled={sending || !readiness.ready} onClick={send}>
                  {sending ? <Loader2 className="animate-spin" /> : <Send />}
                  {sending ? "Sending..." : "Send"}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {readiness.ready
                ? "Send this proposal to your client"
                : "Complete all required steps before sending"}
            </TooltipContent>
          </Tooltip>
        </div>
        )}
      </header>

      {/* Body: steps beside the live preview */}
      <SplitPane
        left={
          <div ref={stepsRef} className="h-full space-y-6 overflow-y-auto bg-muted/30 px-4 py-5">
            {/* One list, in the preview tabs' order (lib/proposals.ts PROPOSAL_STEPS). */}
            {stages.map((stage) => (
              <div key={stage.name}>
                <div className="space-y-3">
                  {stage.steps.map((step) => {
                    stepNumber += 1;
                    const number = stepNumber;
                    const item = progress.find((entry) => entry.step === step);
                    const active = openStep === step;
                    const completed = item?.status === "completed";
                    const hint = STEP_HINTS[step];
                    const statusLabel = completed
                      ? null
                      : item?.status === "in_progress"
                        ? "In Progress"
                        : hint.optional
                          ? "Optional"
                          : step === "Payments" || step === "Terms & Sign"
                            ? null
                            : "Empty";

                    return (
                      <div
                        key={step}
                        data-proposal-step={step}
                        className={cn(
                          "scroll-mt-4 overflow-hidden rounded-lg border bg-card shadow-sm transition-colors",
                          active ? "border-primary" : "border-border",
                        )}
                      >
                        <button
                          type="button"
                          aria-expanded={active}
                          onClick={() => setOpenStep(active ? null : step)}
                          className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/40 disabled:cursor-not-allowed"
                        >
                          <span
                            className={cn(
                              "grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold",
                              completed
                                ? "bg-success text-white"
                                : active
                                  ? "bg-primary text-primary-foreground"
                                  : "border-2 border-border text-muted-foreground",
                            )}
                          >
                            {completed ? <Check className="size-3.5" strokeWidth={2.5} /> : number}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="truncate text-sm font-semibold">{step}</span>
                              {statusLabel && (
                                <Badge
                                  variant={
                                    statusLabel === "In Progress"
                                      ? "outline"
                                      : statusLabel === "Optional"
                                        ? "secondary"
                                        : "warning"
                                  }
                                  className={cn(
                                    "px-1.5 py-0 text-[10.5px] font-medium",
                                    statusLabel === "In Progress" && "border-primary/20 bg-primary/10 text-primary",
                                  )}
                                >
                                  {statusLabel}
                                </Badge>
                              )}
                            </span>
                            {!active && (
                              <span className="mt-1 block truncate text-xs text-muted-foreground">
                                {item?.summary || hint.empty}
                              </span>
                            )}
                          </span>
                          {active ? (
                            <ChevronDown className="size-4 shrink-0 text-primary" />
                          ) : (
                            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                          )}
                        </button>
                        {active && (
                          <div className="border-t border-border px-4 py-4 sm:px-6">{renderStep(step)}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        }
        right={
          <ProposalPreviewPanel step={openStep} preview={preview} onStepSelect={selectStepFromPreview} />
        }
      />

      {loading && <BuilderSkeleton />}

      <AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave proposal builder?</AlertDialogTitle>
            <AlertDialogDescription>
              Any changes you haven&apos;t saved on this step will be lost. Are you sure you want to go back?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction onClick={() => router.push(exitUrl)}>Leave</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DeleteProposalDialog
        target={deleteOpen && proposalId ? { id: proposalId, title: state.general.proposal_name } : null}
        onClose={() => setDeleteOpen(false)}
        onDeleted={() => router.push("/proposals")}
      />

      <SaveTemplateDialog
        open={templateOpen}
        onOpenChange={setTemplateOpen}
        state={state}
        templateId={templateMode ? templateId : null}
        initialName={
          templateMode
            ? templateMeta?.name ||
              (state.general.proposal_name !== "Untitled Proposal" ? state.general.proposal_name : "")
            : ""
        }
        initialDescription={templateMode ? (templateMeta?.description ?? "") : ""}
        // Template mode ends here, on the templates screen.
        onSaved={templateMode ? () => router.push("/proposals/templates") : undefined}
      />
    </div>
    </EditorImageUploadContext.Provider>
  );
}

function SaveTemplateDialog({
  open,
  onOpenChange,
  state,
  templateId = null,
  initialName = "",
  initialDescription = "",
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: BuilderState;
  /** Editing one of your own templates: saves over it rather than adding one. */
  templateId?: string | null;
  initialName?: string;
  initialDescription?: string;
  /** After a successful save — template mode goes back to the templates screen. */
  onSaved?: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setName(initialName);
    setDescription(initialDescription);
    setSubmitted(false);
  }, [open, initialName, initialDescription]);

  const save = async () => {
    setSubmitted(true);
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (templateId) await updateProposalTemplateApi(templateId, name, description, state);
      else await saveProposalTemplateApi(name, description, state);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["proposal-templates"] }),
        // Its cached copy (preview, editor) is now out of date.
        ...(templateId ? [refreshTemplate(queryClient, templateId)] : []),
      ]);
      toast.success(templateId ? "Proposal template updated" : "Proposal template saved");
      onOpenChange(false);
      onSaved?.();
    } catch (error) {
      toast.error(apiErrorMessage(error, "Failed to save template"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{templateId ? "Save proposal template" : "Save proposal as template"}</DialogTitle>
          <DialogDescription>
            Saves everything you&apos;ve built so far — general details, services, introduction, terms, and
            notification settings — as one reusable template.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field
            label="Template name"
            htmlFor="proposal_template_name"
            required
            error={submitted && !name.trim() ? "Template name is required" : undefined}
          >
            <Input
              id="proposal_template_name"
              value={name}
              placeholder="Enter template name"
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field label="Description (optional)" htmlFor="proposal_template_description">
            <Textarea
              id="proposal_template_description"
              rows={3}
              value={description}
              placeholder="What is this template for?"
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={saving} onClick={save}>
            {saving && <Loader2 className="animate-spin" />}
            Save template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Steps on the left, the live preview on the right, with a drag handle between. */
/** The builder's own shape while an existing proposal loads — header, steps, preview. */
function BuilderSkeleton() {
  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-background" role="status" aria-label="Loading proposal">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 md:px-6">
        <div className="flex flex-1 items-center gap-3">
          <Shimmer className="size-9 rounded-md" />
          <Shimmer className="hidden h-4 w-24 sm:block" />
          <Shimmer className="h-8 w-full max-w-[25rem]" />
        </div>
        <div className="flex items-center gap-2">
          <Shimmer className="hidden h-8 w-24 md:block" />
          <Shimmer className="hidden h-8 w-36 md:block" />
          <Shimmer className="h-8 w-20" />
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="w-full space-y-3 bg-muted/30 px-4 py-5 lg:w-1/2">
          <Shimmer className="mb-4 h-5 w-48" />
          {Array.from({ length: 5 }).map((_, index) => (
            <Shimmer key={index} className="h-16 w-full rounded-lg border border-border" />
          ))}
        </div>
        <div className="hidden flex-1 flex-col gap-4 border-l border-border bg-muted/30 p-4 lg:flex">
          <Shimmer className="h-10 w-full rounded-lg" />
          <Shimmer className="w-full flex-1 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

function SplitPane({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [leftWidth, setLeftWidth] = React.useState(50);

  const startDrag = (event: React.MouseEvent) => {
    event.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const move = (moveEvent: MouseEvent) => {
      const raw = ((moveEvent.clientX - rect.left) / rect.width) * 100;
      setLeftWidth(Math.min(68, Math.max(38, raw)));
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  return (
    <div
      ref={containerRef}
      className="flex min-h-0 flex-1 overflow-hidden"
      style={{ "--proposal-left": `${leftWidth}%` } as React.CSSProperties}
    >
      <div className="h-full w-full min-w-0 overflow-hidden lg:w-[var(--proposal-left)] lg:min-w-[380px] lg:shrink-0 xl:min-w-[420px]">
        {left}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize preview"
        onMouseDown={startDrag}
        className="group hidden w-2 shrink-0 cursor-col-resize items-center justify-center bg-muted/50 transition-colors hover:bg-muted lg:flex"
      >
        <div className="h-10 w-0.5 rounded-full bg-border transition-colors group-hover:bg-muted-foreground/50" />
      </div>
      <div className="hidden flex-1 overflow-hidden lg:block lg:min-w-[400px] xl:min-w-[480px]">{right}</div>
    </div>
  );
}
