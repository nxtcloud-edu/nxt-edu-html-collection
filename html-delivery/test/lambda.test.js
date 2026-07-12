const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { handler } = require('../lambda');

test('Lambda handler를 함수로 export한다', () => {
  assert.equal(typeof handler, 'function');
});

test('Lambda가 PNG 응답을 base64 바이너리로 전달한다', async () => {
  const response = await handler({
    version: '2.0',
    routeKey: 'GET /assets/nxtcloud-logo.png',
    rawPath: '/assets/nxtcloud-logo.png',
    rawQueryString: '',
    headers: { host: 'example.test' },
    requestContext: {
      http: { method: 'GET', path: '/assets/nxtcloud-logo.png', protocol: 'HTTP/1.1', sourceIp: '127.0.0.1' },
    },
  }, {});
  const source = await readFile(path.join(__dirname, '../public/assets/nxtcloud-logo.png'));
  const served = Buffer.from(response.body, 'base64');

  assert.equal(response.statusCode, 200);
  assert.equal(response.isBase64Encoded, true);
  assert.match(response.headers['content-type'], /^image\/png/);
  assert.equal(createHash('md5').update(served).digest('hex'), createHash('md5').update(source).digest('hex'));
});
