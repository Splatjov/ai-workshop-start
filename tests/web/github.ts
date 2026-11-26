// GitHub for the web view's tests: answered from tests/web/recording.ts, never from the network.
import { expect, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { answer as text } from '../../src/core/replay.ts';
import { ink, typeLoaded } from './in-page.js';
import { RECORDING } from './recording.ts';

export type Recorded = {
  /** The URLs asked for, as they come. */
  requests: string[];
  /** The URLs answered, as they are. */
  answered: string[];
  /** The Authorization header of each request to the GitHub API. */
  authorizations: (string | undefined)[];
  /** The errors thrown in the page. */
  errors: string[];
  /** Holds GitHub's answers for a repository until the returned function is called: a slow repository. */
  slow(repository: string): () => void;
};

/**
 * Answers GitHub's requests from the recording, in every tab of the context; anything else on
 * GitHub fails, as the network would.
 */
export async function recorded(page: Page, context: BrowserContext = page.context()): Promise<Recorded> {
  const requests: string[] = [];
  const answered: string[] = [];
  const authorizations: (string | undefined)[] = [];
  const errors: string[] = [];
  const holds: { pattern: RegExp; open: Promise<void> }[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await context.route(/^https:\/\/(api\.github\.com|raw\.githubusercontent\.com)\//, async (route) => {
    const url = route.request().url();
    requests.push(url);
    if (url.startsWith('https://api.github.com/')) authorizations.push(route.request().headers().authorization);
    const answer = RECORDING[url];
    for (const { pattern, open } of holds) if (pattern.test(url)) await open;
    if (!answer) return route.abort('internetdisconnected');
    await route.fulfill({
      status: answer.status,
      body: text(answer, route.request().postData() ?? ''),
      headers: { 'access-control-allow-origin': '*' },
    });
    answered.push(url);
  });
  const slow = (repository: string) => {
    let release!: () => void;
    holds.push({ pattern: new RegExp(`/${repository}[/?]`), open: new Promise((resolve) => (release = resolve)) });
    return release;
  };
  return { requests, answered, authorizations, errors, slow };
}

export async function scan(page: Page, url: string) {
  await page.getByLabel('Repository link').fill(url);
  await page.getByRole('button', { name: 'Scan' }).click();
}

export const skillButtons = (page: Page) => page.getByRole('navigation', { name: 'Skills' }).getByRole('button');
export const chosen = (page: Page) => page.getByRole('region', { name: /: SKILL\.md$/ });
export const filterField = (page: Page) => page.getByLabel('Filter skills');
export const examples = (page: Page) => page.getByRole('navigation', { name: 'Examples' }).getByRole('link');

export const sky = (page: Page) => page.locator('canvas.sky');
export const place = (page: Page, name: string) => page.locator('[data-place]').filter({ hasText: new RegExp(`^${name}$`) });
/** A world's name on the sky: `owner/repo`, in lower case. */
export const world = (page: Page, key: string) => page.locator(`[data-world="${key}"]`);
export const worldButtons = (page: Page) => page.getByRole('navigation', { name: 'Worlds' }).getByRole('button');

/**
 * Where something named on the sky is, on the page, once it has come to rest: its name's element is
 * a point there, placed by the engine a frame or more after the page wrote it.
 */
export async function where(page: Page, named: Locator): Promise<{ x: number; y: number }> {
  await page.evaluate(typeLoaded); // the page is laid out as it will stay
  await expect(named).toHaveAttribute('style', /translate3d/);
  let last = await named.boundingBox();
  await expect
    .poll(
      async () => {
        const next = await named.boundingBox();
        const rested = next !== null && last !== null && next.x === last.x && next.y === last.y;
        last = next;
        return rested;
      },
      { intervals: [150] },
    )
    .toBe(true);
  return { x: last!.x, y: last!.y };
}

/** The ink on a sky that has stopped changing: for a still sky, to compare what is drawn. */
export async function rested(page: Page) {
  let last = await page.evaluate(ink);
  await expect
    .poll(
      async () => {
        const next = await page.evaluate(ink);
        const same = next.weight === last.weight;
        last = next;
        return same;
      },
      { intervals: [200] },
    )
    .toBe(true);
  return last;
}

/** `?repo=<URL>&repo=<URL>`: the address that charts these repositories. */
export const address = (ids: string[], more = '') => `./?${ids.map((id) => `repo=${encodeURIComponent(`https://github.com/${id}`)}`).join('&')}${more}`;
