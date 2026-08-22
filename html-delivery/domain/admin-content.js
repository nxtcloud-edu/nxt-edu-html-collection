const { contentTypeFromCategory, categoryFromContentType } = require('./content');
const { preferredContentKey, storageSchemeForKey } = require('./content-storage');

function toAdminContent(record, cohort, { appBaseUrl, contentUrl }) {
  const latestObjectKey = preferredContentKey(record);
  return {
    contentId: record.contentId,
    cohort: cohort ? { cohortId: cohort.cohortId, name: cohort.name, status: cohort.status } : null,
    owner: { kind: cohort?.submissionMode === 'team' ? 'team' : 'individual', name: record.name },
    title: record.title || record.name,
    contentType: contentTypeFromCategory(record.category),
    latestVersion: record.latestVersion,
    latestObjectKey,
    fallbackObjectKey: record.latestKey !== latestObjectKey ? record.latestKey : null,
    storageScheme: storageSchemeForKey(latestObjectKey),
    likes: record.likes || 0,
    createdAt: record.createdAt2 || null,
    updatedAt: record.updatedAt || null,
    contentUrl: contentUrl(latestObjectKey),
    viewerUrl: `${appBaseUrl.replace(/\/$/, '')}/view.html?id=${record.contentId}`,
  };
}

function validateAdminV2Patch(existing, body, cohorts) {
  const allowed = ['title', 'cohortId', 'owner', 'contentType'];
  const errors = [];
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { errors: ['요청 본문이 올바르지 않습니다.'], fields: {} };
  if (Object.keys(body).some((key) => !allowed.includes(key))) errors.push('수정할 수 없는 항목이 포함되어 있습니다.');
  if (!allowed.some((key) => Object.prototype.hasOwnProperty.call(body, key))) errors.push('수정할 항목을 입력하세요.');
  const cohortId = body.cohortId === undefined ? existing.cohortId : String(body.cohortId).trim();
  const cohort = cohorts.find((item) => item.cohortId === cohortId);
  if (!cohort) errors.push('등록된 코호트를 찾을 수 없습니다.');
  const title = body.title === undefined ? existing.title : (typeof body.title === 'string' ? body.title.trim() : '');
  if (!title || title.length > 60) errors.push('제목은 1~60자로 입력하세요.');
  const owner = body.owner === undefined ? { name: existing.name } : body.owner;
  const ownerName = typeof owner?.name === 'string' ? owner.name.trim() : '';
  const expectedKind = cohort?.submissionMode === 'team' ? 'team' : 'individual';
  if (body.owner !== undefined && owner?.kind !== expectedKind) errors.push(`소유자 유형은 ${expectedKind}이어야 합니다.`);
  if (!ownerName || ownerName.length > 40) errors.push('소유자 이름은 1~40자로 입력하세요.');
  if (cohort?.submissionMode === 'team' && !cohort.teams?.includes(ownerName)) errors.push('등록된 팀을 선택하세요.');
  const requestedType = body.contentType === undefined ? contentTypeFromCategory(existing.category) : body.contentType;
  const category = categoryFromContentType(requestedType);
  if (!category) errors.push('콘텐츠 유형은 game 또는 webpage여야 합니다.');
  const fields = {};
  if (body.title !== undefined) fields.title = title;
  if (body.cohortId !== undefined && cohort) Object.assign(fields, { cohortId, affiliation: cohort.name });
  if (body.owner !== undefined) fields.name = ownerName;
  if (body.contentType !== undefined && category) fields.category = category;
  return { errors: [...new Set(errors)], fields };
}

function filterAdminContents(contents, { cohortId = '', contentType = '', query = '' } = {}) {
  const normalizedQuery = query.trim().toLocaleLowerCase('ko-KR');
  return contents.filter((item) => (!cohortId || item.cohortId === cohortId)
    && (!contentType || contentTypeFromCategory(item.category) === contentType)
    && (!normalizedQuery || [item.title, item.name, item.contentId, item.affiliation]
      .some((value) => String(value || '').toLocaleLowerCase('ko-KR').includes(normalizedQuery))));
}

module.exports = { filterAdminContents, toAdminContent, validateAdminV2Patch };
