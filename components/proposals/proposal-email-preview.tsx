"use client";

import * as React from "react";
import { Lock, Paperclip } from "lucide-react";

import { useSalesSettings } from "@/lib/use-sales-settings";
import { formatFileSize } from "@/lib/proposal-templates";
import {
  EMAIL_MUTED,
  SOLE_LOGO_BLACK,
  emailInitials,
  emailTheme,
  emailValidUntil,
  type EmailTheme,
} from "@/lib/proposal-email-theme";
import {
  formatProposalMoney,
  isBlankHtml,
  proxiedImage,
  proxyHtmlImages,
  type PreviewData,
} from "@/lib/proposals";

const FONT = "'Plus Jakarta Sans', Arial, Helvetica, sans-serif";

/**
 * The proposal email as the client receives it — the same design the
 * backend sends (sole-ocr documentEmail.js, as the invoice and quote
 * emails): the business's brand band with its logo or initials, the
 * sender's message, the total and dates, the button, the sign-off and
 * "Powered by Sole". Above it, what the inbox shows: subject, from, to and
 * attachments.
 */
export function ProposalEmailPreview({ preview }: { preview: PreviewData }) {
  const { settings } = useSalesSettings();
  const theme = emailTheme({ brandColor: settings.brandColor, contentColor: settings.contentColor });
  const { business, general, services, notification, client } = preview;

  const reminder = preview.emailKind === "reminder";
  const displayName = business.name || "Your Business";
  const currency = general.currency_code || "AUD";
  const total = services.reduce((sum, service) => sum + Number(service.amount || 0), 0);
  const amount = total > 0 ? formatProposalMoney(total, currency) : "";
  const title = general.proposal_name || "your proposal";
  const validUntil = emailValidUntil(general.issued_at ?? new Date().toISOString(), general.expire_in_days);
  const proposalNumber = preview.proposalNumber || "";
  const senderName = preview.sender?.name || displayName;
  const senderEmail = preview.sender?.email || "";
  const attachments = notification.attachments ?? [];
  const subject =
    notification.subject?.trim() ||
    `${reminder ? "Reminder: " : ""}Your proposal from ${displayName}`;

  const cells = [
    ...(validUntil ? [{ label: "Valid until", value: validUntil }] : []),
    ...(proposalNumber ? [{ label: "Proposal number", value: proposalNumber, accent: true }] : []),
  ];

  return (
    <div className="space-y-3 text-left">
      {/* What the inbox shows before it's opened. */}
      <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm shadow-sm">
        <p className="break-words font-semibold text-foreground">{subject}</p>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">From</dt>
          <dd className="min-w-0 truncate text-foreground">{displayName} via Sole</dd>
          <dt className="text-muted-foreground">To</dt>
          <dd className="min-w-0 break-all text-foreground">
            {client?.email ? (
              <>
                {client.email}
                {notification.cc_emails?.length ? (
                  <span className="text-muted-foreground"> · CC {notification.cc_emails.join(", ")}</span>
                ) : null}
              </>
            ) : (
              <span className="text-warning">No client email on file</span>
            )}
          </dd>
        </dl>
        {attachments.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {attachments.map((file, index) => (
              <a
                key={`${file.url}-${index}`}
                href={file.url}
                target="_blank"
                rel="noreferrer"
                className="flex max-w-full items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted/50"
              >
                <Paperclip className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate font-medium">{file.name}</span>
                {file.size != null && <span className="shrink-0 text-muted-foreground">{formatFileSize(file.size)}</span>}
              </a>
            ))}
          </div>
        )}
      </div>

      {/* The email itself. */}
      <div className="rounded-xl px-3 py-6 sm:px-6 sm:py-8" style={{ backgroundColor: "#f3f4f6", fontFamily: FONT }}>
        <div className="mx-auto max-w-[600px] overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white">
          <Header theme={theme} displayName={displayName} logo={business.logo} docNo={proposalNumber} />

          <div className="px-5 pb-9 pt-8 text-center sm:px-7">
            {!isBlankHtml(notification.email_body) ? (
              <div
                className="proposal-rich-html text-left text-[15px] leading-6"
                style={{ color: EMAIL_MUTED }}
                dangerouslySetInnerHTML={{ __html: proxyHtmlImages(notification.email_body) }}
              />
            ) : (
              <>
                <p className="text-[22px] font-bold leading-[29px]" style={{ color: theme.ink }}>
                  Hi {client?.name || "there"},
                </p>
                <p className="mt-3 text-base leading-[26px]" style={{ color: EMAIL_MUTED }}>
                  {reminder ? (
                    <>
                      Just a reminder that {displayName} is waiting to hear from you about{" "}
                      <strong style={{ color: theme.ink }}>{title}</strong>.
                    </>
                  ) : (
                    <>
                      {displayName} has sent you a proposal, <strong style={{ color: theme.ink }}>{title}</strong>
                      {amount && (
                        <>
                          {" "}
                          for <strong style={{ color: theme.ink }}>{amount}</strong>
                        </>
                      )}
                      . Review it and let them know if you&apos;d like to go ahead.
                    </>
                  )}
                </p>
              </>
            )}

            <SummaryCard
              theme={theme}
              label={amount ? "Proposal total" : "Proposal"}
              amount={amount || title}
              pill={reminder ? "Reminder · awaiting your response" : "Awaiting your response"}
              cells={cells}
            />

            <span
              className="mt-8 block rounded-[10px] px-6 py-[15px] text-base font-bold leading-[21px]"
              style={{ backgroundColor: theme.accent, color: theme.onAccent }}
            >
              {reminder ? "Review your proposal" : "Review & respond to proposal"} &nbsp;&rarr;
            </span>
            <p className="mt-3.5 flex items-center justify-center gap-1.5 text-sm" style={{ color: EMAIL_MUTED }}>
              <Lock className="size-3.5" aria-hidden />
              Review, accept and sign on your secure proposal page
            </p>

            <div className="mt-6 border-t border-[#e5e7eb] pt-5 text-sm leading-[22px]" style={{ color: EMAIL_MUTED }}>
              <p>Questions about this proposal? Just reply to this email — we’re happy to help.</p>
              <p className="mt-3">Thanks,</p>
              <p className="text-base font-bold" style={{ color: theme.ink }}>
                {senderName}
              </p>
              <p>{displayName}</p>
              {senderEmail && (
                <p className="font-bold" style={{ color: theme.accentText }}>
                  {senderEmail}
                </p>
              )}
            </div>
          </div>
        </div>

        <p className="mt-6 flex flex-wrap items-center justify-center gap-1 text-[13px] text-[#6b7280]">
          Powered by
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={SOLE_LOGO_BLACK} alt="Sole" className="mx-1 h-3.5 w-auto" />
          · <span className="underline">Send invoices for free</span>
        </p>
      </div>
    </div>
  );
}

