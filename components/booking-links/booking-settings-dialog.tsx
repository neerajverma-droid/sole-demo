"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AttachmentUpload } from "@/components/shared/attachment-upload";
import { AvailabilityEditor } from "@/components/booking-links/availability-editor";
import { Field, GradientHeader, SectionHeading } from "@/components/booking-links/booking-ui";
import { apiErrorMessage } from "@/lib/api-error";
import { saveBookingSettings, uploadBookingProfilePicture } from "@/lib/booking-links-api";
import {
  DEFAULT_TEXT_COLOR,
  DEFAULT_THEME_COLOR,
  DURATION_OPTIONS,
  SETTINGS_BUFFER_OPTIONS,
  defaultAvailability,
  isValidHexColor,
  validateSettings,
  type BookingSettings,
  type TimezoneOption,
} from "@/lib/booking-links";
import { cn } from "@/lib/utils";

const ACCEPTED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/svg+xml",
];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function ColorField({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string;
  value: string;
  fallback: string;
  onChange: (value: string) => void;
}) {
  const id = React.useId();
  const invalid = Boolean(value) && !isValidHexColor(value);
  return (
    <Field
      label={label}
      htmlFor={id}
      error={invalid ? "Use a six-digit hex colour, like #4F5DE8" : null}
    >
      <div
        className={cn(
          "flex max-w-[260px] items-center gap-2 rounded-md border border-input bg-background py-1 pl-1 pr-2.5",
          invalid && "border-destructive",
        )}
      >
        <input
          type="color"
          aria-label={`${label} swatch`}
          value={isValidHexColor(value) ? value : fallback}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="h-[30px] w-[34px] shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch]:border-none"
        />
        <input
          id={id}
          type="text"
          value={value}
          placeholder={fallback}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent text-sm uppercase tracking-wide outline-none"
        />
      </div>
    </Field>
  );
}

/** The stored picture's file name, for the uploader's preview row. */
function pictureName(url: string): string {
  try {
    const last = new URL(url).pathname.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last) : "Profile picture";
  } catch {
    return url.split("/").pop() || "Profile picture";
  }
}

/**
 * The profile picture, in the same uploader expenses use for receipts:
 * dropzone with Browse, then a preview with Change — as the old drawer had,
 * no Remove. A pick uploads straight away; Save stores it.
 */
function ProfilePictureField({
  url,
  uploadingName,
  onPick,
}: {
  url: string;
  /** The file being uploaded right now, if any. */
  uploadingName: string | null;
  onPick: (file: File) => void;
}) {
  return (
    <Field label="Profile picture" hint="Shown on your public booking page.">
      <AttachmentUpload
        noun="photo"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        acceptLabel="PNG, JPG, WEBP or SVG"
        maxBytes={MAX_IMAGE_BYTES}
        receipt={url ? { dataUrl: url, name: pictureName(url), size: 0 } : null}
        // The preview comes from the uploaded URL, not the local file.
        onChange={() => {}}
        onFileSelected={onPick}
        // As the old drawer: a picture can be changed, not removed.
        removable={false}
        replaceLabel="Change"
        status={uploadingName ? "uploading" : "idle"}
        pendingName={uploadingName ?? undefined}
      />
    </Field>
  );
}

/**
 * Booking settings — the public page's look, and the defaults every new link
 * starts from. The old SettingDrawer's fields, in the design's dialog.
 */
