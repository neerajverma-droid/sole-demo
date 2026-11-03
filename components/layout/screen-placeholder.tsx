"use client";

import { Suspense } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useCreateIntent } from "@/lib/use-create-intent";

/** Route stub for screens that haven't been built yet. */
export function ScreenPlaceholder({
  title,
  /** Copy for the creation UI this screen opens on `?new=1`. */
  createUiLabel,
}: {
  title: string;
  createUiLabel?: string;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">
          Not built yet — this screen comes next.
        </p>
      </div>
      {createUiLabel && (
        <Suspense fallback={null}>
          <CreateIntentNotice label={createUiLabel} />
        </Suspense>
      )}
    </div>
  );
}

/**
 * Stands in for the real creation UI until this screen is built. The intent
 * read itself is real, so the deep-links are verifiable end to end.
 */
function CreateIntentNotice({ label }: { label: string }) {
  const createIntent = useCreateIntent();
  if (!createIntent) return null;

  return (
    <Alert className="max-w-xl">
      <AlertTitle>Create intent received</AlertTitle>
      <AlertDescription>
        {label} opens here on <code className="font-medium">?new=1</code>.
      </AlertDescription>
    </Alert>
  );
}
