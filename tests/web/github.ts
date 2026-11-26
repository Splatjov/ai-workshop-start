// GitHub for the web view's tests: answered from tests/web/recording.ts, never from the network.
import type { BrowserContext, Page } from '@playwright/test';
import { RECORDING } from './recording.ts';

export type Recorded = {
  /** The URLs asked for, as they come. */
  requests: string[];
  /** The URLs answered, as they are. */
  answered: string[];
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
  const errors: string[] = [];
  const holds: { pattern: RegExp; open: Promise<void> }[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await context.route(/^https:\/\/(api\.github\.com|raw\.githubusercontent\.com)\//, async (route) => {
    const url = route.request().url();
    requests.push(url);
    const answer = RECORDING[url];
    for (const { pattern, open } of holds) if (pattern.test(url)) await open;
    if (!answer) return route.abort('internetdisconnected');
    await route.fulfill({
      status: answer.status,
      body: typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body),
      headers: { 'access-control-allow-origin': '*' },
    });
    answered.push(url);
  });
  const slow = (repository: string) => {
    let release!: () => void;
    holds.push({ pattern: new RegExp(`/${repository}[/?]`), open: new Promise((resolve) => (release = resolve)) });
    return release;
  };
  return { requests, answered, errors, slow };
}

export async function scan(page: Page, url: string) {
  await page.getByLabel('Repository link').fill(url);
  await page.getByRole('button', { name: 'Scan' }).click();
}

export const skillButtons = (page: Page) => page.getByRole('navigation', { name: 'Skills' }).getByRole('button');
export const chosen = (page: Page) => page.getByRole('region', { name: /: SKILL\.md$/ });
export const examples = (page: Page) => page.getByRole('navigation', { name: 'Examples' }).getByRole('link');
