// Cache em memória com TTL e limite de entradas (descarta o menos usado).
// As chaves podem vir do cliente: sem limite, o processo cresceria sem parar.
// Observação: cada instância do App Service tem o próprio cache.
export function createBoundedCache({ max, ttlMs, now = Date.now }) {
  if (!Number.isInteger(max) || max < 1) throw new Error('max deve ser um inteiro positivo.');
  const entries = new Map();

  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= now()) {
        entries.delete(key);
        return undefined;
      }
      // Reinsere para marcar como usado recentemente (ordem do Map = LRU).
      entries.delete(key);
      entries.set(key, entry);
      return entry;
    },
    set(key, value, ttl = ttlMs) {
      const entry = { value, expiresAt: now() + ttl };
      entries.delete(key);
      entries.set(key, entry);
      while (entries.size > max) entries.delete(entries.keys().next().value);
      return entry;
    },
    delete(key) {
      return entries.delete(key);
    },
    get size() {
      return entries.size;
    },
  };
}
