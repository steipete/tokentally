export type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
