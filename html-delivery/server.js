const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const express = require('express');
const multer = require('multer');
const { PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');

const PORT = Number(process.env.PORT || 3210);
const MAX_FILE_SIZE = 1024 * 1024;
const LOCAL_DEPLOY_DIR = path.join(__dirname, '.local-deploy');
const UPLOAD_LOG = path.join(__dirname, 'uploads.log.jsonl');

function validateUploadInput({ affiliation, name, file }) {
  const errors = [];
  const trimmedAffiliation = typeof affiliation === 'string' ? affiliation.trim() : '';
  const trimmedName = typeof name === 'string' ? name.trim() : '';
  if (!trimmedAffiliation || trimmedAffiliation.length > 40) errors.push('소속은 1~40자로 입력하세요.');
  if (!trimmedName || trimmedName.length > 40) errors.push('이름은 1~40자로 입력하세요.');
  if (!file) errors.push('HTML 파일을 선택하세요.');
  else {
    if (path.extname(file.originalname).toLowerCase() !== '.html') errors.push('HTML 파일만 업로드할 수 있습니다.');
    if (file.size > MAX_FILE_SIZE) errors.push('파일 크기는 1MB 이하여야 합니다.');
  }
  return { errors, affiliation: trimmedAffiliation, name: trimmedName };
}

function createObjectKey(now = new Date()) {
  const stamp = now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const random = crypto.randomBytes(2).toString('hex');
  return `games/${stamp}-${random}.html`;
}

function publicUrl(key) {
  const baseUrl = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
  return process.env.S3_BUCKET ? `${baseUrl}/${key}` : `${baseUrl}/deployed/${key}`;
}

function encodeMetadataValue(value) {
  return encodeURIComponent(value);
}

async function appendUploadLog(entry) {
  await fs.appendFile(UPLOAD_LOG, `${JSON.stringify(entry)}\n`, 'utf8');
}

async function saveLocally(key, buffer) {
  const destination = path.join(LOCAL_DEPLOY_DIR, key);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, buffer);
}

async function saveToS3(key, buffer, metadata) {
  const client = new S3Client({ region: process.env.S3_REGION || 'ap-northeast-2' });
  await client.send(new PutObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: 'text/html; charset=utf-8',
    Metadata: metadata,
  }));
}

async function storeUpload({ key, buffer, affiliation, name, uploadedAt }) {
  const metadata = {
    affiliation: encodeMetadataValue(affiliation),
    name: encodeMetadataValue(name),
    uploadedAt,
  };
  if (process.env.S3_BUCKET) {
    await saveToS3(key, buffer, metadata);
    try {
      await appendUploadLog({ affiliation, name, key, url: publicUrl(key), uploadedAt });
    } catch (error) {
      console.warn('업로드 로그 기록 실패:', error);
    }
  } else {
    await saveLocally(key, buffer);
    await appendUploadLog({ affiliation, name, key, url: publicUrl(key), uploadedAt });
  }
}

function createApp() {
  const app = express();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_SIZE } });
  app.use(express.static(path.join(__dirname, 'public')));
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.get('/deployed/*splat', async (req, res, next) => {
    try {
      const key = Array.isArray(req.params.splat) ? req.params.splat.join('/') : req.params.splat;
      const filePath = path.join(LOCAL_DEPLOY_DIR, key);
      if (!filePath.startsWith(`${LOCAL_DEPLOY_DIR}${path.sep}`)) return res.sendStatus(404);
      const contents = await fs.readFile(filePath);
      return res.type('html').send(contents);
    } catch (error) {
      if (error.code === 'ENOENT') return res.sendStatus(404);
      return next(error);
    }
  });
  app.post('/api/upload', upload.single('file'), async (req, res, next) => {
    try {
      const result = validateUploadInput({ ...req.body, file: req.file });
      if (result.errors.length) return res.status(400).json({ error: result.errors[0], details: result.errors });
      const key = createObjectKey();
      const uploadedAt = new Date().toISOString();
      await storeUpload({ key, buffer: req.file.buffer, affiliation: result.affiliation, name: result.name, uploadedAt });
      return res.status(201).json({ url: publicUrl(key), key, uploadedAt });
    } catch (error) { return next(error); }
  });
  app.use((error, _req, res, _next) => {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: '파일 크기는 1MB 이하여야 합니다.' });
    console.error(error);
    return res.status(500).json({ error: '업로드 처리 중 오류가 발생했습니다.' });
  });
  return app;
}

if (require.main === module) createApp().listen(PORT, () => console.log(`html-delivery 서버 실행: http://localhost:${PORT}`));

module.exports = { MAX_FILE_SIZE, createApp, createObjectKey, encodeMetadataValue, publicUrl, validateUploadInput };
