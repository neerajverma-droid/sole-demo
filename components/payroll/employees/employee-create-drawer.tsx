"use client";

import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Landmark,
  Loader2,
  PiggyBank,
  ReceiptText,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { FormSection } from "@/components/ui/form-section";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  CheckField,
  MobileField,
  MoneyField,
  NumberField,
  SelectField,
  TextField,
} from "@/components/payroll/employees/employee-fields";
import {
  useCreateEmployeeMutation,
  usePayrollCloneSourcesQuery,
} from "@/hooks/use-payroll-employees-query";
import {
  CLONE_MANUAL,
  CREATE_EMPLOYEE_DEFAULTS,
  EMPLOYMENT_TYPE_OPTIONS,
  STP_INCOME_STREAM_OPTIONS,
  SUPER_HOURS_OPTIONS,
  SUPER_OVERRIDE_OPTIONS,
  TAX_SCALE_OPTIONS,
  createEmployeeSchema,
  employeeErrorMessage,
  employeeWriteBlock,
  employeeName,
  type CreateEmployeeValues,
  type EmployeeWriteBlock,
  type Option,
} from "@/lib/payroll-employees";

const TAX_FLAGS: { name: keyof CreateEmployeeValues; label: string }[] = [
  { name: "taxFreeThresholdClaimed", label: "Tax-free threshold claimed" },
  { name: "helpHecs", label: "HELP / HECS debt" },
  { name: "tradeSupportLoan", label: "Trade Support Loan" },
  { name: "studentFinancialSupplement", label: "Student Financial Supplement" },
  {
    name: "seniorsAndPensionersTaxOffset",
    label: "Seniors and Pensioners Offset",
  },
];

/**
 * `POST /employees` — a new person, queued for Microkeeper.
 *
 * Tax, super and banking are required alongside the identity block — they're
 * what the pay run's profile check looks for, so an employee created without
 * them is flagged the first time they're paid. "Clone settings from" copies another
 * synced employee's Microkeeper settings in place of choosing an employment
 * type here.
 */
