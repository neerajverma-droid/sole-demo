"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, FilePlus2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DocumentCapture,
  type DocumentCaptureHandle,
} from "@/components/shared/document-capture";
import { formatExpenseDate } from "@/lib/expenses";
import { invoiceMoney } from "@/lib/invoices";
import { expenseCaptureEditor, extractExpenseApi } from "@/lib/ocr-capture";
import { cn } from "@/lib/utils";
import { useCaptureStore } from "@/stores/capture";
import { useCountryContext } from "@/hooks/use-country-context";
import { taxWord } from "@/lib/country-context";

/**
 * Same two-tier chooser as Create invoice, with only the first tier — an
 * inline page, never a modal.
 */
export function CreateExpenseChooser() {
  const router = useRouter();
  const captureRef = React.useRef<DocumentCaptureHandle>(null);
  const setCapturedExpense = useCaptureStore((state) => state.setExpense);
  const { country } = useCountryContext();

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="space-y-3">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/expenses">
            <ArrowLeft />
            Expenses
          </Link>
        </Button>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Create new expense
          </h1>
          <p className="text-sm text-muted-foreground">
            Choose how you&apos;d like to record this expense.
          </p>
        </div>
      </div>

      <div
        className="grid grid-cols-1 gap-4 md:grid-cols-2"
        data-usertour="expense-create-methods"
      >
        <MethodCard
          href="/expenses/new/manual"
          title="Create manually"
          tag="Fastest"
          body={`Start from a blank expense form and enter the details yourself — description, price, supplier, category and ${taxWord(country)}.`}
          recommended
          icon={<FilePlus2 className="size-5 text-primary-foreground" />}
        />
        <MethodCard
          title="Upload receipt"
          body="Already have a receipt as a PDF or image? Upload it and Sole captures the details for you. PDF, PNG, JPG or JPEG · up to 10MB."
          icon={<Upload className="size-5 text-muted-foreground" />}
          onClick={() => captureRef.current?.open()}
          // The copy invites a file, so a drop is caught here — otherwise the
          // browser navigates to it and the page is lost.
          onDrop={(files) => captureRef.current?.take(files[0])}
        />
      </div>

      {/* Appears once a file is chosen: upload, read, then hand the reading to
          the expense form. */}
      <DocumentCapture
        handleRef={captureRef}
        noun="receipt"
        folder="expense-uploads"
        extract={extractExpenseApi}
        editor={expenseCaptureEditor}
        fields={({ fields }) => [
          { label: "Description", value: fields.description },
          { label: "Supplier", value: fields.supplierName },
          {
            label: "Date",
            value: fields.date ? formatExpenseDate(fields.date) : "",
          },
          {
            label: "Total",
            value: fields.amount ? invoiceMoney(Number(fields.amount)) : "",
          },
        ]}
        onUse={({ fields, confidence }, file) => {
          setCapturedExpense({ fields, confidence, file });
          router.push("/expenses/new/manual?capture=1");
        }}
      />
    </div>
  );
}

function MethodCard({
  href,
  title,
  tag,
  body,
  icon,
  recommended,
  onClick,
  onDrop,
}: {
  href?: string;
  title: string;
  tag?: string;
  body: string;
  icon: React.ReactNode;
  recommended?: boolean;
  onClick?: () => void;
  /** Only for the upload card, whose copy invites a dropped file. */
  onDrop?: (files: FileList) => void;
}) {
  const className = cn(
    "flex h-full cursor-pointer items-start gap-4 rounded-lg border p-5 text-left",
    "shadow-sm outline-none transition-all hover:-translate-y-px hover:border-primary/40 hover:shadow-md",
    "focus-visible:ring-2 focus-visible:ring-ring",
    recommended
      ? "border-primary/30 bg-primary/[0.02]"
      : "border-border bg-card",
  );

  const content = (
    <>
      <span
        className={cn(
          "grid size-12 shrink-0 place-items-center rounded-xl",
          recommended ? "bg-primary" : "bg-muted",
        )}
        aria-hidden
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 space-y-1.5">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{title}</span>
          {tag && (
            <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
              {tag}
            </span>
          )}
        </span>
        <span className="block text-sm leading-relaxed text-muted-foreground">
          {body}
        </span>
      </span>
    </>
  );

  return href ? (
    <Link href={href} className={className}>
      {content}
    </Link>
  ) : (
    <button
      type="button"
      onClick={onClick}
      onDragOver={onDrop ? (event) => event.preventDefault() : undefined}
      onDrop={
        onDrop
          ? (event) => {
              event.preventDefault();
              onDrop(event.dataTransfer.files);
            }
          : undefined
      }
      className={className}
    >
      {content}
    </button>
  );
}
