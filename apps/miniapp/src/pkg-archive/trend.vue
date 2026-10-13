<script lang="ts" setup>
import { computed, ref } from 'vue'
import { http } from '@/xj/request'
import { useXj } from '@/xj/store'
import { lineSvg, SOURCE_STYLE } from '@/xj/utils'

definePage({ style: { navigationBarTitleText: '指标趋势' } })

const xj = useXj()
const codes = ref<any[]>([])
const code = ref('INDEX')
const range = ref('12m')
const t = ref<any>(null)
const src = computed(() => lineSvg(t.value?.points || [], { width: 340, height: 200, refLow: t.value?.refLow, refHigh: t.value?.refHigh }))

async function load() {
  t.value = await http.get(`/app/archive/metrics/${code.value}/trend`, { range: range.value })
}
onLoad(async (q: any) => {
  if (q?.code) code.value = q.code
  codes.value = await http.get('/app/archive/metrics')
  load()
})
</script>

<template>
  <view :class="xj.pageClass">
    <scroll-view scroll-x style="white-space: nowrap; padding: 12px 0">
      <view v-for="c in codes" :key="c.code" class="chip" :class="{ on: code === c.code }" @click="code = c.code; load()">{{ c.name }}</view>
    </scroll-view>
    <view class="row gap8" style="margin-bottom: 12px">
      <view v-for="r in [['3m', '3 个月'], ['6m', '6 个月'], ['12m', '12 个月']]" :key="r[0]" class="seg" :class="{ on: range === r[0] }" @click="range = r[0]; load()">{{ r[1] }}</view>
    </view>
    <view v-if="t" class="card stack">
      <view class="row-between">
        <text class="t-lg">{{ t.name }}</text>
        <text class="t-sm c2">{{ t.unit }}</text>
      </view>
      <image :src="src" style="width: 100%; height: 200px" mode="aspectFit" />
      <view class="row gap12 t-xs c2 wrap">
        <view v-for="(s, k) in SOURCE_STYLE" :key="k" class="row gap4"><view class="lgd" :style="{ borderColor: s.fg }" /><text>{{ s.name }}</text></view>
        <view v-if="t.refLow !== null && t.refHigh !== null && t.refLow !== undefined" class="row gap4"><view class="lgd ref" /><text>参考范围</text></view>
      </view>
      <xj-empty v-if="!t.points.length" text="这段时间还没有数据" />
      <view class="group" style="padding: 0">
        <view v-for="p in [...t.points].reverse()" :key="p.date + p.value" class="cell">
          <text class="flex1 t-body num">{{ p.date }}</text>
          <text class="t-md semi num">{{ p.value }} {{ t.unit }}</text>
          <text class="tag" :style="{ background: SOURCE_STYLE[p.source].bg, color: SOURCE_STYLE[p.source].fg }">{{ SOURCE_STYLE[p.source].name }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped>
.chip { display: inline-flex; height: 36px; align-items: center; padding: 0 14px; margin-right: 8px; border-radius: 18px; background: #fff; font-size: var(--fs-sm); }
.chip.on { background: var(--brand); color: var(--on-brand); font-weight: 600; }
.seg { flex: 1; height: 40px; border-radius: 20px; background: #fff; display: flex; align-items: center; justify-content: center; font-size: var(--fs-sm); }
.seg.on { background: var(--brand-soft); color: var(--brand-ink); font-weight: 700; }
.lgd { width: 10px; height: 10px; border-radius: 6px; border: 2.5px solid; background: #fff; }
.lgd.ref { border: 0; border-radius: 2px; background: #e6f1ef; }
</style>
