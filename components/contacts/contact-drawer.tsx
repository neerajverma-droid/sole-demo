"use client";

import * as React from "react";
import { useAtom } from "jotai";
import {
  MapPin,
  Pencil,
  Plus,
  Trash2,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useFieldArray, useForm, type FieldPath } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { FormSection } from "@/components/ui/form-section";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CurrencySelect } from "@/components/ui/currency-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { keepOpenForTour } from "@/components/usertour/keep-open-for-tour";
import { useCountryContext } from "@/hooks/use-country-context";
import {
  useContactDetailQuery,
  useCreateContactMutation,
  useUpdateContactMutation,
} from "@/hooks/use-contacts-query";
import { apiErrorMessage } from "@/lib/api-error";
import { contactDrawerAtom } from "@/lib/atoms";
import {
  COUNTRY_CODES,
  EMPTY_CONTACT_PERSON,
  contactFormDefaults,
  contactPeople,
  contactSchemaFor,
  type ContactFormValues,
  type ContactPerson,
} from "@/lib/contacts";
import { maskExample } from "@/lib/business-identifier";
import { cn } from "@/lib/utils";

const TYPE_CHOICES = [
  { value: "Client" as const, label: "Client", hint: "You invoice them" },
  { value: "Supplier" as const, label: "Supplier", hint: "They bill you" },
];

/**
 * The chosen primary, moved into the flat fields.
 *
 * Which card holds the primary and which fields the rest of the product reads
 * are two different things. The switch marks a person; the flat `personName`,
 * `email`, `countryCode`, `phone`, `division` and `position` are what the
 * table, the client picker, invoices and quotes read. So the promotion happens
 * here, on the way to the store, rather than as you toggle — a switch that
 * swapped two cards' contents under your hand would be a strange thing to press.
 *
 * A straight swap: the promoted person's slot takes the person they replaced,
 * so the list keeps its order and nobody is lost. `isPrimary` is then set from
 * position rather than carried over, which is what makes "exactly one, and it's
 * the flat one" true by the time the store sees it.
 */
function withPrimaryFirst(values: ContactFormValues): ContactFormValues {
  // Watched values are read here on every render, and the watch can hand back a
  // partial before the form settles — so the list is defaulted rather than
  // trusted, as it is everywhere else this component reads it.
  const people = values.additionalContacts ?? [];
  const chosen = people.findIndex((person) => person.isPrimary);

  // Already the anchor card's person — just make the flags agree.
  if (chosen === -1) {
    return {
      ...values,
      isPrimary: true,
      additionalContacts: people.map((person) => ({
        ...person,
        isPrimary: false,
      })),
    };
  }

  const promoted = people[chosen];
  // The flat anchor's own id (if it has one) has to travel with it into the
  // array, the same way the promoted person's id travels the other way —
  // otherwise a swap would either invent a new person server-side for
  // someone who already exists, or lose track of which row an existing one
  // used to be.
  const demoted: ContactPerson = {
    id: values.personId,
    personName: values.personName,
    email: values.email,
    countryCode: values.countryCode,
    phone: values.phone,
    division: values.division,
    position: values.position,
    isPrimary: false,
  };

  return {
    ...values,
    personId: promoted.id,
    personName: promoted.personName,
    email: promoted.email,
    countryCode: promoted.countryCode,
    phone: promoted.phone,
    division: promoted.division,
    position: promoted.position,
    isPrimary: true,
    additionalContacts: people.map((person, index) =>
      index === chosen ? demoted : { ...person, isPrimary: false },
    ),
  };
}

