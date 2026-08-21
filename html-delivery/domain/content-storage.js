const CONTENT_ID_PATTERN = /^[0-9a-f]{8}$/;
const LEGACY_CONTENT_KEY_PATTERN = /^games\/([0-9a-f]{8})-v([1-9][0-9]*)\.html$/;
const V2_CONTENT_KEY_PATTERN = /^contents\/([0-9a-f]{8})\/v([1-9][0-9]*)\.html$/;
const CONTENT_KEY_PATTERN = /^(?:games\/[0-9a-f]{8}-v[1-9][0-9]*\.html|contents\/[0-9a-f]{8}\/v[1-9][0-9]*\.html)$/;

function assertVersionInput(contentId, version) {
  if (!CONTENT_ID_PATTERN.test(contentId || '')) throw new Error('invalid contentId');
  if (!Number.isInteger(version) || version < 1) throw new Error('invalid content version');
}

function createLegacyVersionKey(contentId, version) {
  assertVersionInput(contentId, version);
  return `games/${contentId}-v${version}.html`;
}

function createV2VersionKey(contentId, version) {
  assertVersionInput(contentId, version);
  return `contents/${contentId}/v${version}.html`;
}

function contentKeyParts(key) {
  if (typeof key !== 'string') return null;
  const legacy = key.match(LEGACY_CONTENT_KEY_PATTERN);
  if (legacy) return { storageScheme: 'legacy-games', contentId: legacy[1], version: Number(legacy[2]) };
  const v2 = key.match(V2_CONTENT_KEY_PATTERN);
  if (v2) return { storageScheme: 'v2-contents', contentId: v2[1], version: Number(v2[2]) };
  return null;
}

function storageSchemeForKey(key) {
  return contentKeyParts(key)?.storageScheme || 'unknown';
}

function isValidContentKey(value) {
  return typeof value === 'string' && CONTENT_KEY_PATTERN.test(value);
}

function createVersionKey(contentId, version, { existingKey } = {}) {
  if (!existingKey) return createV2VersionKey(contentId, version);
  const parts = contentKeyParts(existingKey);
  if (!parts) throw new Error(`unsupported content key: ${existingKey}`);
  if (parts.contentId !== contentId) throw new Error(`content key mismatch: ${contentId}`);
  return parts.storageScheme === 'legacy-games'
    ? createLegacyVersionKey(contentId, version)
    : createV2VersionKey(contentId, version);
}

function versionKeysForContent({ contentId, latestVersion, latestKey }) {
  const parts = contentKeyParts(latestKey);
  if (!parts) throw new Error(`unsupported content key: ${latestKey}`);
  if (parts.contentId !== contentId || parts.version !== latestVersion) throw new Error(`content key mismatch: ${contentId}`);
  const createKey = parts.storageScheme === 'legacy-games' ? createLegacyVersionKey : createV2VersionKey;
  return Array.from({ length: latestVersion }, (_, index) => createKey(contentId, index + 1));
}

module.exports = {
  CONTENT_KEY_PATTERN,
  LEGACY_CONTENT_KEY_PATTERN,
  V2_CONTENT_KEY_PATTERN,
  contentKeyParts,
  createLegacyVersionKey,
  createV2VersionKey,
  createVersionKey,
  isValidContentKey,
  storageSchemeForKey,
  versionKeysForContent,
};
