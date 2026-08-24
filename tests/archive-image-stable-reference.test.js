const test = require('node:test')
const assert = require('node:assert/strict')

const {
  preserveStableArchiveImages,
  storageObjectKey
} = require('../cloudfunctions/api/archive-image-stable-reference')

test('storage object keys match cloud file ids with encoded temporary URLs', () => {
  const objectKey = '中国狮子联会/远航服务队/例会_1.jpg'

  assert.equal(
    storageObjectKey(`cloud://env.bucket/${objectKey}`),
    objectKey
  )
  assert.equal(
    storageObjectKey(`https://bucket.tcb.qcloud.la/${encodeURI(objectKey)}?sign=temporary&t=1785565519`),
    objectKey
  )
})

test('older clients cannot replace an active cloud file id with its temporary URL', () => {
  const objectKey = '中国狮子联会/远航服务队/例会_1.jpg'
  const fileId = `cloud://env.bucket/${objectKey}`
  const images = preserveStableArchiveImages([
    {
      imageUrl: `https://bucket.tcb.qcloud.la/${encodeURI(objectKey)}?sign=temporary&t=1785565519`
    }
  ], [
    {
      status: 'active',
      fileId,
      objectKey
    }
  ])

  assert.deepEqual(images, [{ fileId, imageUrl: '', objectKey }])
})

test('deleted stable references are not revived after the storage object was removed', () => {
  const objectKey = 'archive/deleted.jpg'
  const imageUrl = `https://bucket.tcb.qcloud.la/${objectKey}?sign=expired&t=1785565519`
  const images = preserveStableArchiveImages([{ imageUrl }], [{
    status: 'deleted',
    fileId: `cloud://env.bucket/${objectKey}`,
    objectKey
  }])

  assert.deepEqual(images, [{ imageUrl }])
})

test('permanent external URLs are never replaced merely because their pathname matches', () => {
  const objectKey = 'archive/permanent.jpg'
  const imageUrl = `https://static.example/${objectKey}`
  const images = preserveStableArchiveImages([{ imageUrl }], [{
    status: 'active',
    fileId: `cloud://env.bucket/${objectKey}`,
    objectKey
  }])

  assert.deepEqual(images, [{ imageUrl }])
})

test('canonicalization deduplicates cloud ids and differently signed URLs before image limits apply', () => {
  const objectKey = 'archive/repeated.jpg'
  const fileId = `cloud://env.bucket/${objectKey}`
  const images = preserveStableArchiveImages([
    { fileId },
    { imageUrl: `https://bucket.tcb.qcloud.la/${objectKey}?sign=first&t=1785565519` },
    { imageUrl: `https://bucket.tcb.qcloud.la/${objectKey}?sign=second&t=1785565520` },
    { imageUrl: 'https://static.example/unique.jpg' }
  ], [{ status: 'active', fileId, objectKey }])

  assert.deepEqual(images, [
    { fileId },
    { imageUrl: 'https://static.example/unique.jpg' }
  ])
})
