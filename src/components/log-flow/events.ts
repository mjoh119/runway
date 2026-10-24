/** Window event fired after a successful mutation so any mounted page can refetch. */
export const RUNWAY_CHANGED_EVENT = 'runway:changed';

export function dispatchRunwayChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(RUNWAY_CHANGED_EVENT));
}