function Header({
  theme,
  displayName,
  logo,
  docNo,
}: {
  theme: EmailTheme;
  displayName: string;
  logo: string;
  docNo: string;
}) {
  return (
    <div className="flex items-center gap-3.5 px-5 py-3 sm:px-7" style={{ backgroundColor: theme.accent }}>
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={proxiedImage(logo)} alt={displayName} className="block max-h-11 w-auto max-w-[96px] sm:max-w-[160px]" />
      ) : (
        <span
          className="grid size-11 shrink-0 place-items-center bg-white text-sm font-bold"
          style={{ color: theme.accentText }}
        >
          {emailInitials(displayName)}
        </span>
      )}
      <span className="min-w-0 flex-1 break-words text-[17px] font-bold" style={{ color: theme.onAccent }}>
        {displayName}
      </span>
      {docNo && (
        <span className="shrink-0 text-[13px] font-bold" style={{ color: theme.onAccent }}>
          {docNo}
        </span>
      )}
    </div>
  );
}

function SummaryCard({
  theme,
  label,
  amount,
  pill,
  cells,
}: {
  theme: EmailTheme;
  label: string;
  amount: string;
  pill: string;
  cells: { label: string; value: string; accent?: boolean }[];
}) {
  return (
    <div
      className="mt-8 rounded-[14px] border px-5 pb-[22px] pt-5"
      style={{ backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: EMAIL_MUTED }}>
        {label}
      </p>
      <p className="mt-2 break-words text-[32px] font-extrabold leading-10" style={{ color: theme.ink }}>
        {amount}
      </p>
      <p className="mt-2">
        <span
          className="inline-block rounded-full px-3 py-1 text-[13px] font-bold leading-4"
          style={{ backgroundColor: theme.accentPill, color: theme.accentText }}
        >
          {pill}
        </span>
      </p>
      {cells.length > 0 && (
        <div className="mt-4 flex border-t" style={{ borderColor: theme.accentBorder }}>
          {cells.map((cell, index) => (
            <div
              key={cell.label}
              className="min-w-0 flex-1 pt-4"
              style={index > 0 ? { borderLeft: `1px solid ${theme.accentBorder}` } : undefined}
            >
              <p className="text-[13px] leading-[18px]" style={{ color: EMAIL_MUTED }}>
                {cell.label}
              </p>
              <p
                className="mt-0.5 break-words px-1 text-[15px] font-bold leading-[22px]"
                style={{ color: cell.accent ? theme.accentText : theme.ink }}
              >
                {cell.value}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
