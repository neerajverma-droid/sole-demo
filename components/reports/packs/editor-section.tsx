"use client";

import * as React from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";

import { FormSection } from "@/components/ui/form-section";
import { cn } from "@/lib/utils";

export const A4_WIDTH_PX = 794;
export const A4_HEIGHT_PX = 1123;

export const EDITOR_LAYOUT =
  "grid items-start gap-4 xl:grid-cols-[minmax(360px,420px)_minmax(0,1fr)] xl:grid-rows-[minmax(0,1fr)] xl:items-stretch";

export const EDITOR_SIDEBAR =
  "space-y-4 xl:h-full xl:overflow-y-auto xl:overscroll-contain xl:pb-4";

export const PREVIEW_GRID = "grid gap-4 lg:grid-cols-[minmax(0,1fr)_136px]";

export const STICKY_BELOW_TOP_BAR =
  "lg:sticky lg:top-[4.5rem] lg:max-h-[calc(100vh-5.5rem)] lg:overflow-y-auto lg:overscroll-contain";

const DESKTOP_MIN_WIDTH = 1280;
const BOTTOM_GAP = 16;
const MIN_HEIGHT = 420;

export function useViewportFill() {
  const ref = React.useRef<HTMLDivElement>(null);
  const [height, setHeight] = React.useState<number>();

  const measure = React.useCallback(() => {
    const element = ref.current;
    if (!element || window.innerWidth < DESKTOP_MIN_WIDTH) {
      setHeight(undefined);
      return;
    }
    const top = element.getBoundingClientRect().top + window.scrollY;
    setHeight(
      Math.max(MIN_HEIGHT, Math.floor(window.innerHeight - top - BOTTOM_GAP)),
    );
  }, []);

  React.useLayoutEffect(() => {
    measure();
    const container = ref.current?.parentElement;
    const observer = new ResizeObserver(measure);
    if (container) observer.observe(container);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  return { ref, style: height ? { height } : undefined };
}

export function EditorSection({
  icon,
  title,
  description,
  summary,
  defaultOpen = false,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  summary?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const contentId = React.useId();

  return (
    <FormSection
      icon={icon}
      bare={!open}
      description={open ? description : summary}
      title={
        <button
          type="button"
          className="text-left hover:underline focus-visible:outline-none"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => setOpen((current) => !current)}
        >
          {title}
        </button>
      }
      action={
        <button
          type="button"
          aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => setOpen((current) => !current)}
          className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronDown
            className={cn("size-4 transition-transform", open && "rotate-180")}
          />
        </button>
      }
    >
      {open ? (
        <div id={contentId} className="space-y-4">
          {children}
        </div>
      ) : null}
    </FormSection>
  );
}
