import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { http, TOKEN_KEY } from './request'
import { DEFAULT_THEME, isThemeKey, THEMES, type XjTheme } from './themes'

/** 客户端全局状态：登录态、个人资料、乐龄模式、治愈系主题 */
export const useXj = defineStore('xj', () => {
  const token = ref<string>(uni.getStorageSync(TOKEN_KEY) || '')
  const me = ref<any>(null)
  const elderMode = ref<boolean>(uni.getStorageSync('xj_elder') === 'on')
  const tier = ref<string>(uni.getStorageSync('xj_tier') || 'C')
  const theme = ref<string>(isThemeKey(uni.getStorageSync('xj_theme')) ? uni.getStorageSync('xj_theme') : DEFAULT_THEME)

  const loggedIn = computed(() => !!token.value)
  /** 页面容器 class：主题 class 同时驱动 CSS 变量切换 */
  const pageClass = computed(() => ['xj', `theme-${theme.value}`, elderMode.value ? 'elder' : 'std'])
  /** 当前主题配置（名称 / 色卡） */
  const themeMeta = computed<XjTheme>(() => THEMES.find(t => t.key === theme.value) || THEMES[0])
  /** 原生控件色（switch / slider / swiper 指示器不支持 CSS 变量） */
  const themeHex = computed(() => themeMeta.value.hex)

  function setToken(t: string) {
    token.value = t
    uni.setStorageSync(TOKEN_KEY, t)
  }

  function setElder(on: boolean) {
    elderMode.value = on
    uni.setStorageSync('xj_elder', on ? 'on' : 'off')
  }

  function setThemeLocal(k: string) {
    if (!isThemeKey(k)) return
    theme.value = k
    uni.setStorageSync('xj_theme', k)
  }

  async function loadMe() {
    if (!token.value) return null
    try {
      me.value = await http.get('/app/me', undefined, { silent: true })
      setElder(!!me.value.elderMode)
      tier.value = me.value.tier
      if (isThemeKey(me.value.theme)) setThemeLocal(me.value.theme)
      uni.setStorageSync('xj_tier', me.value.tier)
      return me.value
    }
    catch (e: any) {
      if (e?.code === 40001) logout()
      return null
    }
  }

  /** 切换治愈系主题：本地立即生效，登录态下静默同步到云端 */
  async function setTheme(k: string) {
    if (!isThemeKey(k) || k === theme.value) return
    setThemeLocal(k)
    const meta = THEMES.find(t => t.key === k)
    uni.showToast({ title: `已切换为${meta?.label || ''}主题`, icon: 'none' })
    if (token.value) await http.patch('/app/me/settings', { theme: k }, { silent: true }).catch(() => {})
  }

  async function toggleElder(on?: boolean) {
    const v = on === undefined ? !elderMode.value : on
    setElder(v)
    if (token.value) await http.patch('/app/me/settings', { elderMode: v }, { silent: true }).catch(() => {})
    uni.showToast({ title: v ? '已开启乐龄模式' : '已切换为标准模式', icon: 'none' })
  }

  function logout() {
    token.value = ''
    me.value = null
    uni.removeStorageSync(TOKEN_KEY)
  }

  return { token, me, elderMode, tier, theme, themeMeta, themeHex, loggedIn, pageClass, setToken, setElder, setTheme, loadMe, toggleElder, logout }
})
