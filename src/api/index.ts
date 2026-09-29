// API 类型定义 + fetch 封装

export interface Engine {
  id: string
  name: string
  url: string
}

export interface AppConfig {
  title: string
  background: { type: 'color' | 'gradient' | 'image' | 'video' | 'bing'; value: string }
  // bing 类型时 value 为空 = 每日一图自动更换;为 YYYYMMDD = 固定某天壁纸
  // 背景图/视频模糊值(px),仅对 image/video 类型生效
  backgroundBlur: number
  // 背景遮罩透明度(0-1),仅对 image/video 类型生效
  backgroundMask: number
  defaultEngine: string
  engines: Engine[]
  openInNewTab: boolean
  // 功能插件开关(未设置的插件默认开启;key 见 src/plugins.ts 注册表)
  plugins?: Record<string, boolean>
}

export interface Bookmark {
  id: string
  name: string
  url: string
  icon: string
  desc: string
  sort: number
  clicks: number
  createdAt: number
  // 是否常用(常用显示在分组顶部)
  favorite?: boolean
}

export interface Group {
  id: string
  name: string
  sort: number
  // 分组图标(内置图标集的 id,如 'star'/'code';空 = 默认图标)
  icon?: string
  bookmarks: Bookmark[]
}

export interface Note {
  id: string
  content: string
  bgColor: string
  textColor: string
  x: number
  y: number
  width: number
  height: number
  createdAt: number
  updatedAt: number
}

export interface Todo {
  id: string
  text: string
  done: boolean
  createdAt: number
  completedAt: number | null
  important?: boolean
  listId?: string | null
}

export interface TodoList {
  id: string
  name: string
}

// 热榜条目(热值为原始数值,展示时格式化为"xx 万")
export interface HotItem {
  title: string
  url: string
  hot: number | null
}

// 热榜源元数据(与后端 /api/hot 支持的 source 一致)
export interface HotSourceMeta {
  id: string
  name: string
}

// 支持的热榜源(前端 tab / 磁贴默认源选择共用;与后端 /api/hot 的 source 一致)
// 注:微博需登录态(匿名 403)、V2EX 境内直连超时,均不可用未收录
export const HOT_SOURCES: HotSourceMeta[] = [
  { id: 'douyin', name: '抖音' },
  { id: 'zhihu', name: '知乎' },
  { id: 'bilibili', name: 'B站' },
  { id: 'baidu', name: '百度' },
  { id: 'toutiao', name: '头条' },
  { id: 'tieba', name: '贴吧' }
]

// 汇率数据(以 CNY 为基准:1 CNY = rates[币种] 外币)
export interface RateInfo {
  base: string
  rates: Record<string, number>
  updated: number // 数据更新时间(毫秒时间戳)
  date: string // 汇率日期(YYYY-MM-DD)
}

// 磁贴/换算器展示的币种(unit = 展示时按多少单位外币折算,如日元按 100)
export interface RateCurrencyMeta {
  ccy: string
  name: string
  unit: number
}

export const RATE_CURRENCIES: RateCurrencyMeta[] = [
  { ccy: 'USD', name: '美元', unit: 1 },
  { ccy: 'EUR', name: '欧元', unit: 1 },
  { ccy: 'JPY', name: '日元', unit: 100 },
  { ccy: 'HKD', name: '港元', unit: 1 },
  { ccy: 'GBP', name: '英镑', unit: 1 },
  { ccy: 'KRW', name: '韩元', unit: 100 },
  { ccy: 'SGD', name: '新加坡元', unit: 1 },
  { ccy: 'AUD', name: '澳元', unit: 1 },
  { ccy: 'CAD', name: '加元', unit: 1 },
  { ccy: 'CHF', name: '瑞士法郎', unit: 1 },
  { ccy: 'TWD', name: '新台币', unit: 1 },
  { ccy: 'MOP', name: '澳门元', unit: 1 },
  { ccy: 'THB', name: '泰铢', unit: 1 },
  { ccy: 'MYR', name: '林吉特', unit: 1 },
  { ccy: 'VND', name: '越南盾', unit: 100 },
  { ccy: 'PHP', name: '菲律宾比索', unit: 1 },
  { ccy: 'RUB', name: '卢布', unit: 1 },
  { ccy: 'INR', name: '印度卢比', unit: 1 },
  { ccy: 'NZD', name: '纽元', unit: 1 },
  { ccy: 'CNY', name: '人民币', unit: 1 }
]

// 壁纸图库条目(多源统一结构;thumb 用于网格预览,url 为全尺寸原图)
export interface WallpaperItem {
  id: string
  title: string
  thumb: string
  url: string
}

export interface GroupsResponse {
  groups: Group[]
}

export interface InitResponse {
  loggedIn: boolean
  reason: string | null
  passwordSet: boolean
  config: AppConfig | null
  groups: Group[]
}

async function request<T = unknown>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  })

  if (res.status === 401) {
    // 触发跳转登录页
    const evt = new CustomEvent('auth:unauthorized')
    window.dispatchEvent(evt)
    throw new Error('未登录')
  }

  const ct = res.headers.get('content-type') || ''
  if (!res.ok) {
    let msg = `请求失败 (${res.status})`
    if (ct.includes('application/json')) {
      const data = await res.json().catch(() => ({}))
      msg = data.error || msg
    }
    throw new Error(msg)
  }

  if (ct.includes('application/json')) {
    return res.json() as Promise<T>
  }
  return (await res.text()) as unknown as T
}

