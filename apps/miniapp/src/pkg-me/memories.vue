<script lang="ts" setup>
import { ref } from 'vue'
import XIcon from '@/components/XIcon.vue'
import { http } from '@/xj/request'
import { useXj } from '@/xj/store'
import { confirm, go } from '@/xj/utils'

definePage({ style: { navigationBarTitleText: '小镜记得的事' } })

const xj = useXj()
const list = ref<any[]>([])
const c9 = ref(false)

async function load() {
  list.value = await http.get('/app/mirror/memories')
  const cs: any[] = await http.get('/app/consents')
  c9.value = !!cs.find(c => c.type === 'C9')?.granted
}
onShow(load)

async function del(m: any) {
  if (!(await confirm('删除这条记忆', m.text, '删除'))) return
  await http.del(`/app/mirror/memories/${m.id}`)
  load()
}
</script>

<template>
  <view :class="xj.pageClass">
    <view class="stack" style="padding-top: 12px">
      <text class="t-sm c2">小镜只记得您主动说过的生活小事，不记诊断、用药、财务和证件信息。</text>
      <view v-if="!c9" class="card hint stack">
        <text class="t-md">您还没有开启"魔镜记忆"</text>
        <view class="btn small" @click="go('/pkg-auth/consent?type=C9')">开启</view>
      </view>
      <view class="group">
        <view v-for="m in list" :key="m.id" class="cell">
          <text class="tag">{{ m.category }}</text>
          <text class="flex1 t-body">{{ m.text }}</text>
          <view @click="del(m)"><XIcon name="trash" :size="20" color="#786E74" /></view>
        </view>
        <xj-empty v-if="!list.length" text="小镜还没有记住什么" />
      </view>
    </view>
  </view>
</template>
