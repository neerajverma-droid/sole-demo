"use client";

import * as React from "react";
import {
  GripVertical,
  ImageIcon,
  Link2,
  Loader2,
  PenLine,
  Play,
  Plus,
  Rows3,
  Trash2,
  Upload,
  Video,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Field } from "@/components/documents/field";
import { SIGNATURE_FONT_CLASS, SIGNATURE_SIZES } from "@/components/proposals/proposal-document";
import { RichTextEditor } from "@/components/proposals/rich-text-editor";
import { SenderSelect, type SenderOption } from "@/components/proposals/steps/content-steps";
import { StepFooter, StepHeader } from "@/components/proposals/steps/step-parts";
import {
  newBlockId,
  videoEmbedUrl,
  type IntroBlock,
  type IntroBlockType,
  type IntroductionData,
  type MergeValues,
  type SignatureSize,
} from "@/lib/proposals";
import { cn } from "@/lib/utils";

const BLOCK_OPTIONS: {
  type: IntroBlockType;
  label: string;
  sub: string;
  Icon: React.ComponentType<{ className?: string }>;
}[] = [
  { type: "text", label: "Text", sub: "Heading, paragraph, list — rich formatting", Icon: PenLine },
  { type: "image", label: "Image", sub: "Photo, logo or screenshot", Icon: ImageIcon },
  { type: "video", label: "Video", sub: "YouTube, Loom or Vimeo link", Icon: Video },
  { type: "page_break", label: "Page break", sub: "Continue the intro on a new page", Icon: Rows3 },
];

/** Only a text block can hold the first, primary slot. */
const withPrimary = (blocks: IntroBlock[]) =>
  blocks.map((block, index) => ({
    ...block,
    isPrimary: index === 0 && block.type === "text",
  }));

