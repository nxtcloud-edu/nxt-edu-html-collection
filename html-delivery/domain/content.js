const CONTENT_TYPES = Object.freeze({ GAME: 'game', WEBPAGE: 'webpage' });

function contentTypeFromCategory(value) {
  if (value === CONTENT_TYPES.GAME || value === '미니게임') return CONTENT_TYPES.GAME;
  if (value === CONTENT_TYPES.WEBPAGE || value === '웹페이지' || value === '랜딩페이지') return CONTENT_TYPES.WEBPAGE;
  return null;
}

function categoryFromContentType(value) {
  if (value === CONTENT_TYPES.GAME) return '미니게임';
  if (value === CONTENT_TYPES.WEBPAGE) return '웹페이지';
  return null;
}

function normalizeLegacyCategory(value) {
  return categoryFromContentType(contentTypeFromCategory(value)) || value;
}

function toDomainContent(record, { ownerKind = record?.ownerKind || 'individual' } = {}) {
  if (!record) return null;
  const contentType = contentTypeFromCategory(record.contentType || record.category);
  if (!contentType) throw new Error(`지원하지 않는 콘텐츠 분류입니다: ${record.contentType || record.category || ''}`);
  return {
    contentId: record.contentId,
    cohortId: record.cohortId || null,
    owner: { kind: ownerKind, name: record.owner?.name || record.name },
    title: record.title || record.name,
    contentType,
    latestVersion: record.latestVersion,
    latestObjectKey: record.latestObjectKey || record.latestKey,
    likes: record.likes || 0,
    createdAt: record.createdAt2 || null,
    updatedAt: record.updatedAt || null,
  };
}

function toLegacyContent(content, { cohortName } = {}) {
  if (!content) return null;
  const category = categoryFromContentType(content.contentType);
  if (!category) throw new Error(`지원하지 않는 콘텐츠 유형입니다: ${content.contentType || ''}`);
  return {
    contentId: content.contentId,
    ...(content.cohortId ? { cohortId: content.cohortId } : {}),
    name: content.owner.name,
    title: content.title,
    affiliation: cohortName,
    category,
    latestVersion: content.latestVersion,
    latestKey: content.latestObjectKey,
    likes: content.likes || 0,
    createdAt2: content.createdAt,
    updatedAt: content.updatedAt,
  };
}

module.exports = {
  CONTENT_TYPES,
  categoryFromContentType,
  contentTypeFromCategory,
  normalizeLegacyCategory,
  toDomainContent,
  toLegacyContent,
};
