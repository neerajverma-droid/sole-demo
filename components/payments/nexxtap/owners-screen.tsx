"use client";

import { Loader2, Plus, Trash2, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormSection } from "@/components/ui/form-section";
import {
  NexxtapOnboardingShell,
  NexxtapStepFooter,
  NEXXTAP_SECTION_HEADER,
} from "@/components/payments/nexxtap/onboarding-shell";
import { useNexxtapStepForm } from "@/components/payments/nexxtap/use-step-form";
import {
  SelectField,
  TextField,
} from "@/components/payments/shared/onboarding-fields";
import {
  EMPTY_NEXXTAP_OWNER,
  MAX_OWNERS,
  NEXXTAP_STATES,
  ownersIssues,
  todayIso,
  type NexxtapOwner,
} from "@/lib/nexxtap";

/**
 * Owner field ids, built per row.
 *
 * `ownersIssues` keys its findings `"<index>.<field>"`, so the id map the
 * scroll-to-error helper needs has to be built from the list rather than
 * written out — there's no fixed set of fields when the count is up to four.
 */
function fieldIdsFor(count: number): Record<string, string> {
  const ids: Record<string, string> = { owners: "nexxtap-owners-list" };
  for (let index = 0; index < count; index += 1) {
    for (const field of Object.keys(EMPTY_NEXXTAP_OWNER)) {
      ids[`${index}.${field}`] = ownerFieldId(index, field);
    }
  }
  return ids;
}

const ownerFieldId = (index: number, field: string) =>
  `nexxtap-owner-${index}-${field.replace(/_/g, "-")}`;

/**
 * Ultimate beneficial owners.
 *
 * A list rather than one person, which is what separates this step from the
 * Applicant one: NextTap wants everyone who ultimately owns the business, up
 * to four, and the applicant is often only one of them.
 *
 * At least one is required. The first row is offered already open rather than
 * behind an "Add owner" button, because a step whose only content is a button
 * reads as a step with nothing in it.
 */