export function BookingSettingsDialog({
  open,
  onOpenChange,
  settings,
  loading,
  timezones,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: BookingSettings | undefined;
  loading: boolean;
  timezones: TimezoneOption[];
  onSaved: () => void;
}) {
  const [draft, setDraft] = React.useState<BookingSettings | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [uploadingName, setUploadingName] = React.useState<string | null>(null);
  const uploading = uploadingName !== null;

  React.useEffect(() => {
    if (!open || !settings) return;
    setDraft({
      ...settings,
      availability: settings.availability.length ? settings.availability : defaultAvailability(),
    });
  }, [open, settings]);

  const update = (patch: Partial<BookingSettings>) =>
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));

  const timezoneOptions = React.useMemo(() => {
    const options = timezones.length ? [...timezones] : [];
    if (draft?.timezone && !options.some((option) => option.value === draft.timezone)) {
      options.unshift({ value: draft.timezone, label: draft.timezone });
    }
    return options;
  }, [timezones, draft?.timezone]);

  const pickPicture = async (file: File) => {
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      toast.error("Please upload a PNG, JPG, WEBP, or SVG image");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("Image must be smaller than 5 MB");
      return;
    }
    setUploadingName(file.name);
    try {
      const url = await uploadBookingProfilePicture(file);
      update({ profile_picture: url });
      toast.success("Profile picture uploaded");
    } catch (error) {
      toast.error(apiErrorMessage(error, "Failed to upload profile picture"));
    } finally {
      setUploadingName(null);
    }
  };

  const save = async () => {
    if (!draft) return;
    const problem = validateSettings(draft);
    if (problem) {
      toast.error(problem);
      return;
    }
    setSaving(true);
    try {
      await saveBookingSettings(draft);
      toast.success("Booking settings saved");
      onSaved();
      onOpenChange(false);
    } catch (error) {
      toast.error(apiErrorMessage(error, "Failed to save settings"));
    } finally {
      setSaving(false);
    }
  };

  const busy = saving || uploading;

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent
        hideClose
        className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-6 sm:max-w-[640px]"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <GradientHeader
          title="Booking settings"
          description="Customise your public booking page and the defaults for new links."
        />

        <div className="-mx-6 min-h-0 flex-1 overflow-y-auto px-6 py-1">
          {loading || !draft ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }, (_, index) => (
                <div key={index} className="h-10 animate-pulse rounded-md bg-muted/60" />
              ))}
            </div>
          ) : (
            <div>
              <SectionHeading
                title="Booking appearance"
                description="Customise how your public booking page looks to guests."
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <ColorField
                    label="Theme colour"
                    value={draft.theme_color}
                    fallback={DEFAULT_THEME_COLOR}
                    onChange={(theme_color) => update({ theme_color })}
                  />
                  <p className="mt-1.5 text-[13px] text-muted-foreground">
                    Used in the sidebar and primary actions on your booking page.
                  </p>
                </div>
                <ColorField
                  label="Text colour"
                  value={draft.text_color}
                  fallback={DEFAULT_TEXT_COLOR}
                  onChange={(text_color) => update({ text_color })}
                />
              </div>
              <div className="mt-4">
                <ProfilePictureField
                  url={draft.profile_picture}
                  uploadingName={uploadingName}
                  onPick={(file) => void pickPicture(file)}
                />
              </div>

              <SectionHeading
                title="Default settings"
                description="Applied when you create new booking links."
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Default duration">
                  <Select
                    value={String(draft.default_duration_min)}
                    onValueChange={(value) => update({ default_duration_min: Number(value) })}
                  >
                    <SelectTrigger className="bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DURATION_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={String(option.value)}>
                          {option.label}
                        </SelectItem>
                      ))}
                      {!DURATION_OPTIONS.some(
                        (option) => option.value === draft.default_duration_min,
                      ) && (
                        <SelectItem value={String(draft.default_duration_min)}>
                          {draft.default_duration_min} minutes
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Buffer after booking">
                  <Select
                    value={String(draft.default_buffer_after_minutes)}
                    onValueChange={(value) =>
                      update({ default_buffer_after_minutes: Number(value) })
                    }
                  >
                    <SelectTrigger className="bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SETTINGS_BUFFER_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={String(option.value)}>
                          {option.label}
                        </SelectItem>
                      ))}
                      {!SETTINGS_BUFFER_OPTIONS.some(
                        (option) => option.value === draft.default_buffer_after_minutes,
                      ) && (
                        <SelectItem value={String(draft.default_buffer_after_minutes)}>
                          {draft.default_buffer_after_minutes} minutes
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <SectionHeading
                title="Timezone"
                description="The default timezone shown to guests for booking."
              />
              <Select value={draft.timezone} onValueChange={(timezone) => update({ timezone })}>
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Select a timezone" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {timezoneOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <SectionHeading
                title="Availability"
                description="Guests can book on the days and time ranges you set here (slots also need to be open in your calendar)."
              />
              <AvailabilityEditor
                key={open ? "open" : "closed"}
                value={draft.availability}
                onChange={(availability) => update({ availability })}
              />
            </div>
          )}
        </div>

        <div className="-mx-6 mt-4 flex shrink-0 justify-end gap-2 border-t border-border px-6 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={busy || loading || !draft}>
            {saving && <Loader2 className="animate-spin" />}
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
