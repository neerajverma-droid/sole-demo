import { CheckCircle2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  paymentMethodLabel,
  proposalStatusLabel,
  type ProposalPayment,
  type ProposalStatus,
} from "@/lib/proposals";
import { cn } from "@/lib/utils";

/** Sent and viewed are in flight, so they wear the brand tint rather than a verdict. */
const IN_FLIGHT = "border-primary/20 bg-primary/10 text-primary hover:bg-primary/15";

export function ProposalStatusBadge({
  status,
  className,
}: {
  status: ProposalStatus;
  className?: string;
}) {
  const variant =
    status === "accepted"
      ? "success"
      : status === "rejected" || status === "lost"
        ? "danger"
        : status === "expired"
          ? "warning"
          : status === "draft"
            ? "secondary"
            : "outline";

  return (
    <Badge
      variant={variant}
      className={cn(
        "whitespace-nowrap font-medium",
        variant === "outline" && IN_FLIGHT,
        className,
      )}
    >
      {proposalStatusLabel(status)}
    </Badge>
  );
}

export function ProposalPaidBadge({ payment }: { payment: ProposalPayment }) {
  if (!payment.required) {
    return <span className="text-xs text-muted-foreground">Not required</span>;
  }
  if (payment.paid) {
    return (
      <Badge variant="success" className="gap-1 whitespace-nowrap font-medium">
        <CheckCircle2 className="size-3" aria-hidden />
        Paid
        {payment.paidMethod && (
          <span className="opacity-70">
            · {paymentMethodLabel(payment.paidMethod)}
          </span>
        )}
      </Badge>
    );
  }
  return (
    <Badge variant="warning" className="whitespace-nowrap font-medium">
      Not paid
    </Badge>
  );
}
