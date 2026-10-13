<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import XIcon from '@/components/XIcon.vue'
import { http } from '@/xj/request'
import { useXj } from '@/xj/store'
import { createRecognizer, go, speak, stopSpeak, toast } from '@/xj/utils'

definePage({ style: { navigationBarTitleText: '答题' } })

const xj = useXj()
const id = ref(0)
const level = ref('')
const levelInfo = ref<any>(null)
const questions = ref<any[]>([])
const answers = ref<Record<string, any>>({})
const idx = ref(0)
const listening = ref(false)
const numInput = ref('')

const q = computed(() => questions.value[idx.value])
const cur = computed(() => answers.value[q.value?.code] || {})
const selected = computed<string[]>(() => cur.value.values || (cur.value.value !== undefined ? [cur.value.value] : []))
const sliderVal = ref(0)

async function load(keepCode?: string) {
  const r: any = await http.get(`/app/assessments/${id.value}/levels/${level.value}`)
  levelInfo.value = r.level
  questions.value = r.questions
  answers.value = r.answers || {}
  uni.setNavigationBarTitle({ title: `${r.level?.name}${level.value === 'safety' ? '' : '关'}` })
  if (keepCode) {
    const i = questions.value.findIndex(x => x.code === keepCode)
    idx.value = i >= 0 ? i : idx.value
  }
  else {
    const first = questions.value.findIndex(x => !answers.value[x.code])
    idx.value = first >= 0 ? first : 0
  }
}

onLoad((query: any) => {
  id.value = Number(query.id)
  level.value = query.level
})
onShow(() => load(q.value?.code))
onUnload(() => stopSpeak())

watch(q, (nq) => {
  if (!nq) return
  if (nq.type === 'slider') sliderVal.value = answers.value[nq.code]?.value ?? nq.config?.default ?? nq.config?.min ?? 0
  if (nq.type === 'number') numInput.value = answers.value[nq.code]?.value !== undefined ? String(answers.value[nq.code].value) : ''
  if (xj.elderMode && xj.me?.autoRead !== false) setTimeout(() => speak(nq.voiceText || nq.title), 300)
}, { immediate: false })

async function save(answer: any, inputMethod = 'tap') {
  const code = q.value.code
  answers.value[code] = answer
  const r: any = await http.put(`/app/assessments/${id.value}/answers`, { questionCode: code, answer, inputMethod })
  if (r.urgent) {
    uni.setStorageSync('xj_urgent', r.urgentPage)
    go('/pkg-assess/urgent')
    return false
  }
  // 分支题：显示条件变化时重新取题
  const codes = questions.value.map(x => x.code).join(',')
  if (r.visibleCodes && r.visibleCodes.join(',') !== codes) await load(code)
  return true
}

async function pick(opt: any) {
  if (q.value.type === 'multi') {
    let vals = [...selected.value]
    if (opt.exclusive) vals = vals.includes(opt.value) ? [] : [opt.value]
    else {
      vals = vals.filter(v => !q.value.options.find((o: any) => o.value === v)?.exclusive)
      if (vals.includes(opt.value)) vals = vals.filter(v => v !== opt.value)
      else {
        if (q.value.config?.max && vals.length >= q.value.config.max) return toast(`最多选 ${q.value.config.max} 个`)
        vals.push(opt.value)
      }
    }
    answers.value[q.value.code] = { values: vals }
    return
  }
  const ok = await save({ value: opt.value })
  if (ok) setTimeout(nextQ, 280)
}

async function nextQ() {
  const nq = q.value
  if (!nq) return
  if (nq.type === 'multi') {
    if (!selected.value.length) return toast(nq.required ? '这题需要选一项' : '请选择，或点"跳过"')
    if (!(await save({ values: selected.value }))) return
  }
  else if (nq.type === 'slider') {
    if (!(await save({ value: sliderVal.value }))) return
  }
  else if (nq.type === 'number') {
    if (numInput.value === '') return toast('请填写数字，或点"跳过"')
    if (!(await save({ value: Number(numInput.value) }))) return
  }
  else if (!answers.value[nq.code]) {
    return toast(nq.required ? '这题需要选一项' : '请选择，或点"跳过"')
  }
  if (idx.value < questions.value.length - 1) idx.value++
  else finishLevel()
}

async function skip() {
  if (!(await save({ skipped: true }))) return
  if (idx.value < questions.value.length - 1) idx.value++
  else finishLevel()
}

function prev() {
  if (idx.value > 0) idx.value--
}

async function finishLevel() {
  const missing = questions.value.filter(x => x.required && !answers.value[x.code])
  if (missing.length) {
    idx.value = questions.value.indexOf(missing[0])
    return toast('还有必答题没有完成')
  }
  const r: any = await http.post(`/app/assessments/${id.value}/levels/${level.value}/complete`)
  await new Promise(res => uni.showModal({
    title: `${levelInfo.value?.name || ''}已完成${r.points ? `，+${r.points} 积分` : ''}`,
    content: r.tip || '谢谢您的配合',
    showCancel: false,
    confirmText: '回到关卡地图',
    confirmColor: '#8A5A00',
    complete: res,
  }))
  uni.navigateBack()
}

function openTest() {
  go(`/pkg-assess/${q.value.type === 'counter' ? 'test-chair' : 'test-balance'}?id=${id.value}&code=${q.value.code}&ref=${q.value.config?.ref || ''}`)
}