export const api = {
  // 初始化(合并登录态 + 配置 + 分组,一次请求)
  getInit: () => request<InitResponse>('/api/init'),

  // 鉴权
  checkLogin: () => request<{ loggedIn: boolean; reason: string | null; passwordSet: boolean }>('/api/auth/check'),
  login: (password: string) =>
    request<{ ok: boolean; firstSetup: boolean; expiresAt: number }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password })
    }),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  // 配置
  getConfig: () => request<AppConfig>('/api/config'),
  saveConfig: (config: AppConfig) =>
    request<{ ok: boolean }>('/api/config', { method: 'PUT', body: JSON.stringify(config) }),

  // 分组
  getGroups: () => request<GroupsResponse>('/api/groups'),
  createGroup: (name: string, icon = '') =>
    request<{ ok: boolean; group: Group }>('/api/groups', {
      method: 'POST',
      body: JSON.stringify({ name, icon })
    }),
  updateGroup: (id: string, payload: { name?: string; icon?: string; sort?: number; allSorts?: Array<{ id: string; sort: number }> }) =>
    request<{ ok: boolean }>(`/api/groups/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteGroup: (id: string) =>
    request<{ ok: boolean }>(`/api/groups/${id}`, { method: 'DELETE' }),

  // 书签
  addBookmark: (groupId: string, bookmark: Partial<Bookmark>) =>
    request<{ ok: boolean; bookmark: Bookmark }>(`/api/groups/${groupId}/bookmarks`, {
      method: 'POST',
      body: JSON.stringify(bookmark)
    }),
  saveBookmarks: (groupId: string, bookmarks: Bookmark[]) =>
    request<{ ok: boolean; bookmarks: Bookmark[] }>(`/api/groups/${groupId}/bookmarks`, {
      method: 'PUT',
      body: JSON.stringify({ bookmarks })
    }),
  // 跨分组移动书签(后端单次原子写入)
  moveBookmark: (fromGroupId: string, bookmarkId: string, toGroupId: string) =>
    request<{ ok: boolean }>(`/api/groups/${fromGroupId}/move`, {
      method: 'POST',
      body: JSON.stringify({ bookmarkId, toGroupId })
    }),

  // 便利贴
  getNotes: () => request<{ notes: Note[] }>('/api/notes'),
  createNote: (note: Partial<Note>) =>
    request<{ ok: boolean; note: Note }>('/api/notes', {
      method: 'POST',
      body: JSON.stringify(note)
    }),
  updateNote: (id: string, payload: Partial<Note>) =>
    request<{ ok: boolean }>(`/api/notes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),
  deleteNote: (id: string) =>
    request<{ ok: boolean }>(`/api/notes/${id}`, { method: 'DELETE' }),
  saveAllNotes: (notes: Note[]) =>
    request<{ ok: boolean }>('/api/notes', {
      method: 'PUT',
      body: JSON.stringify({ notes })
    }),

  // To-do List
  getTodos: () => request<{ todos: Todo[]; lists: TodoList[] }>('/api/todos'),
  createTodo: (text: string, listId?: string | null, important = false) =>
    request<{ ok: boolean; todo: Todo }>('/api/todos', {
      method: 'POST',
      body: JSON.stringify({ text, listId: listId || null, important })
    }),
  updateTodo: (id: string, payload: { text?: string; done?: boolean; important?: boolean; listId?: string | null }) =>
    request<{ ok: boolean }>(`/api/todos/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),
  deleteTodo: (id: string) =>
    request<{ ok: boolean }>(`/api/todos/${id}`, { method: 'DELETE' }),

  // 清单
  createTodoList: (name: string) =>
    request<{ ok: boolean; list: TodoList }>('/api/todos/lists', {
      method: 'POST',
      body: JSON.stringify({ name })
    }),
  renameTodoList: (id: string, name: string) =>
    request<{ ok: boolean }>(`/api/todos/lists?id=${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ name })
    }),
  deleteTodoList: (id: string) =>
    request<{ ok: boolean }>(`/api/todos/lists?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // 热榜聚合(服务端代理各源 + 10min 缓存;单源失败返回该源错误)
  getHot: (source: string) =>
    request<{ items: HotItem[]; updated: string }>(
      `/api/hot?source=${encodeURIComponent(source)}`
    ),

  // 实时汇率(以 CNY 为基准,服务端代理 + 1h 缓存)
  getRates: () => request<RateInfo>('/api/rate'),

  // UI 状态(面板位置等)
  getUIState: () => request<Record<string, unknown>>('/api/ui'),
  saveUIState: (state: Record<string, unknown>) =>
    request<{ ok: boolean }>('/api/ui', { method: 'PUT', body: JSON.stringify(state) }),

  // 壁纸图库(多源元数据,图片前端直连;source: bing|picsum|wallhaven)
  getWallpapers: (source: string, q = '', page = 1) =>
    request<{ gallery: WallpaperItem[] }>(
      `/api/wallpaper?source=${encodeURIComponent(source)}&q=${encodeURIComponent(q)}&page=${page}`
    ),

  // 备份
  exportBackup: async (): Promise<string> => {
    const res = await fetch('/api/backup', { credentials: 'include' })
    if (!res.ok) throw new Error('导出失败')
    return res.text()
  },
  importBackup: (json: string) =>
    request<{ ok: boolean; count: number }>('/api/backup', {
      method: 'POST',
      body: json
    })
}
