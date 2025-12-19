/** Minimal `fetch` signature used by tokentally's Node helpers. */
export type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
