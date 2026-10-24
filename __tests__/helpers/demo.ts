import { generateFederalHolidays } from '../../src/lib/holidays/generator';
import { projectCashFlow } from '../../src/lib/projection/engine';
import { generateDemoData } from '../../src/sources/fake-source';

/** Holidays for the year plus its neighbours: shifts can cross Dec 31 / Jan 1 either way. */
export const holidaysAround = (y: number): string[] =>
  [y - 1, y, y + 1].flatMap(generateFederalHolidays);

/** Build the ProjectionInput from the demo data and run the engine. */
export function run(today: string) {
  const demo = generateDemoData(today);
  const projection = projectCashFlow({
    accounts: demo.accounts,
    schedules: demo.schedules,
    oneOffEntries: demo.oneOffEntries,
    holidays: holidaysAround(Number(today.slice(0, 4))),
    currentDate: today,
    projectionHorizonDays: demo.workspaceSettings.projectionHorizonDays,
    lowBalanceThresholdCents: demo.workspaceSettings.lowBalanceThresholdCents,
  });
  return { demo, projection };
}
