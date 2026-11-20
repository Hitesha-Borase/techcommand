// Minimal Worker entry used only to host bindings (D1, etc.) for vitest-plugin
// integration tests. The real Next.js app has its own production worker entry
// (worker/index.ts) - we deliberately do not boot that here, since these tests
// only need a D1 binding to exercise database-backed query logic directly.
export default {
  async fetch() {
    return new Response("test worker");
  },
};
