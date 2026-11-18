"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, FilePlus2, ScanText } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DocumentCapture,
  type DocumentCaptureHandle,
} from "@/components/shared/document-capture";
import { MethodCard } from "@/components/expenses/create-expense-chooser";
import { formatExpenseDate } from "@/lib/expenses";
import { invoiceMoney } from "@/lib/invoices";
import { billCaptureEditor, extractBillApi } from "@/lib/ocr-capture";
import { useCaptureStore } from "@/stores/capture";

/**
 * Add bill: type it in, or scan the supplier's bill. Same card order as
 * Create new expense — manual first, the upload card on the right.
 */
export function CreateBillChooser() {
  const router = useRouter();
  const captureRef = React.useRef<DocumentCaptureHandle>(null);
  const setCapturedBill = useCaptureStore((state) => state.setBill);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="space-y-3">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/expenses/bills">
            <ArrowLeft />
            Bills
          </Link>
        </Button>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Add bill</h1>
          <p className="text-sm text-muted-foreground">
            Record a bill you&apos;ve received and pay later. It becomes an
            expense once you convert it from the Bills list.
          </p>
        </div>
      </div>

      <div
        className="grid grid-cols-1 gap-4 md:grid-cols-2"
        data-usertour="bill-create-methods"
      >
        <MethodCard
          href="/expenses/bills/new/manual"
          title="Enter manually"
          tag="Fastest"
          body="Start from a blank bill and type in the supplier, dates and each line yourself."
          recommended
          icon={<FilePlus2 className="size-5 text-primary-foreground" />}
        />
        <MethodCard
          title="Scan bill"
          body="Upload the supplier's bill as a PDF or image and Sole reads the supplier, bill number, dates and line items for you. PDF, PNG, JPG or JPEG · up to 10MB."
          icon={<ScanText className="size-5 text-muted-foreground" />}
          onClick={() => captureRef.current?.open()}
          onDrop={(files) => captureRef.current?.take(files[0])}
        />
      </div>

      <DocumentCapture
        handleRef={captureRef}
        noun="bill"
        folder="expense-uploads"
        extract={extractBillApi}
        editor={billCaptureEditor}
        fields={({ fields }) => [
          { label: "Supplier", value: fields.supplierName },
          { label: "Bill number", value: fields.billNo },
          {
            label: "Bill date",
            value: fields.billDate ? formatExpenseDate(fields.billDate) : "",
          },
          {
            label: "Due date",
            value: fields.dueDate ? formatExpenseDate(fields.dueDate) : "",
          },
          {
            label: "Total",
            value: fields.total ? invoiceMoney(Number(fields.total)) : "",
          },
          {
            label: "Line items",
            value: fields.lines.length ? String(fields.lines.length) : "",
          },
        ]}
        onUse={({ fields, confidence }, file) => {
          setCapturedBill({ fields, confidence, file });
          router.push("/expenses/bills/new/manual?capture=1");
        }}
      />
    </div>
  );
}
