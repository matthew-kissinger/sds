// SPDX-License-Identifier: AGPL-3.0-or-later
import { WorkerEntrypoint } from 'cloudflare:workers';

/** Private service entrypoint: serve the game without recursively fetching /r/*. */
export default class InviteShell extends WorkerEntrypoint<{ ASSETS: Fetcher }> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url); url.pathname = '/'; url.search = '';
    const response = await this.env.ASSETS.fetch(new Request(url, { method: 'GET' }));
    const result = new Response(response.body, response);
    result.headers.set('Cache-Control', 'private, no-store');
    result.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return result;
  }
}
