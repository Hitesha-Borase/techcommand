// Safe fallback for React 19 RSC in environments where WeakRef is not exposed globally.
if (typeof (globalThis as any).WeakRef === "undefined") {
  (globalThis as any).WeakRef = class WeakRef<T extends object> {
    private target: T;
    constructor(target: T) {
      this.target = target;
    }
    deref(): T | undefined {
      return this.target;
    }
  };
}

export {};