export function NexxtapOwnersScreen() {
  const { draft, setDraft, issues, saving, save, fieldEvents } = useNexxtapStepForm<
    NexxtapOwner[]
  >({
    stepId: "owners",
    select: (state) =>
      state.owners.length > 0 ? state.owners : [{ ...EMPTY_NEXXTAP_OWNER }],
    merge: (state, owners) => ({ ...state, owners }),
    validate: ownersIssues,
    // Rebuilt from the current row count on every render, so a row added
    // after a failed Save is still reachable by the error scroll.
    fieldIds: fieldIdsFor(MAX_OWNERS),
    savedMessage: "Beneficial owners saved",
  });

  const patchOwner = (index: number, values: Partial<NexxtapOwner>) =>
    setDraft(
      draft.map((owner, at) => (at === index ? { ...owner, ...values } : owner)),
    );

  const addOwner = () => setDraft([...draft, { ...EMPTY_NEXXTAP_OWNER }]);

  const removeOwner = (index: number) =>
    setDraft(draft.filter((_, at) => at !== index));

  return (
    <NexxtapOnboardingShell stepId="owners">
      <div className="space-y-4" {...fieldEvents}>
        <FormSection
          icon={Users}
          title="Beneficial owners"
          description={`Everyone who ultimately owns the business — up to ${MAX_OWNERS}.`}
          headerClassName={NEXXTAP_SECTION_HEADER}
          className="space-y-4 p-4 sm:p-6"
        >
          {issues.owners && (
            <p className="text-xs text-destructive" id="nexxtap-owners-list">
              {issues.owners}
            </p>
          )}

          {draft.map((owner, index) => (
            <div
              key={index}
              className="space-y-4 rounded-[14px] border border-border bg-muted/30 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <Badge variant="secondary">Owner {index + 1}</Badge>
                {/* Only once there's more than one — removing the only owner
                    would leave a step that can't be saved. */}
                {draft.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => removeOwner(index)}
                  >
                    <Trash2 />
                    Remove
                  </Button>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  id={ownerFieldId(index, "first_name")}
                  label="First name"
                  required
                  placeholder="John"
                  value={owner.first_name}
                  error={issues[`${index}.first_name`]}
                  onChange={(first_name) => patchOwner(index, { first_name })}
                />
                <TextField
                  id={ownerFieldId(index, "last_name")}
                  label="Last name"
                  required
                  placeholder="Smith"
                  value={owner.last_name}
                  error={issues[`${index}.last_name`]}
                  onChange={(last_name) => patchOwner(index, { last_name })}
                />
                <TextField
                  id={ownerFieldId(index, "date_of_birth")}
                  label="Date of birth"
                  required
                  type="date"
                  max={todayIso()}
                  value={owner.date_of_birth}
                  error={issues[`${index}.date_of_birth`]}
                  onChange={(date_of_birth) =>
                    patchOwner(index, { date_of_birth })
                  }
                />
                <TextField
                  id={ownerFieldId(index, "position")}
                  label="Position"
                  required
                  placeholder="Owner"
                  value={owner.position}
                  error={issues[`${index}.position`]}
                  onChange={(position) => patchOwner(index, { position })}
                />
                <TextField
                  id={ownerFieldId(index, "contact_number")}
                  label="Contact number"
                  required
                  inputMode="tel"
                  placeholder="0412345678"
                  value={owner.contact_number}
                  error={issues[`${index}.contact_number`]}
                  onChange={(contact_number) =>
                    patchOwner(index, { contact_number })
                  }
                />
                <TextField
                  id={ownerFieldId(index, "email")}
                  label="Email"
                  required
                  type="email"
                  placeholder="john@example.com"
                  value={owner.email}
                  error={issues[`${index}.email`]}
                  onChange={(email) => patchOwner(index, { email })}
                />
                <div className="sm:col-span-2">
                  <TextField
                    id={ownerFieldId(index, "residential_address")}
                    label="Residential address"
                    required
                    placeholder="45 Park Avenue"
                    value={owner.residential_address}
                    error={issues[`${index}.residential_address`]}
                    onChange={(residential_address) =>
                      patchOwner(index, { residential_address })
                    }
                  />
                </div>
                <TextField
                  id={ownerFieldId(index, "city")}
                  label="City"
                  required
                  placeholder="Brisbane"
                  value={owner.city}
                  error={issues[`${index}.city`]}
                  onChange={(city) => patchOwner(index, { city })}
                />
                <SelectField
                  id={ownerFieldId(index, "state")}
                  label="State"
                  required
                  options={NEXXTAP_STATES}
                  value={owner.state}
                  error={issues[`${index}.state`]}
                  placeholder="Select state"
                  onChange={(state) => patchOwner(index, { state })}
                />
                <TextField
                  id={ownerFieldId(index, "post_code")}
                  label="Post code"
                  required
                  inputMode="numeric"
                  placeholder="4000"
                  value={owner.post_code}
                  error={issues[`${index}.post_code`]}
                  onChange={(post_code) => patchOwner(index, { post_code })}
                />
              </div>
            </div>
          ))}

          <Button
            variant="outline"
            className="rounded-[9px]"
            onClick={addOwner}
            disabled={draft.length >= MAX_OWNERS}
          >
            <Plus />
            Add owner
          </Button>
          {draft.length >= MAX_OWNERS && (
            <p className="text-xs text-muted-foreground">
              NextTap accepts at most {MAX_OWNERS} beneficial owners on an
              application.
            </p>
          )}
        </FormSection>
      </div>

      <NexxtapStepFooter
        onSave={save}
        saveDisabled={saving}
        saveLabel={
          saving ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Saving…
            </>
          ) : (
            "Save beneficial owners"
          )
        }
      />
    </NexxtapOnboardingShell>
  );
}
