const test = require('node:test');
const assert = require('node:assert/strict');
const { handler } = require('../lambda');

test('Lambda handler를 함수로 export한다', () => {
  assert.equal(typeof handler, 'function');
});
