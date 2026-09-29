// 内置分组图标集(20 个常用图标,lucide 风格 stroke SVG,渲染时用 currentColor)
// icon 数据结构:path 片段数组,统一在 GroupIcon.vue 中包裹 <svg stroke="currentColor">

export interface GroupIconDef {
  id: string
  label: string
  // SVG 内部元素(不含 <svg> 外壳),基于 24x24 viewBox
  paths: string[]
}

export const GROUP_ICONS: GroupIconDef[] = [
  {
    id: 'star',
    label: '常用',
    paths: [
      '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>'
    ]
  },
  {
    id: 'globe',
    label: '网页',
    paths: [
      '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>'
    ]
  },
  {
    id: 'code',
    label: '开发',
    paths: ['<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>']
  },
  {
    id: 'cloud',
    label: '云服务',
    paths: ['<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>']
  },
  {
    id: 'music',
    label: '音乐',
    paths: [
      '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'
    ]
  },
  {
    id: 'video',
    label: '视频',
    paths: [
      '<rect x="2" y="4" width="20" height="16" rx="3"/><polygon points="10 9 15 12 10 15"/>'
    ]
  },
  {
    id: 'game',
    label: '游戏',
    paths: [
      '<rect x="2" y="7" width="20" height="10" rx="5"/><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><circle cx="15" cy="13" r="0.5"/><circle cx="18" cy="11" r="0.5"/>'
    ]
  },
  {
    id: 'book',
    label: '学习',
    paths: [
      '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'
    ]
  },
  {
    id: 'work',
    label: '工作',
    paths: [
      '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>'
    ]
  },
  {
    id: 'users',
    label: '社交',
    paths: [
      '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'
    ]
  },
  {
    id: 'shopping',
    label: '购物',
    paths: [
      '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>'
    ]
  },
  {
    id: 'news',
    label: '资讯',
    paths: [
      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>'
    ]
  },
  {
    id: 'tool',
    label: '工具',
    paths: [
      '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>'
    ]
  },
  {
    id: 'plane',
    label: '出行',
    paths: ['<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>']
  },
  {
    id: 'food',
    label: '美食',
    paths: [
      '<path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>'
    ]
  },
  {
    id: 'heart',
    label: '健康',
    paths: [
      '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>'
    ]
  },
  {
    id: 'wallet',
    label: '财经',
    paths: ['<rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>']
  },
  {
    id: 'palette',
    label: '设计',
    paths: [
      '<circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>'
    ]
  },
  {
    id: 'mail',
    label: '邮箱',
    paths: ['<rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="22 6 12 13 2 6"/>']
  },
  {
    id: 'chat',
    label: '聊天',
    paths: [
      '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>'
    ]
  }
]

// 默认图标(未知 id 时兜底)
const DEFAULT_ICON: GroupIconDef = {
  id: 'default',
  label: '默认',
  paths: [
    '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>'
  ]
}

export function getGroupIcon(id?: string): GroupIconDef {
  if (!id) return DEFAULT_ICON
  return GROUP_ICONS.find((g) => g.id === id) || DEFAULT_ICON
}
