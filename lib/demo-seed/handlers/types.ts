import type { DemoCountryConfig } from "../country";
import type { SeedData } from "../generator";
import type { Story } from "../story";

/** What a demo API answer looks like. `data` may be a Blob for document previews. */
export interface HandlerResponse {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  headers?: Record<string, string>;
  message?: string;
}

export interface HandlerCtx {
  /** Upper-case HTTP method. */
  method: string;
  /** Path with the `/api` prefix and any trailing slash removed, query string excluded. */
  path: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: Record<string, any>;
  /** The decoded request body (AES envelope opened). Evaluated lazily. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fields: () => Record<string, any>;
  seed: SeedData;
  story: Story;
  cfg: DemoCountryConfig;
  /** Today as YYYY-MM-DD. */
  today: string;
}

/**
 * One feature's slice of the demo API. Return null to pass the request on to the next
 * handler (and finally to mock-server.ts's generic ones). A handler that changes data
 * must do so by mutating `ctx.seed`, so the change shows up on the next read and is
 * replayed after a reload; it must be deterministic given the same sequence of calls.
 */
export type DemoHandler = (ctx: HandlerCtx) => HandlerResponse | null;
