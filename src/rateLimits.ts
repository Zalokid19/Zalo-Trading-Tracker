const WINDOW_MS = 60_000;
const MAX_CALLS = 7; // stays under Twelve Data's 8/min cap with a safety margin

let callTimestamps: number[] = [];

export function canMakeRequest(): boolean {
  const now = Date.now();
  callTimestamps = callTimestamps.filter((t) => now - t < WINDOW_MS);
  return callTimestamps.length < MAX_CALLS;
}

export function recordRequest(): void {
  callTimestamps.push(Date.now());
}

export function secondsUntilNextSlot(): number {
  if (callTimestamps.length === 0) return 0;
  const oldest = callTimestamps[0];
  const wait = WINDOW_MS - (Date.now() - oldest);
  return Math.max(0, Math.ceil(wait / 1000));
}