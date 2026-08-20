// 配色主题:内置预设 + CSS 变量映射与应用
import type { ThemeConfig } from '@/api'

// ThemeConfig 字段 -> CSS 变量名 映射
export const THEME_VARS: Record<keyof Omit<ThemeConfig, 'id' | 'name'>, string> = {
  // 基础
  bgPage: '--bg-page',
  bgCard: '--bg-card',
  bgCardHover: '--bg-card-hover',
  bgGlass: '--bg-glass',
  bgGlassStrong: '--bg-glass-strong',
  bgModal: '--bg-modal',
  bgInput: '--bg-input',
  textPrimary: '--text-primary',
  textSecondary: '--text-secondary',
  textMuted: '--text-muted',
  borderColor: '--border-color',
  borderStrong: '--border-strong',
  accent: '--accent',
  accentHover: '--accent-hover',
  danger: '--danger',
  success: '--success',
  warning: '--warning',
  // 搜索框
  searchBg: '--search-bg',
  searchText: '--search-text',
  searchPlaceholder: '--search-placeholder',
  searchBtnBg: '--search-btn-bg',
  searchBtnIcon: '--search-btn-icon',
  // 搜索 tab
  searchTabDefaultBg: '--search-tab-default-bg',
  searchTabActiveBg: '--search-tab-active-bg',
  searchTabText: '--search-tab-text',
  searchTabActiveText: '--search-tab-active-text',
  // 分组标签
  groupTabDefaultBg: '--group-tab-default-bg',
  groupTabActiveBg: '--group-tab-active-bg',
  groupTabText: '--group-tab-text',
  groupTabActiveText: '--group-tab-active-text',
  // 书签文字
  bookmarkText: '--bookmark-text',
  bookmarkFontSize: '--bookmark-font-size',
  // 顶部导航
  topbarBg: '--topbar-bg',
  topbarOpacity: '--topbar-opacity',
  // 图标
  iconColor: '--icon-color',
  iconSize: '--icon-size',
  // 右侧切换
  sidebarBg: '--sidebar-bg',
  sidebarDot: '--sidebar-dot',
  sidebarDotActive: '--sidebar-dot-active',
  sidebarArrow: '--sidebar-arrow',
  sidebarText: '--sidebar-text'
}

// 默认值(深色基调,作为生成内置主题的基础)
const DEFAULTS: Omit<ThemeConfig, 'id' | 'name'> = {
  bgPage: '#1f2937',
  bgCard: 'rgba(255,255,255,0.06)',
  bgCardHover: 'rgba(255,255,255,0.12)',
  bgGlass: 'rgba(20,25,35,0.5)',
  bgGlassStrong: 'rgba(20,25,35,0.75)',
  bgModal: '#374151',
  bgInput: 'rgba(255,255,255,0.08)',
  textPrimary: '#f3f4f6',
  textSecondary: '#9ca3af',
  textMuted: '#6b7280',
  borderColor: 'rgba(255,255,255,0.1)',
  borderStrong: 'rgba(255,255,255,0.2)',
  accent: '#60a5fa',
  accentHover: '#3b82f6',
  danger: '#f87171',
  success: '#34d399',
  warning: '#fbbf24',
  searchBg: 'rgba(20,25,35,0.75)',
  searchText: '#f3f4f6',
  searchPlaceholder: '#6b7280',
  searchBtnBg: '#60a5fa',
  searchBtnIcon: '#ffffff',
  searchTabDefaultBg: 'transparent',
  searchTabActiveBg: '#60a5fa',
  searchTabText: '#9ca3af',
  searchTabActiveText: '#ffffff',
  groupTabDefaultBg: 'rgba(255,255,255,0.06)',
  groupTabActiveBg: '#60a5fa',
  groupTabText: '#9ca3af',
  groupTabActiveText: '#ffffff',
  bookmarkText: '#f3f4f6',
  bookmarkFontSize: 14,
  topbarBg: 'rgba(20,25,35,0.5)',
  topbarOpacity: 0.5,
  iconColor: '#9ca3af',
  iconSize: 17,
  sidebarBg: 'rgba(20,25,35,0.75)',
  sidebarDot: '#6b7280',
  sidebarDotActive: '#60a5fa',
  sidebarArrow: '#9ca3af',
  sidebarText: '#f3f4f6'
}

function makeTheme(
  id: string,
  name: string,
  partial: Partial<Omit<ThemeConfig, 'id' | 'name'>> = {}
): ThemeConfig {
  return { id, name, ...DEFAULTS, ...partial }
}

