// GitHub for the web view's tests: answered from tests/web/recording.ts, never from the network.
import type { Page } from '@playwright/test';
import { RECORDING } from './recording.ts';

/**
 * Answers the page's GitHub requests from the recording; anything else on GitHub fails, as the
 * network would. Returns the URLs asked for and the errors thrown in the page, as they come.
 */
export async function recorded(page: Page): Promise<{ requests: string[]; errors: string[] }> {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route(/^https:\/\/(api\.github\.com|raw\.githubusercontent\.com)\//, async (route) => {
    const url = route.request().url();
    requests.push(url);
    const answer = RECORDING[url];
    if (!answer) return route.abort('internetdisconnected');
    await route.fulfill({
      status: answer.status,
      body: typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body),
      headers: { 'access-control-allow-origin': '*' },
    });
  });
  return { requests, errors };
}

export async function scan(page: Page, url: string) {
  await page.getByLabel('Repository link').fill(url);
  await page.getByRole('button', { name: 'Scan' }).click();
}

export const skillButtons = (page: Page) => page.getByRole('navigation', { name: 'Skills' }).getByRole('button');
export const chosen = (page: Page) => page.getByRole('region', { name: /: SKILL\.md$/ });
