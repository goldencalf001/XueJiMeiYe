<script lang="ts" setup>
/** 门店项目与预约：版式参考美团门店页（GitHub issue #1），品牌色保留雪姬酒红；价格为美团公开团购价，对所有客户一致 */
import { computed, ref } from 'vue'
import XIcon from '@/components/XIcon.vue'
import { http } from '@/xj/request'
import { useXj } from '@/xj/store'
import { call, go, toast } from '@/xj/utils'

definePage({ style: { navigationBarTitleText: '门店项目' } })

const xj = useXj()
const d = ref<any>(null)
const cat = ref('all')

onLoad(async () => {
  d.value = await http.get('/app/store')
})

const tabs = computed(() => [{ key: 'all', title: '全部', n: (d.value?.groups || []).reduce((s: number, g: any) => s + g.items.length, 0) }, ...(d.value?.groups || []).map((g: any) => ({ key: g.title, title: g.title, n: g.items.length }))])
const items = computed(() => (d.value?.groups || []).filter((g: any) => cat.value === 'all' || g.title === cat.value).flatMap((g: any) => g.items))
const starPct = computed(() => `${Math.min(100, Math.max(0, ((d.value?.store?.rating || 0) / 5) * 100))}%`)

/** "新客价，90 天最低价" → 两个优惠标签 */
const promos = (it: any) => (it.priceNote ? String(it.priceNote).split('，').filter(Boolean) : [])
/** "年售 200+ · 本店复购第 1" → 销量文字 + 其余作为标签 */
const sales = (it: any) => String(it.salesNote || '').split(' · ').find(x => x.startsWith('年售')) || ''
const badges = (it: any) => String(it.salesNote || '').split(' · ').filter(x => x && !x.startsWith('年售'))

function book(item?: any) {
  if (!xj.loggedIn) return go('/pkg-auth/login')
  if (item) uni.setStorageSync('xj_lead_prefill', { project: item.shortName || item.name })
  go('/pkg-module/lead-form?code=store_services')
}

function phone() {
  const p = d.value?.store?.phone || ''
  if (/\d{6,}/.test(p)) call(p)
  else toast('门店电话待补充，可先在线预约')
}

function copyAddr() {
  const s = d.value?.store
  if (!s) return
  uni.setClipboardData({ data: `${s.name} ${s.address}${s.mall ? `（${s.mall}）` : ''}`, success: () => toast('地址已复制') })
}
</script>

<template>
  <view :class="[...xj.pageClass, 'has-footer']">
    <template v-if="d?.store">
      <!-- 门店头图：实拍图到位前用插画占位 -->
      <view class="hero">
        <view class="col gap4">
          <text class="hero-brand">雪姬美业 · 科技护美</text>
          <text class="hero-name">AI 智能健康美容体验馆</text>
          <text class="hero-sub">面部护理 · 身体 SPA · 一对一服务</text>
        </view>
        <XIcon name="building-store" :size="64" color="rgba(0,0,0,0.14)" />
        <text class="hero-tip">示意图</text>
      </view>

      <view class="card head stack">
        <text class="t-lg" style="line-height: 1.4">{{ d.store.name }}</text>
        <view class="row gap8 wrap">
          <view v-if="d.store.rating" class="row gap6">
            <view class="stars">★★★★★<view class="on" :style="{ width: starPct }">★★★★★</view></view>
            <text class="rating num">{{ d.store.rating }}</text>
          </view>
          <text v-if="d.store.reviewCount" class="t-sm c2">{{ d.store.reviewCount }} 条评价</text>
          <text class="t-sm c3">{{ d.store.category }}</text>
        </view>
        <view class="row gap8">
          <text class="tag">营业时间</text>
          <text class="t-sm">{{ d.store.openHours }}</text>
        </view>
        <view class="divider" />
        <view class="row gap12">
          <view class="col flex1" @click="copyAddr">
            <text class="t-body semi">{{ d.store.address }}</text>
            <text class="t-xs c3">{{ d.store.mall }}{{ d.store.district ? ` · ${d.store.district}` : '' }}</text>
          </view>
          <view class="act" @click="copyAddr"><XIcon name="copy" :size="20" /><text>地址</text></view>
          <view class="act" @click="phone"><XIcon name="phone" :size="20" /><text>电话</text></view>
        </view>
        <view v-if="d.store.facilities?.length" class="row gap6 wrap">
          <text v-for="f in d.store.facilities" :key="f" class="tag line">{{ f }}</text>
        </view>
      </view>

      <view v-if="d.store.promises?.length" class="card">
        <view class="row gap6 mb8"><XIcon name="shield-check" :size="18" color="var(--brand-ink)" /><text class="t-md">门店承诺</text></view>
        <view class="promises">
          <view v-for="p in d.store.promises" :key="p" class="row gap4"><XIcon name="circle-check" :size="15" color="var(--brand-ink)" /><text class="t-xs c2">{{ p }}</text></view>
        </view>
      </view>

      <view class="card deals">
        <view class="row-between">
          <text class="t-md">门店项目</text>
          <text class="t-xs c3">与美团团购同价</text>
        </view>
        <scroll-view scroll-x class="tabs-scroll" :show-scrollbar="false">
          <view class="tabs">
            <view v-for="t in tabs" :key="t.key" class="tab" :class="{ on: cat === t.key }" @click="cat = t.key">{{ t.title }}<text class="tab-n">{{ t.n }}</text></view>
          </view>
        </scroll-view>
        <view v-for="it in items" :key="it.code" class="deal" @click="book(it)">
          <view class="thumb" :class="it.category === 'body' ? 'body' : 'face'">
            <XIcon :name="it.category === 'body' ? 'massage' : 'sparkles'" :size="xj.elderMode ? 38 : 34" />
            <text v-if="it.durationMin" class="thumb-label">{{ it.durationMin }} 分钟</text>
          </view>
          <view class="col flex1 gap4">
            <text class="deal-title">{{ it.name }}</text>
            <text v-if="it.audience || sales(it)" class="t-xs c3">{{ [it.audience, sales(it)].filter(Boolean).join(' · ') }}</text>
            <view v-if="promos(it).length || badges(it).length" class="row gap4 wrap">
              <text v-for="p in promos(it)" :key="p" class="tag promo">{{ p }}</text>
              <text v-for="b in badges(it)" :key="b" class="tag">{{ b }}</text>
            </view>
            <view class="row-between" style="align-items: flex-end">
              <view class="row gap6 flex1" style="align-items: baseline">
                <view class="price"><text class="yen">¥</text><text class="amt">{{ it.groupPrice }}</text></view>
                <text v-if="it.priceRef" class="price-orig">¥{{ it.priceRef }}</text>
              </view>
              <view class="mini">预约</view>
            </view>
          </view>
        </view>
      </view>
      <text class="t-xs c3 note">{{ d.priceNote }} 团购可在美团 App 搜索门店名称购买；到店付款，平台不在线收款。</text>
    </template>

    <view class="footer-bar">
      <view class="row gap12">
        <view class="foot-act" @click="phone"><XIcon name="phone" :size="22" /><text>电话</text></view>
        <view class="foot-act" @click="go('/pkg-me/advisor')"><XIcon name="user-heart" :size="22" /><text>顾问</text></view>
        <view class="btn flex1" @click="book()"><XIcon name="calendar-plus" />预约到店</view>
      </view>
    </view>
  </view>