// 内置主题
export const BUILTIN_THEMES: ThemeConfig[] = [
  makeTheme('dark', '默认深色'),
  makeTheme('aurora', '极光蓝', {
    bgPage: '#0b1e3a',
    bgModal: '#12294d',
    bgGlass: 'rgba(11,30,58,0.5)',
    bgGlassStrong: 'rgba(11,30,58,0.78)',
    accent: '#38bdf8',
    accentHover: '#0ea5e9',
    searchBg: 'rgba(8,20,40,0.8)',
    searchBtnBg: '#38bdf8',
    searchTabActiveBg: '#38bdf8',
    groupTabActiveBg: '#38bdf8',
    sidebarBg: 'rgba(8,20,40,0.8)',
    sidebarDotActive: '#38bdf8'
  }),
  makeTheme('forest', '森林绿', {
    bgPage: '#0e2a1e',
    bgModal: '#14392a',
    bgGlass: 'rgba(14,42,30,0.5)',
    bgGlassStrong: 'rgba(14,42,30,0.78)',
    accent: '#34d399',
    accentHover: '#10b981',
    searchBg: 'rgba(10,32,24,0.8)',
    searchBtnBg: '#34d399',
    searchTabActiveBg: '#34d399',
    groupTabActiveBg: '#34d399',
    sidebarBg: 'rgba(10,32,24,0.8)',
    sidebarDotActive: '#34d399'
  }),
  makeTheme('sunset', '落日橙', {
    bgPage: '#2a1610',
    bgModal: '#3b2117',
    bgGlass: 'rgba(42,22,16,0.5)',
    bgGlassStrong: 'rgba(42,22,16,0.78)',
    accent: '#fb923c',
    accentHover: '#f97316',
    searchBg: 'rgba(38,18,12,0.8)',
    searchBtnBg: '#fb923c',
    searchTabActiveBg: '#fb923c',
    groupTabActiveBg: '#fb923c',
    sidebarBg: 'rgba(38,18,12,0.8)',
    sidebarDotActive: '#fb923c'
  }),
  makeTheme('purple', '暗夜紫', {
    bgPage: '#1e1130',
    bgModal: '#2b1a45',
    bgGlass: 'rgba(30,17,48,0.5)',
    bgGlassStrong: 'rgba(30,17,48,0.78)',
    accent: '#a78bfa',
    accentHover: '#8b5cf6',
    searchBg: 'rgba(24,12,40,0.8)',
    searchBtnBg: '#a78bfa',
    searchTabActiveBg: '#a78bfa',
    groupTabActiveBg: '#a78bfa',
    sidebarBg: 'rgba(24,12,40,0.8)',
    sidebarDotActive: '#a78bfa'
  }),
  makeTheme('light', '明亮白', {
    bgPage: '#f5f5f5',
    bgCard: 'rgba(0,0,0,0.04)',
    bgCardHover: 'rgba(0,0,0,0.08)',
    bgGlass: 'rgba(255,255,255,0.5)',
    bgGlassStrong: 'rgba(255,255,255,0.75)',
    bgModal: '#ffffff',
    bgInput: 'rgba(0,0,0,0.05)',
    textPrimary: '#1f2937',
    textSecondary: '#6b7280',
    textMuted: '#9ca3af',
    borderColor: 'rgba(0,0,0,0.1)',
    borderStrong: 'rgba(0,0,0,0.2)',
    searchBg: 'rgba(255,255,255,0.8)',
    searchText: '#1f2937',
    searchPlaceholder: '#9ca3af',
    bookmarkText: '#1f2937',
    iconColor: '#4b5563',
    sidebarBg: 'rgba(255,255,255,0.8)',
    sidebarDot: '#9ca3af',
    sidebarArrow: '#4b5563',
    sidebarText: '#1f2937'
  })
]

export const DEFAULT_THEME_ID = 'dark'

// 查找主题(内置或自定义)
export function findTheme(
  themeId: string | undefined,
  customThemes?: ThemeConfig[]
): ThemeConfig {
  const all = [...BUILTIN_THEMES, ...(customThemes || [])]
  return all.find((t) => t.id === themeId) || BUILTIN_THEMES.find((t) => t.id === DEFAULT_THEME_ID)!
}

// 把主题配置应用到 :root 的 CSS 变量上
export function applyThemeConfig(theme: ThemeConfig) {
  const root = document.documentElement
  for (const key of Object.keys(THEME_VARS) as Array<keyof Omit<ThemeConfig, 'id' | 'name'>>) {
    const v = (theme as unknown as Record<string, unknown>)[key]
    if (v === undefined) continue
    root.style.setProperty(THEME_VARS[key], String(v))
  }
}
