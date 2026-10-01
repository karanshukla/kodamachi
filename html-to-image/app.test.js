import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import { createApp, createBrowserPool, isAllowedRequest, CHROMIUM_LAUNCH_ARGS, MAX_CONCURRENT_RENDERS } from './app.js';

function startServer(getBrowser, options) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(createApp(getBrowser, options));
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, url: `http://127.0.0.1:${server.address().port}` });
    });
    server.on('error', reject);
  });
}

async function waitFor(predicate, { timeoutMs = 2000, intervalMs = 5 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('waitFor: timed out');
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

function stopServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

// Mock page writes dummy bytes so createReadStream succeeds.
function makeMockBrowser({ failScreenshot = false } = {}) {
  const calls = { setRequestInterception: [], requestHandlers: [], setViewport: [], setContent: [], evaluate: [], waitForFunction: [], screenshot: [] };
  const page = {
    setRequestInterception: async (value) => { calls.setRequestInterception.push(value); },
    on: (event, handler) => { if (event === 'request') calls.requestHandlers.push(handler); },
    setViewport: async (opts) => { calls.setViewport.push(opts); },
    setContent:  async (html) => { calls.setContent.push(html); },
    evaluate:    async (fn)   => { calls.evaluate.push(fn); return Promise.resolve(); },
    waitForFunction: async (fn, opts) => { calls.waitForFunction.push({ fn, opts }); return Promise.resolve(); },
    screenshot:  async (args) => {
      calls.screenshot.push({ ...args });
      if (failScreenshot) throw new Error('screenshot failed');
      if (args.path) await fs.writeFile(args.path, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    },
    close: async () => {},
  };
  const browser = { newPage: async () => page, connected: true };
  return { browser, calls };
}

async function post(url, body, extraHeaders = {}) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    body: JSON.stringify(body),
  });
}

describe('GET /', () => {
  let server, url;
  before(async () => ({ server, url } = await startServer(async () => { throw new Error('no browser'); })));
  after(() => stopServer(server));

  test('returns 200 with status ok', async () => {
    const res = await fetch(url);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: 'ok' });
  });
});

describe('POST /warm', () => {
  test('invokes warm and returns 200', async () => {
    let warmed = 0;
    const { server, url } = await startServer(async () => { throw new Error('no browser'); }, {
      warm: async () => { warmed++; },
    });
    try {
      const res = await fetch(`${url}/warm`, { method: 'POST' });
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { status: 'warm' });
      assert.equal(warmed, 1);
    } finally {
      await stopServer(server);
    }
  });

  test('is not rejected by the render validation that requires a source body', async () => {
    const { server, url } = await startServer(async () => { throw new Error('no browser'); }, {
      warm: async () => {},
    });
    try {
      const res = await post(`${url}/warm`, {});
      assert.equal(res.status, 200);
    } finally {
      await stopServer(server);
    }
  });

  test('returns 503 when the browser cannot be launched', async () => {
    const { server, url } = await startServer(async () => { throw new Error('no browser'); }, {
      warm: async () => { throw new Error('launch failed'); },
    });
    try {
      const res = await fetch(`${url}/warm`, { method: 'POST' });
      assert.equal(res.status, 503);
      assert.match((await res.json()).error, /launch failed/);
    } finally {
      await stopServer(server);
    }
  });
});