</template>

<style scoped>
.hero { position: relative; margin: 0 calc(-1 * var(--pad)); padding: 22px var(--pad) 44px; display: flex; align-items: center; justify-content: space-between; background: var(--brand-grad); color: var(--on-brand); }
.hero-brand { font-size: var(--fs-xs); opacity: 0.75; letter-spacing: 1px; }
.hero-name { font-size: var(--fs-xl); font-weight: 700; line-height: 1.3; }
.hero-sub { font-size: var(--fs-sm); opacity: 0.8; }
.hero-tip { position: absolute; right: 10px; bottom: 30px; font-size: 10px; padding: 0 6px; border-radius: 4px; background: rgba(0, 0, 0, 0.35); color: #fff; }
.head { position: relative; margin-top: -24px; }
.rating { color: var(--price); font-weight: 700; font-size: var(--fs-md); }
.act { display: flex; flex-direction: column; align-items: center; gap: 2px; color: var(--ink-2); font-size: var(--fs-xs); min-width: 40px; }
.mb8 { margin-bottom: 8px; }
.promises { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px 4px; }
.elder .promises { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.tabs-scroll { margin: 10px 0 2px; white-space: nowrap; }
.tabs { display: inline-flex; gap: 8px; }
.tab { display: inline-flex; align-items: center; gap: 4px; height: 30px; padding: 0 12px; border-radius: 15px; background: #f5f5f5; color: var(--ink-2); font-size: var(--fs-sm); }
.elder .tab { height: 40px; padding: 0 16px; border-radius: 20px; font-size: var(--fs-body); }
.tab.on { background: var(--brand-soft); color: var(--brand-ink); font-weight: 700; }
.tab-n { font-size: var(--fs-xs); opacity: 0.7; }
.deal { display: flex; gap: 10px; padding: 12px 0; border-top: 1px solid var(--line); }
.tabs-scroll + .deal { border-top: 0; }
.deal-title { font-size: var(--fs-md); font-weight: 600; line-height: 1.4; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
.mini { height: 30px; padding: 0 14px; border-radius: 15px; background: var(--brand); color: var(--on-brand); font-weight: 700; font-size: var(--fs-sm); display: flex; align-items: center; flex-shrink: 0; }
.elder .mini { height: 40px; padding: 0 18px; border-radius: 20px; font-size: var(--fs-body); }
.note { display: block; line-height: 1.6; }
.foot-act { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; width: 48px; color: var(--ink-2); font-size: var(--fs-xs); }
</style>
