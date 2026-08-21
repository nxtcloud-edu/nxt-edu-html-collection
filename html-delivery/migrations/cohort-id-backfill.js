const { COHORT_ID_PATTERN, deriveLegacyCohortId, newCohortId } = require('../domain/cohort');

function duplicateValues(items, field) {
  const counts = new Map();
  items.forEach((item) => {
    const value = item[field];
    if (value) counts.set(value, (counts.get(value) || 0) + 1);
  });
  return new Set([...counts].filter(([, count]) => count > 1).map(([value]) => value));
}

function planCohortIdBackfill({ baseCohorts = [], customCohorts = [], contents = [] }) {
  const normalizedCustomCohorts = customCohorts.map((cohort) => ({
    ...cohort,
    ...(!cohort.cohortId && cohort.name ? { cohortId: deriveLegacyCohortId(cohort.name) } : {}),
  }));
  const cohorts = [...baseCohorts, ...normalizedCustomCohorts];
  const duplicateNames = duplicateValues(cohorts, 'name');
  const duplicateIds = duplicateValues(cohorts, 'cohortId');
  const unresolved = [];

  duplicateNames.forEach((name) => unresolved.push({ scope: 'cohort', name, reason: 'duplicate-cohort-name' }));
  duplicateIds.forEach((cohortId) => unresolved.push({ scope: 'cohort', cohortId, reason: 'duplicate-cohort-id' }));

  const cohortsByName = new Map();
  cohorts.forEach((cohort) => {
    if (typeof cohort.name !== 'string' || !cohort.name.trim()) {
      unresolved.push({ scope: 'cohort', cohortId: cohort.cohortId || null, reason: 'invalid-cohort-name' });
      return;
    }
    if (!COHORT_ID_PATTERN.test(cohort.cohortId || '')) {
      unresolved.push({ scope: 'cohort', name: cohort.name, reason: 'invalid-cohort-id' });
      return;
    }
    if (!duplicateNames.has(cohort.name) && !duplicateIds.has(cohort.cohortId)) cohortsByName.set(cohort.name, cohort);
  });

  const contentUpdates = [];
  let unchanged = 0;
  let conflicts = 0;
  contents.forEach((content) => {
    const identity = { scope: 'content', contentId: content.contentId || null, affiliation: content.affiliation || null };
    if (!content.contentId) {
      unresolved.push({ ...identity, reason: 'invalid-content-id' });
      return;
    }
    const cohort = cohortsByName.get(content.affiliation);
    if (!cohort) {
      unresolved.push({ ...identity, reason: duplicateNames.has(content.affiliation) ? 'duplicate-cohort-name' : 'cohort-not-found' });
      return;
    }
    if (!content.cohortId) {
      contentUpdates.push({ contentId: content.contentId, affiliation: content.affiliation, cohortId: cohort.cohortId });
      return;
    }
    if (content.cohortId === cohort.cohortId) {
      unchanged += 1;
      return;
    }
    conflicts += 1;
    unresolved.push({ ...identity, cohortId: content.cohortId, expectedCohortId: cohort.cohortId, reason: 'cohort-id-conflict' });
  });

  return {
    summary: {
      cohortsTotal: cohorts.length,
      cohortsToUpdate: customCohorts.filter((cohort) => !cohort.cohortId).length,
      contentsTotal: contents.length,
      contentsToUpdate: contentUpdates.length,
      unchanged,
      unresolved: unresolved.length,
      conflicts,
    },
    originalCustomCohorts: customCohorts,
    customCohorts: normalizedCustomCohorts,
    contentUpdates,
    unresolved,
  };
}

async function applyCohortIdBackfill(plan, { saveCustomCohorts, setContentCohortId }) {
  if (plan.summary.unresolved > 0) throw new Error(`backfill blocked: ${plan.summary.unresolved} unresolved`);
  if (plan.summary.cohortsToUpdate > 0) {
    const updated = await saveCustomCohorts(plan.customCohorts, plan.originalCustomCohorts);
    if (updated === false) throw new Error('backfill write conflict: custom cohorts');
  }
  for (const update of plan.contentUpdates) {
    const updated = await setContentCohortId(update);
    if (updated === false) throw new Error(`backfill write conflict: ${update.contentId}`);
  }
  return {
    cohortsUpdated: plan.summary.cohortsToUpdate,
    contentsUpdated: plan.summary.contentsToUpdate,
  };
}

module.exports = {
  COHORT_ID_PATTERN,
  applyCohortIdBackfill,
  deriveLegacyCohortId,
  newCohortId,
  planCohortIdBackfill,
};