export function IntroductionStep({
  data,
  onChange,
  onImageUpload,
  onSave,
  onBack,
  saving,
  senders,
  mergeValues,
}: {
  data: IntroductionData;
  onChange: (updater: (prev: IntroductionData) => IntroductionData) => void;
  onImageUpload: (blockId: string, file: File) => void;
  onSave: () => void;
  onBack: () => void;
  saving: boolean;
  senders: SenderOption[];
  mergeValues: MergeValues;
}) {
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [overId, setOverId] = React.useState<string | null>(null);
  const [video, setVideo] = React.useState<{ blockId: string; url: string } | null>(null);

  const setBlocks = (updater: (blocks: IntroBlock[]) => IntroBlock[]) =>
    onChange((prev) => ({ ...prev, blocks: updater(prev.blocks) }));
  const updateBlock = (id: string, patch: Partial<IntroBlock>) =>
    setBlocks((blocks) => blocks.map((block) => (block.id === id ? { ...block, ...patch } : block)));
  const insertAfter = (afterId: string | null, type: IntroBlockType) =>
    setBlocks((blocks) => {
      const next = [...blocks];
      const index = afterId ? next.findIndex((block) => block.id === afterId) : next.length - 1;
      next.splice(index + 1, 0, { id: newBlockId(), type });
      return next;
    });
  const removeBlock = (id: string) => setBlocks((blocks) => withPrimary(blocks.filter((block) => block.id !== id)));

  const drop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    setBlocks((blocks) => {
      const from = blocks.findIndex((block) => block.id === dragId);
      const to = blocks.findIndex((block) => block.id === targetId);
      if (from < 0 || to < 0) return blocks;
      const next = [...blocks];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return withPrimary(next);
    });
  };

  const signature = data.signature;
  const setSignature = (patch: Partial<IntroductionData["signature"]>) =>
    onChange((prev) => ({ ...prev, signature: { ...prev.signature, ...patch } }));

  return (
    <section className="space-y-5">
      <StepHeader
        title="Introduction"
        description="Give your client a clear and friendly introduction to your proposal."
      />

      <Field label="Display message from">
        <SenderSelect
          options={senders}
          value={data.message_from}
          onChange={(value) => onChange((prev) => ({ ...prev, message_from: value }))}
        />
      </Field>

      <div className="space-y-2">
        <Label>Content</Label>
        <p className="text-xs text-muted-foreground">
          Drag the handle to reorder. Click <span className="font-semibold text-primary">+</span>{" "}
          below any block to insert text, image, or video.
        </p>

        <div className="space-y-1">
          {data.blocks.map((block, index) => (
            <div key={block.id}>
              <div
                onDragOver={(event) => {
                  if (!dragId) return;
                  event.preventDefault();
                  setOverId(block.id);
                }}
                onDragLeave={() => setOverId((current) => (current === block.id ? null : current))}
                onDrop={(event) => {
                  event.preventDefault();
                  drop(block.id);
                  setDragId(null);
                  setOverId(null);
                }}
                className={cn(
                  "group flex items-start gap-2 rounded-md transition-opacity",
                  dragId === block.id && "opacity-40",
                  overId === block.id && dragId !== block.id && "ring-2 ring-primary/40",
                )}
              >
                <div className="flex shrink-0 flex-col items-center gap-1 pt-3 opacity-40 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      setDragId(block.id);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverId(null);
                    }}
                    className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
                    aria-label="Drag to reorder"
                  >
                    <GripVertical className="size-3.5" />
                  </button>
                  {index !== 0 && (
                    <button
                      type="button"
                      onClick={() => removeBlock(block.id)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Remove block"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <BlockEditor
                    block={block}
                    mergeValues={mergeValues}
                    onUpdate={(patch) => updateBlock(block.id, patch)}
                    onImageFile={(file) => onImageUpload(block.id, file)}
                    onAddVideo={() => setVideo({ blockId: block.id, url: block.videoUrl ?? "" })}
                  />
                </div>
              </div>
              {!dragId && (
                <AddBlockMenu onAdd={(type) => insertAfter(block.id, type)} />
              )}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
          <div className="flex flex-wrap items-center gap-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => insertAfter(null, "text")}>
              <PenLine /> Add text
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => insertAfter(null, "image")}>
              <ImageIcon /> Add image
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => insertAfter(null, "video")}>
              <Video /> Add video
            </Button>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => insertAfter(null, "page_break")}>
            <Plus /> Add page
          </Button>
        </div>
      </div>

      <div className="space-y-3 border-t border-border pt-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="intro-signature">Signature</Label>
            <p className="text-xs text-muted-foreground">
              Sign-off at the end of the introduction. Type the name — we&apos;ll
              render it in a signature font.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Switch
              id="intro-signature"
              checked={signature.showing}
              onCheckedChange={(checked) => setSignature({ showing: checked })}
            />
            <span className="text-xs text-muted-foreground">
              {signature.showing ? "Showing" : "Hidden"}
            </span>
          </div>
        </div>

        {signature.showing && (
          <>
            <Input
              value={signature.name}
              placeholder="Your name"
              aria-label="Signature name"
              onChange={(event) => setSignature({ name: event.target.value })}
            />
            <div className="flex items-center gap-2">
              <span className="mr-1 text-xs text-muted-foreground">Size</span>
              {(["small", "medium", "large"] as SignatureSize[]).map((size) => (
                <Button
                  key={size}
                  type="button"
                  size="sm"
                  variant={signature.size === size ? "secondary" : "outline"}
                  aria-pressed={signature.size === size}
                  className={cn("capitalize", signature.size === size && "ring-1 ring-foreground/40")}
                  onClick={() => setSignature({ size })}
                >
                  {size}
                </Button>
              ))}
            </div>
            <div className="rounded-lg border border-border bg-muted/40 px-5 py-4">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Preview
              </p>
              <p
                className={cn(
                  SIGNATURE_FONT_CLASS,
                  "leading-tight",
                  SIGNATURE_SIZES[signature.size] ?? SIGNATURE_SIZES.medium,
                )}
              >
                {signature.name || "Your signature"}
              </p>
            </div>
          </>
        )}
      </div>

      <StepFooter
        saving={saving}
        nextLabel="Documents"
        onSave={onSave}
        backLabel="Payments"
        onBack={onBack}
      />

      <Dialog open={video != null} onOpenChange={(open) => !open && setVideo(null)}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Add introduction video</DialogTitle>
            <DialogDescription>
              Paste a link from Loom, YouTube or Vimeo. Video is shown on the
              Introduction page.
            </DialogDescription>
          </DialogHeader>
          <Input
            type="url"
            autoFocus
            value={video?.url ?? ""}
            placeholder="eg., https://youtu.be/dQw4w9WgXcQ"
            aria-label="Video URL"
            onChange={(event) => setVideo((prev) => (prev ? { ...prev, url: event.target.value } : prev))}
          />
          <div className="grid h-[220px] place-items-center overflow-hidden rounded-lg bg-muted">
            {video?.url && videoEmbedUrl(video.url) ? (
              <iframe
                title="Video preview"
                src={videoEmbedUrl(video.url) ?? undefined}
                className="size-full"
                allow="autoplay; fullscreen"
                allowFullScreen
              />
            ) : (
              <span className="grid size-12 place-items-center rounded-full bg-background shadow">
                <Play className="ml-0.5 size-4 text-muted-foreground" />
              </span>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setVideo(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!video?.url.trim()}
              onClick={() => {
                if (!video) return;
                updateBlock(video.blockId, { videoUrl: video.url.trim() });
                setVideo(null);
              }}
            >
              Add video
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function AddBlockMenu({ onAdd }: { onAdd: (type: IntroBlockType) => void }) {
  return (
    <div className="my-1 ml-6">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Insert block"
            className="grid size-5 place-items-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <Plus className="size-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[260px]">
          {BLOCK_OPTIONS.map(({ type, label, sub, Icon }) => (
            <DropdownMenuItem key={type} className="items-start gap-3 py-2.5" onSelect={() => onAdd(type)}>
              <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                <Icon className="size-4" />
              </span>
              <span>
                <span className="block text-sm font-medium">{label}</span>
                <span className="block text-xs text-muted-foreground">{sub}</span>
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function BlockEditor({
  block,
  mergeValues,
  onUpdate,
  onImageFile,
  onAddVideo,
}: {
  block: IntroBlock;
  mergeValues: MergeValues;
  onUpdate: (patch: Partial<IntroBlock>) => void;
  onImageFile: (file: File) => void;
  onAddVideo: () => void;
}) {
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [url, setUrl] = React.useState("");

  if (block.type === "text") {
    return (
      <RichTextEditor
        initialValue={block.editorHtml ?? ""}
        mergeValues={mergeValues}
        onChange={(html) => onUpdate({ editorHtml: html })}
      />
    );
  }

  if (block.type === "page_break") {
    return (
      <div className="flex items-center gap-3 py-3">
        <div className="flex-1 border-t border-dashed border-border" />
        <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
          Page break
        </span>
        <div className="flex-1 border-t border-dashed border-border" />
      </div>
    );
  }

  if (block.type === "video") {
    return (
      <div className="overflow-hidden rounded-lg border border-border">
        {block.videoUrl ? (
          <div className="relative">
            <iframe
              title="Introduction video"
              src={videoEmbedUrl(block.videoUrl) ?? block.videoUrl}
              className="h-[200px] w-full"
              allow="autoplay; fullscreen"
              allowFullScreen
            />
            <RemoveMedia onClick={() => onUpdate({ videoUrl: undefined })} />
          </div>
        ) : (
          <MediaPlaceholder
            icon={<Video className="size-4" />}
            title="Add a video"
            sub="Paste a Loom / YouTube / Vimeo link"
          >
            <Button type="button" variant="outline" size="sm" onClick={onAddVideo}>
              <Link2 /> Use URL
            </Button>
          </MediaPlaceholder>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      {block.imageUploading ? (
        <div className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
          Uploading image…
        </div>
      ) : block.imageUrl ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={block.imageUrl}
            alt={block.imageName || "Introduction image"}
            className="min-h-[200px] w-full object-contain"
          />
          <RemoveMedia onClick={() => onUpdate({ imageUrl: undefined, imageName: undefined })} />
        </div>
      ) : block.imageInputMode === "url" ? (
        <div className="flex items-center gap-2 p-3">
          <Input
            type="url"
            autoFocus
            value={url}
            placeholder="https://example.com/image.jpg"
            aria-label="Image URL"
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && url.trim()) {
                onUpdate({ imageUrl: url.trim(), imageName: "Image", imageInputMode: "none" });
              }
              if (event.key === "Escape") onUpdate({ imageInputMode: "none" });
            }}
          />
          <Button
            type="button"
            size="sm"
            disabled={!url.trim()}
            onClick={() => onUpdate({ imageUrl: url.trim(), imageName: "Image", imageInputMode: "none" })}
          >
            Add
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Cancel"
            onClick={() => onUpdate({ imageInputMode: "none" })}
          >
            <X />
          </Button>
        </div>
      ) : (
        <MediaPlaceholder icon={<ImageIcon className="size-4" />} title="Add an image" sub="JPG, PNG or WebP">
          <Button type="button" variant="outline" size="sm" onClick={() => onUpdate({ imageInputMode: "url" })}>
            <Link2 /> Use URL
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onImageFile(file);
              event.target.value = "";
            }}
          />
          <Button type="button" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload /> Upload
          </Button>
        </MediaPlaceholder>
      )}
    </div>
  );
}

function MediaPlaceholder({
  icon,
  title,
  sub,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
          {icon}
        </span>
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{sub}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

function RemoveMedia({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="absolute right-2 top-2 size-7 rounded-full"
      aria-label="Remove"
      onClick={onClick}
    >
      <X />
    </Button>
  );
}
