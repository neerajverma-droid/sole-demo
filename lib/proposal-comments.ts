/**
 * Comments on a sent proposal, Google Docs-style — sole-ocr's
 * `services/proposalComment.js`. The client highlights text on the public link
 * (or picks a whole page) and comments; the owner replies from the builder;
 * either side resolves. Every call answers with all of the proposal's threads.
 *
 * Highlights are found again by text, not by position: a thread keeps the
 * quoted words and a little text either side (`anchor`), so it survives the
 * layout changing. If the owner rewrites the quoted words, the thread stays
 * but its highlight can't be placed ("on text that has since changed").
 */

import apiRoutes from "@/config/api-routes";
import { apiRequest } from "@/lib/api/client";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";
import type { PreviewTab } from "@/components/proposals/proposal-document";
import type { ProposalStep } from "@/lib/proposals";
import api from "@/utils/axiosInstance";

/** The pages a thread can be on — the backend's SECTIONS. */
export const COMMENT_SECTIONS = ["COVER", "INTRODUCTION", "SERVICES", "PRICING", "TERMS", "THANK_YOU"] as const;
export type CommentSection = (typeof COMMENT_SECTIONS)[number];

export const SECTION_OF_TAB: Partial<Record<PreviewTab, CommentSection>> = {
  Cover: "COVER",
  Introduction: "INTRODUCTION",
  Services: "SERVICES",
  Pricing: "PRICING",
  Terms: "TERMS",
  "Thank You": "THANK_YOU",
};

export const SECTION_LABEL: Record<CommentSection, string> = {
  COVER: "Cover",
  INTRODUCTION: "Introduction",
  SERVICES: "Services",
  PRICING: "Pricing",
  TERMS: "Terms",
  THANK_YOU: "Thank You",
};

/** The builder step where a thread's page is edited. */
export const STEP_OF_SECTION: Record<CommentSection, ProposalStep> = {
  COVER: "General",
  INTRODUCTION: "Introduction",
  SERVICES: "Services",
  PRICING: "Payments",
  TERMS: "Terms & Sign",
  THANK_YOU: "Thank You",
};

export const COMMENT_BODY_MAX = 2000;
/** How often the public link checks for replies and edits while open. */
export const PORTAL_REFRESH_MS = 15_000;
/** The live event the backend pushes to the owner when a client comments. */
export const COMMENT_EVENT = "proposal_comment";

export type CommentAnchor = { prefix: string; suffix: string };

export type ProposalComment = {
  id: string;
  authorType: "client" | "user";
  authorName: string;
  body: string;
  createdAt: string;
};

export type CommentThread = {
  id: string;
  section: CommentSection;
  quote: string | null;
  anchor: CommentAnchor | null;
  resolved: boolean;
  resolvedBy: "client" | "user" | null;
  createdAt: string;
  comments: ProposalComment[];
};

type ApiThread = {
  id: string | number;
  section?: string | null;
  quote?: string | null;
  anchor?: unknown;
  resolved?: boolean;
  resolved_by?: string | null;
  created_at?: string | null;
  comments?: { id: string | number; author_type?: string; author_name?: string; body?: string; created_at?: string | null }[];
};

const isSection = (value: unknown): value is CommentSection =>
  COMMENT_SECTIONS.includes(String(value) as CommentSection);

export function mapThreads(raw: unknown): CommentThread[] {
  if (!Array.isArray(raw)) return [];
  return (raw as ApiThread[]).map((thread) => {
    const anchor = thread.anchor as Partial<CommentAnchor> | null | undefined;
    return {
      id: String(thread.id),
      section: isSection(thread.section) ? thread.section : "COVER",
      quote: thread.quote || null,
      anchor: anchor && typeof anchor === "object" ? { prefix: String(anchor.prefix ?? ""), suffix: String(anchor.suffix ?? "") } : null,
      resolved: Boolean(thread.resolved),
      resolvedBy: thread.resolved_by === "client" || thread.resolved_by === "user" ? thread.resolved_by : null,
      createdAt: thread.created_at ?? "",
      comments: (thread.comments ?? []).map((comment) => ({
        id: String(comment.id),
        authorType: comment.author_type === "user" ? "user" : "client",
        authorName: comment.author_name || "",
        body: comment.body || "",
        createdAt: comment.created_at ?? "",
      })),
    };
  });
}

