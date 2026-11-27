/**
 * The demo session: which industry/country this visitor is looking at, when the
 * visit ends, and the changes they've made.
 *
 * Everything lives in the visitor's own tab (window.name), never on a
 * server, so there is nothing to clean up and no route to anyone else's data:
 *
 *   - closing the tab ends the demo (the tab's window.name is discarded with it);
 *   - signing out ends it immediately (`endDemoSession`, called from the mock's
 *     /auth/logout);
 *   - a visit also expires after DEMO_SESSION_MINUTES (hard cap) or
 *     DEMO_IDLE_MINUTES without a heartbeat/request, checked on every call.
 *
 * What the visitor changes is kept as a short log of writes (`ops`) that is
 * replayed on top of the freshly generated seed after a reload, so a refresh
 * doesn't wipe their work, but a new visit always starts clean.
 */

import type { DemoCountry } from "./industries/types";

export interface DemoOp {
  method: string;
  url: string;
  params?: Record<string, unknown>;
  body: Record<string, unknown>;
}

export interface DemoSessionState {
  id: string;
  industry: string;
  country: DemoCountry;
  startedAt: number;
  expiresAt: number;
  lastSeenAt: number;
  ops: DemoOp[];
}

const STORAGE_KEY = "sole.demo.session.v1";
const MAX_OPS = 500;

const minutes = (raw: string | undefined, fallback: number) => {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/** Hard cap on one visit. Configurable per deployment. */
export const DEMO_SESSION_MINUTES = minutes(process.env.NEXT_PUBLIC_DEMO_SESSION_MINUTES, 120);
/** A visit not heard from (no request, no heartbeat) for this long is over. */
export const DEMO_IDLE_MINUTES = minutes(process.env.NEXT_PUBLIC_DEMO_IDLE_MINUTES, 30);

let memory: DemoSessionState | null = null;
const listeners = new Set<() => void>();

/*
 * Where the session is kept across a reload: `window.name`.
 *
 * It lives exactly as long as the tab (a new tab starts empty, closing the tab
 * discards it) which is the lifetime the demo wants. sessionStorage would be the
 * natural home, but the app's sign-out teardown (lib/api/teardown.ts) empties
 * all of it whenever a session is cleared — including the moment a page load
 * finds no tokens — which would end a visit that should simply continue.
 */
const NAME_PREFIX = `${STORAGE_KEY}=`;

function readRaw(): string | null {
  try {
    if (typeof window === "undefined") return null;
    return window.name.startsWith(NAME_PREFIX) ? window.name.slice(NAME_PREFIX.length) : null;
  } catch {
    return null;
  }
}

function writeRaw(raw: string | null) {
  try {
    if (typeof window === "undefined") return;
    if (raw) window.name = `${NAME_PREFIX}${raw}`;
    else if (window.name.startsWith(NAME_PREFIX)) window.name = "";
  } catch {
    // The session still works for this page load.
  }
}

function read(): DemoSessionState | null {
  if (memory) return memory;
  const raw = readRaw();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DemoSessionState;
    if (!parsed || typeof parsed.industry !== "string" || (parsed.country !== "AU" && parsed.country !== "NZ")) return null;
    memory = { ...parsed, ops: Array.isArray(parsed.ops) ? parsed.ops : [] };
    return memory;
  } catch {
    return null;
  }
}

function write(state: DemoSessionState | null) {
  memory = state;
  writeRaw(state ? JSON.stringify(state) : null);
}

export function isExpired(state: DemoSessionState, now = Date.now()): boolean {
  return now >= state.expiresAt || now - state.lastSeenAt >= DEMO_IDLE_MINUTES * 60_000;
}

/** The live session, or null. An expired one is removed on the way out. */
export function getActiveSession(now = Date.now()): DemoSessionState | null {
  const state = read();
  if (!state) return null;
  if (isExpired(state, now)) {
    endDemoSession();
    return null;
  }
  return state;
}

/** Whether a stored session exists but has run out (so the UI can say "your demo has ended"). */
export function hasExpiredSession(now = Date.now()): boolean {
  const state = read();
  return Boolean(state && isExpired(state, now));
}

export function startDemoSession(input: { industry: string; country: DemoCountry }, now = Date.now()): DemoSessionState {
  const state: DemoSessionState = {
    id: `demo_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    industry: input.industry,
    country: input.country,
    startedAt: now,
    expiresAt: now + DEMO_SESSION_MINUTES * 60_000,
    lastSeenAt: now,
    ops: [],
  };
  write(state);
  notify();
  return state;
}

export function endDemoSession() {
  write(null);
  notify();
}

/** "This tab is still here" — keeps the visit from going idle. */
export function touchSession(now = Date.now()): DemoSessionState | null {
  const state = read();
  if (!state || isExpired(state, now)) return null;
  state.lastSeenAt = now;
  write(state);
  return state;
}

/** Keep a write so it can be replayed after a reload. Ignores anything that can't be stored. */
export function recordOp(op: DemoOp) {
  const state = read();
  if (!state) return;
  let safe: DemoOp;
  try {
    safe = JSON.parse(JSON.stringify(op)) as DemoOp;
  } catch {
    return;
  }
  state.ops.push(safe);
  if (state.ops.length > MAX_OPS) state.ops.splice(0, state.ops.length - MAX_OPS);
  write(state);
}

/** Called when the active session changes, so the mock drops its cached data. */
export function onSessionChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  for (const listener of listeners) listener();
}

/** For tests. */
export function __resetSessionForTests() {
  memory = null;
  listeners.clear();
}
