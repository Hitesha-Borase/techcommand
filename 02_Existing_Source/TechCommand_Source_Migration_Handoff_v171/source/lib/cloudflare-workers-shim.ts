// Runtime shim for cloudflare:workers when running under Node.js / Next.js
export const env: Record<string, any> = new Proxy(
  (typeof process !== "undefined" && process.env ? process.env : {}) as Record<string, any>,
  {
    get(target: Record<string, any>, prop: string) {
      if (prop === "DB") {
        return {
          prepare: (_query: string) => ({
            bind: (..._args: any[]) => ({
              first: async () => null,
              all: async () => ({ results: [] }),
              run: async () => ({ meta: { changes: 0 } }),
            }),
            first: async () => null,
            all: async () => ({ results: [] }),
            run: async () => ({ meta: { changes: 0 } }),
          }),
        };
      }
      if (prop === "BUCKET") {
        return {
          get: async () => null,
          put: async () => null,
          delete: async () => null,
        };
      }
      return target[prop] ?? "";
    },
  }
);

export default { env };
