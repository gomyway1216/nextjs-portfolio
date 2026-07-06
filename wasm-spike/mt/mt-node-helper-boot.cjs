// Boot shim for the Lazy SMP node helper thread: worker_threads requires a
// .js/.cjs/.mjs entry file, so this registers the tsx require hook and loads
// the TypeScript helper. Spawned by mtPlayer.ts.
require('tsx/cjs');
require('./mt-node-helper.ts');