/** Open threads first, then by when they started. */
export function sortThreads(threads: readonly CommentThread[]): CommentThread[] {
  return [...threads].sort((a, b) => Number(a.resolved) - Number(b.resolved) || a.createdAt.localeCompare(b.createdAt));
}

export const openCount = (threads: readonly CommentThread[], section?: CommentSection) =>
  threads.filter((thread) => !thread.resolved && (!section || thread.section === section)).length;

/* ------------------------------------------------------------------ *
 * Finding highlighted text again (pure, so it can be tested)
 * ------------------------------------------------------------------ */

const ANCHOR_CONTEXT = 40;

/** Whitespace collapsed to single spaces — the same text whatever the layout. */
export const squash = (text: string) => text.replace(/\s+/g, " ");

/** What to store for a selection at [start, end) of a page's text: the words, and some text either side. */
export function placementOf(text: string, start: number, end: number): { quote: string; anchor: CommentAnchor } {
  return {
    quote: squash(text.slice(start, end)).trim(),
    anchor: {
      prefix: squash(text.slice(Math.max(0, start - ANCHOR_CONTEXT), start)),
      suffix: squash(text.slice(end, end + ANCHOR_CONTEXT)),
    },
  };
}

/**
 * Where a thread's quote is in a page's (squashed) text, or null when it's no
 * longer there. When the words appear more than once, the occurrence whose
 * surrounding text best matches the anchor wins.
 */
export function locateQuote(text: string, quote: string, anchor: CommentAnchor | null): { start: number; end: number } | null {
  const needle = squash(quote).trim();
  if (!needle) return null;
  const score = (at: number) => {
    if (!anchor) return 0;
    let points = 0;
    const before = text.slice(0, at);
    const after = text.slice(at + needle.length);
    const prefix = anchor.prefix.trim();
    const suffix = anchor.suffix.trim();
    for (let length = Math.min(prefix.length, 40); length > 0; length -= 1) {
      if (before.trimEnd().endsWith(prefix.slice(-length))) {
        points += length;
        break;
      }
    }
    for (let length = Math.min(suffix.length, 40); length > 0; length -= 1) {
      if (after.trimStart().startsWith(suffix.slice(0, length))) {
        points += length;
        break;
      }
    }
    return points;
  };
  let best: { start: number; points: number } | null = null;
  for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + 1)) {
    const points = score(at);
    if (!best || points > best.points) best = { start: at, points };
  }
  return best ? { start: best.start, end: best.start + needle.length } : null;
}

/* ------------------------------------------------------------------ *
 * The page's text, as text nodes — for selections and highlights
 * ------------------------------------------------------------------ */

type TextMap = { text: string; nodes: { node: Text; start: number; offsets: number[] }[] };

/**
 * The container's text with whitespace squashed, and where each squashed
 * character came from — so a quote found in the squashed text maps back to a
 * DOM Range.
 */
export function textMapOf(container: HTMLElement): TextMap {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes: TextMap["nodes"] = [];
  let text = "";
  let lastWasSpace = true;
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const raw = node.data;
    const offsets: number[] = [];
    const start = text.length;
    for (let i = 0; i < raw.length; i += 1) {
      const space = /\s/.test(raw[i]);
      if (space && lastWasSpace) continue;
      text += space ? " " : raw[i];
      offsets.push(i);
      lastWasSpace = space;
    }
    nodes.push({ node, start, offsets });
  }
  return { text, nodes };
}

