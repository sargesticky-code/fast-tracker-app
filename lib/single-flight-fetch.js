const inFlight = new Map();

export function singleFlightFetch(key, input, init = {}, timeoutMs = null) {
  const existing = inFlight.get(key);
  if (existing) return existing.then((response) => response.clone());

  const options = { ...init };
  if (!options.signal && Number.isFinite(timeoutMs) && timeoutMs > 0) {
    options.signal = AbortSignal.timeout(timeoutMs);
  }

  const request = fetch(input, options)
    .finally(() => {
      if (inFlight.get(key) === request) inFlight.delete(key);
    });

  inFlight.set(key, request);
  return request.then((response) => response.clone());
}
