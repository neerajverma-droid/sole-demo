"use client";

import * as React from "react";
import { toast } from "sonner";

import { useSalesSettingsQuery } from "@/hooks/use-sales-settings-query";
import { useSalesSettings } from "@/lib/use-sales-settings";
import { useSalesSettingsStore } from "@/stores/sales-settings";
import { removeLogoApi, uploadLogoApi } from "@/lib/sales-settings-api";
import { apiErrorMessage } from "@/lib/api-error";

/** Reads a just-picked (or just-cropped) file back as a data URL — the same
 * interchange format `DocumentsSectionForm.logo` and `uploadLogoApi` use. */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * The account's one photo, and the pick-then-crop-then-upload flow behind it —
 * shared by every screen that shows or changes it (the Settings profile card,
 * Business details, Sales → Branding), so none of them can disagree about
 * what's on file or duplicate the upload logic three times.
 *
 * `profile_pic` lives on `user_info`, keyed by user id alone — one photo per
 * ACCOUNT, not per business — which is also why this reads through the shared
 * sales-settings store rather than a second fetch of its own. See
 * `lib/sales-settings-api.ts`.
 *
 * Uploaded (or removed) the moment it's picked and cropped, independent of
 * whatever "Save" button happens to be on the page it's used from — there's
 * no draft concept for a photo the way there is for text fields.
 */
export function useAvatarUpload(): {
  logo: string | null;
  busy: boolean;
  /** Set once a file has been picked, until the crop dialog is confirmed or cancelled. */
  cropSrc: string | null;
  pick: (file: File) => void;
  confirmCrop: (cropped: File) => void;
  cancelCrop: () => void;
  remove: () => void;
} {
  useSalesSettingsQuery();
  const { settings: sales } = useSalesSettings();
  const patchSales = useSalesSettingsStore((state) => state.patch);
  const [cropSrc, setCropSrc] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const pick = (file: File) => {
    void fileToDataUrl(file).then(setCropSrc);
  };

  const confirmCrop = (cropped: File) => {
    setCropSrc(null);
    setBusy(true);
    void (async () => {
      try {
        const dataUrl = await fileToDataUrl(cropped);
        const url = await uploadLogoApi(dataUrl);
        patchSales({ logo: url });
        toast.success("Photo updated");
      } catch (error) {
        toast.error(apiErrorMessage(error, "Couldn't upload that photo."));
      } finally {
        setBusy(false);
      }
    })();
  };

  const cancelCrop = () => setCropSrc(null);

  const remove = () => {
    setBusy(true);
    void (async () => {
      try {
        await removeLogoApi();
        patchSales({ logo: null });
        toast.success("Photo removed");
      } catch (error) {
        toast.error(apiErrorMessage(error, "Couldn't remove that photo."));
      } finally {
        setBusy(false);
      }
    })();
  };

  return { logo: sales.logo ?? null, busy, cropSrc, pick, confirmCrop, cancelCrop, remove };
}
