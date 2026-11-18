"use client";

import * as React from "react";
import { Camera, ExternalLink, FileText, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AssetFile } from "@/lib/assets";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ *
 * What kind of file is it
 *
 * An AssetFile's `dataUrl` is either a `data:` URL (picked this session)
 * or the server's own URL (already uploaded). A saved photo is the second
 * kind, so "is it an image" can't be answered from a `data:image` prefix
 * alone — that left every saved photo showing as a bare file name.
 * ------------------------------------------------------------------ */

const IMAGE_EXTENSIONS = /\.(jpe?g|png|gif|webp|avif|bmp|heic|heif)$/i;

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url.split(/[?#]/)[0];
  }
}

export function isImageFile(file: Pick<AssetFile, "dataUrl" | "name">): boolean {
  if (file.dataUrl.startsWith("data:")) return file.dataUrl.startsWith("data:image/");
  return IMAGE_EXTENSIONS.test(file.name) || IMAGE_EXTENSIONS.test(pathOf(file.dataUrl));
}

export function isPdfFile(file: Pick<AssetFile, "dataUrl" | "name">): boolean {
  if (file.dataUrl.startsWith("data:")) return file.dataUrl.startsWith("data:application/pdf");
  return /\.pdf$/i.test(file.name) || /\.pdf$/i.test(pathOf(file.dataUrl));
}

/**
 * A URL the browser will display. A `data:` URL is turned into an object URL:
 * Chrome won't render a `data:application/pdf` in a frame or open it in a tab.
 */
function useDisplayUrl(file: AssetFile | null): string | null {
  const [url, setUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    if (!file.dataUrl.startsWith("data:")) {
      setUrl(file.dataUrl);
      return;
    }
    let objectUrl: string | null = null;
    let cancelled = false;
    fetch(file.dataUrl)
      .then((response) => response.blob())
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => !cancelled && setUrl(file.dataUrl));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file]);
  return url;
}

/* ------------------------------------------------------------------ *
 * Preview
 * ------------------------------------------------------------------ */

/** An image or PDF, full size, with a way out to a new tab. */
export function FilePreviewDialog({
  file,
  title,
  onClose,
}: {
  file: AssetFile | null;
  title?: string;
  onClose: () => void;
}) {
  const url = useDisplayUrl(file);
  const image = file ? isImageFile(file) : false;
  const pdf = file ? isPdfFile(file) : false;

  return (
    <Dialog open={!!file} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="truncate">{title || file?.name}</DialogTitle>
          {title && file?.name ? (
            <DialogDescription className="truncate">{file.name}</DialogDescription>
          ) : null}
        </DialogHeader>

        <div className="grid min-h-48 place-items-center overflow-hidden rounded-md border border-border bg-muted/30">
          {!url ? (
            <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading" />
          ) : image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={title || file?.name || ""} className="max-h-[70vh] w-auto object-contain" />
          ) : pdf ? (
            <iframe src={url} title={title || file?.name || "Document"} className="h-[70vh] w-full" />
          ) : (
            <p className="p-6 text-sm text-muted-foreground">
              This file can&apos;t be previewed here — open it in a new tab.
            </p>
          )}
        </div>

        <DialogFooter>
          {url ? (
            <Button variant="outline" asChild>
              <a href={url} target="_blank" rel="noreferrer">
                <ExternalLink />
                Open in new tab
              </a>
            </Button>
          ) : null}
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A clickable thumbnail: the picture itself for an image, a document card for
 * a PDF or anything else. Clicking opens `onOpen` (normally the preview).
 */
export function AssetFileTile({
  file,
  label,
  onOpen,
  className,
}: {
  file: AssetFile;
  label?: string;
  onOpen: () => void;
  className?: string;
}) {
  const image = isImageFile(file);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Preview ${label || file.name}`}
      title={`Preview ${file.name}`}
      className={cn(
        "group flex w-full flex-col overflow-hidden rounded-md border border-border bg-card text-left",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring hover:border-primary/50",
        className,
      )}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={file.dataUrl} alt={label || file.name} className="h-28 w-full object-cover" />
      ) : (
        <span className="grid h-28 w-full place-items-center bg-muted/40">
          <span className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
            <FileText className={cn("size-7", isPdfFile(file) ? "text-destructive" : "text-primary")} aria-hidden />
            {isPdfFile(file) ? "PDF document" : "Document"}
          </span>
        </span>
      )}
      <span className="block w-full truncate px-2 py-1.5 text-xs">
        {label ? <span className="font-medium">{label} · </span> : null}
        <span className="text-muted-foreground group-hover:underline">{file.name}</span>
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * Camera
 *
 * `<input capture>` only opens a camera on phones and tablets; a desktop
 * browser ignores it and shows the file picker — so "Camera" did the same as
 * "Browse". Desktops get a live webcam preview instead (as the old screens
 * had); touch devices keep the native camera, which is better there.
 * ------------------------------------------------------------------ */

/** True when the device should use its own camera app via `<input capture>`. */
export function prefersNativeCamera(): boolean {
  if (typeof window === "undefined") return true;
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const canStream = !!navigator.mediaDevices?.getUserMedia;
  return coarse || !canStream;
}

function cameraErrorMessage(error: unknown): string {
  const name = (error as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Camera access is blocked. Allow the camera for this site in your browser settings, or use Browse.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No camera was found on this device. Use Browse to pick a photo instead.";
  }
  if (name === "NotReadableError") {
    return "The camera is being used by another app. Close it and try again.";
  }
  return "Couldn't start the camera. Use Browse to pick a photo instead.";
}

export function CameraCaptureDialog({
  open,
  title,
  onOpenChange,
  onCapture,
}: {
  open: boolean;
  title: string;
  onOpenChange: (open: boolean) => void;
  onCapture: (file: File) => void;
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [ready, setReady] = React.useState(false);
  const [capturing, setCapturing] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setReady(false);

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.play().catch(() => {});
        }
      })
      .catch((err) => !cancelled && setError(cameraErrorMessage(err)));

    // Always release the camera — a forgotten stream keeps the light on.
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [open]);

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    setCapturing(true);
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        setCapturing(false);
        if (!blob) {
          setError("Couldn't take the photo. Try again.");
          return;
        }
        const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "photo";
        onCapture(new File([blob], `${slug}-${Date.now()}.jpg`, { type: "image/jpeg" }));
        onOpenChange(false);
      },
      "image/jpeg",
      0.92,
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Take a photo · {title}</DialogTitle>
          <DialogDescription>Line it up in the frame, then press Capture.</DialogDescription>
        </DialogHeader>

        <div className="relative grid aspect-video place-items-center overflow-hidden rounded-md border border-border bg-black">
          {error ? (
            <p className="p-6 text-center text-sm text-white/80" role="alert">
              {error}
            </p>
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                onLoadedMetadata={() => setReady(true)}
                className="h-full w-full object-contain"
              />
              {!ready ? (
                <Loader2 className="absolute size-6 animate-spin text-white/70" aria-label="Starting camera" />
              ) : null}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={capture} disabled={!ready || !!error || capturing}>
            {capturing ? <Loader2 className="animate-spin" /> : <Camera />}
            Capture
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
