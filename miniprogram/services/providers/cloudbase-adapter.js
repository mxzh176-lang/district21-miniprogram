let initialized = false

function initialize(options = {}) {
  if (initialized || !wx.cloud) return initialized
  wx.cloud.init({
    env: options.env,
    traceUser: options.traceUser !== false
  })
  initialized = true
  return true
}

function invoke(action, data = {}, options = {}) {
  if (!wx.cloud || !wx.cloud.callFunction) {
    return Promise.reject(new Error('当前基础库不支持云开发'))
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error('云服务响应超时，已切换本地数据')
      error.code = 'CLOUD_TIMEOUT'
      reject(error)
    }, options.timeout || 15000)
    wx.cloud.callFunction({
      name: options.functionName || 'api',
      data: { action, ...data }
    }).then(response => {
      clearTimeout(timer)
      const result = response && response.result
      if (!result || !result.ok) {
        const error = new Error(result && result.message ? result.message : '云服务调用失败')
        error.code = result && result.code ? result.code : 'CLOUD_CALL_FAILED'
        reject(error)
        return
      }
      resolve(result.data)
    }).catch(error => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

function uploadFile(cloudPath, filePath) {
  if (!wx.cloud || !wx.cloud.uploadFile) {
    return Promise.reject(new Error('当前基础库不支持云存储上传'))
  }
  return wx.cloud.uploadFile({ cloudPath, filePath })
}

module.exports = { initialize, invoke, uploadFile }
