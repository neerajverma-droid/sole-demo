"use client";

import { BellRing, Mail, MessageSquare } from "lucide-react";

import { Switch } from "@/components/ui/switch";
import { SalesSection } from "@/components/sales-settings/tab-shell";
import type { SalesSettings } from "@/lib/sales-settings";

/** Tab 8. Three groups of switches, nothing else — so it stays a plain list. */
export function CommunicationTab({
  values,
  patch,
}: {
  values: SalesSettings;
  patch: (next: Partial<SalesSettings>) => void;
}) {
  return (
    <div className="space-y-4">
      <SalesSection
        icon={MessageSquare}
        title="Text Message Settings"
        description="Send invoices and reminders by SMS as well as email. Charges apply per message once this is live."
      >
        <SwitchRow
          label="Enable text messages"
          hint="Off by default — nothing is sent by SMS until you turn this on."
          checked={values.textMessagesEnabled}
          onChange={(on) => patch({ textMessagesEnabled: on })}
        />
      </SalesSection>

      <SalesSection
        icon={Mail}
        title="Notifications"
        description="Keep a copy of what Sole sends on your behalf."
      >
        <div className="divide-y rounded-md border border-border">
          <SwitchRow
            bare
            label="BCC me on invoice emails"
            hint="A copy of every invoice email lands in your inbox."
            checked={values.bccInvoiceEmails}
            onChange={(on) => patch({ bccInvoiceEmails: on })}
          />
          <SwitchRow
            bare
            label="BCC me on quote emails"
            hint="The same, for quotes."
            checked={values.bccQuoteEmails}
            onChange={(on) => patch({ bccQuoteEmails: on })}
          />
        </div>
      </SalesSection>

      <SalesSection
        icon={BellRing}
        title="Customer Reminders"
        description="Automatic nudges to your client. Each one can be overridden on an individual document."
      >
        <div className="divide-y rounded-md border border-border">
          <SwitchRow
            bare
            label="Invoice due reminder"
            hint="Sent the day before an invoice falls due."
            checked={values.remindInvoiceDue}
            onChange={(on) => patch({ remindInvoiceDue: on })}
          />
          <SwitchRow
            bare
            label="Invoice overdue reminder"
            hint="Sent the day after an invoice passes its due date."
            checked={values.remindInvoiceOverdue}
            onChange={(on) => patch({ remindInvoiceOverdue: on })}
          />
          <SwitchRow
            bare
            label="Quote expiry reminder"
            hint="Sent before a quote lapses, while it can still be accepted."
            checked={values.remindQuoteExpiry}
            onChange={(on) => patch({ remindQuoteExpiry: on })}
          />
        </div>
      </SalesSection>
    </div>
  );
}

function SwitchRow({
  label,
  hint,
  checked,
  onChange,
  bare,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Inside a divided list, which supplies its own border. */
  bare?: boolean;
}) {
  return (
    <label
      className={
        bare
          ? "flex cursor-pointer items-center justify-between gap-4 p-3"
          : "flex cursor-pointer items-center justify-between gap-4 rounded-md border border-border p-3"
      }
    >
      <span className="min-w-0 space-y-0.5">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </label>
  );
}
