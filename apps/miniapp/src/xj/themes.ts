/**
 * 治愈系多主题定义（视觉语言参考 moe-ui 风格库：轻盈水彩 / 清新蜡笔 / 奶油彩铅）
 * - key 与 server 端 ALLOWED_THEMES 保持一致
 * - swatch 用于设置页色卡展示（两段渐变），hex 为原生控件（switch/slider/swiper 指示器）色，
 *   对应各主题 --brand-dark，保证选中态明显
 */

export interface XjTheme {
  key: 'sun' | 'sakura' | 'mizu' | 'matcha' | 'cream'
  label: string
  desc: string
  swatch: [string, string]
  hex: string
  /** 主题主视觉插画（压缩版，源图在 apps/miniapp/design/theme-artwork/） */
  img: string
}

export const THEMES: XjTheme[] = [
  { key: 'sun', label: '暖阳', desc: '元气柠檬黄', swatch: ['#ffe14d', '#ffd100'], hex: '#F5BE00', img: '/static/images/themes/sun.jpg' },
  { key: 'sakura', label: '樱粉', desc: '软萌樱花粉', swatch: ['#ffd3de', '#ffb3c6'], hex: '#F79BB2', img: '/static/images/themes/sakura.jpg' },
  { key: 'mizu', label: '雾蓝', desc: '温柔天空蓝', swatch: ['#bcd7ef', '#8fb8e0'], hex: '#7AA5D1', img: '/static/images/themes/mizu.jpg' },
  { key: 'matcha', label: '抹茶', desc: '清新鼠尾草', swatch: ['#cde3c0', '#aecfa0'], hex: '#97BA88', img: '/static/images/themes/matcha.jpg' },
  { key: 'cream', label: '奶油', desc: '甜糯蜂蜜黄', swatch: ['#f7e3bb', '#eec787'], hex: '#E2B367', img: '/static/images/themes/cream.jpg' },
]

export const DEFAULT_THEME = 'sun'

export function isThemeKey(v: unknown): v is XjTheme['key'] {
  return typeof v === 'string' && THEMES.some(t => t.key === v)
}
