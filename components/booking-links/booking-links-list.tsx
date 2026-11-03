"use client";

import * as React from "react";
import { Copy, Link2, Loader2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { apiErrorMessage } from "@/lib/api-error";
import { deleteBookingLink } from "@/lib/booking-links-api";
import {
  bookingUrl,
  bookingUrlPrefix,
  formatDuration,
  type BookingLinkRow,
} from "@/lib/booking-links";

async function copyLink(slug: string) {
  try {
    await navigator.clipboard.writeText(bookingUrl(slug));
    toast.success("Link copied to clipboard");
  } catch {
    toast.error("Couldn't copy the link — copy it from the address shown instead.");
  }
}

function LinkRow({
  link,
  onEdit,
  onDelete,
}: {
  link: BookingLinkRow;
  onEdit: (link: BookingLinkRow) => void;
  onDelete: (link: BookingLinkRow) => void;
}) {
  const meta = [
    `${bookingUrlPrefix()}${link.slug}`,
    formatDuration(link.duration_min),
    link.meeting_type || "",
  ].filter(Boolean);
  const days = link.scheduled_days?.length
    ? link.scheduled_days.map((day) => day.slice(0, 3)).join(", ")
    : "";

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-3 shadow-sm">
      <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-primary/10 text-primary">
        <Link2 className="size-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-semibold">{link.title || "Untitled booking"}</p>
          <span className="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-primary">
            {link.booked_count || 0} booked
          </span>
        </div>
        <p className="truncate text-xs tabular-nums text-muted-foreground">
          {meta.join(" · ")}
          {days && <span className="hidden md:inline"> · {days}</span>}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0"
        onClick={() => void copyLink(link.slug)}
      >
        <Copy />
        <span className="hidden sm:inline">Copy link</span>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            aria-label={`More for ${link.title}`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onEdit(link)}>
            <Pencil />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={bookingUrl(link.slug)} target="_blank" rel="noreferrer">
              <Link2 />
              Open booking page
            </a>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => onDelete(link)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** A link row's shape while the list loads. */
function LinkRowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-3 shadow-sm">
      <Skeleton className="size-9 shrink-0 rounded-[10px]" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-14" />
        </div>
        <Skeleton className="h-3 w-full max-w-[340px]" />
      </div>
      <Skeleton className="h-8 w-9 shrink-0 sm:w-[104px]" />
      <Skeleton className="size-8 shrink-0" />
    </div>
  );
}

/**
 * "No booking links yet" — inside the list when its tab is open, and on its own
 * in place of the whole screen while there isn't a single link to book from.
 */
export function BookingLinksEmpty({
  onCreate,
  className,
}: {
  onCreate: () => void;
  className?: string;
}) {
  return (
    <Empty className={className}>
      <EmptyMedia>
        <Link2 />
      </EmptyMedia>
      <EmptyTitle>No booking links yet</EmptyTitle>
      <EmptyDescription>
        Create a link, share it, and clients pick a time that suits you both.
      </EmptyDescription>
      <Button onClick={onCreate} size="sm">
        Create booking link
      </Button>
    </Empty>
  );
}

/** "Your booking links" — copy, edit or remove each, ten at a time. */
export function BookingLinksList({
  links,
  loading,
  hasMore,
  loadingMore,
  onLoadMore,
  onEdit,
  onCreate,
  onDeleted,
}: {
  links: BookingLinkRow[];
  loading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onEdit: (link: BookingLinkRow) => void;
  onCreate: () => void;
  onDeleted: () => void;
}) {
  const [pendingDelete, setPendingDelete] = React.useState<BookingLinkRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  // The next page loads once the end of the list scrolls into view — the old
  // list's observer on its last row, here a sentinel after it.
  const sentinelRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || loadingMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore();
      },
      { rootMargin: "120px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, onLoadMore, links.length]);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteBookingLink(pendingDelete.id);
      toast.success("Booking link removed");
      setPendingDelete(null);
      onDeleted();
    } catch (error) {
      toast.error(apiErrorMessage(error, "Failed to remove booking link"));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section>
      <h3 className="mb-2.5 text-sm font-semibold">Your booking links</h3>
      {loading ? (
        <div className="flex flex-col gap-2.5" aria-busy="true" aria-label="Loading booking links">
          {Array.from({ length: 3 }, (_, index) => (
            <LinkRowSkeleton key={index} />
          ))}
        </div>
      ) : links.length === 0 ? (
        <BookingLinksEmpty onCreate={onCreate} className="py-8" />
      ) : (
        <div className="flex flex-col gap-2.5">
          {links.map((link) => (
            <LinkRow key={link.id} link={link} onEdit={onEdit} onDelete={setPendingDelete} />
          ))}
          {loadingMore &&
            Array.from({ length: 2 }, (_, index) => <LinkRowSkeleton key={`more-${index}`} />)}
          {hasMore && <div ref={sentinelRef} aria-hidden className="h-px" />}
        </div>
      )}

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && !deleting && setPendingDelete(null)}
      >
        <AlertDialogContent className="sm:max-w-[440px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove booking link?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{pendingDelete?.title}&rdquo; will stop taking bookings, and its link will no
              longer open.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={() => void confirmDelete()} disabled={deleting}>
              {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Remove
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
