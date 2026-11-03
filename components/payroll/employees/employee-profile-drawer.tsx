"use client";

import * as React from "react";
import {
  useForm,
  useWatch,
  type Control,
  type FieldErrors,
  type Resolver,
} from "react-hook-form";
import {
  BadgeDollarSign,
  Banknote,
  BriefcaseBusiness,
  CalendarClock,
  CircleUserRound,
  Clock3,
  Download,
  FileText,
  FolderOpen,
  Landmark,
  Loader2,
  MapPin,
  ReceiptText,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Upload,
  UserRoundCheck,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Form, FormControl, FormField, FormItem } from "@/components/ui/form";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Shimmer } from "@/components/ui/shimmer";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatBytes } from "@/components/bulk/wizard-parts";
import { AddressAutocomplete } from "@/components/documents/address-autocomplete";
import {
  DateField,
  MobileField,
  MoneyField,
  NumberField,
  SelectField,
  TextField,
  ToggleField,
} from "@/components/payroll/employees/employee-fields";
import {
  useDeleteEmployeeDocumentMutation,
  usePayrollEmployeeDocumentsQuery,
  usePayrollEmployeeQuery,
  useUpdateEmployeeMutation,
  useUploadEmployeeDocumentsMutation,
} from "@/hooks/use-payroll-employees-query";
import { payrollInitials } from "@/lib/payroll";
import {
  CESSATION_TYPE_OPTIONS,
  CLOCKING_METHOD_OPTIONS,
  CONTRACTED_DAYS,
  EMPLOYEE_FILE_ACCEPT,
  EMPLOYEE_FILE_MAX_COUNT,
  EMPLOYEE_STATUS_OPTIONS,
  EMPLOYMENT_TYPE_OPTIONS,
  EMPTY_OPENING_BALANCE,
  GENDER_OPTIONS,
  LOCATION_ACCESS_OPTIONS,
  PAYROLL_ACCESS_OPTIONS,
  PROFILE_SECTIONS,
  ROSTER_ACCESS_OPTIONS,
  SALARY_TYPE_OPTIONS,
  STP_INCOME_STREAM_OPTIONS,
  SUPER_HOURS_OPTIONS,
  SUPER_OVERRIDE_OPTIONS,
  TAX_SCALE_OPTIONS,
  EMPLOYEE_ACCESS_OPTIONS,
  HR_ACCESS_OPTIONS,
  employeeErrorMessage,
  employeeWriteBlock,
  emptyEmployeeProfile,
  employeeFilesError,
  isImageDocument,
  syncStatusLabel,
  syncStatusVariant,
  validateProfile,
  type EmployeeDocument,
  type EmployeeProfile,
  type EmployeeWriteBlock,
  type ProfileSectionId,
} from "@/lib/payroll-employees";
import { cn } from "@/lib/utils";

const SECTION_ICONS: Record<ProfileSectionId, LucideIcon> = {
  files: FolderOpen,
  personal: CircleUserRound,
  address: MapPin,
  employment: BriefcaseBusiness,
  hours: Clock3,
  entitlements: CalendarClock,
  tax: ReceiptText,
  super: Landmark,
  opening: BadgeDollarSign,
  payslip: FileText,
  status: UserRoundCheck,
  access: ShieldCheck,
  banking: Banknote,
};

const GRID = "grid gap-4 sm:grid-cols-2";

/** How far below the scroll area's top edge a section counts as "current". */
const SPY_OFFSET_PX = 32;

/** Only the three fields a save can't go without are checked. */
const profileResolver: Resolver<EmployeeProfile> = async (values) => {
  const errors = validateProfile(values);
  if (Object.keys(errors).length === 0) return { values, errors: {} };
  return {
    values: {},
    errors: Object.fromEntries(
      Object.entries(errors).map(([name, message]) => [
        name,
        { type: "validate", message },
      ]),
    ) as FieldErrors<EmployeeProfile>,
  };
};

/** The form always edits one opening-balance row, even when there's none yet. */
function formValues(profile: EmployeeProfile): EmployeeProfile {
  return {
    ...profile,
    openingBalances:
      profile.openingBalances.length > 0
        ? profile.openingBalances
        : [{ ...EMPTY_OPENING_BALANCE }],
  };
}

