const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildExportEntries,
  buildManifest,
  contentDisposition,
  exportFileName,
  safeFilenamePart,
} = require('../cohort-export');

function content(overrides = {}) {
  return {
    contentId: '1234abcd',
    affiliation: '2026-테스트',
    name: '1팀',
    title: 'AI 웹페이지',
    category: '웹페이지',
    latestVersion: 2,
    latestKey: 'games/1234abcd-v2.html',
    updatedAt: '2026-08-21T00:00:00.000Z',
    ...overrides,
  };
}

test('ZIP 파일명 구성은 경로·제어문자를 제거하고 한글을 보존한다', () => {
  assert.equal(safeFilenamePart(' ../1팀/AI:여행?\u0000 '), '-1팀-AI-여행-');
  assert.equal(exportFileName('2026/경희대', new Date('2026-08-21T00:00:00.000Z')), '2026-경희대_콘텐츠_2026-08-21.zip');
  assert.match(contentDisposition('한글 콘텐츠.zip'), /^attachment; filename="cohort-contents\.zip"; filename\*=UTF-8''/);
});

test('ZIP 엔트리는 이름·제목·최신 버전을 표시하고 manifest가 원본 키를 보존한다', () => {
  const entries = buildExportEntries([
    content({ contentId: 'bbbbbbbb', name: '2팀', title: '두 번째', latestVersion: 1, latestKey: 'games/bbbbbbbb-v1.html' }),
    content(),
  ]);
  assert.deepEqual(entries.map((entry) => entry.fileName), [
    '001_1팀_AI 웹페이지_v2.html',
    '002_2팀_두 번째_v1.html',
  ]);
  const manifest = buildManifest(entries, {
    cohort: '2026-테스트',
    createdAt: '2026-08-21T00:00:00.000Z',
    appBaseUrl: 'http://localhost:3210/',
  });
  assert.equal(manifest.csv.startsWith('\uFEFFfileName,contentId'), true);
  const parsed = JSON.parse(manifest.json);
  assert.equal(parsed.count, 2);
  assert.equal(parsed.contents[0].s3Key, 'games/1234abcd-v2.html');
  assert.equal(parsed.contents[0].viewerUrl, 'http://localhost:3210/view.html?id=1234abcd');
});
