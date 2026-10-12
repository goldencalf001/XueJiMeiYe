<script setup lang="ts">
/**
 * 首页配置驱动渲染（设计文档 5.6）：greeting / tierCard / healthCard / entryGrid / banner / moduleList / activityCard / notice / mirrorFab / divider
 * 不认识的组件类型直接跳过，保证老版本兼容。
 */
import { computed } from 'vue'
import XIcon from '@/components/XIcon.vue'
import XRadar from '@/components/XRadar.vue'
import { http } from '@/xj/request'
import { useXj } from '@/xj/store'
import { go } from '@/xj/utils'

const props = defineProps<{ components: any[], night?: boolean }>()
const xj = useXj()
const elder = computed(() => xj.elderMode)
const KNOWN = ['greeting', 'tierCard', 'healthCard', 'entryGrid', 'banner', 'moduleList', 'activityCard', 'notice', 'mirrorFab', 'divider']
const list = computed(() => (props.components || []).filter(c => KNOWN.includes(c.type)))

function open(item: any, component: string) {
  if (item?.code) http.post('/app/events', { event: 'home_component_click', props: { component, moduleCode: item.code } }, { silent: true }).catch(() => {})
  if (!xj.loggedIn && item?.link && !item.link.startsWith('/pkg-module/detail') && !item.link.startsWith('/pages/')) {
    go('/pkg-auth/login')
    return
  }
  go(item.link)
}

const featuredFirst = (items: any[], featured?: string) => {
  if (!featured) return { feature: null, rest: items }
  const f = items.find(i => i.code === featured)
  return { feature: f || null, rest: items.filter(i => i.code !== featured) }
}
</script>

