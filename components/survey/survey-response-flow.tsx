"use client";

import * as React from "react";
import { Check, Copy, Facebook, Linkedin, MessageCircle, Star, XIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { FilterPill } from "@/components/ui/filter-pills";
import { Textarea } from "@/components/ui/textarea";
import { clickPublicSurveyReview, publicSurveyErrorMessage, submitPublicSurvey } from "@/lib/public-survey-api";
import {
  buildSocialShareUrl,
  buildSubmission,
  defaultSocialMessage,
  FALLBACK_SHARE_URL,
  FIRM_NAME,
  hasGoogleLink,
  headline,
  ISSUE_CATEGORIES,
  offersSocials,
  ratingLabel,
  routeForRating,
  SOCIAL_PLATFORMS,
  type PublicSurvey,
  type SocialPlatform,
  type SurveyAnswers,
  type SurveyRoute,
  type SurveyStep,
} from "@/lib/public-survey";
import { cn } from "@/lib/utils";

const PLATFORM_ICON: Record<SocialPlatform, React.ComponentType<{ className?: string }>> = {
  linkedin: Linkedin,
  x: XIcon,
  facebook: Facebook,
  whatsapp: MessageCircle,
};

function Brand({ firmName }: { firmName: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="grid size-10 place-items-center rounded-full bg-primary text-base font-semibold text-primary-foreground">
        {firmName.charAt(0)}
      </span>
      <span className="text-xs font-semibold text-muted-foreground">{firmName}</span>
    </div>
  );
}

function StarPicker({
  value,
  interactive,
  size = 44,
  onPick,
}: {
  value: number;
  interactive: boolean;
  size?: number;
  onPick?: (rating: number) => void;
}) {
  const [hovered, setHovered] = React.useState(0);
  const shown = hovered || value;
  return (
    <div
      role={interactive ? "radiogroup" : undefined}
      aria-label={interactive ? "Rate your experience" : undefined}
      className="flex items-center justify-center gap-2"
      onMouseLeave={() => interactive && setHovered(0)}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          aria-label={`${star} star`}
          disabled={!interactive}
          onMouseEnter={() => interactive && setHovered(star)}
          onClick={() => interactive && onPick?.(star)}
          className={cn(
            "rounded p-0.5 transition-transform",
            interactive && "cursor-pointer hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <Star
            style={{ width: size, height: size }}
            strokeWidth={1.4}
            className={star <= shown ? "fill-amber-400 text-amber-400" : "text-border"}
            aria-hidden
          />
        </button>
      ))}
    </div>
  );
}

function BackToRating({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Back to rating"
      aria-label="Back to rating"
      className="absolute -left-1 -top-1 grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4">
        <line x1="19" y1="12" x2="5" y2="12" />
        <polyline points="12 19 5 12 12 5" />
      </svg>
    </button>
  );
}

function IssueChip({
  selected,
  onSelect,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <FilterPill active={selected} onSelect={onSelect} className="rounded-full px-3 py-1.5 text-xs">
      {children}
    </FilterPill>
  );
}

function PoweredBySole() {
  return (
    <div className="mt-5 flex items-center justify-center gap-1.5 border-t border-border pt-3.5">
      <span className="text-[11px] font-medium text-muted-foreground">Powered by</span>
      <span className="text-[11px] font-bold text-primary">Sole</span>
    </div>
  );
}

