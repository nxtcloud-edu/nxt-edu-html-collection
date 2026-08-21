const CONTENT_REPOSITORY_METHODS = Object.freeze([
  'list',
  'getPrivate',
  'getPublic',
  'findByIdentity',
  'create',
  'updateVersion',
  'updateFields',
  'updatePassword',
  'delete',
  'incrementLikes',
]);

function createContentRepository(implementation) {
  const repository = {};
  for (const method of CONTENT_REPOSITORY_METHODS) {
    if (typeof implementation?.[method] !== 'function') {
      throw new TypeError(`content repository 메서드가 없습니다: ${method}`);
    }
    repository[method] = (...args) => implementation[method](...args);
  }
  return Object.freeze(repository);
}

module.exports = { CONTENT_REPOSITORY_METHODS, createContentRepository };
