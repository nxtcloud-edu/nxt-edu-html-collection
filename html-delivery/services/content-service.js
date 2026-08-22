const crypto = require('node:crypto');
const path = require('node:path');

function createContentService({
  contentRepository,
  versionRepository,
  feedbackRepository,
  objectStorage,
  createContentId,
  createVersionKey,
  preferredContentKey,
  versionStorageFields,
  hashPassword,
  verifyPassword,
  allVersionKeysForContent,
  now = () => new Date().toISOString(),
} = {}) {
  const required = {
    contentRepository,
    versionRepository,
    feedbackRepository,
    objectStorage,
    createContentId,
    createVersionKey,
    preferredContentKey,
    versionStorageFields,
    hashPassword,
    verifyPassword,
    allVersionKeysForContent,
  };
  for (const [name, value] of Object.entries(required)) {
    if (!value) throw new TypeError(`content service ${name} is required`);
  }

  function versionRecord({ contentId, version, key, file, uploadedAt }) {
    return {
      contentId,
      version,
      objectKey: key,
      originalFileName: typeof file.originalname === 'string' ? path.basename(file.originalname).slice(0, 255) : null,
      sizeBytes: file.buffer.length,
      sha256: crypto.createHash('sha256').update(file.buffer).digest('hex'),
      uploadedAt,
    };
  }

  async function storeVersion({ contentId, title, version, key, file, uploadedAt }) {
    await objectStorage.putHtml(key, file.buffer, {
      contentid: contentId,
      title: encodeURIComponent(title),
      version: String(version),
    });
    const record = versionRecord({ contentId, version, key, file, uploadedAt });
    if (!await versionRepository.save(record)) {
      const error = new Error('이미 기록된 콘텐츠 버전입니다.');
      error.code = 'VERSION_CONFLICT';
      throw error;
    }
    return record;
  }

  async function create({ cohort, ownerName, title, category, password, file }) {
    const contentId = createContentId();
    const version = 1;
    const key = createVersionKey(contentId, version);
    const uploadedAt = now();
    const item = {
      contentKey: `content#${contentId}`,
      createdAt: 'meta',
      contentId,
      cohortId: cohort.cohortId,
      name: ownerName,
      title,
      affiliation: cohort.name,
      category,
      ...hashPassword(password),
      latestVersion: version,
      latestKey: key,
      latestObjectKey: key,
      likes: 0,
      createdAt2: uploadedAt,
      updatedAt: uploadedAt,
    };
    await storeVersion({ contentId, title, version, key, file, uploadedAt });
    await contentRepository.create(item);
    return item;
  }

  async function addVersion({ contentId, password, title, file }) {
    const existing = await contentRepository.getPrivate(contentId);
    if (!existing) return { status: 'not-found' };
    if (!verifyPassword(password, existing.passwordHash, existing.salt)) return { status: 'forbidden', existing };
    const version = existing.latestVersion + 1;
    const key = createVersionKey(existing.contentId, version, { existingKey: preferredContentKey(existing) });
    const uploadedAt = now();
    const storageFields = versionStorageFields(existing, key);
    await storeVersion({ contentId: existing.contentId, title, version, key, file, uploadedAt });
    await contentRepository.updateVersion(existing.contentId, {
      title,
      latestVersion: version,
      ...storageFields,
      updatedAt: uploadedAt,
    });
    return {
      status: 'created',
      content: { ...existing, title, latestVersion: version, ...storageFields, updatedAt: uploadedAt },
    };
  }

  async function upsertLegacy({ cohort, identity, password, file, normalizeCategory }) {
    const existing = await contentRepository.findByIdentity(identity, normalizeCategory);
    if (existing && !verifyPassword(password, existing.passwordHash, existing.salt)) return { status: 'forbidden' };
    const contentId = existing?.contentId || createContentId();
    const version = existing ? existing.latestVersion + 1 : 1;
    const key = createVersionKey(contentId, version, { existingKey: existing ? preferredContentKey(existing) : undefined });
    const uploadedAt = now();
    const storageFields = existing ? versionStorageFields(existing, key) : { latestKey: key, latestObjectKey: key };
    const credentials = existing ? { passwordHash: existing.passwordHash, salt: existing.salt } : hashPassword(password);
    const item = {
      contentKey: `content#${contentId}`,
      createdAt: 'meta',
      contentId,
      cohortId: cohort.cohortId,
      name: identity.name,
      title: identity.title,
      affiliation: identity.affiliation,
      category: identity.category,
      ...credentials,
      latestVersion: version,
      ...storageFields,
      likes: existing?.likes || 0,
      createdAt2: existing?.createdAt2 || uploadedAt,
      updatedAt: uploadedAt,
    };
    await storeVersion({ contentId, title: identity.title, version, key, file, uploadedAt });
    if (existing) {
      await contentRepository.updateVersion(contentId, {
        title: identity.title,
        latestVersion: version,
        ...storageFields,
        updatedAt: uploadedAt,
      });
    } else {
      await contentRepository.create(item);
    }
    return { status: 'created', content: item, key, version, uploadedAt };
  }

  async function deleteContent(contentId) {
    const existing = await contentRepository.getPrivate(contentId);
    if (!existing) return false;
    await Promise.all(allVersionKeysForContent(existing).map(objectStorage.deleteObject));
    await feedbackRepository.deleteForContent(contentId);
    await versionRepository.deleteForContent(contentId);
    await contentRepository.delete(contentId);
    return true;
  }

  async function listVersions(contentId, { admin = false } = {}) {
    const content = await contentRepository.getPrivate(contentId);
    if (!content) return null;
    const stored = await versionRepository.list(contentId);
    const storedByVersion = new Map(stored.map((item) => [item.version, item]));
    const records = Array.from({ length: content.latestVersion }, (_, index) => {
      const version = index + 1;
      return storedByVersion.get(version) || {
        contentId,
        version,
        objectKey: createVersionKey(contentId, version, { existingKey: preferredContentKey(content) }),
        originalFileName: null,
        sizeBytes: null,
        sha256: null,
        uploadedAt: version === content.latestVersion ? content.updatedAt : (version === 1 ? content.createdAt2 : null),
      };
    });
    const serialize = admin ? versionRepository.adminVersion : versionRepository.publicVersion;
    return {
      metadataStatus: stored.length === content.latestVersion ? 'complete' : (stored.length ? 'partial' : 'legacy-synthesized'),
      versions: records.map((item) => serialize(item, content.latestVersion)),
    };
  }

  return Object.freeze({
    addVersion,
    create,
    deleteContent,
    getPrivate: contentRepository.getPrivate,
    getPublic: contentRepository.getPublic,
    incrementLikes: contentRepository.incrementLikes,
    list: contentRepository.list,
    listVersions,
    updateFields: contentRepository.updateFields,
    updatePassword: contentRepository.updatePassword,
    upsertLegacy,
  });
}

module.exports = { createContentService };