<template>
  <view class="home-render stack">
    <template v-for="(c, i) in list" :key="i">
      <!-- 问候栏 -->
      <view v-if="c.type === 'greeting'" class="greet row-between">
        <view class="col gap6 flex1">
          <text class="t-hero">{{ c.props.text }}</text>
          <view class="row gap8">
            <text class="tag" :class="{ gold: c.props.tier === 'A' }">{{ c.props.isGuest ? '访客' : c.props.tierName }}</text>
            <text v-if="c.props.isGuest" class="t-sm c-brand semi" @click="go('/pkg-auth/login')">登录 / 注册</text>
          </view>
        </view>
        <view v-if="c.props.showElderToggle" class="col gap4" style="align-items: flex-end" @click="xj.toggleElder()">
          <text class="t-sm c2">乐龄模式</text>
          <view class="toggle" :class="{ on: elder }"><view class="knob" /></view>
        </view>
      </view>

      <!-- 等级卡 -->
      <view v-else-if="c.type === 'tierCard'" class="tier-card" :class="`tier-${c.props.tier}`" @click="go('/pkg-me/tier')">
        <view class="row-between">
          <text class="t-lg">{{ c.props.tierName }}</text>
          <view class="row gap4 t-sm"><text>全部权益</text><XIcon name="chevron-right" :size="16" /></view>
        </view>
        <view class="tier-line" />
        <view class="row wrap gap8">
          <text v-for="b in c.props.benefits" :key="b" class="benefit t-sm">{{ b }}</text>
        </view>
        <text v-if="c.props.keepUntil" class="t-xs" style="opacity: 0.8">保级至 {{ c.props.keepUntil }}</text>
      </view>

      <!-- 健康卡 -->
      <view v-else-if="c.type === 'healthCard'" class="card raised health">
        <template v-if="c.props.hasAssessment">
          <view class="row-between" @click="go('/pages/archive/index')">
            <view class="col gap4">
              <text class="t-body c2">六维年轻化指数</text>
              <view class="row gap8" style="align-items: baseline">
                <text class="num bold" :style="{ fontSize: elder ? '60px' : '52px', lineHeight: 1.05 }">{{ c.props.index }}</text>
                <text v-if="c.props.delta" class="semi" :class="c.props.delta > 0 ? 'c-care' : 'c-warn'">比上次 {{ c.props.delta > 0 ? '+' : '' }}{{ c.props.delta }}</text>
              </view>
              <text class="t-sm c3">上次测评 {{ c.props.lastAssessedAt }}</text>
            </view>
            <XRadar :scores="c.props.dims" :size="elder ? 104 : 96" :dark="night" />
          </view>
        </template>
        <view v-else class="col gap12" @click="go(xj.loggedIn ? '/pkg-assess/intro' : '/pkg-auth/login')">
          <text class="t-lg">了解自己的六个维度</text>
          <text class="c2">肌肤、体型、轮廓、体能、体态、心灵。完成测评可以领取免费体检券。</text>
          <view class="btn">{{ c.props.cta || '开始六维测评，约 8 分钟' }}</view>
        </view>
        <view v-for="t in c.props.todos" :key="t.text" class="todo row gap12" @click="go(t.link)">
          <view class="icon-box" :class="t.tone === 'care' ? 'care' : ''"><XIcon :name="t.icon" /></view>
          <view class="col flex1">
            <text class="t-md">{{ t.text }}</text>
            <text v-if="t.sub" class="t-sm c2">{{ t.sub }}</text>
          </view>
          <XIcon name="chevron-right" :size="20" color="#786E74" />
        </view>
      </view>

      <!-- 入口宫格 -->
      <view v-else-if="c.type === 'entryGrid'">
        <view v-if="elder || c.props.columns === 3" class="grid3">
          <view v-if="featuredFirst(c.props.items, c.props.featured).feature" class="tile featured" @click="open(featuredFirst(c.props.items, c.props.featured).feature, 'entryGrid')">
            <XIcon :name="featuredFirst(c.props.items, c.props.featured).feature.icon" :size="30" />
            <view class="col">
              <text class="t-xl">{{ featuredFirst(c.props.items, c.props.featured).feature.name }}</text>
              <text class="t-sm" style="opacity: 0.88">{{ featuredFirst(c.props.items, c.props.featured).feature.summary }}</text>
            </view>
          </view>
          <view v-for="it in featuredFirst(c.props.items, c.props.featured).rest" :key="it.code" class="tile" @click="open(it, 'entryGrid')">
            <XIcon :name="it.icon" :size="30" :color="it.code === 'checkup_coupon' ? '#1F6E68' : (night ? '#D2B47A' : 'var(--brand-ink)')" />
            <text class="tile-name">{{ it.name }}</text>
          </view>
        </view>
        <view v-else class="grid4 card">
          <view v-for="it in c.props.items" :key="it.code" class="g4 col gap6" @click="open(it, 'entryGrid')">
            <view class="icon-box" :class="it.code === 'checkup_coupon' ? 'care' : ''"><XIcon :name="it.icon" :size="24" /></view>
            <text class="t-sm">{{ it.name }}</text>
          </view>
        </view>
      </view>

      <!-- 轮播（乐龄模式停用自动轮播） -->
      <swiper v-else-if="c.type === 'banner'" class="banner" :autoplay="c.props.autoplay" circular :indicator-dots="c.props.items.length > 1" indicator-color="rgba(34, 24, 40, 0.14)" :indicator-active-color="xj.themeHex">
        <swiper-item v-for="it in c.props.items" :key="it.code">
          <view class="card row gap12 banner-card" @click="open(it, 'banner')">
            <view class="photo-slot" style="width: 84px; height: 84px"><XIcon :name="it.icon" :size="24" /><text>实拍位</text></view>
            <view class="col gap4 flex1">
              <text class="t-xs c-care semi">{{ it.name }}</text>
              <text class="t-lg">{{ it.summary }}</text>
              <text class="t-sm c-brand semi">{{ it.priceText || '查看详情' }}</text>
            </view>
          </view>
        </swiper-item>
      </swiper>

      <!-- 分组标题 -->
      <view v-else-if="c.type === 'divider'" class="section-title">
        <text>{{ c.props.title }}</text>
      </view>

      <!-- 模块列表 -->
      <view v-else-if="c.type === 'moduleList'" class="stack">
        <text v-if="c.props.title" class="t-lg">{{ c.props.title }}</text>
        <template v-if="c.props.style === 'card'">
          <view v-for="it in c.props.items" :key="it.code" class="card row gap12 mcard" @click="open(it, 'moduleList')">
            <view class="photo-slot" :style="{ width: elder ? '92px' : '84px', height: elder ? '92px' : '84px' }">
              <XIcon :name="it.icon" :size="22" />
              <text>实拍位</text>
            </view>
            <view class="col gap4 flex1">
              <text class="t-lg" style="line-height: 1.35">{{ it.name }}</text>
              <text class="t-sm c2">{{ it.days || it.summary }}</text>
              <text v-if="it.priceText" class="t-md c-brand bold">{{ it.priceText }}</text>
            </view>
          </view>
        </template>
        <view v-else class="group">
          <view v-for="it in c.props.items" :key="it.code" class="cell" @click="open(it, 'moduleList')">
            <view class="icon-box"><XIcon :name="it.icon" /></view>
            <view class="col flex1">
              <text class="t-md">{{ it.name }}</text>
              <text class="t-sm c2">{{ it.summary }}</text>
            </view>
            <XIcon name="chevron-right" :size="20" color="#786E74" />
          </view>
        </view>
      </view>

      <!-- 活动卡 -->
      <view v-else-if="c.type === 'activityCard'" class="card row gap12" @click="open(c.props, 'activityCard')">
        <view class="icon-box care"><XIcon name="calendar-event" /></view>
        <view class="col flex1"><text class="t-md">{{ c.props.name }}</text><text class="t-sm c2">{{ c.props.summary }}</text></view>
      </view>

      <!-- 公告条 -->
      <view v-else-if="c.type === 'notice'" class="card hint row gap8" @click="go(c.props.link)">
        <XIcon name="info-circle" /><text class="t-sm">{{ c.props.text }}</text>
      </view>

      <!-- 魔镜悬浮入口 -->
      <view v-else-if="c.type === 'mirrorFab'" class="fab" :class="{ elder, night }" @click="go('/pages/mirror/index')">
        <XIcon name="sparkles" :size="elder ? 26 : 22" />
        <text>{{ elder ? (c.props.label || '和小镜聊聊') : (c.props.label || '小镜') }}</text>
      </view>
    </template>
  </view>
