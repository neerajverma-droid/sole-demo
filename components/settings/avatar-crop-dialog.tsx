"use client";

import * as React from "react";
import { RotateCw } from "lucide-react";
import {
  Cropper,
  CircleStencil,
  ImageRestriction,
  type CropperRef,
} from "react-advanced-cropper";
import "react-advanced-cropper/dist/style.css";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * The crop step between picking a photo and uploading it.
 *
 * Ported from sole-webapp's `components/ImageUploaderShadcn.js` — same
 * library (`react-advanced-cropper`) wrapped in the same kind of dialog —
 * trimmed to what an avatar needs: a fixed circular crop, the library's own
 * built-in scroll/pinch zoom and drag-to-reposition, and one rotate button.
 * The source's stencil-shape toggle, aspect-ratio presets and
 * brightness/contrast/saturation sliders are left out as embellishments
 * orthogonal to the crop-then-upload flow this is porting.
 */
export function AvatarCropDialog({
  open,
  src,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  /** An object URL for the just-picked file. */
  src: string | null;
  onCancel: () => void;
  /** The cropped square, as a JPEG File ready to POST. */
  onConfirm: (file: File) => void;
}) {
  const cropperRef = React.useRef<CropperRef>(null);

  const rotate = () => cropperRef.current?.rotateImage(90);

  const confirm = () => {
    const canvas = cropperRef.current?.getCanvas();
    if (!canvas) return;
    canvas.toBlob(
      (blob) => {
        if (blob) {
          onConfirm(new File([blob], "avatar.jpg", { type: "image/jpeg" }));
        }
      },
      "image/jpeg",
      0.92,
    );
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Crop your photo</DialogTitle>
        </DialogHeader>

        {src && (
          <div className="overflow-hidden rounded-lg bg-muted">
            <Cropper
              ref={cropperRef}
              src={src}
              stencilComponent={CircleStencil}
              stencilProps={{ aspectRatio: 1, movable: true, resizable: true }}
              imageRestriction={ImageRestriction.fitArea}
              className="h-72 w-full"
            />
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Scroll or pinch to zoom, drag to reposition.
        </p>

        <DialogFooter className="sm:justify-between">
          <Button type="button" variant="outline" onClick={rotate}>
            <RotateCw className="size-4" aria-hidden />
            Rotate
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="button" onClick={confirm}>
              Use photo
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
