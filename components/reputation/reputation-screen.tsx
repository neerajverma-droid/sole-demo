"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Eye, Star } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmailComposeDialog, type EmailComposeRequest } from "@/components/reputation/email-compose-dialog";
import { FeedbackDetailDialog } from "@/components/reputation/feedback-detail-dialog";
import { ReputationFeedbackTab } from "@/components/reputation/reputation-feedback";
import { ReputationOverview } from "@/components/reputation/reputation-overview";
import { ReputationRequestsTab } from "@/components/reputation/reputation-requests";
import { ReputationSettingsTab } from "@/components/reputation/reputation-settings";
import { ReputationSurveysTab } from "@/components/reputation/reputation-surveys";
import { ReviewPreviewDialog } from "@/components/reputation/review-preview-dialog";
import { SendSurveyDialog } from "@/components/reputation/send-survey-dialog";
import { SurveyDialog } from "@/components/reputation/survey-dialog";
import { useActiveBusiness } from "@/hooks/use-active-business";
import {
  useInvalidateReputation,
  useReputationFeedbacksQuery,
  useReputationOverviewQuery,
  useReputationSettingsQuery,
  useReputationSurveysQuery,
} from "@/hooks/use-reputation-query";
import {
  reputationBaseUrl,
  reputationErrorMessage,
  resendReputationRequest,
  updateReputationFeedback,
} from "@/lib/reputation-api";
import {
  feedbackClientLabel,
  recoveryMessage,
  resendRequestMessage,
  type FeedbackFilter,
  type FeedbackUpdate,
  type ReputationFeedback,
  type ReputationSettings,
  type ReputationSurvey,
} from "@/lib/reputation";

type Tab = "overview" | "feedback" | "requests" | "surveys" | "settings";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "feedback", label: "Feedback" },
  { id: "requests", label: "Requests" },
  { id: "surveys", label: "Surveys" },
  { id: "settings", label: "Settings" },
];

function useErrorToast(isError: boolean, error: unknown, fallback: string, enabled: boolean) {
  React.useEffect(() => {
    if (enabled && isError) toast.error(reputationErrorMessage(error, fallback));
  }, [enabled, isError, error, fallback]);
}