/**
 * The whole employee, editable — `GET` then `PUT /employees/{id}`.
 *
 * Thirteen sections in one long scroll, with a nav beside it that follows
 * along. One scroll rather than tabs because people fill a profile top to
 * bottom, and a section nobody has opened is a section nobody has checked.
 */
export function EmployeeProfileDrawer({
  employeeId,
  onClose,
  onBlocked,
}: {
  employeeId: string | null;
  onClose: () => void;
  /** Re-employing someone needs a free seat — the drawer stays open. */
  onBlocked: (block: EmployeeWriteBlock, message: string) => void;
}) {
  const update = useUpdateEmployeeMutation();
  const open = employeeId !== null;
  const detailQuery = usePayrollEmployeeQuery(employeeId);
  const documentsQuery = usePayrollEmployeeDocumentsQuery(employeeId);
  const detail = detailQuery.data;

  const form = useForm<EmployeeProfile>({
    resolver: profileResolver,
    mode: "onTouched",
    defaultValues: formValues(emptyEmployeeProfile()),
  });

  React.useEffect(() => {
    if (open && detail) form.reset(formValues(detail.profile));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, detail]);

  const [active, setActive] = React.useState<ProfileSectionId>("files");
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const sectionRefs = React.useRef<
    Partial<Record<ProfileSectionId, HTMLElement | null>>
  >({});
  // While a nav click is scrolling, the spy would light every section it
  // passes on the way — so it holds still until the jump has landed.
  const spyPausedUntil = React.useRef(0);

  React.useEffect(() => {
    if (open) setActive("files");
  }, [open, employeeId]);

  const onScroll = () => {
    if (Date.now() < spyPausedUntil.current) return;
    const container = scrollRef.current;
    if (!container) return;

    // The last sections are too short to reach the top; at the bottom of the
    // scroll the last one is what you're looking at.
    if (
      container.scrollTop + container.clientHeight >=
      container.scrollHeight - 4
    ) {
      setActive(PROFILE_SECTIONS[PROFILE_SECTIONS.length - 1].id);
      return;
    }
    const top = container.getBoundingClientRect().top;
    let current: ProfileSectionId = PROFILE_SECTIONS[0].id;
    for (const section of PROFILE_SECTIONS) {
      const node = sectionRefs.current[section.id];
      if (node && node.getBoundingClientRect().top - top <= SPY_OFFSET_PX) {
        current = section.id;
      }
    }
    setActive(current);
  };

  const jumpTo = (id: ProfileSectionId) => {
    setActive(id);
    spyPausedUntil.current = Date.now() + 800;
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    sectionRefs.current[id]?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });
  };

  const onSave = async (values: EmployeeProfile) => {
    if (!employeeId) return;
    try {
      await update.mutateAsync({ id: employeeId, profile: values });
      toast.success("Employee profile updated successfully");
      onClose();
    } catch (error) {
      const message = employeeErrorMessage(error, "Failed to update employee.");
      const block = employeeWriteBlock(error);
      if (block) onBlocked(block, message);
      else toast.error(message);
    }
  };

  const onInvalid = () => {
    toast.error("Given name, surname and email are required.");
    jumpTo("personal");
  };

  const [givenName, surname, photo, username, salaryType] = useWatch({
    control: form.control,
    name: [
      "givenName",
      "surname",
      "profilePhotoUrl",
      "username",
      "employment.salaryType",
    ],
  });
  const name = [givenName, surname].filter(Boolean).join(" ").trim();
  const handle = detail?.eusername || username;
  const loading = detailQuery.isPending && open;

  const sectionRef = (id: ProfileSectionId) => (node: HTMLElement | null) => {
    sectionRefs.current[id] = node;
  };

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-5xl">
        <SheetHeader className="border-b p-6 pr-12 text-left">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="size-11">
              {photo && <AvatarImage src={photo} alt="" />}
              <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">
                {name ? payrollInitials(name) : "E"}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 space-y-0.5">
              <div className="flex min-w-0 items-center gap-2">
                <SheetTitle className="truncate">
                  {loading ? "Employee profile" : name || "Employee profile"}
                </SheetTitle>
                {detail && (
                  <Badge variant={syncStatusVariant(detail.status)}>
                    {syncStatusLabel(detail.status)}
                  </Badge>
                )}
              </div>
              <SheetDescription className="truncate">
                {handle ? `@${handle}` : "No username yet"}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSave, onInvalid)}
            className="flex min-h-0 flex-1 flex-col"
            noValidate
          >
            <div className="flex min-h-0 flex-1">
              <nav
                aria-label="Profile sections"
                className="hidden w-56 shrink-0 overflow-y-auto border-r border-border p-3 md:block"
              >
                <ul className="space-y-0.5">
                  {PROFILE_SECTIONS.map((section) => {
                    const Icon = SECTION_ICONS[section.id];
                    const current = active === section.id;
                    return (
                      <li key={section.id}>
                        <button
                          type="button"
                          onClick={() => jumpTo(section.id)}
                          aria-current={current ? "true" : undefined}
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                            current
                              ? "bg-primary/10 font-medium text-primary-heading"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground",
                          )}
                        >
                          <Icon className="size-4 shrink-0" aria-hidden />
                          {section.label}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </nav>

              <div
                ref={scrollRef}
                onScroll={onScroll}
                className="min-h-0 flex-1 overflow-y-auto p-6"
              >
                {/* No room for the nav on a phone — a jump list stands in. */}
                <div className="mb-6 md:hidden">
                  <Select
                    value={active}
                    onValueChange={(next) => jumpTo(next as ProfileSectionId)}
                  >
                    <SelectTrigger aria-label="Jump to section">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROFILE_SECTIONS.map((section) => (
                        <SelectItem key={section.id} value={section.id}>
                          {section.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-6">
                  {loading ? (
                    <div className="space-y-6" aria-hidden>
                      <Shimmer className="h-48 w-full rounded-lg border border-border" />
                      <Shimmer className="h-72 w-full rounded-lg border border-border" />
                      <Shimmer className="h-72 w-full rounded-lg border border-border" />
                    </div>
                  ) : detailQuery.isError ? (
                    <Empty>
                      <EmptyMedia>
                        <TriangleAlert aria-hidden />
                      </EmptyMedia>
                      <div className="space-y-1">
                        <EmptyTitle>Couldn&apos;t load this profile</EmptyTitle>
                        <EmptyDescription>
                          {/* A deleted employee or a stale link says so;
                              anything else is the server being unreachable. */}
                          {employeeErrorMessage(
                            detailQuery.error,
                            "Something went wrong reaching the server. Try again.",
                          )}
                        </EmptyDescription>
                      </div>
                      <EmptyActions>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void detailQuery.refetch()}
                        >
                          Try again
                        </Button>
                      </EmptyActions>
                    </Empty>
                  ) : (
                    <ProfileSections
                      employeeId={employeeId}
                      control={form.control}
                      sectionRef={sectionRef}
                      documents={documentsQuery.data ?? []}
                      documentsLoading={documentsQuery.isPending}
                      documentsFailed={documentsQuery.isError}
                      onRetryDocuments={() => void documentsQuery.refetch()}
                      onAddress={(place) => {
                        const dirty = { shouldDirty: true };
                        form.setValue(
                          "address.addressLine1",
                          place.addressLine1,
                          dirty,
                        );
                        form.setValue("address.city", place.city, dirty);
                        form.setValue("address.state", place.state, dirty);
                        form.setValue(
                          "address.postcode",
                          place.postcode,
                          dirty,
                        );
                        form.setValue("address.country", place.country, dirty);
                      }}
                      salaryType={salaryType}
                    />
                  )}
                </div>
              </div>
            </div>

            <SheetFooter className="flex-row justify-end gap-2 border-t p-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading || detailQuery.isError || update.isPending}
              >
                {update.isPending && (
                  <Loader2 className="animate-spin" aria-hidden />
                )}
                {update.isPending ? "Saving…" : "Save profile"}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}

type C = Control<EmployeeProfile>;

function ProfileSections({
  employeeId,
  control,
  sectionRef,
  documents,
  documentsLoading,
  documentsFailed,
  onRetryDocuments,
  onAddress,
  salaryType,
}: {
  employeeId: string | null;
  control: C;
  sectionRef: (id: ProfileSectionId) => (node: HTMLElement | null) => void;
  documents: EmployeeDocument[];
  documentsLoading: boolean;
  documentsFailed: boolean;
  onRetryDocuments: () => void;
  onAddress: (place: {
    addressLine1: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
  }) => void;
  salaryType: string;
}) {
  const [addressSearch, setAddressSearch] = React.useState("");

  return (
    <>
      <ProfileSection
        sectionRef={sectionRef}
        id="files"
        description="Contracts, declarations and other documents for this employee."
        grid={false}
      >
        <PersonalFiles
          employeeId={employeeId}
          documents={documents}
          loading={documentsLoading}
          failed={documentsFailed}
          onRetry={onRetryDocuments}
        />
      </ProfileSection>

      <ProfileSection
        sectionRef={sectionRef}
        id="personal"
        description="Identity and contact details used throughout payroll."
      >
        <TextField
          control={control}
          name="givenName"
          label="Given name"
          required
        />
        <TextField control={control} name="surname" label="Surname" required />
        <TextField
          control={control}
          name="email"
          label="Email"
          type="email"
          required
        />
        <MobileField
          control={control}
          codeName="mobileCountryCode"
          numberName="mobileNumber"
          label="Mobile"
        />
        <TextField control={control} name="username" label="Username" />
        <TextField control={control} name="payrollId" label="Payroll ID" />
        <TextField
          control={control}
          name="personalDetails.position"
          label="Position"
        />
        <TextField
          control={control}
          name="personalDetails.employeeIdNo"
          label="Employee ID"
        />
        <DateField
          control={control}
          name="personalDetails.dob"
          label="Date of birth"
        />
        <SelectField
          control={control}
          name="personalDetails.gender"
          label="Gender"
          options={GENDER_OPTIONS}
        />
        <TextField
          control={control}
          name="personalDetails.homePhone"
          label="Home phone"
          inputMode="tel"
        />
        <TextField
          control={control}
          name="personalDetails.altPhone"
          label="Alternative phone"
          inputMode="tel"
        />
        <TextField
          control={control}
          name="personalDetails.nokName"
          label="Next of kin"
        />
        <TextField
          control={control}
          name="personalDetails.nokNumber"
          label="Next of kin phone"
          inputMode="tel"
        />
        <TextField
          control={control}
          name="personalDetails.abn"
          label="ABN"
          inputMode="numeric"
          hint="For sub-contractors."
        />
        <TextField
          control={control}
          name="personalDetails.businessName"
          label="Business name"
          hint="For sub-contractors."
        />
      </ProfileSection>

      <ProfileSection
        sectionRef={sectionRef}
        id="address"
        description="Their home address and the timezone payroll uses for them."
      >
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="employee-address-search">Search address</Label>
          <AddressAutocomplete
            id="employee-address-search"
            value={addressSearch}
            onChange={setAddressSearch}
            onSelect={onAddress}
            placeholder="Start typing an address"
            countryRestrictions={["au"]}
          />
          <p className="text-xs text-muted-foreground">
            Pick a match to fill the fields below, or type them in.
          </p>
        </div>
        <TextField
          control={control}
          name="address.addressLine1"
          label="Address line 1"
          className="sm:col-span-2"
        />
        <TextField
          control={control}
          name="address.addressLine2"
          label="Address line 2"
          className="sm:col-span-2"
        />
        <TextField
          control={control}
          name="address.city"
          label="Suburb / city"
        />
        <TextField
          control={control}
          name="address.state"
          label="State"
          placeholder="VIC"
        />
        <TextField
          control={control}
          name="address.postcode"
          label="Postcode"
          inputMode="numeric"
        />
        <TextField control={control} name="address.country" label="Country" />
        <TextField
          control={control}
          name="address.timezone"
          label="Timezone"
          placeholder="Victoria"
        />
      </ProfileSection>

      <ProfileSection
        sectionRef={sectionRef}
        id="employment"
        description="Pay rates, classification and key dates."
      >
        <SelectField
          control={control}
          name="employment.employmentType"
          label="Employment type"
          options={EMPLOYMENT_TYPE_OPTIONS}
        />
        <SelectField
          control={control}
          name="employment.salaryType"
          label="Salary type"
          options={SALARY_TYPE_OPTIONS}
        />
        <MoneyField
          control={control}
          name="employment.defaultHourlyRate"
          label="Base hourly rate"
        />
        <MoneyField
          control={control}
          name="employment.annualSalary"
          label="Annual salary"
        />
        <MoneyField
          control={control}
          name="employment.saturdayRate"
          label="Saturday rate"
        />
        <MoneyField
          control={control}
          name="employment.sundayRate"
          label="Sunday rate"
        />
        {salaryType === "AUTO_OVERTIME" && (
          <NumberField
            control={control}
            name="employment.autoOvertimeMultiplier"
            label="Overtime multiplier"
            placeholder="1.5"
            suffix="×"
          />
        )}
        <DateField
          control={control}
          name="employment.startDate"
          label="Start date"
        />
        <TextField
          control={control}
          name="employment.primaryManagerUsername"
          label="Primary manager username"
        />
      </ProfileSection>

      <ProfileSection
        sectionRef={sectionRef}
        id="hours"
        description="Ordinary weekly hours and their regular schedule."
        grid={false}
      >
        <div className={GRID}>
          <NumberField
            control={control}
            name="employment.weeklyOrdinaryHours"
            label="Weekly ordinary hours"
            suffix="hrs"
          />
          <TextField
            control={control}
            name="employment.contractedHoursRoster"
            label="Roster"
            placeholder="Default Roster"
          />
        </div>
        <ContractedHoursGrid control={control} />
      </ProfileSection>

      <ProfileSection
        sectionRef={sectionRef}
        id="entitlements"
        description="Leave entitlements and how leave loading is paid."
      >
        <NumberField
          control={control}
          name="employment.entitledAnnualLeaveWeeks"
          label="Annual leave"
          suffix="wks"
        />
        <NumberField
          control={control}
          name="employment.entitledPersonalLeaveWeeks"
          label="Personal leave"
          suffix="wks"
        />
        <NumberField
          control={control}
          name="employment.annualLeaveLoadingPct"
          label="Annual leave loading"
          suffix="%"
        />
        <NumberField
          control={control}
          name="employment.longServiceLeaveOutOf"
          label="Long service leave out of"
          suffix="yrs"
        />
        <ToggleField
          control={control}
          name="employment.superOnLeaveLoading"
          label="Pay super on leave loading"
          className="sm:col-span-2"
        />
      </ProfileSection>

      <ProfileSection
        sectionRef={sectionRef}
        id="tax"
        description="Tax declaration and STP reporting."
      >
        <TextField
          control={control}
          name="tax.tfn"
          label="Tax file number"
          inputMode="numeric"
        />
        <SelectField
          control={control}
          name="tax.taxScale"
          label="Tax scale"
          options={TAX_SCALE_OPTIONS}
        />
        <SelectField
          control={control}
          name="tax.stpIncomeStreamType"
          label="STP income stream"
          options={STP_INCOME_STREAM_OPTIONS}
        />
        <TextField
          control={control}
          name="tax.overseasCountry"
          label="Overseas country"
          hint="Only for foreign residents and working holiday makers."
        />
        <MoneyField
          control={control}
          name="tax.taxOffsetAmount"
          label="Tax offset amount"
        />
        <NumberField
          control={control}
          name="tax.taxRateFixPercent"
          label="Tax rate fix"
          suffix="%"
        />
        <ToggleField
          control={control}
          name="tax.taxFreeThresholdClaimed"
          label="Tax-free threshold claimed"
        />
        <ToggleField
          control={control}
          name="tax.helpHecs"
          label="HELP / HECS debt"
        />
        <ToggleField
          control={control}
          name="tax.tradeSupportLoan"
          label="Trade Support Loan"
        />
        <ToggleField
          control={control}
          name="tax.studentFinancialSupplement"
          label="Student Financial Supplement"
        />
        <ToggleField
          control={control}
          name="tax.seniorsAndPensionersTaxOffset"
          label="Seniors and Pensioners Offset"
        />
      </ProfileSection>

      <ProfileSection
        sectionRef={sectionRef}
        id="super"
        description="Their primary fund, and an additional one if they have it."
      >
        <TextField
          control={control}
          name="super.employerSuperFund"
          label="Employer super fund"
        />
        <TextField
          control={control}
          name="super.employerMemberNumber"
          label="Member number"
        />
        <SelectField
          control={control}
          name="super.superOrdinaryHours"
          label="Ordinary hours calculation"
          options={SUPER_HOURS_OPTIONS}
        />
        <NumberField
          control={control}
          name="super.additionalSuperRate"
          label="Additional super rate"
          suffix="%"
        />
        <SelectField
          control={control}
          name="super.superOverrideType"
          label="Override type"
          options={SUPER_OVERRIDE_OPTIONS}
        />
        <NumberField
          control={control}
          name="super.superOverrideAmount"
          label="Override amount"
        />
        <MoneyField
          control={control}
          name="super.superMinimum"
          label="Super minimum"
        />
        <div className="hidden sm:block" aria-hidden />
        <TextField
          control={control}
          name="super.additionalSuperFund"
          label="Additional fund"
        />
        <TextField
          control={control}
          name="super.additionalMemberNumber"
          label="Additional member number"
        />
      </ProfileSection>

      <ProfileSection
        sectionRef={sectionRef}
        id="opening"
        description="Year-to-date pay and leave brought in from a previous system."
      >
        <TextField
          control={control}
          name="openingBalances.0.financialYear"
          label="Financial year"
          placeholder="2025-2026"
          hint="Nothing here is saved without a financial year."
          className="sm:col-span-2"
        />
        <MoneyField
          control={control}
          name="openingBalances.0.preGrossEarnings"
          label="Gross earnings"
        />
        <MoneyField
          control={control}
          name="openingBalances.0.preSuperannuation"
          label="Superannuation"
        />
        <MoneyField
          control={control}
          name="openingBalances.0.preTax"
          label="Tax"
        />
        <MoneyField
          control={control}
          name="openingBalances.0.preNet"
          label="Net pay"
        />
        <NumberField
          control={control}
          name="openingBalances.0.annualLeaveHours"
          label="Annual leave"
          suffix="hrs"
        />
        <NumberField
          control={control}
          name="openingBalances.0.personalLeaveHours"
          label="Personal leave"
          suffix="hrs"
        />
        <NumberField
          control={control}
          name="openingBalances.0.longServiceLeaveHours"
          label="Long service leave"
          suffix="hrs"
        />
        <NumberField
          control={control}
          name="openingBalances.0.rdoHours"
          label="RDO"
          suffix="hrs"
        />
      </ProfileSection>

      <ProfileSection
        sectionRef={sectionRef}
        id="payslip"
        description="What appears on their payslips."
      >
        <ToggleField
          control={control}
          name="employment.showPersonalLeaveOnPayslip"
          label="Show personal leave"
        />
        <ToggleField
          control={control}
          name="employment.showAnnualLeaveOnPayslip"
          label="Show annual leave"
        />
        <ToggleField
          control={control}
          name="employment.showLongServiceLeaveOnPayslip"
          label="Show long service leave"
        />
        <ToggleField
          control={control}
          name="employment.showRdoOnPayslip"
          label="Show RDO"
        />
        <ToggleField
          control={control}
          name="employment.printedPayslip"
          label="Printed payslip"
        />
        <ToggleField
          control={control}
          name="employment.hideTimesheet"
          label="Hide timesheet"
        />
      </ProfileSection>

      <ProfileSection
        sectionRef={sectionRef}
        id="status"
        description="Employment status, termination and how they clock on."
      >
        <SelectField
          control={control}
          name="employment.employeeStatus"
          label="Employee status"
          options={EMPLOYEE_STATUS_OPTIONS}
        />
        <SelectField
          control={control}
          name="employment.clockingMethod"
          label="Clocking method"
          options={CLOCKING_METHOD_OPTIONS}
        />
        <DateField
          control={control}
          name="employment.terminationDate"
          label="Termination date"
        />
        <SelectField
          control={control}
          name="employment.cessationType"
          label="Cessation type"
          options={CESSATION_TYPE_OPTIONS}
        />
        <ToggleField
          control={control}
          name="employment.showRosterEndTime"
          label="Show roster end time"
          className="sm:col-span-2"
        />
      </ProfileSection>

      <ProfileSection
        sectionRef={sectionRef}
        id="access"
        description="What they can see and do in rostering, timesheets and payroll."
      >
        <SelectField
          control={control}
          name="accessControl.locationAccess"
          label="Location access"
          options={LOCATION_ACCESS_OPTIONS}
        />
        <SelectField
          control={control}
          name="accessControl.rosterAccess"
          label="Roster access"
          options={ROSTER_ACCESS_OPTIONS}
        />
        <SelectField
          control={control}
          name="accessControl.timesheetAccess"
          label="Timesheet access"
          options={ROSTER_ACCESS_OPTIONS}
        />
        <SelectField
          control={control}
          name="accessControl.payrollAccess"
          label="Payroll access"
          options={PAYROLL_ACCESS_OPTIONS}
        />
        <SelectField
          control={control}
          name="accessControl.employeeAccess"
          label="Employee access"
          options={EMPLOYEE_ACCESS_OPTIONS}
        />
        <SelectField
          control={control}
          name="accessControl.hrAccess"
          label="HR access"
          options={HR_ACCESS_OPTIONS}
        />
        <ToggleField
          control={control}
          name="accessControl.displayCosts"
          label="Display costs"
        />
        <ToggleField
          control={control}
          name="accessControl.leaveRequests"
          label="Manage leave requests"
        />
        <ToggleField
          control={control}
          name="accessControl.reports"
          label="Reports"
        />
        <ToggleField
          control={control}
          name="accessControl.filesAccess"
          label="Files"
        />
        <ToggleField
          control={control}
          name="accessControl.nfcTagsFingerprints"
          label="NFC tags and fingerprints"
        />
        <ToggleField
          control={control}
          name="accessControl.jobsAndClients"
          label="Jobs and clients"
        />
        <ToggleField
          control={control}
          name="accessControl.invoicing"
          label="Invoicing"
        />
        <ToggleField
          control={control}
          name="accessControl.activityFeed"
          label="Activity feed"
        />
        <ToggleField
          control={control}
          name="accessControl.groupConfig"
          label="Group config"
        />
        <ToggleField
          control={control}
          name="accessControl.settings"
          label="Settings"
        />
      </ProfileSection>

      <ProfileSection
        sectionRef={sectionRef}
        id="banking"
        description="The account their pay goes into."
      >
        <TextField
          control={control}
          name="banking.account1Name"
          label="Account name"
          className="sm:col-span-2"
        />
        <TextField
          control={control}
          name="banking.account1Bsb"
          label="BSB"
          placeholder="063-182"
          inputMode="numeric"
        />
        <TextField
          control={control}
          name="banking.account1Number"
          label="Account number"
          inputMode="numeric"
        />
        <TextField
          control={control}
          name="banking.account1Description"
          label="Description"
          className="sm:col-span-2"
        />
      </ProfileSection>
    </>
  );
}

/** One of the thirteen, anchored so the nav can find it and jump to it. */
function ProfileSection({
  id,
  sectionRef,
  description,
  grid = true,
  children,
}: {
  id: ProfileSectionId;
  sectionRef: (id: ProfileSectionId) => (node: HTMLElement | null) => void;
  description: string;
  grid?: boolean;
  children: React.ReactNode;
}) {
  const title =
    PROFILE_SECTIONS.find((section) => section.id === id)?.label ?? id;
  return (
    <div ref={sectionRef(id)} id={`employee-${id}`} className="scroll-mt-6">
      <FormSection
        icon={SECTION_ICONS[id]}
        title={title}
        description={description}
        className={grid ? GRID : undefined}
      >
        {children}
      </FormSection>
    </div>
  );
}

/** Monday to Sunday: start, end and hours for each day they usually work. */
function ContractedHoursGrid({ control }: { control: C }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[440px] text-sm">
        <thead className="bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 text-left font-medium">
              Day
            </th>
            <th scope="col" className="px-3 py-2 text-left font-medium">
              Start
            </th>
            <th scope="col" className="px-3 py-2 text-left font-medium">
              End
            </th>
            <th scope="col" className="w-28 px-3 py-2 text-left font-medium">
              Hours
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {CONTRACTED_DAYS.map((day, index) => (
            <tr key={day.dayOfWeek}>
              <th scope="row" className="px-3 py-2 text-left font-medium">
                {day.label}
              </th>
              {(["startTime", "endTime", "hours"] as const).map((key) => (
                <td key={key} className="px-3 py-2">
                  <FormField
                    control={control}
                    name={`employment.contractedHours.${index}.${key}`}
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input
                            {...field}
                            value={String(field.value ?? "")}
                            type={key === "hours" ? "text" : "time"}
                            inputMode={key === "hours" ? "decimal" : undefined}
                            placeholder={key === "hours" ? "0" : undefined}
                            aria-label={`${day.label} ${
                              key === "startTime"
                                ? "start"
                                : key === "endTime"
                                  ? "end"
                                  : "hours"
                            }`}
                            className="tabular"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** `GET`, `POST` and `DELETE /employees/{id}/documents`. */
function PersonalFiles({
  employeeId,
  documents,
  loading,
  failed,
  onRetry,
}: {
  employeeId: string | null;
  documents: EmployeeDocument[];
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [removing, setRemoving] = React.useState<EmployeeDocument | null>(null);

  const upload = useUploadEmployeeDocumentsMutation(employeeId);
  const remove = useDeleteEmployeeDocumentMutation(employeeId);

  const onFiles = async (files: File[]) => {
    if (files.length === 0) return;
    const problem = employeeFilesError(files);
    if (problem) {
      toast.error(problem);
      return;
    }
    try {
      await upload.mutateAsync(files);
      toast.success(
        `${files.length} employee file${files.length === 1 ? "" : "s"} uploaded`,
      );
    } catch (error) {
      toast.error(
        employeeErrorMessage(error, "Failed to upload employee files."),
      );
    }
  };

  const onRemove = async () => {
    if (!removing) return;
    try {
      const message = await remove.mutateAsync(removing.id);
      // The server says so when the record went but the stored file didn't.
      if (/could not be deleted/i.test(message)) toast.warning(message);
      else toast.success("Employee file removed");
      setRemoving(null);
    } catch (error) {
      toast.error(
        employeeErrorMessage(error, "Failed to remove employee file."),
      );
    }
  };

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="space-y-2" aria-hidden>
          <Shimmer className="h-14 w-full rounded-md" />
          <Shimmer className="h-14 w-full rounded-md" />
        </div>
      ) : failed ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <TriangleAlert className="size-4 text-destructive" aria-hidden />
            Couldn&apos;t load their files.
          </p>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : documents.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          No files yet.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {documents.map((document) => (
            <li key={document.id} className="flex items-center gap-3 p-3">
              {isImageDocument(document) && document.fileUrl ? (
                // A signed storage URL, not a static asset — nothing for
                // next/image to optimise.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={document.fileUrl}
                  alt=""
                  className="size-10 shrink-0 rounded-md object-cover"
                />
              ) : (
                <span
                  className="grid size-10 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"
                  aria-hidden
                >
                  <FileText className="size-5" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {document.fileName || "Untitled file"}
                </p>
                <p className="text-xs text-muted-foreground tabular">
                  {document.fileSize === null
                    ? "Stored securely"
                    : formatBytes(document.fileSize)}
                </p>
              </div>
              <Button variant="ghost" size="icon" className="size-8" asChild>
                <a
                  href={document.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  download={document.fileName}
                  aria-label={`Download ${document.fileName || "file"}`}
                >
                  <Download className="size-4 text-muted-foreground" />
                </a>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => setRemoving(document)}
                aria-label={`Remove ${document.fileName || "file"}`}
              >
                <Trash2 className="size-4 text-muted-foreground" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={upload.isPending || !employeeId}
        >
          {upload.isPending ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <Upload />
          )}
          {upload.isPending ? "Uploading…" : "Add files"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Up to {EMPLOYEE_FILE_MAX_COUNT} at a time, 20 MB each — PDF, image,
          Word, Excel, CSV or text.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={EMPLOYEE_FILE_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            void onFiles(files);
          }}
        />
      </div>

      <AlertDialog
        open={removing !== null}
        onOpenChange={(next) => !next && !remove.isPending && setRemoving(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove file?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing?.fileName || "This file"} will be deleted from this
              employee&apos;s files. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={remove.isPending}
              onClick={(event) => {
                event.preventDefault();
                void onRemove();
              }}
            >
              {remove.isPending && (
                <Loader2 className="animate-spin" aria-hidden />
              )}
              {remove.isPending ? "Removing…" : "Remove file"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