export function EmployeeCreateDrawer({
  open,
  onOpenChange,
  onBlocked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The server refused for seats or billing — the drawer stays open. */
  onBlocked: (block: EmployeeWriteBlock, message: string) => void;
}) {
  const create = useCreateEmployeeMutation();

  const form = useForm<CreateEmployeeValues>({
    resolver: zodResolver(createEmployeeSchema),
    mode: "onTouched",
    defaultValues: CREATE_EMPLOYEE_DEFAULTS,
  });

  React.useEffect(() => {
    if (open) form.reset(CREATE_EMPLOYEE_DEFAULTS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const sourcesQuery = usePayrollCloneSourcesQuery(open);
  const cloneOptions: Option[] = (sourcesQuery.data?.employees ?? [])
    .filter((employee) => employee.eusername)
    .map((employee) => ({
      value: employee.eusername as string,
      label: employeeName(employee) || (employee.eusername as string),
    }));

  const cloning =
    useWatch({ control: form.control, name: "clonedFromUsername" }) !==
    CLONE_MANUAL;

  // A type picked before switching to a clone would be ignored anyway; the
  // error for it shouldn't linger either.
  React.useEffect(() => {
    if (cloning) form.clearErrors("employmentType");
  }, [cloning, form]);

  const onSubmit = async (values: CreateEmployeeValues) => {
    try {
      await create.mutateAsync(values);
      toast.success("Employee created and queued for Microkeeper sync");
      onOpenChange(false);
    } catch (error) {
      const message = employeeErrorMessage(error, "Failed to create employee.");
      // Out of seats or billing: what's typed stays put, so buying a seat
      // and pressing Create again is all it takes.
      const block = employeeWriteBlock(error);
      if (block) onBlocked(block, message);
      else toast.error(message);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="space-y-1 border-b p-6 text-left">
          <SheetTitle>New employee</SheetTitle>
          <SheetDescription>
            Add their details, then they&apos;re queued to sync to Microkeeper.
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex min-h-0 flex-1 flex-col"
            noValidate
          >
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
              <FormSection
                icon={UserRound}
                title="Employee details"
                description="Used across payroll and on payslips."
                className="grid gap-4 sm:grid-cols-2"
              >
                <TextField
                  control={form.control}
                  name="givenName"
                  label="Given name"
                  required
                  autoComplete="off"
                />
                <TextField
                  control={form.control}
                  name="surname"
                  label="Surname"
                  required
                  autoComplete="off"
                />
                <TextField
                  control={form.control}
                  name="username"
                  label="Username"
                  required
                  autoComplete="off"
                />
                <TextField
                  control={form.control}
                  name="payrollId"
                  label="Payroll ID"
                  placeholder="Generated automatically if blank"
                />
                <TextField
                  control={form.control}
                  name="email"
                  label="Email"
                  type="email"
                  required
                  className="sm:col-span-2"
                />
                <MobileField
                  control={form.control}
                  codeName="mobileCountryCode"
                  numberName="mobileNumber"
                  label="Mobile"
                  required
                  className="sm:col-span-2"
                />
                <SelectField
                  control={form.control}
                  name="clonedFromUsername"
                  label="Clone settings from"
                  leading={[{ value: CLONE_MANUAL, label: "Manual selection" }]}
                  options={cloneOptions}
                  hint={
                    sourcesQuery.isPending
                      ? "Loading synced employees…"
                      : cloneOptions.length === 0
                        ? "No synced employees to clone from yet."
                        : "Copies a synced employee's Microkeeper settings."
                  }
                />
                <SelectField
                  control={form.control}
                  name="employmentType"
                  label="Employment type"
                  options={EMPLOYMENT_TYPE_OPTIONS}
                  placeholder={
                    cloning
                      ? "From the cloned employee"
                      : "Select employment type"
                  }
                  required={!cloning}
                  hint={
                    cloning
                      ? "Not sent when cloning — the cloned employee's type is used."
                      : undefined
                  }
                />
                <NumberField
                  control={form.control}
                  name="weeklyOrdinaryHours"
                  label="Weekly ordinary hours"
                  placeholder="38"
                  suffix="hrs"
                />
                <div className="space-y-3 sm:col-span-2">
                  <CheckField
                    control={form.control}
                    name="sendCredentialsEmail"
                    label="Send credentials by email"
                  />
                  <CheckField
                    control={form.control}
                    name="sendCredentialsSms"
                    label="Send credentials by SMS"
                  />
                </div>
              </FormSection>

              <FormSection
                icon={ReceiptText}
                title="Tax"
                description="Needed before this employee can be paid."
                className="grid gap-4 sm:grid-cols-2"
              >
                <TextField
                  control={form.control}
                  name="tfn"
                  label="Tax file number"
                  inputMode="numeric"
                  required
                />
                <SelectField
                  control={form.control}
                  name="taxScale"
                  label="Tax scale"
                  options={TAX_SCALE_OPTIONS}
                  required
                />
                <SelectField
                  control={form.control}
                  name="stpIncomeStreamType"
                  label="STP income stream"
                  options={STP_INCOME_STREAM_OPTIONS}
                  required
                  className="sm:col-span-2"
                />
                <div className="space-y-3 sm:col-span-2">
                  {TAX_FLAGS.map((flag) => (
                    <CheckField
                      key={flag.name}
                      control={form.control}
                      name={flag.name}
                      label={flag.label}
                    />
                  ))}
                </div>
                <MoneyField
                  control={form.control}
                  name="taxOffsetAmount"
                  label="Tax offset amount"
                />
                <NumberField
                  control={form.control}
                  name="taxRateFixPercent"
                  label="Tax rate fix"
                  suffix="%"
                />
              </FormSection>

              <FormSection
                icon={PiggyBank}
                title="Superannuation"
                description="The employee's primary employer super fund."
                className="grid gap-4 sm:grid-cols-2"
              >
                <SelectField
                  control={form.control}
                  name="superOrdinaryHours"
                  label="Ordinary hours calculation"
                  options={SUPER_HOURS_OPTIONS}
                  required
                />
                <NumberField
                  control={form.control}
                  name="additionalSuperRate"
                  label="Additional super rate"
                  suffix="%"
                />
                <SelectField
                  control={form.control}
                  name="superOverrideType"
                  label="Override type"
                  options={SUPER_OVERRIDE_OPTIONS}
                />
                <NumberField
                  control={form.control}
                  name="superOverrideAmount"
                  label="Override amount"
                />
                <TextField
                  control={form.control}
                  name="employerSuperFund"
                  label="Super fund USI"
                  placeholder="STA0100AU"
                  hint="The fund's Unique Superannuation Identifier — Microkeeper matches the fund by it."
                  required
                />
                <TextField
                  control={form.control}
                  name="employerMemberNumber"
                  label="Member number"
                  required
                />
              </FormSection>

              <FormSection
                icon={Landmark}
                title="Banking"
                description="The account their pay goes into."
                className="grid gap-4 sm:grid-cols-2"
              >
                <TextField
                  control={form.control}
                  name="account1Name"
                  label="Account name"
                  required
                  className="sm:col-span-2"
                />
                <TextField
                  control={form.control}
                  name="account1Bsb"
                  label="BSB"
                  placeholder="063-182"
                  inputMode="numeric"
                  required
                />
                <TextField
                  control={form.control}
                  name="account1Number"
                  label="Account number"
                  inputMode="numeric"
                  required
                />
                <TextField
                  control={form.control}
                  name="account1Description"
                  label="Account description"
                  placeholder="Everyday account"
                  className="sm:col-span-2"
                />
              </FormSection>
            </div>

            <SheetFooter className="flex-row justify-end gap-2 border-t p-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending && (
                  <Loader2 className="animate-spin" aria-hidden />
                )}
                {create.isPending ? "Creating…" : "Create employee"}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
