// Preloaded into the CLI by the e2e tests (`node --import`): counts the requests it sends, by
// host, and writes them as JSON to the file named by SKILL_ATLAS_E2E_REQUESTS when it exits.
// The CLI's own output is untouched.
import { writeFileSync } from 'node:fs';

const requests: Record<string, number> = {};
const send = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const { host } = new URL(input instanceof Request ? input.url : String(input));
  requests[host] = (requests[host] ?? 0) + 1;
  return send(input, init);
};
process.on('exit', () => writeFileSync(process.env.SKILL_ATLAS_E2E_REQUESTS!, JSON.stringify(requests)));
