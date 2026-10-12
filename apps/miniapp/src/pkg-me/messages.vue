<script lang="ts" setup>
import { ref } from 'vue'
import { http } from '@/xj/request'
import { useXj } from '@/xj/store'
import { go } from '@/xj/utils'

definePage({ style: { navigationBarTitleText: '消息中心' } })

const xj = useXj()
const list = ref<any[]>([])
onShow(async () => { list.value = await http.get('/app/messages') })
</script>

<template>
  <view :class="xj.pageClass">
    <view class="stack" style="padding-top: 12px">
      <view v-for="m in list" :key="m.id" class="card col gap4" @click="go(m.link)">
        <view class="row-between"><text class="t-md">{{ m.title }}</text><text class="t-xs c3">{{ m.at }}</text></view>
        <text class="t-sm c2">{{ m.content }}</text>
      </view>
      <xj-empty v-if="!list.length" text="暂无消息" />
    </view>
  </view>
</template>
