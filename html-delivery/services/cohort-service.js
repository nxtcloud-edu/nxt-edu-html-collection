function createCohortService({
  baseCohorts,
  cohortDates,
  teamCohorts,
  getCustomCohorts,
  addCustomCohort,
  renameCustomCohort,
  deriveLegacyCohortId,
  newCohortId,
  isCohortId,
  contentService,
} = {}) {
  async function list() {
    const base = baseCohorts.map((name) => ({
      cohortId: deriveLegacyCohortId(name),
      name,
      teams: teamCohorts[name] || null,
      date: cohortDates[name] || null,
    }));
    const names = new Set(baseCohorts);
    const custom = (await getCustomCohorts())
      .filter((cohort) => cohort?.name && !names.has(cohort.name))
      .map((cohort) => ({
        cohortId: isCohortId(cohort.cohortId || '') ? cohort.cohortId : deriveLegacyCohortId(cohort.name),
        name: cohort.name,
        teams: null,
        date: cohort.date || null,
        createdAt: cohort.createdAt || null,
        updatedAt: cohort.updatedAt || null,
      }));
    return [...base, ...custom];
  }

  async function add({ name, date }) {
    if ((await list()).some((cohort) => cohort.name === name)) return { status: 'conflict' };
    await addCustomCohort({ cohortId: newCohortId(), name, date: date || null });
    return { status: 'created' };
  }

  async function rename({ oldName, name }) {
    const cohorts = await list();
    if (!cohorts.some((cohort) => cohort.name === oldName)) return { status: 'not-found' };
    if (baseCohorts.includes(oldName)) return { status: 'base-cohort' };
    if (name !== oldName && cohorts.some((cohort) => cohort.name === name)) return { status: 'conflict' };
    if (!await renameCustomCohort(oldName, name)) return { status: 'not-found' };
    const matches = (await contentService.list()).filter((content) => content.affiliation === oldName);
    await Promise.all(matches.map((content) => contentService.updateFields(content.contentId, { affiliation: name })));
    return { status: 'renamed', count: matches.length };
  }

  return Object.freeze({ add, list, rename });
}

module.exports = { createCohortService };
