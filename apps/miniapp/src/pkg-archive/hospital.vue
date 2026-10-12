<script lang="ts" setup>
import { ref } from 'vue'
import XIcon from '@/components/XIcon.vue'
import { http } from '@/xj/request'
import { useXj } from '@/xj/store'
import { go } from '@/xj/utils'

definePage({ style: { navigationBarTitleText: '医院报告' } })

const xj = useXj()
const list = ref<any[]>([])
const refs = ref<any[]>([])
onLoad(async () => {
  list.value = await http.get('/app/reports', { type: 'hospital' })
  refs.value = await http.get('/app/referrals')
})
</script>

<template>
  <view :class="xj.pageClass">
    <view class="stack" style="padding-top: 12px">
      <view class="group">
        <view v-for="r in list" :key="r.id" class="cell" @click="go(`/pkg-archive/report?id=${r.id}`)">
          <view class="icon-box care"><XIcon name="building-hospital" /></view>
          <view class="col flex1"><text class="t-md">{{ r.title }}</text><text class="t-sm c2">{{ r.date }}</text></view>
          <XIcon name="chevron-right" :size="18" color="#786E74" />
        </view>
        <xj-empty v-if="!list.length" text="医院回传后，报告会出现在这里" />
      </view>
      <text class="section-title">我的转介与预约</text>
      <view class="group">
        <view v-for="r in refs" :key="r.id" class="cell">
          <view class="col flex1">
            <text class="t-md">{{ r.hospitalName }}</text>
            <text class="t-sm c2">{{ r.services.map((s) => s.name).join('、') || '年度基础体检' }}{{ r.appointmentAt ? ` · ${r.appointmentAt}` : '' }}</text>
          </view>
          <text class="tag care">{{ r.statusName }}</text>
        </view>
        <xj-empty v-if="!refs.length" text="暂无转介记录" />
      </view>
    </view>
  </view>
</template>
