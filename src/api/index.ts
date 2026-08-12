// API 类型定义 + fetch 封装

export interface Engine {
  id: string
  name: string
  url: string
}

export interface AppConfig {
  title: string
  background: { type: 'color' | 'gradient' | 'image'; value: string }
  // 背景图模糊值(px),仅对 image 类型生效
  backgroundBlur: number
  // 背景遮罩透明度(0-1),仅对 image 类型生效
  backgroundMask: number
  theme: 'dark' | 'light' | 'auto'
  defaultEngine: string
  engines: Engine[]
  openInNewTab: boolean
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
}

export interface GroupsResponse {
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
  createGroup: (name: string) =>
    request<{ ok: boolean; group: Group }>('/api/groups', {
      method: 'POST',
      body: JSON.stringify({ name })
    }),
  updateGroup: (id: string, payload: { name?: string; sort?: number; allSorts?: Array<{ id: string; sort: number }> }) =>
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
  getTodos: () => request<{ todos: Todo[] }>('/api/todos'),
  createTodo: (text: string) =>
    request<{ ok: boolean; todo: Todo }>('/api/todos', {
      method: 'POST',
      body: JSON.stringify({ text })
    }),
  updateTodo: (id: string, payload: { text?: string; done?: boolean }) =>
    request<{ ok: boolean }>(`/api/todos/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),
  deleteTodo: (id: string) =>
    request<{ ok: boolean }>(`/api/todos/${id}`, { method: 'DELETE' }),

  // UI 状态(面板位置等)
  getUIState: () => request<Record<string, unknown>>('/api/ui'),
  saveUIState: (state: Record<string, unknown>) =>
    request<{ ok: boolean }>('/api/ui', { method: 'PUT', body: JSON.stringify(state) }),

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
