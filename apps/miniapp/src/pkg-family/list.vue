<script lang="ts" setup>
import { ref } from 'vue'
import XIcon from '@/components/XIcon.vue'
import { http } from '@/xj/request'
import { useXj } from '@/xj/store'
import { confirm, go, toast } from '@/xj/utils'

definePage({ style: { navigationBarTitleText: '我的家人' } })

const xj = useXj()
const data = ref<any>({ myFamily: [], iCareFor: [] })
const relation = ref('daughter')
const invite = ref<any>(null)
const REL: Record<string, string> = { daughter: '女儿', son: '儿子', spouse: '配偶', other: '其他' }
const PERMS = [
  { k: 'view_report', n: '查看测评和报告', d: '包括医生建议摘要' },
  { k: 'receive_reminder', n: '接收复查和体检提醒', d: '提醒会同时发给家人' },
  { k: 'book_for', n: '代为预约', d: '体检和门店项目' },
  { k: 'fill_for', n: '代填测评', d: '帮您回答测评题目' },
]
const pendingPerms = ref<Record<number, string[]>>({})

async function load() {
  data.value = await http.get('/app/family/links')
  data.value.myFamily.filter((l: any) => l.status === 'applied').forEach((l: any) => { pendingPerms.value[l.id] = ['view_report', 'receive_reminder'] })
}
onShow(load)

async function createInvite() {
  invite.value = await http.post('/app/family/invites', { relation: relation.value, permissions: ['view_report', 'receive_reminder'] })
  load()
}

function shareInvite() {
  // #ifdef H5
  const url = `${location.origin}${location.pathname}#${invite.value.path}`
  uni.setClipboardData({ data: url, success: () => toast('邀请链接已复制，发给家人打开即可') })
  // #endif
  // #ifndef H5
  toast('点击右上角"···"转发给家人')
  // #endif
}

async function togglePerm(l: any, k: string) {
  const perms = l.permissions.includes(k) ? l.permissions.filter((x: string) => x !== k) : [...l.permissions, k]
  await http.patch(`/app/family/links/${l.id}`, { permissions: perms })
  l.permissions = perms
}

function togglePending(id: number, k: string) {
  const cur = pendingPerms.value[id] || []
  pendingPerms.value[id] = cur.includes(k) ? cur.filter(x => x !== k) : [...cur, k]
}

async function confirmLink(l: any) {
  await http.post(`/app/family/links/${l.id}/confirm`, { permissions: pendingPerms.value[l.id] || [] })
  toast('已确认绑定')
  load()
}

async function unlink(l: any) {
  if (!(await confirm('解除绑定', `解除后，${l.name}将立即无法查看您的信息`, '解除绑定'))) return
  await http.del(`/app/family/links/${l.id}`)
  load()
}

onShareAppMessage(() => ({ title: `${xj.me?.salutation || ''}邀请您成为她的健康家人`, path: invite.value?.path || '/pages/index/index' }))
</script>

