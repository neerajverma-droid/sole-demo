"use client";

import * as React from "react";
import { Camera, Globe, Mail, MapPin, Phone } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { HeroHairline, WARM_TILE } from "@/components/layout/page-header";
import { AvatarCropDialog } from "@/components/settings/avatar-crop-dialog";
import { contactInitials } from "@/lib/contacts";
import { cn } from "@/lib/utils";
import {
  useBusinessDetails,
  usePreferences,
} from "@/hooks/use-business-settings";
import { useActiveBusinessIndustry } from "@/hooks/use-active-business-industry";
import { useAvatarUpload } from "@/hooks/use-avatar-upload";

/**
 * The one rich moment on Settings. Every value reads from the settings store,
 * so editing Business details updates this card live.
 *
 * The avatar is editable right here rather than behind a separate "Edit
 * profile" button that used to sit beside it — clicking the photo itself
 * opens the picker, and a picked file goes straight into the same crop step
 * Business details uses (`useAvatarUpload`), since it's the same one photo
 * either way.
 */
export function ProfileCard() {
  const { values: business } = useBusinessDetails();
  const { values: prefs } = usePreferences();
  // The industry is an id on the record; this resolves it against the live
  // `/industry` list rather than showing a number.
  const industry = useActiveBusinessIndustry();
  const avatar = useAvatarUpload();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  return (
    <Card
      data-tour="settings-profile"
      data-usertour="settings-profile"
      className="overflow-hidden"
    >
      {/* Flush to the card edges, hence overflow-hidden above. */}
      <HeroHairline />

      <CardContent className="space-y-6 p-[15px]">
        <div className="grid grid-cols-1 gap-[15px] sm:grid-cols-4">
          <div
          className="flex items-start gap-3 text-start"
          data-usertour="settings-profile-header"
        >
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={avatar.busy}
            aria-label="Change photo"
            className="group relative shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {avatar.logo ? (
              <img
                src={avatar.logo}
                alt=""
                className="size-16 rounded-full object-cover ring-2 ring-primary"
              />
            ) : (
              <div className="grid size-16 place-items-center rounded-full bg-primary/10 text-xl font-semibold text-primary ring-2 ring-primary">
                {contactInitials(business.businessName)}
              </div>
            )}
            <span
              className="absolute bottom-0 right-0 size-3.5 rounded-full bg-emerald-500 ring-2 ring-background"
              aria-label="Online"
            />
            <span
              className="absolute inset-0 grid place-items-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100"
              aria-hidden
            >
              <Camera className="size-5" />
            </span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) avatar.pick(file);
              event.target.value = "";
            }}
          />

          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center ">
              <h2 className="text-2xl font-bold tracking-tight">
                {business.businessName || "—"}
              </h2>
              {/* <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                {business.companyType || industry || "—"}
              </span> */}
            </div>
            <p className="flex items-center justify-start gap-1.5 text-sm text-muted-foreground">
              <Mail className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{business.email || "—"}</span>
            </p>
          </div>
        </div>

          <DetailTile
            icon={<Phone aria-hidden />}
            tone="bg-primary/10 text-primary"
            label="Mobile number"
            value={business.phone}
            tabular
          />
          <DetailTile
            icon={<Globe aria-hidden />}
            tone="bg-primary/10 text-primary"
            label="Website"
            value={prefs.website}
          />
          <DetailTile
            icon={<MapPin aria-hidden />}
            tone={WARM_TILE}
            label="Address"
            value={business.addressSearch}
          />
        </div>
      </CardContent>

      <AvatarCropDialog
        open={avatar.cropSrc !== null}
        src={avatar.cropSrc}
        onCancel={avatar.cancelCrop}
        onConfirm={avatar.confirmCrop}
      />
    </Card>
  );
}

function DetailTile({
  icon,
  tone,
  label,
  value,
  tabular,
}: {
  icon: React.ReactNode;
  tone: string;
  label: string;
  value: string;
  tabular?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-muted/30 p-[15px]">
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-xl [&_svg]:size-5",
          tone,
        )}
        aria-hidden
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("truncate font-semibold", tabular && "tabular")}>
          {value.trim() || "—"}
        </p>
      </div>
    </div>
  );
}
