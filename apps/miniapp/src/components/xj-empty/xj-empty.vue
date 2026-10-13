<script lang="ts" setup>
import { useXj } from '@/xj/store'

/**
 * 全局空状态：按当前治愈系主题展示主视觉插画 + 文案。
 * 无数据的列表/区块统一用它，替代散落的纯文字 .empty。
 */
withDefaults(defineProps<{ text?: string, desc?: string }>(), { text: '暂无内容', desc: '' })

const xj = useXj()
</script>

<template>
  <view class="xj-empty">
    <image class="xj-empty__img" :src="xj.themeMeta.img" mode="aspectFill" />
    <view class="xj-empty__body">
      <text class="t-md semi">{{ text }}</text>
      <text v-if="desc" class="t-sm c3">{{ desc }}</text>
    </view>
  </view>
</template>

<style scoped lang="scss">
.xj-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 40px 16px 56px;
}
.xj-empty__img {
  width: 180px;
  height: 120px;
  border-radius: var(--r-card);
  box-shadow: 0 6px 18px -10px rgba(0, 0, 0, 0.25);
}
.xj-empty__body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
</style>
