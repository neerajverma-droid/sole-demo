"use client";

import { Phone, Share2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SalesSection, ToggleRow } from "@/components/sales-settings/tab-shell";
import {
  COUNTRY_CODES,
  FOOTER_LINKS,
  linkError,
  phoneError,
  type SalesSettings,
} from "@/lib/sales-settings";
import { cn } from "@/lib/utils";

/**
 * Each row is a switch plus a field, and the field only exists while the switch
 * is on — nothing half-filled can end up printed on a document.
 */
export function FooterTab({
  values,
  patch,
}: {
  values: SalesSettings;
  patch: (next: Partial<SalesSettings>) => void;
}) {
  const phoneIssue = phoneError(values.footerPhone);

  return (
    <div className="space-y-4">
      <SalesSection
        icon={Phone}
        title="Contact"
        description="Shown in the footer of every invoice and quote you send."
      >
        <ToggleRow
          label="Phone number"
          hint="With the country code your clients will dial."
          checked={values.footerPhone.enabled}
          onChange={(enabled) =>
            patch({ footerPhone: { ...values.footerPhone, enabled } })
          }
        >
          <div className="space-y-1.5">
            <div className="flex gap-2">
              <Select
                value={values.footerPhone.countryCode}
                onValueChange={(countryCode) =>
                  patch({ footerPhone: { ...values.footerPhone, countryCode } })
                }
              >
                <SelectTrigger className="w-24 shrink-0" aria-label="Country code">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRY_CODES.map((code) => (
                    <SelectItem key={code} value={code}>
                      {code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={values.footerPhone.value}
                inputMode="tel"
                placeholder="234 808 2823"
                onChange={(event) =>
                  patch({
                    footerPhone: {
                      ...values.footerPhone,
                      value: event.target.value,
                    },
                  })
                }
                aria-label="Phone number"
                aria-invalid={!!phoneIssue}
                className={cn(
                  "tabular",
                  phoneIssue &&
                    "border-destructive focus-visible:ring-destructive",
                )}
              />
            </div>
            {phoneIssue && (
              <p className="text-xs text-destructive">{phoneIssue}</p>
            )}
          </div>
        </ToggleRow>
      </SalesSection>

      <SalesSection
        icon={Share2}
        title="Website & social"
        description="Only the ones you switch on are printed, so an unused profile never appears."
      >
        <div className="space-y-3">
          {FOOTER_LINKS.map((link) => {
            const entry = values.footerLinks[link.key];
            const issue = linkError(entry);
            return (
              <ToggleRow
                key={link.key}
                label={link.label}
                checked={entry.enabled}
                onChange={(enabled) =>
                  patch({
                    footerLinks: {
                      ...values.footerLinks,
                      [link.key]: { ...entry, enabled },
                    },
                  })
                }
              >
                <div className="space-y-1.5">
                  <Input
                    value={entry.value}
                    placeholder={link.placeholder}
                    onChange={(event) =>
                      patch({
                        footerLinks: {
                          ...values.footerLinks,
                          [link.key]: { ...entry, value: event.target.value },
                        },
                      })
                    }
                    aria-label={link.label}
                    aria-invalid={!!issue}
                    className={cn(
                      issue && "border-destructive focus-visible:ring-destructive",
                    )}
                  />
                  {issue && <p className="text-xs text-destructive">{issue}</p>}
                </div>
              </ToggleRow>
            );
          })}
        </div>
      </SalesSection>
    </div>
  );
}
