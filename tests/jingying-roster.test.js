const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')
const data = require('../miniprogram/data/mock-data')

const EXPECTED = ['王丽', '杨帆', '陈纯玉', '杨丽莹', '付艳超', '孙明龙', '孙洪涛', '于永和', '张影', '周钰慧', '裴大伟', '林衍伟', '安铁', '薛允丽', '郭晓红', '张淑云', '李永生', '王继芳', '吕洪威', '任凤影', '张南翔', '程传海', '刘明海', '陈俊超', '谢巍巍']

test('jingying roster matches the supplied 25 members', () => {
  assert.deepEqual(data.members.filter(item => item.teamId === 'jingying').map(item => item.name), EXPECTED)
  assert.equal(data.teams.find(item => item.id === 'jingying').members, 25)
})

test('cloud directory uses the same jingying roster and retains future admin additions', () => {
  const cloud = fs.readFileSync(path.resolve(__dirname, '../cloudfunctions/api/index.js'), 'utf8')
  EXPECTED.forEach(name => assert.match(cloud, new RegExp(name)))
  assert.doesNotMatch(cloud, /付艳秋|张永祺|周玉慧/)
  assert.match(cloud, /item\.directoryManaged/)
  assert.match(cloud, /directoryManaged: true/)
})
