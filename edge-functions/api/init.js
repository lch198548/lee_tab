import {
  getKV,
  kvGetJSON,
  getGroupsData,
  isAuthenticated,
  jsonResponse
} from '../_lib/kv.js'

// GET /api/init -> 一次请求返回登录状态 + 配置 + 全部分组书签
// 公开路径(无需鉴权),内部自行判断登录态
export async function onRequestGet({ request, env }) {
  const kv = getKV(env)
  if (!kv) {
    return jsonResponse({ loggedIn: false, reason: '存储未就绪', passwordSet: false, config: null, groups: [] })
  }

  // 并行读取:鉴权 + 密码是否已设置
  const [auth, stored] = await Promise.all([
    isAuthenticated(request, env),
    kvGetJSON(kv, 'auth_password', null)
  ])

  const passwordSet = !!(stored && (stored.value || stored.hash))

  if (!auth.ok) {
    return jsonResponse({ loggedIn: false, reason: auth.reason, passwordSet, config: null, groups: [] })
  }

  // 已登录:并行读取配置 + 分组数据 + UI 状态(常用页布局等,渲染前同步水合避免二次跳变)
  const [config, groups, ui] = await Promise.all([
    kvGetJSON(kv, 'config', null),
    getGroupsData(kv),
    kvGetJSON(kv, 'ui_state', null)
  ])

  return jsonResponse({
    loggedIn: true,
    reason: null,
    passwordSet,
    config: config || null,
    groups,
    ui: ui || null
  })
}