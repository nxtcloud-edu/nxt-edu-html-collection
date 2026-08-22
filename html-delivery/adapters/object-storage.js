const fs = require('node:fs/promises');
const path = require('node:path');
const { DeleteObjectCommand, PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');

function createObjectStorage({
  bucket = process.env.S3_BUCKET,
  region = process.env.S3_REGION || 'ap-northeast-2',
  publicBaseUrl = process.env.BASE_URL,
  localDirectory,
  localPort = Number(process.env.PORT || 3210),
  createClient = () => new S3Client({ region }),
} = {}) {
  if (!localDirectory) throw new TypeError('object storage localDirectory is required');
  let client;
  const s3 = () => {
    if (!client) client = createClient();
    return client;
  };

  function publicUrl(key) {
    if (!bucket) return `http://localhost:${localPort}/deployed/${key}`;
    const base = (publicBaseUrl || `https://${bucket}.s3.${region}.amazonaws.com`).replace(/\/$/, '');
    return `${base}/${key}`;
  }

  async function putHtml(key, buffer, metadata) {
    if (!bucket) {
      const destination = path.join(localDirectory, key);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, buffer, { flag: 'wx' });
      return;
    }
    await s3().send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: 'text/html; charset=utf-8',
      IfNoneMatch: '*',
      Metadata: metadata,
    }));
  }

  async function deleteObject(key) {
    if (!bucket) {
      await fs.rm(path.join(localDirectory, key), { force: true });
      return;
    }
    await s3().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }

  return Object.freeze({ deleteObject, publicUrl, putHtml });
}

module.exports = { createObjectStorage };
