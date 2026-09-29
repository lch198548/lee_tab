// 功能插件注册表
// 以后新增"可开关"的功能(如天气、热搜、日历等)时:
// 1. 在 PLUGINS 里加一项 { id, name, desc, icon }
// 2. 常用页小组件 / 侧边栏入口等位置用 isPluginOn() 控制显示
// 3. 开关由设置中心「插件」TAB 自动渲染,无需改设置面板代码

import type { Component } from 'vue'
import type { AppConfig } from '@/api'
import { ClipboardIcon, ExchangeIcon, FlameIcon, NoteIcon } from '@/components/icons'

export interface PluginMeta {
  id: string
  name: string
  desc: string
  icon: Component
}

export const PLUGINS: PluginMeta[] = [
  {
    id: 'todo',
    name: '待办清单',
    desc: '常用页待办小组件与全屏管理弹窗',
    icon: ClipboardIcon
  },
  {
    id: 'notepad',
    name: '记事本',
    desc: '常用页记事本小组件与全屏管理弹窗',
    icon: NoteIcon
  },
  {
    id: 'hot',
    name: '热榜聚合',
    desc: '抖音/知乎/B站/百度/头条/贴吧热榜一站式浏览',
    icon: FlameIcon
  },
  {
    id: 'rate',
    name: '汇率换算',
    desc: '常用币种实时汇率磁贴与汇率换算器',
    icon: ExchangeIcon
  }
]

// 未配置 = 默认开启;显式 false = 关闭
export function isPluginOn(config: AppConfig | null | undefined, id: string): boolean {
  return config?.plugins?.[id] !== false
}
