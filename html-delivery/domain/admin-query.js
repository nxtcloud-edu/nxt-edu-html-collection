function encodeContentCursor(item) {
  return Buffer.from(JSON.stringify({ updatedAt: item.updatedAt || '', contentId: item.contentId })).toString('base64url');
}

function decodeContentCursor(cursor) {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    return typeof value?.updatedAt === 'string' && /^[0-9a-f]{8}$/.test(value?.contentId || '') ? value : null;
  } catch { return null; }
}

function paginateAdminContents(contents, { pageSize = 50, cursor = null } = {}) {
  const decoded = decodeContentCursor(cursor);
  if (cursor && !decoded) return { status: 'invalid-cursor' };
  const sorted = [...contents].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')) || a.contentId.localeCompare(b.contentId));
  const start = decoded ? sorted.findIndex((item) => item.contentId === decoded.contentId && String(item.updatedAt || '') === decoded.updatedAt) + 1 : 0;
  if (decoded && start === 0) return { status: 'invalid-cursor' };
  const items = sorted.slice(start, start + pageSize);
  const hasNext = start + items.length < sorted.length;
  return { status: 'ok', items, total: sorted.length, nextCursor: hasNext ? encodeContentCursor(items.at(-1)) : null };
}

module.exports = { decodeContentCursor, encodeContentCursor, paginateAdminContents };
