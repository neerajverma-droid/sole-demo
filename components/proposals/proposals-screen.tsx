"use client";

import * as React from "react";
import { useAtom, useSetAtom } from "jotai";
import { FileSignature, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { DeleteProposalDialog } from "@/components/proposals/delete-proposal-dialog";
import { ProposalDetailsSheet } from "@/components/proposals/proposal-details-sheet";
import { ProposalTemplatePickerDialog } from "@/components/proposals/proposal-template-picker-dialog";
import { ProposalsTable } from "@/components/proposals/proposals-table";
import { SendReminderDialog } from "@/components/proposals/send-reminder-dialog";
import { proposalTemplatePickerOpenAtom, reminderProposalIdAtom } from "@/lib/atoms";

export function ProposalsScreen() {
  const setPickerOpen = useSetAtom(proposalTemplatePickerOpenAtom);
  const [reminderId, setReminderId] = useAtom(reminderProposalIdAtom);

  return (
    <div className="space-y-[15px]">
      <PageHeader
        icon={FileSignature}
        title="Proposals"
        titleTip="A proposal is a client-facing document you build and send to win new work — covering services, pricing, terms, and e-signature, all in one shareable link."
        description="Build, send and track proposals from draft to signed."
      >
        <Button onClick={() => setPickerOpen(true)}>
          <Plus />
          New proposal
        </Button>
      </PageHeader>

      <ProposalsTable />

      <ProposalTemplatePickerDialog />
      <ProposalDetailsSheet />
      <DeleteProposalDialog />
      <SendReminderDialog proposalId={reminderId} onOpenChange={(open) => !open && setReminderId(null)} />
    </div>
  );
}
