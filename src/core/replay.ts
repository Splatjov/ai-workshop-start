import type { Fetch } from './github.ts';

/**
 * One recorded GitHub answer: the status and the body, JSON or text; or, for a POST, as GraphQL
 * is asked, a function from the request's body to the answer's.
 */
export type Recorded = { status: number; body: unknown };

/** The answer's body as text, for the request's body. */
export function answer({ body }: Recorded, request = ''): string {
  const value: unknown = typeof body === 'function' ? body(request) : body;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/** Recorded answers by request URL. */
export type Recording = Record<string, Recorded>;

/**
 * A fetch that answers from a recording. Any other URL goes to `fallback`,
 * or fails, so a replay never reaches the network by accident.
 */
export function replay(recording: Recording, fallback?: Fetch): Fetch {
  return async (url, init) => {
    if (Object.hasOwn(recording, url)) {
      return new Response(answer(recording[url], init?.body), { status: recording[url].status });
    }
    if (fallback) return fallback(url, init);
    throw new Error(`not recorded: ${url}`);
  };
}
