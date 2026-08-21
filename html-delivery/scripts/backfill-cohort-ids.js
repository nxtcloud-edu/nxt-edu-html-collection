#!/usr/bin/env node
const { deriveLegacyCohortId } = require('../domain/cohort');
const { applyCohortIdBackfill, planCohortIdBackfill } = require('../migrations/cohort-id-backfill');
const { getCustomCohorts, listRegistryItems, replaceCustomCohortsIfUnchanged, setContentCohortId } = require('../registry');
const { COHORTS } = require('../server');

const CONFIRMATION = 'BACKFILL_COHORT_IDS';

function parseArgs(argv) {
  const apply = argv.includes('--apply');
  const summaryOnly = argv.includes('--summary-only');
  const confirmationArg = argv.find((arg) => arg.startsWith('--confirm='));
  const confirmation = confirmationArg ? confirmationArg.slice('--confirm='.length) : '';
  if (apply && confirmation !== CONFIRMATION) {
    throw new Error(`apply requires --confirm=${CONFIRMATION}`);
  }
  return { apply, summaryOnly };
}

async function main(argv = process.argv.slice(2)) {
  const { apply, summaryOnly } = parseArgs(argv);
  const [customCohorts, contents] = await Promise.all([getCustomCohorts(), listRegistryItems()]);
  const baseCohorts = COHORTS.map((name) => ({ cohortId: deriveLegacyCohortId(name), name }));
  const plan = planCohortIdBackfill({ baseCohorts, customCohorts, contents });
  const report = {
    mode: apply ? 'apply' : 'dry-run',
    table: process.env.FEEDBACK_TABLE || 'local-registry',
    summary: plan.summary,
    unresolved: plan.unresolved,
    ...(!summaryOnly ? { contentUpdates: plan.contentUpdates } : {}),
  };

  if (!apply) {
    console.log(JSON.stringify(report, null, 2));
    if (plan.summary.unresolved > 0) process.exitCode = 2;
    return report;
  }

  const applied = await applyCohortIdBackfill(plan, { saveCustomCohorts: replaceCustomCohortsIfUnchanged, setContentCohortId });
  const result = { ...report, applied };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { CONFIRMATION, main, parseArgs };