export function ContactDrawer() {
  const [drawer, setDrawer] = useAtom(contactDrawerAtom);
  // The list row doesn't carry ABN, notes, address or the people list's own
  // ids — the edit drawer needs the real detail fetch, not the summary row.
  const detailQuery = useContactDetailQuery(drawer.editId);
  const editing = drawer.editId ? detailQuery.data : undefined;
  const createContact = useCreateContactMutation();
  const updateContact = useUpdateContactMutation();
  const saving = createContact.isPending || updateContact.isPending;

  /*
   * The business number (ABN in AU, NZBN in NZ) and the starting currency come
   * from the server's country context for the open business, not from this file.
   */
  const { country } = useCountryContext();
  const contactForm = country.forms.contact;
  const numberField = contactForm?.fields.find((f) => f.key === "ABN") ?? null;
  const currencyField = contactForm?.fields.find((f) => f.key === "currency") ?? null;
  const defaultCurrency = currencyField?.default || country.currency;
  const schema = React.useMemo(() => contactSchemaFor(contactForm), [contactForm]);
  const createDefaults = React.useMemo(
    () => ({ ...contactFormDefaults, currency: defaultCurrency }),
    [defaultCurrency],
  );

  const form = useForm<ContactFormValues>({
    resolver: zodResolver(schema),
    // Errors surface once a field has been left, then track live as it's fixed.
    mode: "onTouched",
    defaultValues: createDefaults,
  });

  const additional = useFieldArray({
    control: form.control,
    name: "additionalContacts",
  });

  /**
   * Which additional contact is open, if any.
   *
   * One at a time: these cards are tall, and two open at once in a drawer this
   * narrow is a list you scroll rather than a list you read.
   */
  const [editingIndex, setEditingIndex] = React.useState<number | null>(null);

  /**
   * The open row's values as editing began, so Cancel can put them back.
   *
   * A ref rather than state because nothing renders from it — and null means
   * the row was created by Add and has no earlier state to restore, which is
   * what tells Cancel to drop it instead.
   */
  const restore = React.useRef<ContactPerson | null>(null);

  /**
   * The fetched detail's own people, ids and all, captured the moment the
   * drawer loads them. The update flow diffs the submitted list against
   * this to decide who gets a PATCH, a POST or a DELETE — the update
   * endpoint doesn't take a `contacts` array the way create does, so
   * reconciling it here is the only way to tell "changed" from "new".
   */
  const originalPeopleRef = React.useRef<ContactPerson[]>([]);

  // Reload the form whenever the drawer opens or switches record.
  React.useEffect(() => {
    if (!drawer.open) return;
    setEditingIndex(null);
    restore.current = null;

    if (!drawer.editId) {
      originalPeopleRef.current = [];
      form.reset(createDefaults);
      return;
    }

    // Still loading the real record — the effect re-runs once it lands.
    if (!editing) return;

    /*
     * The people list is the source for the person fields, and it always has a
     * primary — synthesised from the flat fields for a contact saved before the
     * list existed. So the top block and the section's division and position
     * fill from `people[0]` rather than from the record's own columns, and the
     * two can't disagree about who the primary is.
     */
    const [primary, ...others] = contactPeople(editing);
    originalPeopleRef.current = contactPeople(editing);

    form.reset({
      type: editing.type,
      businessType: editing.businessType,
      businessName: editing.businessName,
      personId: primary.id,
      personName: primary.personName,
      email: primary.email,
      countryCode: primary.countryCode,
      phone: primary.phone,
      abn: editing.abn,
      website: editing.website,
      currency: editing.currency,
      division: primary.division,
      position: primary.position,
      addressLine1: editing.addressLine1,
      city: editing.city,
      country: editing.country,
      notes: editing.notes,
      isPrimary: true,
      additionalContacts: others,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawer.open, drawer.editId, editing]);

  // The country context can land after the drawer opens. A new contact that
  // hasn't had its currency chosen yet follows it; one the user picked does not.
  React.useEffect(() => {
    if (!drawer.open || drawer.editId) return;
    if (form.getFieldState("currency").isDirty) return;
    form.setValue("currency", defaultCurrency);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultCurrency]);

  // A detail fetch that comes back an error means the linked record no
  // longer exists (or never did) — closing here beats leaving an edit
  // drawer open on a blank form pretending to be a real contact. This is
  // also the only place a stale `?contact=<id>` deep link gets caught, now
  // that the store no longer holds every contact to check existence against.
  React.useEffect(() => {
    if (drawer.open && drawer.editId && detailQuery.isError) {
      toast.error("That contact could not be found.");
      setDrawer({ open: false, editId: null });
    }
  }, [drawer.open, drawer.editId, detailQuery.isError, setDrawer]);

  const values = form.watch();
  const isBusiness = values.businessType === "Business";

  /*
   * Validated as it will be submitted, not as it is typed.
   *
   * `withPrimaryFirst` is what the store will receive, and the primary's email
   * is the required one — so a person flagged primary from the list has to be
   * checked in the position they're about to occupy. Parsing the raw values
   * would pass a promoted contact with no email straight through.
   */
  // Computed rather than read from formState so the button is correct on open.
  const canSave = schema.safeParse(withPrimaryFirst(values)).success;

  /** Which card the switch is currently lit on. */
  const primaryIndex = values.additionalContacts?.findIndex(
    (person) => person.isPrimary,
  );
  const anchorIsPrimary = primaryIndex === undefined || primaryIndex === -1;

  const close = () => setDrawer({ open: false, editId: null });

  /* ---------------------------------------------------------------- *
   * Additional contacts
   * ---------------------------------------------------------------- */

  /**
   * One primary, chosen by turning a switch on.
   *
   * Written across every person rather than toggled on one, because the rule is
   * about the set: turning this one on is the same event as turning the others
   * off, and doing it in one pass is what stops two from ever being lit at
   * once. `"anchor"` is the card that holds the flat fields.
   */
  const setPrimaryPerson = (target: "anchor" | number) => {
    form.setValue("isPrimary", target === "anchor", { shouldDirty: true });
    form.getValues("additionalContacts").forEach((_, index) => {
      form.setValue(`additionalContacts.${index}.isPrimary`, target === index, {
        shouldDirty: true,
      });
    });
  };

  /**
   * Nobody left holding it, so the anchor takes it back.
   *
   * Removing the person who was primary would otherwise leave every switch off,
   * which is the one state this control isn't allowed to be in — and the anchor
   * card is the only person who can't also be removed, so it's the only safe
   * place for the flag to land.
   */
  const restorePrimaryIfOrphaned = () => {
    const remaining = form.getValues("additionalContacts");
    if (!remaining.some((person) => person.isPrimary)) {
      form.setValue("isPrimary", true, { shouldDirty: true });
    }
  };

  const openPerson = (index: number) => {
    restore.current = form.getValues("additionalContacts")[index] ?? null;
    setEditingIndex(index);
  };

  /** Appended blank and opened, because there is nothing to summarise yet. */
  const addPerson = () => {
    additional.append({ ...EMPTY_CONTACT_PERSON });
    restore.current = null;
    setEditingIndex(additional.fields.length);
  };

  const donePerson = () => {
    restore.current = null;
    setEditingIndex(null);
  };

  /*
   * Back to how the row was, or gone if it never was.
   *
   * A row added and then cancelled is removed rather than left blank: reverting
   * it to its opening values would leave an empty summary card that fails
   * validation, so Save would be disabled by a row nobody meant to keep.
   */
  const cancelPerson = (index: number) => {
    if (restore.current) {
      form.setValue(`additionalContacts.${index}`, restore.current);
    } else {
      additional.remove(index);
    }
    restore.current = null;
    setEditingIndex(null);
    // A row cancelled away can have been the one flagged primary.
    restorePrimaryIfOrphaned();
  };

  const removePerson = (index: number) => {
    additional.remove(index);
    if (editingIndex === index) {
      restore.current = null;
      setEditingIndex(null);
    }
    restorePrimaryIfOrphaned();
  };

  const onSubmit = async (submitted: ContactFormValues) => {
    // Whoever the switch chose becomes the flat person here — see
    // `withPrimaryFirst`. Everything downstream keeps reading the flat fields.
    const composed = withPrimaryFirst(submitted);

    try {
      if (drawer.editId) {
        await updateContact.mutateAsync({
          id: drawer.editId,
          values: composed,
          originalPeople: originalPeopleRef.current,
        });
        toast.success("Contact updated");
      } else {
        await createContact.mutateAsync(composed);
        toast.success("Contact saved");
      }
      close();
    } catch (error) {
      toast.error(apiErrorMessage(error, "Failed to save contact."));
    }
  };

  return (
    <Sheet open={drawer.open} onOpenChange={(open) => !open && close()}>
      <SheetContent
        className="flex w-full flex-col gap-0 p-0 sm:max-w-xl"
        // The new-contact tour starts on `data-mode="new"`; the list tour
        // waits until no drawer is open at all.
        data-usertour="contact-drawer"
        data-mode={drawer.editId ? "edit" : "new"}
        onInteractOutside={keepOpenForTour}
      >
        <SheetHeader className="space-y-1 border-b p-6 text-left">
          <SheetTitle>{editing ? "Edit contact" : "New contact"}</SheetTitle>
          <SheetDescription>
            {editing
              ? "Update this contact’s details."
              : "Add a client or supplier."}
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
              {/* Contact type */}
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem data-usertour="contact-type">
                    <FormLabel className="block">Contact type</FormLabel>
                    <FormControl>
                      <RadioGroup
                        value={field.value}
                        onValueChange={field.onChange}
                        className="grid gap-3 sm:grid-cols-2"
                      >
                        {TYPE_CHOICES.map((choice) => {
                          const selected = field.value === choice.value;
                          return (
                            <Label
                              key={choice.value}
                              htmlFor={`contact-type-${choice.value}`}
                              className={cn(
                                "flex cursor-pointer items-start gap-3 rounded-md border p-3 font-normal leading-normal transition-colors",
                                selected
                                  ? "border-primary bg-primary/5 ring-1 ring-primary/40"
                                  : "border-border hover:border-primary/40 hover:bg-muted/40",
                              )}
                            >
                              <RadioGroupItem
                                value={choice.value}
                                id={`contact-type-${choice.value}`}
                                className="mt-0.5"
                              />
                              <span className="space-y-1">
                                <span className="block text-sm font-medium">
                                  {choice.label}
                                </span>
                                <span className="block text-xs text-muted-foreground">
                                  {choice.hint}
                                </span>
                              </span>
                            </Label>
                          );
                        })}
                      </RadioGroup>
                    </FormControl>
                  </FormItem>
                )}
              />

              {/* Business type */}
              <FormField
                control={form.control}
                name="businessType"
                render={({ field }) => (
                  <FormItem data-usertour="contact-business-type">
                    <FormLabel className="block">Business type</FormLabel>
                    <div>
                      <div
                        role="group"
                        aria-label="Business type"
                        className="inline-flex rounded-lg bg-muted p-1"
                      >
                        {(["Business", "Individual"] as const).map((option) => (
                          <button
                            key={option}
                            type="button"
                            onClick={() => {
                              field.onChange(option);
                              /*
                               * An individual is one person, so the list goes
                               * with the switch. Cleared here rather than left
                               * for the schema to reject, because the list is
                               * hidden in this mode — an error nobody can see
                               * on a field nobody can reach would just be a
                               * Save button that stopped working.
                               */
                              if (option === "Individual") {
                                additional.replace([]);
                                restore.current = null;
                                setEditingIndex(null);
                                // The list took the flag with it if one of its
                                // people held it, and the one card left has to
                                // be the primary.
                                form.setValue("isPrimary", true, {
                                  shouldDirty: true,
                                });
                              }
                            }}
                            aria-pressed={field.value === option}
                            className={cn(
                              "cursor-pointer rounded-md px-3 py-1 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                              field.value === option
                                ? "bg-background font-medium shadow-sm"
                                : "text-muted-foreground hover:text-foreground",
                            )}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    </div>
                    <FormDescription className="text-xs">
                      Business name is optional for Individual.
                    </FormDescription>
                  </FormItem>
                )}
              />

              {isBusiness && (
                <TextField
                  form={form}
                  name="businessName"
                  label="Business name"
                  required
                  placeholder="Turner Consulting"
                />
              )}

              <TextField
                form={form}
                name="abn"
                label={numberField?.label ?? "Business number"}
                placeholder={
                  numberField?.placeholder ??
                  maskExample(
                    numberField && {
                      key: numberField.ref ?? numberField.key,
                      label: numberField.label,
                      required: false,
                      pattern: numberField.pattern,
                      mask: numberField.mask,
                      validator: numberField.validator,
                      sameAs: null,
                    },
                  )
                }
                inputMode="numeric"
                liveValidate
              />

              <TextField
                form={form}
                name="website"
                label="Website"
                placeholder="turnerconsulting.com.au"
              />

              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Currency</FormLabel>
                    <CurrencySelect
                      value={field.value}
                      onChange={field.onChange}
                    />
                  </FormItem>
                )}
              />

              <Section
                icon={UserRound}
                title="Contact person"
                tourId="contact-person"
              >
                {/*
                  The primary, in the same card as everyone else.

                  It used to be split three ways — name, email and mobile up
                  among the company fields, division and position down here on
                  their own — which read as though the primary weren't a person
                  so much as a property of the business. The block above is what
                  the business is; who to talk to there is this section, and the
                  primary is the first card in it. Same card as an additional
                  contact, so a list of people looks like a list of people.

                  Always open, and no Edit, Done, Cancel or Remove: it's the
                  anchor. Its person is the one the flat fields hold, and a
                  contact with no flat person has no name for the table to show
                  — so there is no state in which collapsing or deleting this
                  card would be a thing to offer. Which person sits here after a
                  save is a separate question, answered by the switch.
                */}
                <PersonCard
                  form={form}
                  names={PRIMARY_PERSON_NAMES}
                  namePlaceholder="Michael Turner"
                  emailPlaceholder="michael.turner@email.com"
                  emailRequired={anchorIsPrimary}
                  onSetPrimary={() => setPrimaryPerson("anchor")}
                />

                {/*
                  Everyone else at the business. Hidden outright for an
                  Individual rather than shown empty: there is no second person
                  at a sole trader, so an empty list with an Add button would be
                  offering something that can't be saved.

                  No "set as primary" toggle any more. It was a switch that
                  claimed to nominate a primary while there was only ever one
                  person to nominate — and now that there are several, which one
                  is primary is answered by which block you typed them into.
                */}
                {isBusiness && (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Additional contacts</p>
                      <p className="text-xs text-muted-foreground">
                        Anyone else at this business worth having on file.
                      </p>
                    </div>

                    {additional.fields.length > 0 && (
                      <ul className="space-y-2">
                        {additional.fields.map((row, index) => (
                          <li key={row.id}>
                            {editingIndex === index ? (
                              <PersonEditor
                                form={form}
                                index={index}
                                emailRequired={primaryIndex === index}
                                onSetPrimary={() => setPrimaryPerson(index)}
                                onDone={donePerson}
                                onCancel={() => cancelPerson(index)}
                              />
                            ) : (
                              <PersonSummary
                                form={form}
                                names={personNamesAt(index)}
                                person={values.additionalContacts?.[index]}
                                onSetPrimary={() => setPrimaryPerson(index)}
                                onEdit={() => openPerson(index)}
                                onRemove={() => removePerson(index)}
                              />
                            )}
                          </li>
                        ))}
                      </ul>
                    )}

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addPerson}
                    >
                      <Plus className="size-4" />
                      Add contact person
                    </Button>
                  </div>
                )}
              </Section>

              <Section icon={MapPin} title="Address">
                <TextField
                  form={form}
                  name="addressLine1"
                  label="Address line 1"
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField form={form} name="city" label="City" />
                  <TextField form={form} name="country" label="Country" />
                </div>
              </Section>

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea rows={3} {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <SheetFooter
              className="flex-row justify-end gap-2 border-t p-4"
              data-usertour="contact-save-actions"
            >
              <Button type="button" variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canSave || saving}>
                {saving ? "Saving…" : "Save contact"}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}

/**
 * A group of fields in the drawer. Was a hairline rule and a plain heading;
 * it takes the platform's section treatment now, like every other form.
 */
function Section({
  icon,
  title,
  tourId,
  children,
}: {
  icon: LucideIcon;
  title: string;
  tourId?: string;
  children: React.ReactNode;
}) {
  return (
    <FormSection icon={icon} title={title} tourId={tourId}>
      {children}
    </FormSection>
  );
}

type FormType = ReturnType<typeof useForm<ContactFormValues>>;

/**
 * Any leaf in the form, including the array's — `additionalContacts.1.email` is
 * a name the same helpers have to accept, so the fields inside a row are the
 * same components as the fields outside one.
 */
type FieldName = FieldPath<ContactFormValues>;

/**
 * One additional contact, closed.
 *
 * A summary rather than a collapsed form: what you want from a list of people
 * is to find the right one, so it shows who they are and how to reach them and
 * nothing else. `person` is read from the watched values rather than from the
 * field array's snapshot, which is what keeps the summary current after an edit.
 */
function PersonSummary({
  form,
  names,
  person,
  onSetPrimary,
  onEdit,
  onRemove,
}: {
  form: FormType;
  names: PersonNames;
  person: ContactPerson | undefined;
  onSetPrimary: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const detail = [person?.position, person?.division]
    .filter((part) => part && part.trim())
    .join(" · ");

  return (
    <div className="space-y-4 rounded-[14px] border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <p className="truncate text-sm font-medium">
            {/* A row can only be nameless mid-add, but it still has to render as
                something rather than as an empty line. */}
            {person?.personName?.trim() || "New contact person"}
          </p>
          {detail && (
            <p className="truncate text-xs text-muted-foreground">{detail}</p>
          )}
          {person?.email?.trim() && (
            <p className="truncate text-xs text-muted-foreground">
              {person.email}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
            <Pencil className="size-4" />
            Edit
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="size-4" />
            Remove
          </Button>
        </div>
      </div>

      {/* On the closed card too, and in the same place as on the open one:
          choosing who the main contact is shouldn't mean opening a card to
          reach a switch that has nothing to do with editing their details. */}
      <PrimaryToggle
        form={form}
        name={names.isPrimary}
        onSelect={onSetPrimary}
      />
    </div>
  );
}

/**
 * Where a person's six fields live in the form.
 *
 * The primary's are the flat top-level names and an additional contact's are
 * inside the array, which is the only difference between the two cards. Passing
 * the names in is what lets one component draw both — the alternative was two
 * copies of the same five fields, and two places for the next change to land in
 * only one of.
 */
type PersonNames = {
  personName: FieldName;
  email: FieldName;
  countryCode: FieldName;
  phone: FieldName;
  division: FieldName;
  position: FieldName;
  isPrimary: FieldName;
};

/**
 * The anchor card's fields are the flat ones.
 *
 * Which is not the same as saying the anchor card is always the primary — the
 * toggle decides that, and `withPrimaryFirst` moves whoever won into these
 * fields on the way to the store. See both.
 */
const PRIMARY_PERSON_NAMES: PersonNames = {
  personName: "personName",
  email: "email",
  countryCode: "countryCode",
  phone: "phone",
  division: "division",
  position: "position",
  isPrimary: "isPrimary",
};

function personNamesAt(index: number): PersonNames {
  return {
    personName: `additionalContacts.${index}.personName`,
    email: `additionalContacts.${index}.email`,
    countryCode: `additionalContacts.${index}.countryCode`,
    phone: `additionalContacts.${index}.phone`,
    division: `additionalContacts.${index}.division`,
    position: `additionalContacts.${index}.position`,
    isPrimary: `additionalContacts.${index}.isPrimary`,
  };
}

/**
 * Who to treat as the main contact, one card at a time.
 *
 * A switch rather than a label, because it's a choice and not a status — and it
 * only ever turns something *on*. Off is not a state anyone can select: a
 * contact with no primary has no name for the table to show, so the one that's
 * on stays on until another is chosen. Clicking the lit switch does nothing,
 * which is the honest response to "make this the primary" when it already is.
 *
 * A ruled row rather than the bordered box this control used to sit in. It's
 * inside a card now, and a bordered box inside a bordered card inside a
 * sectioned form is three frames deep for one switch.
 */
function PrimaryToggle({
  form,
  name,
  onSelect,
}: {
  form: FormType;
  name: FieldName;
  onSelect: () => void;
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex items-center justify-between gap-4 border-t border-border pt-4">
          <FormLabel className="font-normal">Set as primary</FormLabel>
          <FormControl>
            <Switch
              checked={!!field.value}
              onCheckedChange={(next) => {
                if (next) onSelect();
              }}
            />
          </FormControl>
        </FormItem>
      )}
    />
  );
}

/**
 * One person's fields, in a card.
 *
 * The shell every person is entered in, primary or not — same border, same
 * radius, same five fields in the same order, so the section reads as a list of
 * people rather than as one special case followed by some others. What differs
 * is passed in: an additional contact carries Done and Cancel, the anchor card
 * carries neither.
 *
 * The card opens on the name field. It briefly led with a right-aligned band
 * holding a "Primary" tag, which was a row of dead space above every card to
 * label a state the switch at the foot of the card already reports.
 */
function PersonCard({
  form,
  names,
  namePlaceholder,
  emailPlaceholder,
  emailRequired,
  onSetPrimary,
  actions,
}: {
  form: FormType;
  names: PersonNames;
  namePlaceholder?: string;
  emailPlaceholder?: string;
  /** Follows the switch: the primary's email is required, a second's isn't. */
  emailRequired?: boolean;
  onSetPrimary: () => void;
  /** The card's own buttons, for a row that can be closed or discarded. */
  actions?: React.ReactNode;
}) {
  return (
    <div className="space-y-4 rounded-[14px] border border-border p-4">
      <TextField
        form={form}
        name={names.personName}
        label="Contact name"
        required
        placeholder={namePlaceholder}
      />

      <TextField
        form={form}
        name={names.email}
        label="Email"
        required={emailRequired}
        type="email"
        placeholder={emailPlaceholder}
      />

      <PhoneField
        form={form}
        label="Mobile"
        codeName={names.countryCode}
        phoneName={names.phone}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField form={form} name={names.division} label="Division" />
        <TextField form={form} name={names.position} label="Position" />
      </div>

      <PrimaryToggle
        form={form}
        name={names.isPrimary}
        onSelect={onSetPrimary}
      />

      {actions}
    </div>
  );
}

/**
 * An additional contact, open.
 *
 * The shared card plus the two buttons that close it. Done only collapses —
 * the values are already in the form, and nothing is written anywhere until the
 * drawer is saved.
 */
function PersonEditor({
  form,
  index,
  emailRequired,
  onSetPrimary,
  onDone,
  onCancel,
}: {
  form: FormType;
  index: number;
  emailRequired?: boolean;
  onSetPrimary: () => void;
  onDone: () => void;
  onCancel: () => void;
}) {
  return (
    <PersonCard
      form={form}
      names={personNamesAt(index)}
      namePlaceholder="Sarah Chen"
      emailPlaceholder="sarah.chen@email.com"
      emailRequired={emailRequired}
      onSetPrimary={onSetPrimary}
      actions={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onDone}>
            Done
          </Button>
        </div>
      }
    />
  );
}

/**
 * A country code and a number, as one field.
 *
 * Shared because the primary and every additional contact need the same pair,
 * and the two halves aren't independent — the code decides how many digits the
 * number should have, so changing it has to re-check the number. That's the
 * `trigger` on both sides, and the reason this is one component rather than two
 * fields sitting next to each other.
 */
function PhoneField({
  form,
  label,
  codeName,
  phoneName,
}: {
  form: FormType;
  label: string;
  codeName: FieldName;
  phoneName: FieldName;
}) {
  return (
    <FormField
      control={form.control}
      name={phoneName}
      render={({ field, fieldState }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <div className="flex gap-2">
            <FormField
              control={form.control}
              name={codeName}
              render={({ field: codeField }) => (
                <Select
                  value={String(codeField.value ?? "")}
                  onValueChange={(value) => {
                    codeField.onChange(value);
                    void form.trigger(phoneName);
                  }}
                >
                  <SelectTrigger
                    className="w-[116px] shrink-0"
                    aria-label="Country code"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRY_CODES.map((entry) => (
                      <SelectItem key={entry.code} value={entry.code}>
                        {entry.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FormControl>
              <Input
                {...field}
                value={String(field.value ?? "")}
                inputMode="tel"
                placeholder="411 111 111"
                aria-invalid={!!fieldState.error}
                className={cn(
                  fieldState.error &&
                    "border-destructive focus-visible:ring-destructive",
                )}
                onChange={(event) => {
                  field.onChange(event);
                  // Live error without blocking keystrokes.
                  void form.trigger(phoneName);
                }}
              />
            </FormControl>
          </div>
          <FormMessage className="text-xs" />
        </FormItem>
      )}
    />
  );
}

/** Text input wired to the shared error treatment. */
function TextField({
  form,
  name,
  label,
  required,
  placeholder,
  type,
  inputMode,
  liveValidate,
}: {
  form: FormType;
  name: FieldName;
  label: string;
  required?: boolean;
  placeholder?: string;
  type?: string;
  inputMode?: "numeric" | "tel";
  /** Validate on every keystroke, without altering the value. */
  liveValidate?: boolean;
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field, fieldState }) => (
        <FormItem>
          <FormLabel>
            {label}
            {required && (
              <span className="ml-0.5 text-destructive" aria-hidden>
                *
              </span>
            )}
          </FormLabel>
          <FormControl>
            <Input
              {...field}
              value={String(field.value ?? "")}
              type={type}
              inputMode={inputMode}
              placeholder={placeholder}
              aria-required={required}
              aria-invalid={!!fieldState.error}
              className={cn(
                fieldState.error &&
                  "border-destructive focus-visible:ring-destructive",
              )}
              onChange={(event) => {
                field.onChange(event);
                if (liveValidate) void form.trigger(name);
              }}
            />
          </FormControl>
          <FormMessage className="text-xs" />
        </FormItem>
      )}
    />
  );
}