describe('POST / validation', () => {
  let server, url;
  before(async () => ({ server, url } = await startServer(async () => { throw new Error('no browser'); })));
  after(() => stopServer(server));

  test('rejects non-POST methods with 405', async () => {
    const res = await fetch(`${url}/`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(res.status, 405);
  });

  test('rejects wrong Content-Type with 415', async () => {
    const res = await fetch(`${url}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'hello',
    });
    assert.equal(res.status, 415);
  });

  test('rejects missing source with 400', async () => {
    const res = await post(url, { format: 'png' });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /source/);
  });

  test('rejects non-string source with 400', async () => {
    const res = await post(url, { source: 42, format: 'png' });
    assert.equal(res.status, 400);
  });

  test('rejects empty source with 400', async () => {
    const res = await post(url, { source: '', format: 'png' });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /empty/);
  });

  test('rejects missing format with 400', async () => {
    const res = await post(url, { source: '<h1>hi</h1>' });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /format/);
  });

  test('rejects unknown format with 400', async () => {
    const res = await post(url, { source: '<h1>hi</h1>', format: 'bmp' });
    assert.equal(res.status, 400);
  });

  test('rejects array options with 400', async () => {
    const res = await post(url, { source: '<h1>hi</h1>', format: 'png', options: ['bad'] });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /options/);
  });

  test('rejects string options with 400', async () => {
    const res = await post(url, { source: '<h1>hi</h1>', format: 'png', options: 'bad' });
    assert.equal(res.status, 400);
  });
});

describe('POST / browser unavailable', () => {
  let server, url;
  before(async () => ({ server, url } = await startServer(async () => { throw new Error('crashed'); })));
  after(() => stopServer(server));

  test('returns 503 when getBrowser throws', async () => {
    const res = await post(url, { source: '<h1>hi</h1>', format: 'png' });
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.match(body.error, /Browser unavailable/);
  });
});

describe('POST / HTML source', () => {
  let server, url, calls;

  before(async () => {
    const { browser, calls: c } = makeMockBrowser();
    calls = c;
    ({ server, url } = await startServer(async () => browser));
  });
  after(() => stopServer(server));

  test('returns 200 with image/png content-type', async () => {
    const res = await post(url, { source: '<h1>Hello</h1>', format: 'png' });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /image\/png/);
  });

  test('renders the source in place rather than navigating to it', () => {
    assert.equal(calls.setContent[0], '<h1>Hello</h1>');
  });

  test('intercepts requests before the source loads', () => {
    assert.deepEqual(calls.setRequestInterception, [true]);
    assert.equal(calls.requestHandlers.length, 1);
  });

  test('continues allowed requests and aborts the rest', () => {
    const handle = calls.requestHandlers[0];
    const outcomes = [];
    const request = (url) => ({
      url: () => url,
      continue: () => outcomes.push(['continue', url]),
      abort: () => outcomes.push(['abort', url]),
    });
    handle(request('https://cdn.bsky.app/a.jpg'));
    handle(request('file:///etc/passwd'));
    assert.deepEqual(outcomes, [
      ['continue', 'https://cdn.bsky.app/a.jpg'],
      ['abort', 'file:///etc/passwd'],
    ]);
  });

  test('uses default viewport 1920x1080 when options omitted', () => {
    assert.deepEqual(calls.setViewport[0], { width: 1920, height: 1080 });
  });

  test('waits for visual readiness (fonts + images) before screenshotting', () => {
    assert.ok(calls.waitForFunction.length > 0, 'waitForFunction was not called');
    assert.ok(calls.evaluate.length > 0, 'evaluate (fonts.ready) was not called');
    const shotIdx = 0; // first screenshot in this describe block
    assert.ok(calls.screenshot.length > shotIdx, 'screenshot was not called');
  });

  test('evaluate callback waits on document.fonts.ready when present', async () => {
    // The callback runs in the browser; the mock only records it, so invoke it against a fake `document`.
    const fn = calls.evaluate[0];
    let readAccessed = false;
    globalThis.document = { fonts: { get ready() { readAccessed = true; return Promise.resolve(); } } };
    try {
      await fn();
    } finally {
      delete globalThis.document;
    }
    assert.ok(readAccessed, 'document.fonts.ready was not read');
  });

  test('evaluate callback resolves without document.fonts', async () => {
    globalThis.document = {};
    try {
      await calls.evaluate[0]();
    } finally {
      delete globalThis.document;
    }
  });

  test('waitForFunction predicate checks every image is complete with non-zero naturalWidth', () => {
    // Same: the predicate runs in-page, so invoke it against a fake `document.images`.
    const predicate = calls.waitForFunction[0].fn;
    globalThis.document = { images: [{ complete: true, naturalWidth: 10 }] };
    try {
      assert.equal(predicate(), true);
      globalThis.document.images = [{ complete: false, naturalWidth: 0 }];
      assert.equal(predicate(), false);
      globalThis.document.images = [{ complete: true, naturalWidth: 0 }];
      assert.equal(predicate(), false);
      globalThis.document.images = [];
      assert.equal(predicate(), true);
    } finally {
      delete globalThis.document;
    }
  });

  test('passes type:png to page.screenshot', () => {
    assert.equal(calls.screenshot[0].type, 'png');
    assert.ok(calls.screenshot[0].path);
  });

  test('URL string passed as source is treated as HTML, not navigated to', async () => {
    const { browser, calls: c } = makeMockBrowser();
    const { server: s, url: u } = await startServer(async () => browser);
    try {
      await post(u, { source: 'https://example.com', format: 'png' });
      assert.equal(c.setContent[0], 'https://example.com');
    } finally {
      await stopServer(s);
    }
  });

  test('a waitForFunction timeout (slow-loading images) does not fail the render', async () => {
    const page = {
      setRequestInterception: async () => {},
      on: () => {},
      setViewport: async () => {},
      setContent: async () => {},
      evaluate: async () => {},
      waitForFunction: async () => { throw new Error('timed out waiting for images'); },
      screenshot: async (args) => {
        if (args.path) await fs.writeFile(args.path, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      },
      close: async () => {},
    };
    const browser = { newPage: async () => page, connected: true };
    const { server: s, url: u } = await startServer(async () => browser);
    try {
      const res = await post(u, { source: '<h1>Hello</h1>', format: 'png' });
      assert.equal(res.status, 200);
    } finally {
      await stopServer(s);
    }
  });
});

describe('POST / custom viewport', () => {
  let server, url, calls;

  before(async () => {
    const { browser, calls: c } = makeMockBrowser();
    calls = c;
    ({ server, url } = await startServer(async () => browser));
  });
  after(() => stopServer(server));

  test('uses options.width and options.height for viewport', async () => {
    await post(url, { source: '<h1>hi</h1>', format: 'png', options: { width: 800, height: 600 } });
    assert.deepEqual(calls.setViewport[0], { width: 800, height: 600 });
  });
});

describe('POST / options.args passthrough', () => {
  let server, url, calls;

  before(async () => {
    const { browser, calls: c } = makeMockBrowser();
    calls = c;
    ({ server, url } = await startServer(async () => browser));
  });
  after(() => stopServer(server));

  test('merges options.args into screenshot call', async () => {
    await post(url, {
      source: '<h1>hi</h1>',
      format: 'png',
      options: { args: { fullPage: true } },
    });
    assert.equal(calls.screenshot[0].fullPage, true);
    assert.equal(calls.screenshot[0].type, 'png');
  });

  test('format.args overrides options.args for conflicting keys', async () => {
    await post(url, {
      source: '<h1>hi</h1>',
      format: 'png',
      options: { args: { type: 'jpeg' } },
    });
    assert.equal(calls.screenshot[1].type, 'png');
  });
});

describe('POST / jpg and webp formats', () => {
  let server, url, calls;

  before(async () => {
    const { browser, calls: c } = makeMockBrowser();
    calls = c;
    ({ server, url } = await startServer(async () => browser));
  });
  after(() => stopServer(server));

  test('jpg returns image/jpeg and type:jpeg to Puppeteer', async () => {
    const res = await post(url, { source: '<h1>hi</h1>', format: 'jpg' });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /image\/jpeg/);
    assert.equal(calls.screenshot[0].type, 'jpeg');
  });

  test('jpeg alias returns image/jpeg', async () => {
    const res = await post(url, { source: '<h1>hi</h1>', format: 'jpeg' });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /image\/jpeg/);
  });

  test('webp returns image/webp and type:webp to Puppeteer', async () => {
    const res = await post(url, { source: '<h1>hi</h1>', format: 'webp' });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /image\/webp/);
    assert.equal(calls.screenshot[calls.screenshot.length - 1].type, 'webp');
  });
});

describe('POST / screenshot failure', () => {
  let server, url;

  before(async () => {
    const { browser } = makeMockBrowser({ failScreenshot: true });
    ({ server, url } = await startServer(async () => browser));
  });
  after(() => stopServer(server));

  test('returns 500 when screenshot throws', async () => {
    const res = await post(url, { source: '<h1>hi</h1>', format: 'png' });
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.match(body.error, /screenshot failed/);
  });
});

describe('POST / concurrency limiting', () => {
  test(`caps concurrent renders at MAX_CONCURRENT_RENDERS (${MAX_CONCURRENT_RENDERS})`, async () => {
    let inFlight = 0;
    let maxObservedInFlight = 0;
    let releaseGate;
    const gate = new Promise((resolve) => { releaseGate = resolve; });

    const page = {
      setRequestInterception: async () => {},
      on: () => {},
      setViewport: async () => {},
      setContent: async () => {},
      evaluate: async () => {},
      waitForFunction: async () => {},
      screenshot: async (args) => {
        inFlight++;
        maxObservedInFlight = Math.max(maxObservedInFlight, inFlight);
        await gate;
        inFlight--;
        if (args.path) await fs.writeFile(args.path, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      },
      close: async () => {},
    };
    const browser = { newPage: async () => page, connected: true };
    const { server, url } = await startServer(async () => browser);

    try {
      const requestCount = MAX_CONCURRENT_RENDERS + 2;
      const responses = Array.from({ length: requestCount }, () =>
        post(url, { source: '<h1>hi</h1>', format: 'png' })
      );

      // Only MAX_CONCURRENT_RENDERS may reach the screenshot; the rest queue on the semaphore.
      await waitFor(() => maxObservedInFlight === MAX_CONCURRENT_RENDERS);
      assert.equal(inFlight, MAX_CONCURRENT_RENDERS, 'excess requests should be queued, not running');

      releaseGate();
      const results = await Promise.all(responses);
      for (const res of results) assert.equal(res.status, 200);
      assert.equal(maxObservedInFlight, MAX_CONCURRENT_RENDERS, 'cap should never be exceeded, even across queued waves');
    } finally {
      await stopServer(server);
    }
  });
});

describe('POST / onRenderComplete callback', () => {
  test('invokes onRenderComplete with the remaining active-render count on success', async () => {
    const { browser } = makeMockBrowser();
    const observed = [];
    const { server, url } = await startServer(async () => browser, {
      onRenderComplete: (activeRenders) => observed.push(activeRenders),
    });

    try {
      const res = await post(url, { source: '<h1>hi</h1>', format: 'png' });
      assert.equal(res.status, 200);
      assert.deepEqual(observed, [0]);
    } finally {
      await stopServer(server);
    }
  });

  test('invokes onRenderComplete even when the render fails', async () => {
    const { browser } = makeMockBrowser({ failScreenshot: true });
    const observed = [];
    const { server, url } = await startServer(async () => browser, {
      onRenderComplete: (activeRenders) => observed.push(activeRenders),
    });

    try {
      const res = await post(url, { source: '<h1>hi</h1>', format: 'png' });
      assert.equal(res.status, 500);
      assert.deepEqual(observed, [0]);
    } finally {
      await stopServer(server);
    }
  });

  test('invokes onRenderComplete when the browser is unavailable', async () => {
    const observed = [];
    const { server, url } = await startServer(async () => { throw new Error('crashed'); }, {
      onRenderComplete: (activeRenders) => observed.push(activeRenders),
    });

    try {
      const res = await post(url, { source: '<h1>hi</h1>', format: 'png' });
      assert.equal(res.status, 503);
      assert.deepEqual(observed, [0]);
    } finally {
      await stopServer(server);
    }
  });
});

describe('createBrowserPool', () => {
  function makeLaunchSpy({ failFirst = false } = {}) {
    const launched = [];
    const launch = async () => {
      if (failFirst && launched.length === 0) {
        launched.push(null);
        throw new Error('launch failed');
      }
      const browser = {
        connected: true,
        closed: false,
        close: async () => { browser.closed = true; browser.connected = false; },
      };
      launched.push(browser);
      return browser;
    };
    return { launch, launched };
  }

  test('does not launch a browser until the first render is requested', async () => {
    const { launch, launched } = makeLaunchSpy();
    createBrowserPool({ launch });
    assert.equal(launched.length, 0, 'browser must not launch at boot — an idle Chromium keeps Railway awake');
  });

  test('launches on first getBrowser and reuses the same instance', async () => {
    const { launch, launched } = makeLaunchSpy();
    const pool = createBrowserPool({ launch });

    const first = await pool.getBrowser();
    const second = await pool.getBrowser();

    assert.equal(launched.length, 1);
    assert.equal(first, second);
  });

  test('closes the browser once idle so the container falls silent', async () => {
    const { launch, launched } = makeLaunchSpy();
    const pool = createBrowserPool({ launch, idleTimeoutMs: 5 });

    await pool.getBrowser();
    pool.onRenderComplete(0);

    await waitFor(() => launched[0].closed);
    assert.ok(launched[0].closed);
  });

  test('does not close while a render is still in flight', async () => {
    const { launch, launched } = makeLaunchSpy();
    const pool = createBrowserPool({ launch, idleTimeoutMs: 5 });

    await pool.getBrowser();
    pool.onRenderComplete(1);

    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(launched[0].closed, false);
  });

  test('a new request before the idle deadline cancels the close', async () => {
    const { launch, launched } = makeLaunchSpy();
    const pool = createBrowserPool({ launch, idleTimeoutMs: 30 });

    const first = await pool.getBrowser();
    pool.onRenderComplete(0);
    const second = await pool.getBrowser();

    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(first, second);
    assert.equal(launched.length, 1);
    assert.equal(launched[0].closed, false, 'idle timer should have been cancelled by the new request');
  });

  test('relaunches after an idle close', async () => {
    const { launch, launched } = makeLaunchSpy();
    const pool = createBrowserPool({ launch, idleTimeoutMs: 5 });

    await pool.getBrowser();
    pool.onRenderComplete(0);
    await waitFor(() => launched[0].closed);

    const revived = await pool.getBrowser();
    assert.equal(launched.length, 2);
    assert.equal(revived, launched[1]);
    assert.equal(revived.closed, false);
  });

  test('closes immediately once the render budget is spent', async () => {
    const { launch, launched } = makeLaunchSpy();
    const pool = createBrowserPool({ launch, idleTimeoutMs: 60_000, rendersBeforeRecycle: 2 });

    await pool.getBrowser();
    pool.onRenderComplete(0);
    assert.equal(launched[0].closed, false);

    pool.onRenderComplete(0);
    await waitFor(() => launched[0].closed);
  });

  test('the render budget resets on relaunch', async () => {
    const { launch, launched } = makeLaunchSpy();
    const pool = createBrowserPool({ launch, idleTimeoutMs: 60_000, rendersBeforeRecycle: 2 });

    await pool.getBrowser();
    pool.onRenderComplete(0);
    pool.onRenderComplete(0);
    await waitFor(() => launched[0].closed);

    await pool.getBrowser();
    pool.onRenderComplete(0);
    assert.equal(launched[1].closed, false, 'counter should restart with the new browser');
  });

  test('a failed launch is not cached — the next request retries', async () => {
    const { launch, launched } = makeLaunchSpy({ failFirst: true });
    const pool = createBrowserPool({ launch });

    await assert.rejects(() => pool.getBrowser(), /launch failed/);
    const browser = await pool.getBrowser();

    assert.equal(launched.length, 2);
    assert.equal(browser.connected, true);
  });

  test('replaces a crashed browser', async () => {
    const { launch, launched } = makeLaunchSpy();
    const pool = createBrowserPool({ launch });

    const first = await pool.getBrowser();
    first.connected = false;

    const second = await pool.getBrowser();
    assert.notEqual(second, first);
    assert.equal(second.connected, true);
    assert.equal(launched.length, 2);
  });

  test('a second caller racing a crash reuses the relaunch the first caller already started', async () => {
    // Two concurrent callers see the same crashed browser; only one may discard-and-relaunch.
    const { launch, launched } = makeLaunchSpy();
    const pool = createBrowserPool({ launch });

    const first = await pool.getBrowser();
    first.connected = false;

    const [a, b] = await Promise.all([pool.getBrowser(), pool.getBrowser()]);
    assert.equal(a, b, 'both concurrent callers should resolve to the same relaunched browser');
    assert.equal(a.connected, true);
    assert.equal(launched.length, 2, 'the crash must trigger exactly one relaunch, not one per caller');
  });

  test('discard swallows a rejected browser promise during close', async () => {
    // discard() on a still-rejecting launch (never awaited) must not throw.
    const pool = createBrowserPool({ launch: async () => { throw new Error('launch failed'); } });

    const pending = pool.getBrowser();
    pending.catch(() => {}); // avoid an unhandled rejection from the in-flight call

    await assert.doesNotReject(() => pool.shutdown());
  });

  test('discard swallows a browser.close() rejection during idle-close', async () => {
    let launchCount = 0;
    const launch = async () => {
      launchCount++;
      return { connected: true, close: async () => { throw new Error('close failed'); } };
    };
    const pool = createBrowserPool({ launch, idleTimeoutMs: 5 });

    await pool.getBrowser();
    pool.onRenderComplete(0);

    // A failed close() must not wedge the pool: the next getBrowser() relaunches.
    await waitFor(() => launchCount === 1);
    await new Promise((resolve) => setTimeout(resolve, 15));
    const revived = await pool.getBrowser();
    assert.equal(revived.connected, true);
    assert.equal(launchCount, 2, 'pool should have relaunched after the idle close');
  });

  test('warm launches the browser ahead of any render', async () => {
    const { launch, launched } = makeLaunchSpy();
    const pool = createBrowserPool({ launch });

    await pool.warm();

    assert.equal(launched.length, 1);
    assert.equal(launched[0].connected, true);
  });

  test('a warm that is never followed by a render still closes on idle', async () => {
    // Without warm() arming the idle close, an abandoned composer pins Chromium up forever.
    const { launch, launched } = makeLaunchSpy();
    const pool = createBrowserPool({ launch, idleTimeoutMs: 5 });

    await pool.warm();

    await waitFor(() => launched[0].closed);
    assert.ok(launched[0].closed);
  });

  test('a render arriving after a warm reuses the warmed browser and defers the close', async () => {
    const { launch, launched } = makeLaunchSpy();
    const pool = createBrowserPool({ launch, idleTimeoutMs: 30 });

    await pool.warm();
    const rendered = await pool.getBrowser();

    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(launched.length, 1, 'the render must not launch a second browser');
    assert.equal(rendered, launched[0]);
    assert.equal(launched[0].closed, false, 'getBrowser should have cancelled the warm idle timer');
  });

  test('warm surfaces a launch failure to its caller', async () => {
    const pool = createBrowserPool({ launch: async () => { throw new Error('launch failed'); } });

    await assert.rejects(() => pool.warm(), /launch failed/);
  });

  test('shutdown closes a running browser', async () => {
    const { launch, launched } = makeLaunchSpy();
    const pool = createBrowserPool({ launch });

    await pool.getBrowser();
    await pool.shutdown();

    assert.equal(launched[0].closed, true);
  });

  test('shutdown is a no-op when no browser was ever launched', async () => {
    const { launch, launched } = makeLaunchSpy();
    const pool = createBrowserPool({ launch });

    await pool.shutdown();
    assert.equal(launched.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Chromium launch flags
// ---------------------------------------------------------------------------
describe('CHROMIUM_LAUNCH_ARGS', () => {
  test('disables the background subsystems that keep the container chattering', () => {
    // Each emits outbound packets on a timer with no page open, resetting Railway's inactivity window.
    for (const flag of [
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-domain-reliability',
      '--safebrowsing-disable-auto-update',
      '--no-pings',
    ]) {
      assert.ok(CHROMIUM_LAUNCH_ARGS.includes(flag), `missing ${flag}`);
    }
    // MediaRouter/DIAL do mDNS + SSDP multicast discovery on a loop.
    const features = CHROMIUM_LAUNCH_ARGS.find((arg) => arg.startsWith('--disable-features='));
    assert.match(features, /MediaRouter/);
    assert.match(features, /DialMediaRouteProvider/);
  });

  test('keeps the container-required sandbox and shm flags', () => {
    assert.ok(CHROMIUM_LAUNCH_ARGS.includes('--no-sandbox'));
    assert.ok(CHROMIUM_LAUNCH_ARGS.includes('--disable-dev-shm-usage'));
  });
});

describe('isAllowedRequest', () => {
  test('lets data: and https: requests through', () => {
    assert.equal(isAllowedRequest('data:image/png;base64,AAAA'), true);
    assert.equal(isAllowedRequest('https://fonts.gstatic.com/s/notosans/v1/a.woff2'), true);
  });

  test('aborts file:, http: and other requests', () => {
    for (const url of ['file:///etc/hosts', 'http://localhost:3000/', 'http://10.0.0.1/', 'chrome://version', 'ftp://example.com/']) {
      assert.equal(isAllowedRequest(url), false, url);
    }
  });
});
