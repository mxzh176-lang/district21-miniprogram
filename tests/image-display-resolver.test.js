const test = require('node:test')
const assert = require('node:assert/strict')
const { fileIdOf, resolveImageDisplayUrls } = require('../cloudfunctions/api/image-display-resolver')

test('resolver accepts fileId and legacy fileID while preserving external imageUrl', async () => {
  const rows = await resolveImageDisplayUrls([
    { id: 'a', fileId: 'cloud://env/a' },
    { id: 'b', fileID: 'cloud://env/b' },
    { id: 'c', imageUrl: 'https://static.example/c.jpg' }
  ], {
    getTempFileURL: async ({ fileList }) => ({
      fileList: fileList.map(fileID => ({ fileID, tempFileURL: `https://temp.example/${fileID.slice(-1)}` }))
    })
  })

  assert.equal(fileIdOf({ fileID: 'cloud://env/b' }), 'cloud://env/b')
  assert.deepEqual(rows.map(row => row.imageUrl), [
    'https://temp.example/a',
    'https://temp.example/b',
    'https://static.example/c.jpg'
  ])
  assert.equal(rows[1].fileID, 'cloud://env/b')
  assert.equal(rows[1].fileId, 'cloud://env/b')
})

test('resolver keeps successful batches and stable ids when one batch fails', async () => {
  const warnings = []
  const rows = await resolveImageDisplayUrls([
    { fileId: 'cloud://env/1' },
    { fileId: 'cloud://env/2' },
    { fileId: 'cloud://env/3' }
  ], {
    batchSize: 1,
    getTempFileURL: async ({ fileList }) => {
      if (fileList[0].endsWith('/2')) throw new Error('batch failed')
      return { fileList: [{ fileID: fileList[0], tempFileURL: `https://temp.example/${fileList[0].slice(-1)}` }] }
    },
    warn: (message, details) => warnings.push({ message, details })
  })

  assert.deepEqual(rows.map(row => row.imageUrl), [
    'https://temp.example/1',
    'cloud://env/2',
    'https://temp.example/3'
  ])
  assert.equal(warnings.length, 1)
  assert.equal(warnings[0].details.batchSize, 1)
})

test('resolver converts every image beyond the platform batch limit', async () => {
  const rows = Array.from({ length: 73 }, (_, index) => ({ fileID: `cloud://env/${index + 1}` }))
  const calls = []
  const resolved = await resolveImageDisplayUrls(rows, {
    getTempFileURL: async ({ fileList }) => {
      calls.push(fileList.slice())
      return {
        fileList: fileList.map(fileID => ({
          fileID,
          tempFileURL: `https://temp.example/${fileID.split('/').pop()}`
        }))
      }
    }
  })
  assert.deepEqual(calls.map(call => call.length).sort((a, b) => a - b), [23, 50])
  assert.equal(resolved[72].imageUrl, 'https://temp.example/73')
})
