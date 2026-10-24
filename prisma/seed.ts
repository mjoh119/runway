// Thin CLI wrapper: creates a workspace and seeds it with demo data.
// Run with a TypeScript runner, e.g. `npx tsx prisma/seed.ts` (tsx is not a dependency).
import { prisma } from '../src/lib/db'
import { seedWorkspace } from '../src/lib/seed-workspace'

function localToday(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

async function main() {
  const workspace = await prisma.workspace.create({ data: {} })
  await seedWorkspace(workspace.id, localToday())
  console.log(`Seeded workspace ${workspace.id}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
