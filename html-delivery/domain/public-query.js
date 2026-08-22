function cursorScope({ sort, cohortId, type, query }) {
  return { sort, cohortId: cohortId || '', type: type || '', query: query || '' };
}

function encodePublicCursor(item, filters) {
  return Buffer.from(JSON.stringify({
    ...cursorScope(filters),
    contentId: item.contentId,
    updatedAt: item.updatedAt || '',
    likes: Number(item.likes) || 0,
  })).toString('base64url');
}

function decodePublicCursor(cursor) {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    return /^[0-9a-f]{8}$/.test(value?.contentId || '') && ['latest', 'likes'].includes(value?.sort) ? value : null;
  } catch { return null; }
}

function paginatePublicContents(contents, filters, { pageSize, cursor = null } = {}) {
  const decoded = decodePublicCursor(cursor);
  if (cursor && !decoded) return { status: 'invalid-cursor' };
  const scope = cursorScope(filters);
  if (decoded && Object.entries(scope).some(([key, value]) => decoded[key] !== value)) return { status: 'invalid-cursor' };
  const start = decoded ? contents.findIndex((item) => item.contentId === decoded.contentId
    && String(item.updatedAt || '') === decoded.updatedAt
    && (Number(item.likes) || 0) === decoded.likes) + 1 : 0;
  if (decoded && start === 0) return { status: 'invalid-cursor' };
  const items = contents.slice(start, start + pageSize);
  const hasNext = start + items.length < contents.length;
  return {
    status: 'ok',
    items,
    total: contents.length,
    nextCursor: hasNext ? encodePublicCursor(items.at(-1), filters) : null,
  };
}

module.exports = { decodePublicCursor, encodePublicCursor, paginatePublicContents };
