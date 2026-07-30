import { api } from '@/api'
import { useAppStore } from '@/stores/app'

export function useAuth() {
  const { state } = useAppStore()

  async function checkLogin() {
    state.loading = true
    try {
      const res = await api.checkLogin()
      state.loggedIn = res.loggedIn
    } catch {
      state.loggedIn = false
    } finally {
      state.loading = false
    }
  }

  async function login(password: string): Promise<{ firstSetup: boolean }> {
    const res = await api.login(password)
    state.loggedIn = true
    return { firstSetup: res.firstSetup }
  }

  async function logout() {
    await api.logout()
    state.loggedIn = false
    state.config = null
    state.groups = []
  }

  return { checkLogin, login, logout }
}
