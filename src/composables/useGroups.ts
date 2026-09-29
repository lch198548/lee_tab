import { api } from '@/api'
import type { Bookmark, Group } from '@/api'
import { useAppStore } from '@/stores/app'
import { cacheGroups } from '@/utils/cache'

export function useGroups() {
  const { state } = useAppStore()

  async function loadGroups() {
    // 1. 优先从缓存加载(秒开)
    const cached = cacheGroups.get<Group[]>()
    if (cached && !cached.expired) {
      state.groups = cached.data
    } else if (cached) {
      // 有缓存但过期,先显示缓存再后台刷新
      state.groups = cached.data
      // 后台异步刷新
      api.getGroups().then((res) => {
        state.groups = res.groups
        cacheGroups.set(res.groups)
      }).catch(() => {})
      return
    }

    // 2. 无缓存,从后端加载
    const res = await api.getGroups()
    state.groups = res.groups
    cacheGroups.set(res.groups)
  }

  async function createGroup(name: string, icon = '') {
    const res = await api.createGroup(name, icon)
    state.groups.push(res.group)
    cacheGroups.set(state.groups)
    return res
  }

  // 更新分组名称/图标(侧边栏右键编辑)
  async function updateGroup(id: string, payload: { name?: string; icon?: string }) {
    await api.updateGroup(id, payload)
    const g = state.groups.find((x) => x.id === id)
    if (g) {
      if (payload.name !== undefined) g.name = payload.name
      if (payload.icon !== undefined) g.icon = payload.icon
    }
    cacheGroups.set(state.groups)
  }

  async function renameGroup(id: string, name: string) {
    await api.updateGroup(id, { name })
    const g = state.groups.find((x) => x.id === id)
    if (g) g.name = name
    cacheGroups.set(state.groups)
  }

  async function deleteGroup(id: string) {
    await api.deleteGroup(id)
    state.groups = state.groups.filter((g) => g.id !== id)
    cacheGroups.set(state.groups)
  }

  async function reorderGroups(groups: Group[]) {
    state.groups = groups
    const allSorts = groups.map((g, i) => ({ id: g.id, sort: i }))
    if (allSorts.length > 0) {
      await api.updateGroup(allSorts[0].id, { allSorts })
    }
    cacheGroups.set(state.groups)
  }

  async function saveGroupSort(sorts: { id: string; sort: number }[]) {
    if (sorts.length === 0) return
    for (const s of sorts) {
      const g = state.groups.find((x) => x.id === s.id)
      if (g) g.sort = s.sort
    }
    state.groups = [...state.groups].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
    await api.updateGroup(sorts[0].id, { allSorts: sorts })
    cacheGroups.set(state.groups)
  }

  async function addBookmark(groupId: string, bookmark: Partial<Bookmark>) {
    const res = await api.addBookmark(groupId, bookmark)
    const g = state.groups.find((x) => x.id === groupId)
    if (g) g.bookmarks.push(res.bookmark)
    cacheGroups.set(state.groups)
  }

  async function saveBookmarks(groupId: string, bookmarks: Bookmark[]) {
    const res = await api.saveBookmarks(groupId, bookmarks)
    const g = state.groups.find((x) => x.id === groupId)
    if (g) g.bookmarks = res.bookmarks
    cacheGroups.set(state.groups)
  }

  // 跨分组移动书签:后端单次原子写入(带乐观锁),成功后同步本地状态
  async function moveBookmarkToGroup(fromGroupId: string, bookmarkId: string, toGroupId: string) {
    if (!fromGroupId || !toGroupId || fromGroupId === toGroupId) return

    try {
      await api.moveBookmark(fromGroupId, bookmarkId, toGroupId)
    } catch (e) {
      // 后端乐观锁重试仍冲突:丢弃本地缓存,从服务端重载真实数据
      const res = await api.getGroups().catch(() => null)
      if (res) {
        state.groups = res.groups
        cacheGroups.set(state.groups)
      }
      throw e
    }

    const fromG = state.groups.find((x) => x.id === fromGroupId)
    const toG = state.groups.find((x) => x.id === toGroupId)
    if (!fromG || !toG) return

    const idx = fromG.bookmarks.findIndex((b) => b.id === bookmarkId)
    if (idx === -1) return
    const [bm] = fromG.bookmarks.splice(idx, 1)
    toG.bookmarks.push({ ...bm, favorite: false, sort: toG.bookmarks.length })
    cacheGroups.set(state.groups)
  }

  return {
    loadGroups,
    createGroup,
    renameGroup,
    updateGroup,
    deleteGroup,
    reorderGroups,
    saveGroupSort,
    addBookmark,
    saveBookmarks,
    moveBookmarkToGroup
  }
}
