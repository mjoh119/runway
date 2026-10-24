import { seedWorkspace } from './seed-workspace'

/** True when `value` is a real calendar date in 'YYYY-MM-DD' form. */
export function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(Date.UTC(y, mo - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d
}

/**
 * Reset demo for ONE workspace. `seedWorkspace` runs a single transaction
 * that deletes only this workspace's accounts (cascading to its schedules and
 * entries, filtered by workspaceId), reseeds the demo data and refreshes the
 * workspace's lastActivity. No other workspace is touched.
 */
export async function resetWorkspace(workspaceId: string, today: string): Promise<void> {
  if (!workspaceId) throw new Error('workspaceId is required')
  if (!isValidIsoDate(today)) throw new Error(`Invalid date (expected YYYY-MM-DD): ${today}`)
  await seedWorkspace(workspaceId, today)
}