/** A DOM Range over [start, end) of a container's squashed text. */
export function rangeFromOffsets(map: TextMap, start: number, end: number): Range | null {
  const point = (at: number, isEnd: boolean): [Text, number] | null => {
    for (const entry of map.nodes) {
      const index = at - entry.start;
      if (index >= 0 && index < entry.offsets.length) return [entry.node, entry.offsets[index]];
      if (isEnd && index === entry.offsets.length && entry.offsets.length) {
        return [entry.node, entry.offsets[entry.offsets.length - 1] + 1];
      }
    }
    return null;
  };
  const from = point(start, false);
  const to = point(end - 1, false);
  if (!from || !to) return null;
  const range = document.createRange();
  range.setStart(from[0], from[1]);
  range.setEnd(to[0], to[1] + 1);
  return range;
}

/** Where a selection Range falls in a container's squashed text. */
export function offsetsOfRange(map: TextMap, range: Range): { start: number; end: number } | null {
  const offsetOf = (node: Node, offset: number) => {
    const entry = map.nodes.find((candidate) => candidate.node === node);
    if (!entry) return null;
    const index = entry.offsets.findIndex((raw) => raw >= offset);
    return entry.start + (index === -1 ? entry.offsets.length : index);
  };
  const start = offsetOf(range.startContainer, range.startOffset);
  const end = offsetOf(range.endContainer, range.endOffset);
  return start === null || end === null || end <= start ? null : { start, end };
}

/* ------------------------------------------------------------------ *
 * Calls
 * ------------------------------------------------------------------ */

const enc = (token: string) => encodeURIComponent(token);

async function publicCall(path: string, method: "GET" | "POST" | "PATCH", body?: Record<string, unknown>) {
  const result = await apiRequest<unknown>(path, {
    method,
    auth: "public",
    ...(body ? { body: buildEncryptedRequestBody(body) } : {}),
  });
  if (!result.success) throw new Error(result.message || "Couldn't update the comments.");
  return mapThreads(result.data);
}

export type NewThread = { section: CommentSection; quote?: string; anchor?: CommentAnchor | null; body: string };

/* Client — the public link */

export const fetchPublicThreads = (token: string) => publicCall(apiRoutes.proposal.publicComments(enc(token)), "GET");

export const addPublicComment = (token: string, comment: NewThread | { threadId: string; body: string }) =>
  publicCall(
    apiRoutes.proposal.publicComments(enc(token)),
    "POST",
    "threadId" in comment
      ? { thread_id: comment.threadId, body: comment.body }
      : { section: comment.section, quote: comment.quote ?? "", anchor: comment.anchor ?? null, body: comment.body },
  );

export const resolvePublicThread = (token: string, threadId: string, resolved: boolean) =>
  publicCall(apiRoutes.proposal.publicComment(enc(token), threadId), "PATCH", { resolved });

/* Owner — the builder */

export async function fetchThreads(proposalId: string): Promise<CommentThread[]> {
  const response = await api.get<{ data?: unknown }>(apiRoutes.proposal.comments(proposalId));
  return mapThreads(response.data?.data);
}

export async function replyToThread(proposalId: string, threadId: string, body: string): Promise<CommentThread[]> {
  const response = await api.post<{ data?: unknown }>(
    apiRoutes.proposal.comments(proposalId),
    buildEncryptedRequestBody({ thread_id: threadId, body }),
  );
  return mapThreads(response.data?.data);
}

export async function resolveThread(proposalId: string, threadId: string, resolved: boolean): Promise<CommentThread[]> {
  const response = await api.patch<{ data?: unknown }>(
    apiRoutes.proposal.comment(proposalId, threadId),
    buildEncryptedRequestBody({ resolved }),
  );
  return mapThreads(response.data?.data);
}

export const threadsQueryKey = (proposalId: string) => ["proposal-comments", proposalId] as const;
export const publicThreadsQueryKey = (token: string) => ["proposal-public-comments", token] as const;
