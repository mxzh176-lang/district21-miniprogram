const api = require('./api')

function callCloud(question, context) {
  if (!wx.cloud || !wx.cloud.callFunction) return Promise.resolve(null)
  return wx.cloud.callFunction({
    name: 'api',
    data: {
      action: 'askAssistant',
      question,
      context
    }
  }).then(result => {
    const response = result && result.result
    if (!response || !response.ok || !response.data || !response.data.answer) return null
    return response.data
  }).catch(() => null)
}

async function ask(question) {
  const local = await api.call('askAssistant', { question })
  const cloud = await callCloud(question, local.context)
  return cloud || local
}

module.exports = { ask }