function voice() {
  const r = createRecognizer(async (text) => {
    const opt = (q.value.options || []).find((o: any) => text.includes(o.label) || o.label.includes(text.replace(/[。，,.\s]/g, '')))
    if (!opt) return toast(`听到"${text}"，没有对上选项，请再说一次或直接点选`)
    toast(`您选的是：${opt.label}`)
    if (q.value.type === 'multi') pick(opt)
    else {
      const ok = await save({ value: opt.value }, 'voice')
      if (ok) setTimeout(nextQ, 600)
    }
  }, () => { listening.value = false })
  if (!r) return toast('当前环境暂不支持语音，请直接点选')
  listening.value = true
  r.start()
}
</script>

<template>
  <view :class="[...xj.pageClass, 'has-footer']">
    <view v-if="q" class="stack" style="padding-top: 12px">
      <view class="col gap8">
        <text class="c2 t-body">第 {{ idx + 1 }} 题，共 {{ questions.length }} 题</text>
        <view class="progress"><view :style="{ width: `${((idx + 1) / questions.length) * 100}%` }" /></view>
      </view>
      <text class="q-title">{{ q.title }}</text>
      <text v-if="q.intro" class="c2 t-body">{{ q.intro }}</text>
      <view class="pill" style="align-self: flex-start" @click="speak(q.voiceText || q.title)">
        <XIcon name="volume" :size="18" />
        <text>朗读题目</text>
      </view>

      <view v-if="['single', 'image_choice', 'multi'].includes(q.type)" class="stack">
        <text v-if="q.type === 'multi'" class="t-sm c2">可以选多个{{ q.config?.max ? `，最多 ${q.config.max} 个` : '' }}</text>
        <view v-for="o in q.options" :key="o.value" class="option" :class="{ on: selected.includes(o.value) }" @click="pick(o)">
          <view class="dot" :class="{ sq: q.type === 'multi' }" />
          <text class="flex1">{{ o.label }}</text>
        </view>
      </view>

      <view v-else-if="q.type === 'slider'" class="card stack" style="align-items: center">
        <view class="row gap8" style="align-items: baseline">
          <text class="num bold" style="font-size: 56px">{{ sliderVal }}</text>
          <text class="t-lg c2">{{ q.config?.unit }}</text>
        </view>
        <view class="row gap16" style="width: 100%">
          <view class="step" @click="sliderVal = Math.max(q.config.min, sliderVal - 1)"><XIcon name="minus" :size="24" /></view>
          <slider class="flex1" :min="q.config.min" :max="q.config.max" :step="q.config.step || 1" :value="sliderVal" :active-color="xj.themeHex" block-size="28" @changing="(e) => (sliderVal = e.detail.value)" @change="(e) => (sliderVal = e.detail.value)" />
          <view class="step" @click="sliderVal = Math.min(q.config.max, sliderVal + 1)"><XIcon name="plus" :size="24" /></view>
        </view>
      </view>

      <view v-else-if="q.type === 'number'" class="card row gap12">
        <input v-model="numInput" class="input flex1" type="digit" placeholder="请输入">
        <text class="t-lg c2">{{ q.config?.unit }}</text>
      </view>

      <view v-else-if="['counter', 'timer'].includes(q.type)" class="card stack">
        <text class="t-md">{{ q.type === 'counter' ? '30 秒内从椅子上站起再坐下，数一数能做几次。' : '扶好椅背，单腿站立，看看能站多久。' }}</text>
        <view v-if="answers[q.code]" class="tag care" style="align-self: flex-start">
          {{ answers[q.code].skipped ? '已跳过，到店再测' : q.type === 'counter' ? `已记录：${answers[q.code].value} 次` : `已记录：${answers[q.code].value} 秒` }}
        </view>
        <view class="btn" @click="openTest">{{ answers[q.code] ? '重新测一次' : '开始小测' }}</view>
      </view>
    </view>

    <view v-if="q" class="footer-bar">
      <view v-if="xj.elderMode && q.options?.length" class="btn" :class="{ listening }" @click="voice">
        <XIcon name="microphone" :size="24" />
        <text>{{ listening ? '正在听…' : '说出答案' }}</text>
      </view>
      <view v-if="q.type === 'multi' || q.type === 'slider' || q.type === 'number' || (['counter', 'timer'].includes(q.type) && answers[q.code])" class="btn" :class="{ ghost: xj.elderMode && q.options?.length }" @click="nextQ">
        {{ idx === questions.length - 1 ? '完成本关' : '下一题' }}
      </view>
      <view v-else-if="answers[q.code] && idx === questions.length - 1" class="btn" :class="{ ghost: xj.elderMode }" @click="finishLevel">完成本关</view>
      <view class="row-between t-body" style="padding: 4px 8px; color: #3b3337">
        <text :style="{ opacity: idx > 0 ? 1 : 0.3 }" @click="prev">上一题</text>
        <text v-if="answers[q.code] && idx < questions.length - 1 && !['multi', 'slider', 'number'].includes(q.type)" @click="idx++">下一题</text>
        <text v-if="!q.required" @click="skip">跳过</text>
      </view>
    </view>
  </view>
</template>

<style scoped>
.q-title { font-size: var(--fs-title); font-weight: 700; line-height: 1.35; }
.step { width: 48px; height: 48px; border-radius: 24px; background: var(--brand-soft); color: var(--brand-ink); display: flex; align-items: center; justify-content: center; }
.btn.listening { background: var(--brand-dark); }
</style>
