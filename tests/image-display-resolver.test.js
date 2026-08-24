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

test('resolver warns once without sensitive values when a successful batch omits a file URL', async () => {
  const warnings = []
  const rows = await resolveImageDisplayUrls([
    { fileId: 'cloud://env/resolved' },
    { fileId: 'cloud://env/missing' }
  ], {
    getTempFileURL: async () => ({
      fileList: [
        { fileID: 'cloud://env/resolved', tempFileURL: 'https://temp.example/resolved.jpg' },
        { fileID: 'cloud://env/missing', tempFileURL: '' }
      ]
    }),
    warn: (message, details) => warnings.push({ message, details })
  })

  assert.deepEqual(rows.map(row => row.imageUrl), [
    'https://temp.example/resolved.jpg',
    'cloud://env/missing'
  ])
  assert.deepEqual(warnings, [{
    message: 'image temp url batch incomplete',
    details: {
      batchIndex: 1,
      batchCount: 1,
      batchSize: 2,
      resolvedCount: 1,
      unresolvedCount: 1
    }
  }])
  const warningText = JSON.stringify(warnings)
  assert.equal(warningText.includes('cloud://'), false)
  assert.equal(warningText.includes('https://'), false)
})

test('invalid local and custom URLs do not mask a stable cloud id', async () => {
  const rows = await resolveImageDisplayUrls([
    { fileId: 'cloud://env/image-url', imageUrl: '/tmp/local.jpg' },
    { fileId: 'cloud://env/src', src: 'wxfile://local.jpg' },
    { fileId: 'cloud://env/url', url: 'custom://local.jpg' },
    { fileId: 'cloud://env/external', imageUrl: 'relative.jpg', src: 'https://static.example/external.jpg' }
  ], {
    getTempFileURL: async ({ fileList }) => ({
      fileList: fileList.map(fileID => ({ fileID, tempFileURL: '' }))
    })
  })

  assert.deepEqual(rows.map(row => row.imageUrl), [
    'cloud://env/image-url',
    'cloud://env/src',
    'cloud://env/url',
    'https://static.example/external.jpg'
  ])
})

test('resolver retains only HTTP or HTTPS display URLs when no stable id exists', async () => {
  const rows = await resolveImageDisplayUrls([
    { imageUrl: '/tmp/local.jpg', src: 'wxfile://local.jpg', url: 'custom://local.jpg' },
    { imageUrl: 'http://static.example/plain.jpg' },
    { src: 'https://static.example/secure.jpg' }
  ], {
    getTempFileURL: async () => ({ fileList: [] })
  })

  assert.deepEqual(rows.map(row => row.imageUrl), [
    '',
    'http://static.example/plain.jpg',
    'https://static.example/secure.jpg'
  ])
})

test('resolver rejects persisted CloudBase signed URLs when no stable file id exists', async () => {
  const rows = await resolveImageDisplayUrls([
    {
      imageUrl: 'https://bucket.tcb.qcloud.la/archive/photo.jpg?sign=expired&t=1785565519'
    },
    {
      imageUrl: 'https://static.example/permanent.jpg'
    }
  ], {
    getTempFileURL: async () => ({ fileList: [] })
  })

  assert.deepEqual(rows.map(row => row.imageUrl), [
    '',
    'https://static.example/permanent.jpg'
  ])
})
