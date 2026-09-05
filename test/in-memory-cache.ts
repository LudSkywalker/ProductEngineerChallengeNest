export function createInMemoryCache() {
  const values = new Map<string, unknown>();

  return {
    get(key: string): Promise<unknown> {
      return Promise.resolve(values.get(key));
    },
    set(key: string, value: unknown): Promise<void> {
      values.set(key, value);
      return Promise.resolve();
    },
    del(key: string): Promise<void> {
      values.delete(key);
      return Promise.resolve();
    },
    clear(): Promise<void> {
      values.clear();
      return Promise.resolve();
    },
  };
}
