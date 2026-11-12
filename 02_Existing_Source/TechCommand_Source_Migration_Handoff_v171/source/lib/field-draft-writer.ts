/** Coalesce typing into one device write; flush before leaving the page. */
export function fieldDraftWriter<T>(write: (value: T) => void, delay = 350) {
  let pending: { value: T } | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    clearTimeout(timer); timer = undefined;
    if (!pending) return;
    const value = pending.value; pending = null; write(value);
  };
  return {
    schedule(value: T) { pending = { value }; clearTimeout(timer); timer = setTimeout(flush, delay); },
    flush,
    cancel() { clearTimeout(timer); timer = undefined; pending = null; },
  };
}
