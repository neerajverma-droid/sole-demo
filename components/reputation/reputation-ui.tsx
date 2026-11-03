"use client";

import * as React from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  RemoveFormatting,
  Star,
  Strikethrough,
  Type,
  Underline,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { initialsOf, type ReputationTone } from "@/lib/reputation";
import { cn } from "@/lib/utils";

export const TONE_CLASSES: Record<ReputationTone, string> = {
  success: "border-success/20 bg-success/10 text-success",
  info: "border-primary/20 bg-primary/10 text-primary",
  warning: "border-warning/20 bg-warning/10 text-warning",
  danger: "border-destructive/20 bg-destructive/10 text-destructive",
  neutral: "border-border bg-muted text-muted-foreground",
  accent: "border-teal-600/20 bg-teal-600/10 text-teal-700 dark:border-teal-400/20 dark:bg-teal-400/10 dark:text-teal-400",
};

export const TONE_TEXT: Record<ReputationTone, string> = {
  success: "text-success",
  info: "text-primary",
  warning: "text-warning",
  danger: "text-destructive",
  neutral: "text-muted-foreground",
  accent: "text-teal-700 dark:text-teal-400",
};

export const TONE_FILL: Record<ReputationTone, string> = {
  success: "bg-success",
  info: "bg-primary",
  warning: "bg-warning",
  danger: "bg-destructive",
  neutral: "bg-muted-foreground",
  accent: "bg-teal-600 dark:bg-teal-400",
};

export function TonePill({
  tone,
  className,
  children,
}: {
  tone: ReputationTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StarRow({ rating, size = 15, className }: { rating: number; size?: number; className?: string }) {
  const filled = Math.round(rating);
  return (
    <span role="img" aria-label={`${rating} out of 5 stars`} className={cn("inline-flex items-center gap-0.5", className)}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          style={{ width: size, height: size }}
          strokeWidth={1.5}
          className={star <= filled ? "fill-amber-500 text-amber-500" : "text-border"}
          aria-hidden
        />
      ))}
    </span>
  );
}

export function ClientAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-xs font-semibold text-primary",
        className,
      )}
      aria-hidden
    >
      {initialsOf(name)}
    </span>
  );
}

