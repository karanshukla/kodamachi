// Bun-runtime canary; gates the client-bun-runtime CI job (reasoning: docs/runtime-notes.md).
// Asserts the runtime is Bun and that the dev server transforms TSX through @vitejs/plugin-react.
// Run with `bun run probe:bun`.
import { createServer } from "vite";

// Under the CI step's 120s so a stall is attributed to a phase.
const DEADLINE_MS = 60_000;

let phase = "startup";
const timings = [];

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exit(1);
}

// Unref'd so it never keeps a clean run alive.
const watchdog = setTimeout(() => {
  console.error(`FAIL probe stalled in phase '${phase}' after ${DEADLINE_MS}ms`);
  process.exit(1);
}, DEADLINE_MS);
watchdog.unref?.();

async function step(name, run) {
  phase = name;
  const started = performance.now();
  const result = await run();
  timings.push(`${name}=${Math.round(performance.now() - started)}ms`);
  return result;
}

if (!process.versions.bun) {
  fail(`probe ran under Node ${process.version} — invoke it as \`bun --bun probe-bun-vite.mjs\``);
}

const server = await step("create", () =>
  createServer({
    server: { host: "127.0.0.1", port: 5199, strictPort: false },
    logLevel: "warn",
  })
);

await step("listen", () => server.listen());

const base = `http://127.0.0.1:${server.config.server.port}`;

const get = (path) => fetch(`${base}${path}`, { headers: { Connection: "close" } });

const html = await step("fetch-index", async () => (await get("/")).text());
if (!html.includes('<script type="module"')) {
  fail(`dev server served no module script for /:\n${html.slice(0, 400)}`);
}

const transformed = await step("fetch-tsx", async () => {
  const res = await get("/src/pages/Login.tsx");
  if (!res.ok) fail(`dev server returned ${res.status} for /src/pages/Login.tsx`);
  return res.text();
});

// jsxDEV is emitted only by plugin-react's dev transform.
if (!transformed.includes("jsxDEV")) {
  fail(`Login.tsx came back untransformed (no jsxDEV):\n${transformed.slice(0, 400)}`);
}

clearTimeout(watchdog);

// Bun buffers non-TTY stdout; await the write so process.exit below cannot drop the line the CI step greps.
await Bun.write(
  Bun.stdout,
  `OK bun=${process.versions.bun} vite=${server.config.command} ` +
    `dev-transform=${transformed.length}B ${timings.join(" ")}\n`
);

// Never calls server.close(): under Bun on CI it does not resolve (#423, 'stalled in phase close'),
// even with closeAllConnections(), and closing is not what this probe asserts.
process.exit(0);
