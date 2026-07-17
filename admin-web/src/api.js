import cloudbase from '@cloudbase/js-sdk'

const app = cloudbase.init({ env: import.meta.env.VITE_CLOUDBASE_ENV_ID })
let authReady

function withTimeout(promise, message, timeout = 12000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), timeout))
  ])
}

async function ensureAuth() {
  if (!authReady) {
    authReady = (async () => {
      const auth = app.auth({ persistence: 'local' })
      const state = await withTimeout(auth.getLoginState(), '连接 CloudBase 超时')
      if (!state) await withTimeout(auth.signInAnonymously(), '无法建立匿名会话，请在 CloudBase 开启匿名登录')
    })()
  }
  return authReady
}

export async function call(action, payload = {}, authenticated = true) {
  await ensureAuth()
  const adminToken = authenticated ? sessionStorage.getItem('adminAccessToken') || '' : ''
  const response = await withTimeout(app.callFunction({
    name: import.meta.env.VITE_CLOUDBASE_FUNCTION || 'api',
    data: { action, ...payload, adminToken }
  }), '调用后台服务超时，请检查 api 云函数')
  const result = response.result
  if (!result?.ok) {
    const error = new Error(result?.message || '服务暂不可用')
    error.code = result?.code
    throw error
  }
  return result.data
}

export function saveSession(data) {
  sessionStorage.setItem('adminAccessToken', data.accessToken)
  localStorage.setItem('adminRefreshToken', data.refreshToken)
  sessionStorage.setItem('adminUser', JSON.stringify(data.user || {}))
}

export function clearSession() {
  sessionStorage.removeItem('adminAccessToken')
  sessionStorage.removeItem('adminUser')
  localStorage.removeItem('adminRefreshToken')
}

export function hasSession() {
  return Boolean(sessionStorage.getItem('adminAccessToken') || localStorage.getItem('adminRefreshToken'))
}

export async function refreshSession() {
  const refreshToken = localStorage.getItem('adminRefreshToken')
  if (!refreshToken) return false
  try {
    saveSession(await call('adminRefresh', { refreshToken }, false))
    return true
  } catch {
    clearSession()
    return false
  }
}
