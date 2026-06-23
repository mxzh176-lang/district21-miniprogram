const cloudbase = require('./providers/cloudbase-adapter')

const ACTIONS = ['listHonorRecords', 'saveHonorRecord', 'deleteHonorRecord']
const STORAGE_KEY = 'demoHonorRecordsV1'

function handles(action) { return ACTIONS.includes(action) }

async function execute(action, payload, localFallback) {
  try {
    return await cloudbase.invoke(action, payload)
  } catch (error) {
    if (action !== 'listHonorRecords') throw error
    return localHonorCall(action, payload, localFallback)
  }
}

function localHonorCall(action) {
  if (action !== 'listHonorRecords') return Promise.reject(new Error('云端不可用，暂不能修改荣誉数据'))
  try { return Promise.resolve(wx.getStorageSync(STORAGE_KEY) || []) } catch (error) { return Promise.resolve([]) }
}

module.exports = { handles, execute }
