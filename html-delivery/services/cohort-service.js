function createCohortService({
  baseCohorts,
  cohortDates,
  teamCohorts,
  getCustomCohorts,
  addCustomCohort,
  renameCustomCohort,
  updateCustomCohortById,
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
      submissionMode: teamCohorts[name] ? 'team' : 'individual',
      status: 'active',
      createdAt: null,
      updatedAt: null,
      source: 'base',
    }));
    const names = new Set(baseCohorts);
    const custom = (await getCustomCohorts())
      .filter((cohort) => cohort?.name && !names.has(cohort.name))
      .map((cohort) => ({
        cohortId: isCohortId(cohort.cohortId || '') ? cohort.cohortId : deriveLegacyCohortId(cohort.name),
        name: cohort.name,
        teams: null,
        date: cohort.date || null,
        submissionMode: 'individual',
        status: cohort.status || 'active',
        createdAt: cohort.createdAt || null,
        updatedAt: cohort.updatedAt || null,
        source: 'custom',
      }));
    return [...base, ...custom];
  }

  async function add({ name, date, status = 'active' }) {
    if ((await list()).some((cohort) => cohort.name === name)) return { status: 'conflict' };
    const cohortId = newCohortId();
    await addCustomCohort({ cohortId, name, date: date || null, status });
    return { status: 'created', cohortId };
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

  async function update({ cohortId, fields }) {
    const cohorts = await list();
    const existing = cohorts.find((cohort) => cohort.cohortId === cohortId);
    if (!existing) return { status: 'not-found' };
    if (existing.source === 'base') return { status: 'base-cohort' };
    if (fields.name && fields.name !== existing.name && cohorts.some((cohort) => cohort.name === fields.name)) return { status: 'conflict' };
    const next = {
      ...(fields.name !== undefined ? { name: fields.name } : {}),
      ...(fields.date !== undefined ? { date: fields.date } : {}),
      ...(fields.status !== undefined ? { status: fields.status } : {}),
      updatedAt: new Date().toISOString(),
    };
    if (!await updateCustomCohortById(cohortId, next)) return { status: 'not-found' };
    if (next.name && next.name !== existing.name) {
      const matches = (await contentService.list()).filter((content) => content.cohortId === cohortId || content.affiliation === existing.name);
      await Promise.all(matches.map((content) => contentService.updateFields(content.contentId, { affiliation: next.name, cohortId })));
      return { status: 'updated', count: matches.length };
    }
    return { status: 'updated', count: 0 };
  }

  return Object.freeze({ add, list, rename, update });
}

module.exports = { createCohortService };
