<script lang="ts" setup>
import { ref } from 'vue'
import { http } from '@/xj/request'
import { useXj } from '@/xj/store'
import { THEMES } from '@/xj/themes'
import { toast } from '@/xj/utils'

definePage({ style: { navigationBarTitleText: '设置' } })

const xj = useXj()
const personalization = ref(true)
const autoRead = ref(true)
const lang = ref('zh')
const themeOpen = ref(false)

onShow(async () => {
  await xj.loadMe()
  personalization.value = xj.me?.personalization !== false
  autoRead.value = xj.me?.autoRead !== false
  lang.value = xj.me?.lang || 'zh'
})

function pickTheme(k: string) {
  xj.setTheme(k)
  themeOpen.value = false
}

async function set(k: string, v: any) {
  await http.patch('/app/me/settings', { [k]: v })
  await xj.loadMe()
}

function subscribe() {
  // #ifdef MP-WEIXIN
  uni.requestSubscribeMessage({ tmplIds: [], complete: () => toast('订阅消息模板待在小程序后台配置') } as any)
  // #endif
  // #ifndef MP-WEIXIN
  toast('小程序内可订阅：预约成功、体检提醒、报告回传')
  // #endif
}
</script>

<template>
  <view :class="xj.pageClass">
    <view class="stack" style="padding-top: 12px">
      <view class="group">
        <view class="cell" @click="themeOpen = !themeOpen">
          <view class="col flex1"><text class="t-md">主题</text><text class="t-sm c2">换一款治愈的配色，换个心情</text></view>
          <view class="row gap8">
            <view class="theme-dot" :style="{ background: `linear-gradient(135deg, ${xj.themeMeta.swatch[0]}, ${xj.themeMeta.swatch[1]})` }" />
            <text class="t-sm semi">{{ xj.themeMeta.label }}</text>
            <text class="i-tabler-chevron-right t-sm c3" />
          </view>
        </view>
        <view v-if="themeOpen" class="theme-picker">
          <view
            v-for="t in THEMES" :key="t.key" class="theme-card"
            :class="{ on: t.key === xj.theme }" @click="pickTheme(t.key)"
          >
            <view class="swatch" :style="{ background: `linear-gradient(135deg, ${t.swatch[0]}, ${t.swatch[1]})` }">
              <text v-if="t.key === xj.theme" class="i-tabler-check check" />
            </view>
            <text class="t-sm semi">{{ t.label }}</text>
            <text class="t-xs c3">{{ t.desc }}</text>
          </view>
        </view>
        <view class="cell">
          <view class="col flex1"><text class="t-md">乐龄模式</text><text class="t-sm c2">字更大、按钮更大、题目和报告可以朗读</text></view>
          <switch :checked="xj.elderMode" :color="xj.themeHex" @change="(e) => xj.toggleElder(e.detail.value)" />
        </view>
        <view class="cell">
          <view class="col flex1"><text class="t-md">语言</text><text class="t-sm c2">粤语语音在 V1.2 上线</text></view>
          <view class="row gap8">
            <text class="seg" :class="{ on: lang === 'zh' }" @click="lang = 'zh'; set('lang', 'zh')">普通话</text>
            <text class="seg" :class="{ on: lang === 'yue' }" @click="lang = 'yue'; set('lang', 'yue')">粤语</text>
          </view>
        </view>
        <view class="cell">
          <view class="col flex1"><text class="t-md">个性化推荐</text><text class="t-sm c2">关闭后首页按默认顺序展示，价格和权益不受影响</text></view>
          <switch :checked="personalization" :color="xj.themeHex" @change="(e) => set('personalization', e.detail.value)" />
        </view>
        <view class="cell">
          <view class="col flex1"><text class="t-md">小镜自动朗读</text><text class="t-sm c2">乐龄模式下，小镜的回复自动播放</text></view>
          <switch :checked="autoRead" :color="xj.themeHex" @change="(e) => set('autoRead', e.detail.value)" />
        </view>
        <view class="cell" @click="subscribe">
          <view class="col flex1"><text class="t-md">消息通知</text><text class="t-sm c2">预约成功、体检前一天、报告回传</text></view>
          <text class="t-sm c-brand semi">去开启</text>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped>
.seg { padding: 6px 12px; border-radius: 16px; background: var(--bg); font-size: var(--fs-sm); }
.seg.on { background: var(--brand); color: var(--on-brand); font-weight: 600; }

.theme-dot { width: 18px; height: 18px; border-radius: 50%; box-shadow: 0 0 0 3px var(--surface), 0 0 0 4.5px var(--brand-line); }
.theme-picker {
  display: flex;
  gap: 10px;
  padding: 4px 0 14px;
  overflow-x: auto;
}
.theme-card {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 10px 12px;
  border-radius: var(--r-inner);
  border: 1.5px solid transparent;
  box-sizing: border-box;
}
.theme-card.on { border-color: var(--brand-dark); background: var(--brand-soft); }
.theme-card .swatch {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.theme-card .check { color: #fff; font-size: 18px; font-weight: 700; filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.25)); }
</style>