<template>
  <view :class="xj.pageClass">
    <view class="stack" style="padding-top: 12px">
      <view v-for="l in data.myFamily.filter((x) => x.status === 'active')" :key="l.id" class="card stack">
        <view class="row gap12">
          <view class="av">{{ (l.name || '家').slice(0, 1) }}</view>
          <view class="col flex1">
            <text class="t-lg">{{ REL[l.relation] || l.relation }} {{ l.name }}</text>
            <text class="t-sm c2">已绑定，可查看您授权的内容</text>
          </view>
        </view>
        <text class="t-sm c2 semi">{{ l.name }}可以看到什么</text>
        <view v-for="p in PERMS" :key="p.k" class="row gap12">
          <view class="col flex1"><text class="t-md">{{ p.n }}</text><text class="t-sm c2">{{ p.d }}</text></view>
          <switch :checked="l.permissions.includes(p.k)" :color="xj.themeHex" @change="togglePerm(l, p.k)" />
        </view>
        <text class="t-sm c2" @click="unlink(l)">不想继续分享时，可以<text class="link" style="color: #5c5358; text-decoration: underline">解除绑定</text></text>
      </view>

      <view v-for="l in data.myFamily.filter((x) => x.status === 'applied')" :key="l.id" class="card hint stack">
        <text class="t-md">{{ l.name }}申请作为您的{{ REL[l.relation] }}绑定</text>
        <text class="t-sm">请勾选允许查看的内容（单独同意 C6）</text>
        <view v-for="p in PERMS" :key="p.k" class="row gap8" @click="togglePending(l.id, p.k)">
          <view class="check" :class="{ on: (pendingPerms[l.id] || []).includes(p.k) }"><XIcon v-if="(pendingPerms[l.id] || []).includes(p.k)" name="check" :size="16" color="var(--on-brand)" /></view>
          <text class="t-body">{{ p.n }}</text>
        </view>
        <view class="btn" @click="confirmLink(l)">确认绑定</view>
      </view>

      <view class="card stack">
        <view class="col gap4">
          <text class="t-lg">邀请家人一起关心您</text>
          <text class="t-sm c2">家人能看到的内容由您决定，可以随时修改</text>
        </view>
        <view class="row gap8 wrap">
          <view v-for="(n, k) in REL" :key="k" class="chip" :class="{ on: relation === k }" @click="relation = k">{{ n }}</view>
        </view>
        <view v-if="invite" class="invite row gap12">
          <view class="icon-box"><XIcon name="users" /></view>
          <view class="col flex1">
            <text class="t-md">{{ xj.me?.salutation }}邀请您成为她的健康家人</text>
            <text class="t-xs c2">72 小时内有效，需要{{ xj.me?.salutation }}再次确认</text>
          </view>
        </view>
        <!-- #ifdef MP-WEIXIN -->
        <button v-if="invite" class="btn" open-type="share">发送给微信好友</button>
        <!-- #endif -->
        <!-- #ifndef MP-WEIXIN -->
        <view v-if="invite" class="btn" @click="shareInvite">复制邀请链接</view>
        <!-- #endif -->
        <view v-if="!invite" class="btn" @click="createInvite">生成邀请</view>
      </view>

      <view v-if="data.myFamily.some((x) => x.status === 'pending')" class="group">
        <view v-for="l in data.myFamily.filter((x) => x.status === 'pending')" :key="l.id" class="cell">
          <text class="flex1 t-body">邀请{{ REL[l.relation] }}（等待接受）</text>
          <text class="t-xs c3">{{ l.expiresAt }} 前有效</text>
        </view>
      </view>

      <view v-if="data.iCareFor.length" class="stack">
        <text class="section-title">我关心的家人</text>
        <view v-for="l in data.iCareFor" :key="l.id" class="card row gap12" @click="go(`/pkg-family/view?elderId=${l.elderId}`)">
          <view class="av care">{{ l.name.slice(0, 1) }}</view>
          <view class="col flex1"><text class="t-lg">{{ l.name }}</text><text class="t-sm c2">查看授权范围内的健康信息</text></view>
          <XIcon name="chevron-right" :size="20" color="#786E74" />
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped>
.av { width: 52px; height: 52px; border-radius: 16px; background: var(--care-soft); color: var(--care); font-size: 20px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
.av.care { background: var(--brand-soft); color: var(--brand-ink); }
.chip { height: 40px; padding: 0 16px; border-radius: 20px; background: var(--bg); display: flex; align-items: center; }
.chip.on { background: var(--brand); color: var(--on-brand); font-weight: 600; }
.invite { background: #f7f3f5; border-radius: 14px; padding: 12px; }
.check { width: 22px; height: 22px; border-radius: 6px; border: 2px solid #c9a35e; display: flex; align-items: center; justify-content: center; box-sizing: border-box; }
.check.on { background: var(--brand); border-color: var(--brand); }
button.btn { margin: 0; line-height: var(--btn-h); }
button.btn::after { border: 0; }
</style>
