<script setup lang="ts">
import { computed } from 'vue'
import { useXj } from '@/xj/store'
import { customTabbarEnable, needHideNativeTabbar, tabbarCacheEnable } from './config'
import { tabbarList, tabbarStore } from './store'

// #ifdef MP-WEIXIN
defineOptions({ virtualHost: true })
// #endif

const xj = useXj()
const elder = computed(() => xj.elderMode)

function handleClick(index: number) {
  if (index === tabbarStore.curIdx && tabbarStore.isCurrentRouteTabbarItem(index)) return
  const list = tabbarList.value
  if (!list[index]) return
  const url = list[index].pagePath
  const prevIdx = tabbarStore.curIdx
  tabbarStore.setCurIdx(index)
  const ok = () => tabbarStore.syncCurIdxByCurrentPageAsync()
  const fail = () => tabbarStore.setCurIdx(prevIdx)
  if (tabbarCacheEnable) uni.switchTab({ url, success: ok, fail })
  else uni.navigateTo({ url, success: ok, fail })
}
// #ifndef MP-WEIXIN || MP-ALIPAY
onLoad(() => {
  needHideNativeTabbar && uni.hideTabBar({ fail() {} })
})
// #endif
</script>

<template>
  <view v-if="customTabbarEnable" class="tabbar-holder" :class="[`theme-${xj.theme}`, { elder }]">
    <view class="tabbar" :class="{ elder }" @touchmove.stop.prevent>
      <view class="items">
        <view v-for="(item, index) in tabbarList" :key="index" class="item" :class="{ on: tabbarStore.curIdx === index }" @click="handleClick(index)">
          <view :class="[item.icon]" class="ic" />
          <text class="label">{{ item.text }}</text>
        </view>
      </view>
      <view class="safe" />
    </view>
  </view>
</template>

<style scoped lang="scss">
.tabbar-holder { height: 60px; }
.tabbar-holder.elder { height: 70px; }
.tabbar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 1000; background: #fff; box-shadow: 0 -1px 0 #ebe6e9, 0 -8px 20px rgba(34, 24, 40, 0.05); }
.items { height: 60px; display: flex; }
.tabbar.elder .items { height: 70px; }
.item { position: relative; flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; color: #8a8188; transition: color 0.15s; }
.item .ic { font-size: 24px; }
.item .label { font-size: 11px; }
.tabbar.elder .item .ic { font-size: 30px; }
.tabbar.elder .item .label { font-size: 14px; }
.item.on { color: #222222; }
.item.on .label { font-weight: 700; }
.item.on::after { content: ''; position: absolute; bottom: 5px; left: 50%; transform: translateX(-50%); width: 18px; height: 3px; border-radius: 2px; background: var(--brand); }
.safe { padding-bottom: env(safe-area-inset-bottom); }
</style>
