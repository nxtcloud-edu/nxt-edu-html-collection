const crypto = require('node:crypto');

const COHORT_ID_PATTERN = /^coh_[a-z0-9]{12}$/;

function deriveLegacyCohortId(name) {
  const normalized = typeof name === 'string' ? name.trim() : '';
  if (!normalized) throw new Error('cohort name is required');
  return `coh_${crypto.createHash('sha256').update(normalized, 'utf8').digest('hex').slice(0, 12)}`;
}

function newCohortId() {
  return `coh_${crypto.randomBytes(6).toString('hex')}`;
}

module.exports = { COHORT_ID_PATTERN, deriveLegacyCohortId, newCohortId };