</template>

<style scoped lang="scss">
.greet { padding-top: 4px; }
.toggle { width: 50px; height: 30px; border-radius: 15px; background: #d8d0d4; position: relative; transition: background 0.2s; }
.toggle .knob { position: absolute; left: 3px; top: 3px; width: 24px; height: 24px; border-radius: 12px; background: #fff; box-shadow: 0 1px 2px rgba(60, 24, 44, 0.25); transition: left 0.2s; }
.toggle.on { background: var(--brand); }
.toggle.on .knob { left: 23px; }
.night .toggle.on { background: var(--gold); }

.tier-card { border-radius: 20px; padding: 16px; display: flex; flex-direction: column; gap: 10px; box-shadow: 0 10px 24px -16px rgba(34, 24, 40, 0.35); }
.tier-C { background: var(--brand-soft); color: var(--brand-ink); }
.tier-B { background: var(--brand); color: var(--on-brand); }
.tier-A { background: #1e191d; color: #f2ece8; border: 1px solid rgba(210, 180, 122, 0.3); }
.tier-A .t-lg { color: #d2b47a; }
.tier-line { height: 1px; background: currentColor; opacity: 0.2; }
.benefit { padding: 2px 10px; border-radius: 8px; background: rgba(255, 255, 255, 0.28); }
.tier-C .benefit { background: #fff; }

.health { padding-bottom: 4px; }
.todo { border-top: 1px solid var(--line); padding: 14px 0 12px; margin-top: 12px; }

.grid3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.tile { height: 100px; border-radius: 20px; background: var(--surface); padding: 14px; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03), 0 8px 18px -14px rgba(34, 24, 40, 0.28); }
.elder .tile { height: 108px; }
.tile-name { font-size: var(--fs-md); font-weight: 600; line-height: 1.3; }
.tile.featured { grid-column: span 2; background: var(--brand); color: var(--on-brand); height: 112px; box-shadow: 0 10px 22px -12px rgba(204, 150, 0, 0.55); }
.night .tile.featured { color: #131013; }
.grid4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px 4px; }
.g4 { align-items: center; text-align: center; }

.banner { height: 120px; }
.banner-card { height: 116px; }
.mcard { padding: 12px; }

.fab { position: fixed; right: 16px; bottom: calc(76px + env(safe-area-inset-bottom)); z-index: 60; height: 48px; padding: 0 16px; border-radius: 24px; background: var(--brand); color: var(--on-brand); display: flex; align-items: center; gap: 6px; font-weight: 700; font-size: 15px; box-shadow: 0 8px 24px -8px rgba(204, 150, 0, 0.55); }
.fab.elder { height: 58px; padding: 0 20px; font-size: 18px; bottom: calc(88px + env(safe-area-inset-bottom)); }
.fab.night { color: #131013; }
</style>
