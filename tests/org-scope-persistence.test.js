const test = require('node:test')
const assert = require('node:assert/strict')

test('selected service team remains in local storage', () => {
  const storage = {}
  global.wx = {
    getStorageSync(key) { return storage[key] },
    setStorageSync(key, value) { storage[key] = value }
  }
  const orgScope = require('../miniprogram/utils/org-scope')

  orgScope.setCurrentScopeByTeamId('yuanhang')
  assert.equal(orgScope.getCurrentScope().teamId, 'yuanhang')
  assert.equal(storage[orgScope.STORAGE_KEY].orgName, '远航服务队')

  delete global.wx
})
