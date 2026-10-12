<script lang="ts" setup>
import XIcon from '@/components/XIcon.vue'
import XNav from '@/components/XNav.vue'
import { useXj } from '@/xj/store'
import { confirm, go } from '@/xj/utils'

definePage({ style: { navigationStyle: 'custom', navigationBarTitleText: '我的' } })

const xj = useXj()

const quick = [
  { name: '体检券', icon: 'ticket', link: '/pkg-checkup/coupons' },
  { name: '我的方案', icon: 'clipboard-heart', link: '/pkg-plan/detail' },
  { name: '我的顾问', icon: 'headset', link: '/pkg-me/advisor' },
  { name: '设置', icon: 'settings', link: '/pkg-me/settings' },
]

const menus = [
  { name: '门店项目与预约', icon: 'building-store', link: '/pkg-module/store' },
  { name: '会员等级与权益', icon: 'crown', link: '/pkg-me/tier' },
  { name: '我的家人', icon: 'users', link: '/pkg-family/list', key: 'family' },
  { name: '消息中心', icon: 'bell', link: '/pkg-me/messages', key: 'msg' },
  { name: '每日打卡', icon: 'calendar-check', link: '/pkg-points/checkin' },
  { name: '授权管理', icon: 'shield-check', link: '/pkg-me/consents' },
  { name: '小镜记得的事', icon: 'notebook', link: '/pkg-me/memories' },
  { name: '隐私与数据', icon: 'lock', link: '/pkg-me/privacy' },
  { name: '关于雪姬美业', icon: 'info-circle', link: '/pkg-me/about' },
]

onShow(() => {
  if (xj.loggedIn) xj.loadMe()
})

async function logout() {
  if (await confirm('退出登录', '退出后可以切换其他演示账号', '确认退出')) {
    xj.logout()
    uni.removeStorageSync('xj_home_cache')
    go('/pkg-auth/login')
  }
}
</script>

<template>
  <view :class="[...xj.pageClass, 'has-tabbar']">
    <XNav />
    <view v-if="!xj.me" class="card empty stack">
      <text>登录后查看个人中心</text>
      <view class="btn" @click="go('/pkg-auth/login')">登录 / 注册</view>
    </view>
    <view v-else class="stack">
      <view class="row gap12" @click="go('/pkg-auth/profile')">
        <view class="avatar">{{ (xj.me.salutation || '客').slice(0, 1) }}</view>
        <view class="col flex1">
          <view class="row gap8">
            <text class="t-xl">{{ xj.me.salutation || '未填写称呼' }}</text>
            <text class="tag" :class="{ gold: xj.me.tier === 'A' }">{{ xj.me.tierName }}</text>
          </view>
          <text class="t-sm c2">{{ xj.me.store?.name || '' }}{{ xj.me.advisor ? `，顾问 ${xj.me.advisor.name}` : '' }}</text>
        </view>
        <XIcon name="chevron-right" :size="20" color="#786E74" />
      </view>

      <view class="passbook row-between" @click="go('/pkg-points/passbook')">
        <view class="col gap4">
          <text class="t-sm" style="opacity: 0.9">健康存折</text>
          <view class="row gap4" style="align-items: baseline">
            <text class="num bold" style="font-size: 32px">{{ xj.me.points }}</text>
            <text class="t-sm">积分</text>
          </view>
          <text class="t-xs" style="opacity: 0.82">获得后 12 个月内有效</text>
        </view>
        <view class="redeem">去兑换<XIcon name="chevron-right" :size="16" /></view>
      </view>

      <view class="card raised quick">
        <view v-for="q in quick" :key="q.name" class="col gap6 q" @click="go(q.link)">
          <view class="icon-box" :class="q.name === '体检券' ? 'care' : ''"><XIcon :name="q.icon" /></view>
          <text class="t-sm">{{ q.name }}</text>
        </view>
      </view>

      <view class="group">
        <view v-for="m in menus" :key="m.name" class="cell" @click="go(m.link)">
          <XIcon :name="m.icon" :size="22" color="var(--brand-ink)" />
          <text class="flex1 t-md">{{ m.name }}</text>
          <text v-if="m.key === 'msg' && xj.me.unreadMessages" class="tag alert">{{ xj.me.unreadMessages }}</text>
          <text v-if="m.key === 'family' && xj.me.familyPending" class="tag alert">待确认</text>
          <text v-else-if="m.key === 'family' && xj.me.familyCount" class="t-sm c2">{{ xj.me.familyCount }} 位</text>
          <XIcon name="chevron-right" :size="18" color="#786E74" />
        </view>
      </view>

      <view class="group">
        <view class="cell" @click="xj.toggleElder()">
          <XIcon name="accessible" :size="22" color="var(--brand-ink)" />
          <text class="flex1 t-md">乐龄模式</text>
          <text class="t-sm c2">{{ xj.elderMode ? '已开启' : '已关闭' }}</text>
        </view>
        <view class="cell" @click="logout">
          <XIcon name="logout" :size="22" color="#786E74" />
          <text class="flex1 t-md">退出登录 / 切换演示账号</text>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped>
.avatar { width: 56px; height: 56px; border-radius: 18px; background: linear-gradient(145deg, var(--brand-soft), var(--brand-line)); border: 1px solid var(--brand-line); color: var(--brand-ink); font-size: 22px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
.passbook { position: relative; overflow: hidden; background: var(--brand-grad); color: var(--on-brand); border-radius: 20px; padding: 18px; box-shadow: 0 10px 24px -12px rgba(204, 150, 0, 0.55); }
.passbook::after { content: ''; position: absolute; right: -28px; top: -36px; width: 120px; height: 120px; border-radius: 50%; background: rgba(255, 255, 255, 0.18); pointer-events: none; }
.redeem { display: flex; align-items: center; gap: 2px; height: 34px; padding: 0 12px 0 14px; border-radius: 999px; background: rgba(34, 34, 34, 0.86); color: var(--brand); font-size: var(--fs-sm); font-weight: 600; }
.quick { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }
.q { align-items: center; }
</style>
