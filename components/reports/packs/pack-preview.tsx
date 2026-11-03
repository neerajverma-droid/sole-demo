"use client";

import * as React from "react";
import { AlertTriangle, CalendarRange, Loader2, Paperclip } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

import { usePackPreview } from "@/hooks/use-report-packs";
import {
  reportTitle,
  type CatalogueEntry,
  type PackAttachment,
  type PackInput,
  type PreviewPage,
} from "@/lib/report-packs";
import { cn } from "@/lib/utils";
import {
  A4_HEIGHT_PX as A4_HEIGHT,
  A4_WIDTH_PX as A4_WIDTH,
  PREVIEW_GRID,
  STICKY_BELOW_TOP_BAR,
} from "./editor-section";
import { PageSkeleton } from "./editor-skeleton";

const PAGE_PADDING =
  "<style>html,body{background:#fff}body{padding:68px 53px 112px 53px}</style>";

const FIXED_HEIGHT_KINDS = new Set<PreviewPage["kind"]>(["cover", "contents"]);
const THUMBNAIL_WIDTH = 118;

function withPreviewPadding(html: string) {
  return html.includes("</head>")
    ? html.replace("</head>", `${PAGE_PADDING}</head>`)
    : `${PAGE_PADDING}${html}`;
}

const PreviewSheet = React.memo(function PreviewSheet({
  page,
  width,
  firstPageOnly = false,
}: {
  page: PreviewPage;
  width: number;
  firstPageOnly?: boolean;
}) {
  const srcDoc = React.useMemo(
    () => withPreviewPadding(page.html),
    [page.html],
  );
  const frame = React.useRef<HTMLIFrameElement>(null);
  const [contentHeight, setContentHeight] = React.useState(A4_HEIGHT);
  const scale = width > 0 ? width / A4_WIDTH : 0;

  const measure = () => {
    if (firstPageOnly || FIXED_HEIGHT_KINDS.has(page.kind)) {
      setContentHeight(A4_HEIGHT);
      return;
    }
    const doc = frame.current?.contentDocument;
    const height = doc?.documentElement?.scrollHeight ?? A4_HEIGHT;
    setContentHeight(Math.max(A4_HEIGHT, height));
  };

  return (
    <div
      className="overflow-hidden rounded-sm bg-white shadow-sm ring-1 ring-border"
      style={{ height: contentHeight * scale }}
    >
      <iframe
        ref={frame}
        title={page.title}
        sandbox="allow-same-origin"
        srcDoc={srcDoc}
        loading={firstPageOnly ? "lazy" : undefined}
        onLoad={measure}
        style={{
          width: A4_WIDTH,
          height: contentHeight,
          border: 0,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          pointerEvents: "none",
        }}
      />
    </div>
  );
});

