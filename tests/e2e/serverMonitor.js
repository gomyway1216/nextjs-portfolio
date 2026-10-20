// TEMPORARY, for measuring the e2e job on CI: preloaded into the test server (playwright.config.ts, CI only), it writes
// one line to stderr every 30 s: memory, event-loop lag, live handles, unhandled rejections, and each kind of request's
// count and times, with any request in flight for more than 10 s by its URL. Changes nothing the server does.
const http = require('node:http');
const { monitorEventLoopDelay } = require('node:perf_hooks');

const t0 = Date.now();
const lag = monitorEventLoopDelay({ resolution: 10 });
lag.enable();
const kind = (url) => {
  const path = (url || '').split('?')[0];
  if (path.startsWith('/api/')) return path;
  if (path.startsWith('/_next/static')) return '/_next/static';
  if (path.startsWith('/_next/image')) return '/_next/image';
  return url && url.includes('_rsc=') ? 'rsc' : 'page';
};
let stats = new Map();
const flying = new Map();
let unhandled = 0;
let serving = false;
process.on('unhandledRejection', () => {
  unhandled += 1;
});
const emit = http.Server.prototype.emit;
http.Server.prototype.emit = function (event, req, res) {
  if (event === 'request' && req && res) {
    serving = true;
    const key = kind(req.url);
    const entry = { key, url: req.url, at: Date.now() };
    flying.set(entry, true);
    const done = () => {
      if (!flying.delete(entry)) return;
      const ms = Date.now() - entry.at;
      const s = stats.get(key) || { n: 0, sum: 0, max: 0, over1s: 0, over5s: 0, dropped: 0 };
      s.n += 1;
      s.sum += ms;
      s.max = Math.max(s.max, ms);
      if (ms > 1000) s.over1s += 1;
      if (ms > 5000) s.over5s += 1;
      if (!res.writableFinished) s.dropped += 1;
      stats.set(key, s);
    };
    res.once('finish', done);
    res.once('close', done);
  }
  return emit.apply(this, arguments);
};
setInterval(() => {
  if (!serving) return;
  const mem = process.memoryUsage();
  const reqs = {};
  for (const [k, s] of stats) reqs[k] = [s.n, Math.round(s.sum / s.n), s.max, s.over1s, s.over5s, s.dropped];
  const now = Date.now();
  const stuck = [...flying.keys()].filter((e) => now - e.at > 10_000).map((e) => `${Math.round((now - e.at) / 1000)}s ${e.url.slice(0, 120)}`);
  const line = {
    t: Math.round((now - t0) / 1000),
    rssMB: Math.round(mem.rss / 1048576),
    heapMB: Math.round(mem.heapUsed / 1048576),
    lagP99: Math.round(lag.percentile(99) / 1e6),
    lagMax: Math.round(lag.max / 1e6),
    handles: process._getActiveHandles().length,
    unhandled,
    inFlight: flying.size,
    stuck,
    reqs,
  };
  lag.reset();
  stats = new Map();
  process.stderr.write(`[server-monitor] ${JSON.stringify(line)}\n`);
}, 30_000).unref();