export function ClientCell({ name, subtitle }: { name: string; subtitle: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <ClientAvatar name={name} />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{name}</p>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

export function ProgressBar({ value, tone = "info", className }: { value: number; tone?: ReputationTone; className?: string }) {
  return (
    <div className={cn("h-2 overflow-hidden rounded-full bg-muted", className)}>
      <div
        className={cn("h-full rounded-full transition-all", TONE_FILL[tone])}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

const FONT_SIZES = [
  { label: "Small", value: "2" },
  { label: "Normal", value: "3" },
  { label: "Large", value: "5" },
  { label: "Huge", value: "7" },
];

const TEXT_COLOURS = ["#111827", "#6b7280", "#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#6366f1", "#ec4899"];

function safeLink(input: string | null): string | null {
  const value = input?.trim();
  if (!value) return null;
  const candidate = /^(https?:|mailto:)/i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function ToolButton({
  label,
  onRun,
  children,
}: {
  label: string;
  onRun: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(event) => {
        event.preventDefault();
        onRun();
      }}
      className="inline-flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 text-foreground transition-colors hover:bg-accent [&_svg]:size-4"
    >
      {children}
    </button>
  );
}

function ToolMenu({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={label}
          aria-label={label}
          onMouseDown={(event) => event.preventDefault()}
          className="inline-flex h-8 items-center gap-0.5 rounded-md px-1.5 text-foreground transition-colors hover:bg-accent [&_svg]:size-4"
        >
          {icon}
          <ChevronDown className="!size-3 opacity-60" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onCloseAutoFocus={(event) => event.preventDefault()}>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function RichTextEditor({
  id,
  value,
  onChange,
  placeholder = "Write your message…",
  invalid,
}: {
  id?: string;
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  invalid?: boolean;
}) {
  const editorRef = React.useRef<HTMLDivElement>(null);
  const savedRange = React.useRef<Range | null>(null);

  React.useEffect(() => {
    const editor = editorRef.current;
    if (editor && editor.innerHTML !== value) editor.innerHTML = value;
  }, [value]);

  const rememberSelection = () => {
    const selection = window.getSelection();
    const editor = editorRef.current;
    if (selection && selection.rangeCount && editor?.contains(selection.anchorNode)) {
      savedRange.current = selection.getRangeAt(0).cloneRange();
    }
  };

  const restoreSelection = () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const range = savedRange.current;
    const selection = window.getSelection();
    if (range && selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
  };

  const run = (command: string, argument?: string) => {
    restoreSelection();
    document.execCommand("styleWithCSS", false, "false");
    document.execCommand(command, false, argument);
    rememberSelection();
    if (editorRef.current) onChange(editorRef.current.innerHTML);
  };

  const insertLink = () => {
    const url = safeLink(window.prompt("Link URL"));
    if (url) run("createLink", url);
  };

  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border border-input bg-background shadow-sm focus-within:ring-1 focus-within:ring-ring",
        invalid && "border-destructive focus-within:ring-destructive",
      )}
    >
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-1.5 py-1" role="toolbar" aria-label="Formatting">
        <ToolMenu label="Font size" icon={<Type />}>
          {FONT_SIZES.map((size) => (
            <DropdownMenuItem key={size.value} onSelect={() => run("fontSize", size.value)}>
              {size.label}
            </DropdownMenuItem>
          ))}
        </ToolMenu>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <ToolButton label="Bold" onRun={() => run("bold")}>
          <Bold />
        </ToolButton>
        <ToolButton label="Italic" onRun={() => run("italic")}>
          <Italic />
        </ToolButton>
        <ToolButton label="Underline" onRun={() => run("underline")}>
          <Underline />
        </ToolButton>
        <ToolMenu label="Text colour" icon={<span className="text-sm font-semibold underline decoration-destructive decoration-2 underline-offset-2">A</span>}>
          <div className="grid grid-cols-4 gap-1.5 p-1.5">
            {TEXT_COLOURS.map((colour) => (
              <DropdownMenuItem
                key={colour}
                aria-label={colour}
                onSelect={() => run("foreColor", colour)}
                className="size-7 rounded-md border border-border p-0"
                style={{ background: colour }}
              />
            ))}
          </div>
        </ToolMenu>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <ToolMenu label="Align" icon={<AlignLeft />}>
          <DropdownMenuItem onSelect={() => run("justifyLeft")}>
            <AlignLeft />
            Left
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => run("justifyCenter")}>
            <AlignCenter />
            Center
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => run("justifyRight")}>
            <AlignRight />
            Right
          </DropdownMenuItem>
        </ToolMenu>
        <ToolButton label="Numbered list" onRun={() => run("insertOrderedList")}>
          <ListOrdered />
        </ToolButton>
        <ToolButton label="Bulleted list" onRun={() => run("insertUnorderedList")}>
          <List />
        </ToolButton>
        <ToolButton label="Decrease indent" onRun={() => run("outdent")}>
          <IndentDecrease />
        </ToolButton>
        <ToolButton label="Increase indent" onRun={() => run("indent")}>
          <IndentIncrease />
        </ToolButton>
        <ToolButton label="Quote" onRun={() => run("formatBlock", "blockquote")}>
          <Quote />
        </ToolButton>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <ToolButton label="Strikethrough" onRun={() => run("strikeThrough")}>
          <Strikethrough />
        </ToolButton>
        <ToolButton label="Insert link" onRun={insertLink}>
          <Link2 />
        </ToolButton>
        <ToolButton label="Clear formatting" onRun={() => run("removeFormat")}>
          <RemoveFormatting />
        </ToolButton>
      </div>
      <div
        id={id}
        ref={editorRef}
        role="textbox"
        aria-multiline="true"
        aria-invalid={invalid || undefined}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={(event) => onChange(event.currentTarget.innerHTML)}
        onPaste={(event) => {
          event.preventDefault();
          document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
        }}
        onKeyUp={rememberSelection}
        onMouseUp={rememberSelection}
        onBlur={rememberSelection}
        className="min-h-[150px] max-h-[320px] overflow-y-auto px-3 py-2.5 text-sm leading-relaxed outline-none empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)] [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_a]:text-primary [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mb-2.5 [&_ul]:list-disc [&_ul]:pl-6"
      />
    </div>
  );
}
