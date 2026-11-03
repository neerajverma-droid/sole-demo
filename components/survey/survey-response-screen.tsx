"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { CircleAlert } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { SurveyResponseFlow } from "@/components/survey/survey-response-flow";
import { SurveyAlreadySubmittedError } from "@/lib/public-survey";
import { fetchPublicSurvey, publicSurveyErrorMessage } from "@/lib/public-survey-api";

/**
 * What a client sees when they open the "share your feedback" link emailed
 * from a completed job — ported from sole-webapp's `pages/survey/[id].js` and
 * `ClientFeedbackFlow` onto this app's own surfaces, same steps, same copy.
 *
 * No account: the token in the URL is the only credential, same as the quote
 * response screen.
 */
export function SurveyResponseScreen({ token, initialRating }: { token: string; initialRating: number }) {
  const query = useQuery({
    queryKey: ["public-survey", token],
    queryFn: () => fetchPublicSurvey(token),
    enabled: Boolean(token),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    staleTime: Infinity,
  });

  if (!token) return <FatalState message="This survey link is invalid." />;
  if (query.isPending) return <LoadingState />;

  const survey = query.data;
  if (!survey) {
    const alreadySubmitted = query.error instanceof SurveyAlreadySubmittedError;
    return (
      <FatalState
        title={alreadySubmitted ? "Already submitted" : "Survey Error"}
        message={publicSurveyErrorMessage(
          query.error,
          "This survey link is invalid, expired, or has already been submitted.",
        )}
      />
    );
  }

  return (
    <PageFrame>
      <Card className="p-8 sm:p-12">
        <SurveyResponseFlow token={token} survey={survey} initialRating={initialRating} />
      </Card>
    </PageFrame>
  );
}

function PageFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-lg">{children}</div>
    </div>
  );
}

function LoadingState() {
  return (
    <PageFrame>
      <Card className="p-8 sm:p-12" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading your survey…</span>
        <div className="flex flex-col items-center gap-3.5">
          <Skeleton className="size-10 rounded-full" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-6 w-72 max-w-full" />
          <Skeleton className="h-4 w-56 max-w-full" />
          <div className="my-1 flex gap-2">
            {[0, 1, 2, 3, 4].map((key) => (
              <Skeleton key={key} className="size-11 rounded" />
            ))}
          </div>
        </div>
      </Card>
    </PageFrame>
  );
}

function FatalState({ message, title = "Survey Error" }: { message: string; title?: string }) {
  return (
    <PageFrame>
      <Empty>
        <EmptyMedia className="bg-destructive/10 text-destructive">
          <CircleAlert aria-hidden />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription role="alert">{message}</EmptyDescription>
      </Empty>
    </PageFrame>
  );
}
