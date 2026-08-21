const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { PassThrough } = require('node:stream');
const { GetObjectCommand, S3Client } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const LOCAL_DEPLOY_DIR = path.join(__dirname, '.local-deploy');
const LOCAL_EXPORT_DIR = path.join(__dirname, '.local-exports');
const EXPORT_ID_PATTERN = /^[0-9a-f]{32}$/;
const DOWNLOAD_TTL_SECONDS = 15 * 60;

async function createZipArchive() {
  const { ZipArchive } = await import('archiver');
  return new ZipArchive({ zlib: { level: 9 } });
}

function safeFilenamePart(value, fallback = 'content', maxLength = 80) {
  const normalized = String(value || '')
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/-+/g, '-')
    .trim()
    .replace(/^[. ]+|[. ]+$/g, '');
  return (normalized || fallback).slice(0, maxLength).trim() || fallback;
}

function buildExportEntries(contents) {
  const used = new Set();
  return [...contents]
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ko')
      || String(a.title || '').localeCompare(String(b.title || ''), 'ko')
      || String(a.contentId).localeCompare(String(b.contentId)))
    .map((content, index) => {
      const sequence = String(index + 1).padStart(3, '0');
      const owner = safeFilenamePart(content.name, '이름없음', 40);
      const title = safeFilenamePart(content.title || content.name, '제목없음', 80);
      const version = Number(content.latestVersion) || 1;
      const base = `${sequence}_${owner}_${title}_v${version}`;
      let fileName = `${base}.html`;
      if (used.has(fileName.toLocaleLowerCase('ko-KR'))) fileName = `${base}_${content.contentId}.html`;
      used.add(fileName.toLocaleLowerCase('ko-KR'));
      return { content, fileName };
    });
}

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function buildManifest(entries, { cohort, createdAt, appBaseUrl = 'https://showcase.nxtcloud.kr' }) {
  const rows = entries.map(({ content, fileName }) => ({
    fileName,
    contentId: content.contentId,
    cohort,
    name: content.name,
    title: content.title || content.name,
    category: content.category,
    version: content.latestVersion,
    updatedAt: content.updatedAt,
    s3Key: content.latestKey,
    viewerUrl: `${appBaseUrl.replace(/\/$/, '')}/view.html?id=${content.contentId}`,
  }));
  const headers = ['fileName', 'contentId', 'cohort', 'name', 'title', 'category', 'version', 'updatedAt', 's3Key', 'viewerUrl'];
  const csv = `\uFEFF${headers.join(',')}\n${rows.map((row) => headers.map((header) => csvCell(row[header])).join(',')).join('\n')}\n`;
  const json = `${JSON.stringify({ cohort, createdAt, count: rows.length, contents: rows }, null, 2)}\n`;
  return { csv, json };
}

function exportFileName(cohort, createdAt = new Date()) {
  const date = createdAt.toISOString().slice(0, 10);
  return `${safeFilenamePart(cohort, 'cohort', 100)}_콘텐츠_${date}.zip`;
}

function contentDisposition(fileName) {
  const encoded = encodeURIComponent(fileName).replace(/['()]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="cohort-contents.zip"; filename*=UTF-8''${encoded}`;
}

function appendStream(archive, stream, name) {
  return new Promise((resolve, reject) => {
    const onEntry = (entry) => {
      if (entry.name !== name) return;
      cleanup();
      resolve();
    };
    const onError = (error) => { cleanup(); reject(error); };
    const cleanup = () => {
      archive.off('entry', onEntry);
      archive.off('error', onError);
      stream.off('error', onError);
    };
    archive.on('entry', onEntry);
    archive.on('error', onError);
    stream.on('error', onError);
    archive.append(stream, { name });
  });
}

async function appendContentFiles(archive, entries, { bucket, region, s3Client }) {
  for (const { content, fileName } of entries) {
    if (!bucket) {
      await appendStream(archive, fs.createReadStream(path.join(LOCAL_DEPLOY_DIR, content.latestKey)), fileName);
      continue;
    }
    const response = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: content.latestKey }));
    if (!response.Body) throw new Error(`S3 객체 본문이 없습니다: ${content.latestKey}`);
    await appendStream(archive, response.Body, fileName);
  }
}

async function createLocalArchive({ exportId, fileName, entries, manifest, cohort }) {
  await fsp.mkdir(LOCAL_EXPORT_DIR, { recursive: true });
  const destination = path.join(LOCAL_EXPORT_DIR, `${exportId}.zip`);
  const output = fs.createWriteStream(destination, { mode: 0o600 });
  const archive = await createZipArchive();
  const completed = new Promise((resolve, reject) => {
    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
  });
  archive.pipe(output);
  try {
    await appendContentFiles(archive, entries, {});
    archive.append(manifest.csv, { name: 'manifest.csv' });
    archive.append(manifest.json, { name: 'manifest.json' });
    await archive.finalize();
    await completed;
  } catch (error) {
    archive.destroy();
    output.destroy();
    await completed.catch(() => {});
    await fsp.rm(destination, { force: true });
    throw error;
  }
  return {
    exportId,
    fileName,
    count: entries.length,
    cohort,
    downloadUrl: `/api/admin/exports/${exportId}/download?filename=${encodeURIComponent(fileName)}`,
  };
}

async function createS3Archive({ exportId, fileName, entries, manifest, cohort, bucket, region }) {
  const s3Client = new S3Client({ region });
  const key = `exports/${exportId}.zip`;
  const body = new PassThrough();
  const archive = await createZipArchive();
  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: 'application/zip',
      ContentDisposition: contentDisposition(fileName),
      Metadata: { cohort: encodeURIComponent(cohort), contentcount: String(entries.length) },
    },
  });
  const uploadPromise = upload.done();
  archive.on('error', (error) => body.destroy(error));
  archive.pipe(body);
  try {
    await appendContentFiles(archive, entries, { bucket, region, s3Client });
    archive.append(manifest.csv, { name: 'manifest.csv' });
    archive.append(manifest.json, { name: 'manifest.json' });
    await archive.finalize();
    await uploadPromise;
  } catch (error) {
    body.destroy(error);
    await upload.abort().catch(() => {});
    await uploadPromise.catch(() => {});
    throw error;
  }
  const downloadUrl = await getSignedUrl(s3Client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: DOWNLOAD_TTL_SECONDS });
  return { exportId, fileName, count: entries.length, cohort, downloadUrl, expiresIn: DOWNLOAD_TTL_SECONDS };
}

async function createCohortExport({ cohort, contents, appBaseUrl, bucket = process.env.S3_BUCKET, region = process.env.S3_REGION || 'ap-northeast-2', now = new Date() }) {
  const exportId = crypto.randomBytes(16).toString('hex');
  const entries = buildExportEntries(contents);
  const createdAt = now.toISOString();
  const fileName = exportFileName(cohort, now);
  const manifest = buildManifest(entries, { cohort, createdAt, appBaseUrl });
  if (!bucket) return createLocalArchive({ exportId, fileName, entries, manifest, cohort });
  return createS3Archive({ exportId, fileName, entries, manifest, cohort, bucket, region });
}

function localExportPath(exportId) {
  return EXPORT_ID_PATTERN.test(exportId) ? path.join(LOCAL_EXPORT_DIR, `${exportId}.zip`) : null;
}

module.exports = {
  DOWNLOAD_TTL_SECONDS,
  EXPORT_ID_PATTERN,
  LOCAL_EXPORT_DIR,
  buildExportEntries,
  buildManifest,
  contentDisposition,
  createCohortExport,
  exportFileName,
  localExportPath,
  safeFilenamePart,
};