export function ReputationScreen() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateReputation();
  const { business } = useActiveBusiness();
  const configured = reputationBaseUrl() !== null;

  const [tab, setTab] = React.useState<Tab>("overview");
  const [feedbackFilter, setFeedbackFilter] = React.useState<FeedbackFilter>("All");
  const [openFeedback, setOpenFeedback] = React.useState<ReputationFeedback | null>(null);
  const [feedbackOpen, setFeedbackOpen] = React.useState(false);
  const [compose, setCompose] = React.useState<EmailComposeRequest | null>(null);
  const [composeOpen, setComposeOpen] = React.useState(false);
  const [sendOpen, setSendOpen] = React.useState(false);
  const [surveyDialog, setSurveyDialog] = React.useState<{ open: boolean; survey: ReputationSurvey | null }>({
    open: false,
    survey: null,
  });
  const [previewOpen, setPreviewOpen] = React.useState(false);

  const overviewQuery = useReputationOverviewQuery();
  const feedbacksQuery = useReputationFeedbacksQuery();
  const surveysQuery = useReputationSurveysQuery();
  const settingsQuery = useReputationSettingsQuery();

  useErrorToast(overviewQuery.isError, overviewQuery.error, "Couldn't load the reputation overview.", configured);
  useErrorToast(feedbacksQuery.isError, feedbacksQuery.error, "Couldn't load client feedback.", configured);
  useErrorToast(surveysQuery.isError, surveysQuery.error, "Couldn't load surveys.", configured);
  useErrorToast(settingsQuery.isError, settingsQuery.error, "Couldn't load reputation settings.", configured);

  const feedbacks = React.useMemo(() => feedbacksQuery.data ?? [], [feedbacksQuery.data]);
  const surveys = React.useMemo(() => surveysQuery.data ?? [], [surveysQuery.data]);
  const settings = settingsQuery.data;
  const activeQuestion = surveys.find((survey) => survey.status === "active")?.question ?? "";

  const refreshActivity = React.useCallback(() => invalidate("feedbacks", "overview"), [invalidate]);

  const updateFeedback = React.useCallback(
    async (feedback: ReputationFeedback, update: FeedbackUpdate, success: string) => {
      try {
        await updateReputationFeedback(feedback.id, update);
        setOpenFeedback((current) =>
          current && current.id === feedback.id
            ? {
                ...current,
                ...(update.is_closed !== undefined ? { isClosed: update.is_closed } : {}),
                ...(update.recovery_status ? { recoveryStatus: update.recovery_status } : {}),
              }
            : current,
        );
        toast.success(success);
        void refreshActivity();
        return true;
      } catch (error) {
        toast.error(reputationErrorMessage(error, "Failed to update feedback"));
        return false;
      }
    },
    [refreshActivity],
  );

  const showCompose = (request: EmailComposeRequest) => {
    setCompose(request);
    setComposeOpen(true);
  };

  const showFeedback = (feedback: ReputationFeedback) => {
    setOpenFeedback(feedback);
    setFeedbackOpen(true);
  };

  const openRecoveryEmail = (feedback: ReputationFeedback) =>
    showCompose({
      title: "Send recovery email",
      description: "Send a personal message to resolve the client's issue.",
      recipientName: feedbackClientLabel(feedback),
      recipientEmail: feedback.clientEmail,
      initialMessage: recoveryMessage(feedback),
      sendLabel: "Send email",
      successMessage: "Recovery email sent",
      send: (html) => resendReputationRequest(feedback.id, { customMessage: html, isRecovery: true }),
    });

  const openResend = (request: ReputationFeedback) =>
    showCompose({
      title: "Send review request",
      description: "The client gets your message with a link to rate the job.",
      recipientName: feedbackClientLabel(request),
      recipientEmail: request.clientEmail,
      initialMessage: resendRequestMessage(request),
      sendLabel: "Send request",
      successMessage: `Review request sent to ${feedbackClientLabel(request)}`,
      send: (html) => resendReputationRequest(request.id, { customMessage: html }),
    });

  const onSettingsSaved = (saved: ReputationSettings) => {
    queryClient.setQueryData(["reputation", "settings"], saved);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Star}
        title="Reputation & client experience"
        description="Measure client experience across each job and turn happy clients into public reviews."
      >
        <Button variant="outline" onClick={() => setPreviewOpen(true)}>
          <Eye />
          Preview client experience
        </Button>
      </PageHeader>

      {!configured && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>Reputation service not connected</AlertTitle>
          <AlertDescription>
            Set NEXT_PUBLIC_REPUTATION_API_URL for this environment to load feedback, requests and surveys.
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={tab} onValueChange={(next) => setTab(next as Tab)}>
        <div className="overflow-x-auto">
          <TabsList aria-label="Reputation">
            {TABS.map((item) => (
              <TabsTrigger key={item.id} value={item.id}>
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-5">
          <ReputationOverview
            overview={overviewQuery.data}
            overviewLoading={configured && overviewQuery.isPending}
            feedbacks={feedbacks}
            feedbacksLoading={configured && feedbacksQuery.isPending}
            onViewFollowUps={() => {
              setFeedbackFilter("Detractors");
              setTab("feedback");
            }}
          />
        </TabsContent>

        <TabsContent value="feedback" className="mt-5">
          <ReputationFeedbackTab
            feedbacks={feedbacks}
            loading={configured && feedbacksQuery.isPending}
            filter={feedbackFilter}
            onFilterChange={setFeedbackFilter}
            onOpen={showFeedback}
          />
        </TabsContent>

        <TabsContent value="requests" className="mt-5">
          <ReputationRequestsTab
            requests={feedbacks}
            loading={configured && feedbacksQuery.isPending}
            onSendNew={() => setSendOpen(true)}
            onResend={openResend}
          />
        </TabsContent>

        <TabsContent value="surveys" className="mt-5">
          <ReputationSurveysTab
            surveys={surveys}
            loading={configured && surveysQuery.isPending}
            onCreate={() => setSurveyDialog({ open: true, survey: null })}
            onEdit={(survey) => setSurveyDialog({ open: true, survey })}
            onChanged={() => invalidate("surveys")}
          />
        </TabsContent>

        <TabsContent value="settings" className="mt-5">
          <ReputationSettingsTab
            settings={settings}
            loading={configured && settingsQuery.isPending}
            onSaved={onSettingsSaved}
          />
        </TabsContent>
      </Tabs>

      <FeedbackDetailDialog
        open={feedbackOpen}
        feedback={openFeedback}
        onClose={() => setFeedbackOpen(false)}
        onUpdate={updateFeedback}
        onSendRecoveryEmail={openRecoveryEmail}
      />

      <EmailComposeDialog
        open={composeOpen}
        request={compose}
        onClose={() => setComposeOpen(false)}
        onSent={() => void refreshActivity()}
      />

      <SendSurveyDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        surveys={surveys}
        surveysLoading={configured && surveysQuery.isPending}
        onSent={() => void refreshActivity()}
      />

      <SurveyDialog
        open={surveyDialog.open}
        survey={surveyDialog.survey}
        onOpenChange={(open) => setSurveyDialog((current) => ({ ...current, open }))}
        onSaved={() => invalidate("surveys")}
      />

      <ReviewPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        businessName={business?.name ?? ""}
        settings={settings}
        question={activeQuestion}
      />
    </div>
  );
}