export function SurveyResponseFlow({
  token,
  survey,
  initialRating,
  firmName = FIRM_NAME,
}: {
  /** Absent in the admin's live preview — nothing is submitted or tracked then. */
  token?: string;
  survey: PublicSurvey;
  initialRating: number;
  firmName?: string;
}) {
  const [step, setStep] = React.useState<SurveyStep>("rate");
  const [rating, setRating] = React.useState(0);
  const [route, setRoute] = React.useState<SurveyRoute | null>(null);
  const [category, setCategory] = React.useState("");
  const [comment, setComment] = React.useState("");
  const [wantsContact, setWantsContact] = React.useState<boolean | null>(null);
  const [socialMessage, setSocialMessage] = React.useState("");
  const [copied, setCopied] = React.useState(false);
  const submittedRef = React.useRef(false);

  const threshold = survey.settings.publicThreshold;
  const hasGoogle = hasGoogleLink(survey);
  const offerSocials = offersSocials(survey);

  const finish = React.useCallback(
    (overrides: Partial<SurveyAnswers> = {}) => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      const answers: SurveyAnswers = {
        rating: overrides.rating ?? rating,
        route: overrides.route ?? route,
        category: overrides.category ?? category,
        comment: overrides.comment ?? comment,
        wantsContact: overrides.wantsContact ?? wantsContact,
      };
      if (!token) return;
      submitPublicSurvey(token, buildSubmission(answers)).catch((error: unknown) => {
        toast.error(publicSurveyErrorMessage(error, "Failed to submit feedback. You may have already submitted it."));
      });
    },
    [token, rating, route, category, comment, wantsContact],
  );

  const pickRating = React.useCallback(
    (n: number) => {
      setRating(n);
      const nextRoute = routeForRating(n, threshold);
      setRoute(nextRoute);
      if (nextRoute === "public") {
        if (hasGoogle || offerSocials) {
          setStep("public");
        } else {
          finish({ rating: n, route: "public" });
          setStep("done");
        }
      } else {
        setStep("private");
      }
    },
    [threshold, hasGoogle, offerSocials, finish],
  );

  React.useEffect(() => {
    if (initialRating) pickRating(initialRating);
    // Runs once, for the rating a link may arrive pre-selected with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openGoogle = () => {
    if (survey.settings.googleUrl) window.open(survey.settings.googleUrl, "_blank", "noopener");
    if (token) clickPublicSurveyReview(token);
    finish({ route: "public" });
    if (offerSocials) {
      setSocialMessage(defaultSocialMessage(firmName));
      setStep("socials");
    } else {
      setStep("done");
    }
  };

  const openSocial = () => {
    finish({ route: "public" });
    setSocialMessage(defaultSocialMessage(firmName));
    setStep("socials");
  };

  const declinePublic = () => {
    finish({ route: "public" });
    setStep("done");
  };

  const shareTo = (platform: SocialPlatform) => {
    const url = buildSocialShareUrl(platform, socialMessage);
    void navigator.clipboard
      ?.writeText(socialMessage)
      .then(() => toast.success("Message copied! You can just paste it in your post."))
      .catch(() => {});
    window.open(url, "_blank", "noopener");
  };

  const copyLink = () => {
    void navigator.clipboard
      ?.writeText(survey.settings.googleUrl || FALLBACK_SHARE_URL)
      .then(() => setCopied(true))
      .catch(() => {});
  };

  const declineSocials = () => {
    finish({ route: "public" });
    setStep("done");
  };

  const submitPrivate = () => {
    finish({ route: "private", category, comment, wantsContact });
    setStep("done");
  };

  let body: React.ReactNode;

  if (step === "rate") {
    const label = ratingLabel(rating);
    body = (
      <div className="flex flex-col items-center gap-3.5 text-center">
        <Brand firmName={firmName} />
        <h1 className="text-lg font-bold">{headline(survey)}</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Your feedback helps {firmName} improve its service. It takes less than 10 seconds.
        </p>
        <div className="my-1">
          <StarPicker value={rating} interactive onPick={pickRating} />
        </div>
        <div className={cn("min-h-5 text-sm font-bold", label ? "text-primary" : "text-muted-foreground")}>
          {label || "Tap a star to rate"}
        </div>
      </div>
    );
  } else if (step === "public") {
    const alreadyReviewed = false;
    body = (
      <div className="relative flex flex-col items-center gap-3.5 text-center">
        <BackToRating onClick={() => setStep("rate")} />
        <Brand firmName={firmName} />
        <StarPicker value={rating || 5} interactive={false} size={28} />
        <h1 className="text-lg font-bold">
          {alreadyReviewed ? "Thanks again — you're the best!" : "Thanks, we're glad you had a good experience."}
        </h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          {hasGoogle
            ? `Would you be willing to leave a quick review for ${firmName}? It helps other businesses find the right accounting support.`
            : `Would you be willing to share your experience with ${firmName}? It helps other businesses find the right accounting support.`}
        </p>
        <div className="mt-1 flex w-full max-w-xs flex-col gap-2">
          {hasGoogle && (
            <Button size="lg" onClick={openGoogle}>
              Leave a Google review
            </Button>
          )}
          {offerSocials && (
            <Button size="lg" variant={hasGoogle ? "outline" : "default"} onClick={openSocial}>
              Share on your socials
            </Button>
          )}
          <Button variant="ghost" onClick={declinePublic}>
            No thanks
          </Button>
        </div>
      </div>
    );
  } else if (step === "socials") {
    body = (
      <div className="relative flex flex-col items-center gap-3.5 text-center">
        <BackToRating onClick={() => setStep("rate")} />
        <Brand firmName={firmName} />
        <h1 className="text-lg font-bold">Share your experience</h1>
        <p className="max-w-sm text-sm text-muted-foreground">Edit the message below, then choose where to post it.</p>

        <div className="w-full max-w-sm text-left">
          <Textarea
            value={socialMessage}
            onChange={(event) => setSocialMessage(event.target.value)}
            rows={4}
            maxLength={500}
            placeholder="Write what you'd like to share..."
            className="resize-y bg-muted/30 text-sm"
          />
          <p className="mt-1 text-right text-[11px] text-muted-foreground">{socialMessage.length}/500</p>
        </div>

        <p className="w-full max-w-sm text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Choose a platform
        </p>
        <div className="grid w-full max-w-sm grid-cols-2 gap-2.5">
          {SOCIAL_PLATFORMS.map((platform) => {
            const Icon = PLATFORM_ICON[platform.id];
            return (
              <button
                key={platform.id}
                type="button"
                onClick={() => shareTo(platform.id)}
                className="flex items-center gap-2.5 rounded-lg border border-border bg-background px-3 py-2.5 text-left text-[13.5px] font-semibold transition-shadow hover:shadow-sm"
              >
                <span
                  className="grid size-[26px] shrink-0 place-items-center rounded-md text-white"
                  style={{ background: platform.color }}
                >
                  <Icon className="size-[15px]" />
                </span>
                {platform.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={copyLink}
          className={cn(
            "inline-flex items-center gap-1.5 text-xs font-semibold",
            copied ? "text-success" : "text-primary",
          )}
        >
          {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
          {copied ? "Link copied!" : "Copy link instead"}
        </button>
        <button type="button" onClick={declineSocials} className="text-xs text-muted-foreground">
          No thanks
        </button>
      </div>
    );
  } else if (step === "private") {
    body = (
      <div className="relative flex flex-col gap-4">
        <BackToRating onClick={() => setStep("rate")} />
        <div className="text-center">
          <Brand firmName={firmName} />
          <h1 className="mt-2 text-lg font-bold">Thanks for your feedback.</h1>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
            We&apos;re sorry the experience wasn&apos;t as strong as it should have been. Please let us know what we
            could improve.
          </p>
        </div>
        <div className="text-left">
          <p className="mb-2 text-xs font-semibold">
            What best describes the issue? <span className="text-destructive">*</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {ISSUE_CATEGORIES.map((option) => (
              <IssueChip key={option} selected={category === option} onSelect={() => setCategory(option)}>
                {option}
              </IssueChip>
            ))}
          </div>
        </div>
        <div className="text-left">
          <p className="mb-2 text-xs font-semibold">
            Tell us a little more <span className="font-normal text-muted-foreground">(optional)</span>
          </p>
          <Textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            rows={3}
            placeholder="What happened?"
            className="resize-y bg-muted/30 text-sm"
          />
        </div>
        <div className="text-left">
          <p className="mb-2 text-xs font-semibold">
            Would you like someone from the firm to contact you?{" "}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </p>
          <div className="flex gap-1.5">
            <IssueChip selected={wantsContact === true} onSelect={() => setWantsContact(true)}>
              Yes, please contact me
            </IssueChip>
            <IssueChip selected={wantsContact === false} onSelect={() => setWantsContact(false)}>
              No, feedback only
            </IssueChip>
          </div>
        </div>
        <Button size="lg" className="w-full" disabled={!category} onClick={submitPrivate}>
          Submit feedback
        </Button>
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col items-center gap-3.5 text-center">
        <span className="grid size-[52px] place-items-center rounded-full bg-success/15 text-success">
          <Check className="size-7" strokeWidth={2.5} aria-hidden />
        </span>
        <h1 className="text-lg font-bold">Thank you!</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          {route === "private"
            ? `Thanks for your feedback. Your response has been sent privately to ${firmName}.`
            : "Thanks — we really appreciate you taking the time."}
        </p>
      </div>
    );
  }

  return (
    <div>
      {body}
      <PoweredBySole />
    </div>
  );
}