export function PackPreview({
  input,
  packId,
  catalogue,
  attachments = [],
}: {
  input: PackInput;
  packId: number | null;
  catalogue: CatalogueEntry[];
  attachments?: PackAttachment[];
}) {
  const preview = usePackPreview(input, packId);
  const column = React.useRef<HTMLDivElement>(null);
  const sheets = React.useRef(new Map<string, HTMLDivElement>());
  const [width, setWidth] = React.useState(0);

  React.useEffect(() => {
    const element = column.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.floor(entry.contentRect.width)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const pages = preview.data?.pages ?? [];
  const skipped = preview.data?.skipped ?? [];
  const ready = Boolean(input.period_from && input.period_to);

  const jump = (key: string) =>
    sheets.current
      .get(key)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });

  const [active, setActive] = React.useState<string | null>(null);
  const pageKeys = pages.map((page) => page.key).join("|");
  const measured = width > 0;

  React.useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const key = visible?.target.getAttribute("data-page-key");
        if (key) setActive(key);
      },
      { threshold: [0.25, 0.5, 0.75] },
    );
    sheets.current.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [pageKeys, measured]);

  return (
    <div className={cn(PREVIEW_GRID, "xl:h-full xl:grid-rows-[minmax(0,1fr)]")}>
      <div className="relative min-w-0 xl:h-full xl:min-h-0">
        {preview.isFetching && (
          <span className="absolute right-2 top-2 z-10 flex items-center gap-1.5 rounded-full bg-background/90 px-2.5 py-1 text-xs text-muted-foreground shadow-sm ring-1 ring-border">
            <Loader2 className="size-3 animate-spin" />
            Updating
          </span>
        )}

        <div className="xl:h-full xl:overflow-y-auto xl:overscroll-contain">
          {!ready && (
            <Empty>
              <EmptyMedia>
                <CalendarRange />
              </EmptyMedia>
              <EmptyTitle>Choose a period</EmptyTitle>
              <EmptyDescription>
                Pick the dates the pack covers and the preview builds here.
              </EmptyDescription>
            </Empty>
          )}

          {ready && preview.isError && (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <div>
                <AlertTitle>Could not build the preview</AlertTitle>
                <AlertDescription>
                  {preview.error instanceof Error
                    ? preview.error.message
                    : "Try again in a moment."}
                </AlertDescription>
              </div>
            </Alert>
          )}

          {ready && preview.isLoading && (
            <PageSkeleton message="Building the preview from your ledger. The first load can take a few seconds; changes after that show almost instantly." />
          )}

          {skipped.length > 0 && (
            <Alert className="mb-3">
              <AlertTriangle className="size-4" />
              <AlertDescription>
                {skipped.map((key) => reportTitle(catalogue, key)).join(", ")}{" "}
                {skipped.length === 1 ? "isn't" : "aren't"} available for this
                business and will be left out.
              </AlertDescription>
            </Alert>
          )}

          <div
            ref={column}
            className={cn(
              "space-y-4",
              preview.isFetching && "opacity-80 transition-opacity",
            )}
          >
            {width > 0 &&
              pages.map((page) => (
                <div
                  key={page.key}
                  ref={(node) => {
                    if (node) sheets.current.set(page.key, node);
                    else sheets.current.delete(page.key);
                  }}
                  data-page-key={page.key}
                  className="scroll-mt-[4.5rem] xl:scroll-mt-0"
                >
                  <PreviewSheet page={page} width={width} />
                </div>
              ))}
          </div>

          {pages.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Page numbers, footers and attachments are added when the PDF is
              built.
            </p>
          )}
        </div>
      </div>

      <nav
        aria-label="Pages in this pack"
        className="hidden lg:block xl:h-full xl:min-h-0 xl:overflow-y-auto xl:overscroll-contain"
      >
        <ol
          className={cn(
            "space-y-3 pb-2 pr-1",
            STICKY_BELOW_TOP_BAR,
            "xl:static xl:max-h-none xl:overflow-visible",
          )}
        >
          {pages.map((page, index) => (
            <li key={page.key}>
              <button
                type="button"
                onClick={() => jump(page.key)}
                aria-current={active === page.key ? "true" : undefined}
                className={cn(
                  "group block w-full rounded-md p-1.5 text-left transition-colors hover:bg-muted",
                  active === page.key && "bg-primary/10 ring-1 ring-primary/40",
                )}
              >
                <div className="pointer-events-none">
                  <PreviewSheet
                    page={page}
                    width={THUMBNAIL_WIDTH}
                    firstPageOnly
                  />
                </div>
                <div className="mt-1.5 flex gap-1.5 text-[11px] leading-snug">
                  <span className="tabular-nums text-muted-foreground">
                    {index + 1}
                  </span>
                  <span
                    className={cn(
                      "line-clamp-2",
                      active === page.key && "font-medium text-primary",
                    )}
                  >
                    {page.title}
                  </span>
                </div>
              </button>
            </li>
          ))}
          {attachments.map((attachment) => (
            <li
              key={`attachment-${attachment.id}`}
              className="flex items-start gap-1.5 px-1.5 text-[11px] text-muted-foreground"
            >
              <Paperclip className="mt-px size-3 shrink-0" />
              <span className="line-clamp-2 leading-snug">
                {attachment.file_name}
              </span>
            </li>
          ))}
        </ol>
      </nav>
    </div>
  );
}
