import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query } from '@nestjs/common'
import { createHash } from 'node:crypto'
import dayjs from 'dayjs'
import { Aud, CurrentUser, type CustomerUser, OptionalAuth, signToken } from '../common/auth'
import { PrismaService } from '../common/prisma.service'
import { Err } from '../common/response'
import { addHours, fmt, genNo, maskPhone, TIER_NAMES, today } from '../common/util'
import { ageOf, evalLogic } from '../engine'
import { TAG_NAMES } from '../engine/rules-data'
import { ArchiveService } from '../services/archive.service'
import { AssessmentService } from '../services/assessment.service'
import { CheckupService } from '../services/checkup.service'
import { HomeService, moduleCard, moduleVisible, TIER_BENEFITS } from '../services/home.service'
import { MirrorService } from '../services/mirror.service'
import { WorkflowService } from '../services/workflow.service'

/** 小程序端可选主题（治愈系多主题，与 miniapp src/xj/themes.ts 保持一致） */
const ALLOWED_THEMES = ['sun', 'sakura', 'mizu', 'matcha', 'cream']

const BENEFIT_TABLE = [
  { name: '专属顾问直连（优先响应）', A: '4 小时内响应', B: '—', C: '—' },
  { name: '海外 VIP 通道', A: '✓', B: '—', C: '—' },
  { name: '接送车', A: '✓', B: '—', C: '70 岁以上可申请陪同' },
  { name: '高端体检 / 优先号源', A: '✓', B: '—', C: '—' },
  { name: '私享活动、私享礼盒', A: '✓', B: '—', C: '—' },
  { name: '年度个人健康报告', A: '✓', B: '—', C: '—' },
  { name: '方案包、医生讲座名额', A: '✓', B: '✓', C: '按活动' },
  { name: '康养文旅精选', A: '私享 / 定制', B: '✓', C: '—' },
  { name: '清远温泉', A: '✓', B: '精品小团', C: '特惠结伴团' },
  { name: '有机商城', A: '私享礼盒', B: '✓', C: '✓' },
  { name: '结伴拼团、小游戏', A: '—', B: '拼团', C: '✓' },
  { name: '六维测评、免费基础体检、健康档案、魔镜', A: '✓', B: '✓', C: '✓' },
]

const REDEEM_ITEMS = [
  { code: 'R_LECTURE', name: '医生健康讲座名额', points: 100 },
  { code: 'R_MALL20', name: '有机商城 20 元券', points: 200 },
  { code: 'R_NECK30', name: '肩颈舒缓体验 30 分钟', points: 300 },
  { code: 'R_BMD', name: '体检加项：骨密度', points: 500 },
]

@Controller('app/auth')
export class AppAuthController {
  constructor(private prisma: PrismaService, private wf: WorkflowService) {}

  /** 演示：wx.login code → openid（正式版调用 code2Session） */
  @Post('wx-login')
  async wxLogin(@Body() body: { code?: string, q?: string }) {
    const openid = `demo_${createHash('sha256').update(body.code || `${Date.now()}`).digest('hex').slice(0, 24)}`
    if (body.q) await this.prisma.qrcode.updateMany({ where: { code: body.q }, data: { scanCount: { increment: 1 } } })
    const c = await this.prisma.customer.findUnique({ where: { openid } })
    await this.wf.event(c?.id || null, 'app_open', { q: body.q })
    if (c) return { token: signToken({ id: c.id }, 'app'), isGuest: false }
    return { token: null, isGuest: true, openid }
  }

  @Get('demo-personas')
  async personas() {
    const list = await this.prisma.customer.findMany({ where: { isDemo: true }, orderBy: { id: 'asc' } })
    return list.map(c => ({ id: c.id, salutation: c.salutation, age: ageOf(c.birthYear), tier: c.tier, tierName: TIER_NAMES[c.tier], elderMode: c.elderMode, title: c.demoTitle }))
  }

  @Post('demo-login')
  async demoLogin(@Body() body: { customerId: number }) {
    const c = await this.prisma.customer.findUnique({ where: { id: Number(body.customerId) } })
    if (!c) throw Err.notFound()
    await this.wf.event(c.id, 'login_success', { isNew: false, demo: true })
    return { token: signToken({ id: c.id }, 'app'), isNew: false, needConsent: (await this.wf.hasConsent(c.id, 'C1')) ? [] : ['C1'] }
  }

  /** 手机号快速验证（演示：直接输入手机号）。匹配老客户则继承等级、门店、顾问；否则按码归属为新客 */
  @Post('phone')
  async phone(@Body() body: { phone: string, q?: string, openid?: string, salutation?: string }) {
    const phone = `${body.phone || ''}`.trim()
    if (!/^1\d{10}$/.test(phone)) throw Err.bad('请输入正确的手机号')
    let c = await this.prisma.customer.findUnique({ where: { phone } })
    let isNew = false
    if (!c) {
      const qr = body.q ? await this.prisma.qrcode.findUnique({ where: { code: body.q } }) : null
      const store = qr?.storeId ? { id: qr.storeId } : await this.prisma.store.findFirst({ orderBy: { id: 'asc' } })
      const advisorId = qr?.staffId || (await this.prisma.staff.findFirst({ where: { role: 'advisor', storeId: store?.id } }))?.id
      c = await this.prisma.customer.create({ data: { customerNo: genNo('C'), phone, openid: body.openid || null, storeId: store?.id, advisorId, tier: 'C', source: qr ? 'store_qr' : 'share', salutation: body.salutation || null } })
      await this.prisma.tierHistory.create({ data: { customerId: c.id, toTier: 'C', reason: 'new' } })
      isNew = true
    }
    else if (body.openid && !c.openid) {
      c = await this.prisma.customer.update({ where: { id: c.id }, data: { openid: body.openid } })
    }
    if (c.status === 'deleted') throw Err.bad('该账号已注销，如需恢复请联系门店')
    await this.wf.event(c.id, 'phone_bind', {})
    await this.wf.event(c.id, 'login_success', { isNew })
    return { token: signToken({ id: c.id }, 'app'), isNew, needProfile: !c.salutation || !c.birthYear, needConsent: (await this.wf.hasConsent(c.id, 'C1')) ? [] : ['C1'] }
  }
}

@Controller('app')
export class AppController {
  constructor(
    private prisma: PrismaService,
    private wf: WorkflowService,
    private home: HomeService,
    private mirror: MirrorService,
  ) {}

  @Get('me')
  @Aud('app')
  async me(@CurrentUser() u: CustomerUser) {
    const c = await this.prisma.customer.findUnique({ where: { id: u.id } })
    if (!c) throw Err.unauth()
    const store = c.storeId ? await this.prisma.store.findUnique({ where: { id: c.storeId } }) : null
    const advisor = c.advisorId ? await this.prisma.staff.findUnique({ where: { id: c.advisorId } }) : null
    const unread = await this.prisma.message.count({ where: { customerId: c.id, read: false } })
    const family = await this.prisma.familyLink.count({ where: { OR: [{ elderId: c.id }, { familyId: c.id }], status: 'active' } })
    const pending = await this.prisma.familyLink.count({ where: { elderId: c.id, status: 'applied' } })
    const coupons = await this.prisma.coupon.count({ where: { customerId: c.id, status: { in: ['issued', 'claimed', 'booked'] } } })
    return {
      id: c.id, customerNo: c.customerNo, salutation: c.salutation, gender: c.gender, birthYear: c.birthYear, age: c.birthYear ? ageOf(c.birthYear) : null,
      tier: c.tier, tierName: TIER_NAMES[c.tier], elderMode: c.elderMode, lang: c.lang, personalization: c.personalization, autoRead: c.autoRead, theme: c.theme,
      phone: maskPhone(c.phone), store: store ? { id: store.id, name: store.name, phone: store.phone, address: store.address } : null,
      advisor: advisor ? { id: advisor.id, name: advisor.name, phone: advisor.phone } : null,
      points: await this.wf.balance(c.id), unreadMessages: unread, familyCount: family, familyPending: pending, coupons,
      needProfile: !c.salutation || !c.birthYear, tierKeepUntil: c.tierKeepUntil ? fmt(c.tierKeepUntil, 'YYYY-MM-DD') : null,
    }
  }

  @Patch('me')
  @Aud('app')
  async updateMe(@CurrentUser() u: CustomerUser, @Body() body: { salutation?: string, birthYear?: number, gender?: string }) {
    const data: any = {}
    if (body.salutation) data.salutation = body.salutation.slice(0, 16)
    if (body.gender) data.gender = body.gender
    if (body.birthYear) {
      const y = Number(body.birthYear)
      if (y > new Date().getFullYear() - 18) throw Err.bad('本平台面向 18 岁以上用户')
      data.birthYear = y
      const c = await this.prisma.customer.findUnique({ where: { id: u.id } })
      // 4.2：≥ 60 岁首次填写时自动开启乐龄模式
      if (!c?.birthYear && ageOf(y) >= 60) data.elderMode = true
    }
    const c = await this.prisma.customer.update({ where: { id: u.id }, data })
    return { ok: true, elderMode: c.elderMode, elderAuto: !!data.elderMode, askElder: !!data.birthYear && ageOf(data.birthYear) >= 50 && ageOf(data.birthYear) < 60 }
  }

  @Patch('me/settings')
  @Aud('app')
  async settings(@CurrentUser() u: CustomerUser, @Body() body: { elderMode?: boolean, lang?: string, personalization?: boolean, autoRead?: boolean, theme?: string }) {
    const data: any = {}
    for (const k of ['elderMode', 'lang', 'personalization', 'autoRead'] as const) if (body[k] !== undefined) data[k] = body[k]
    if (body.theme !== undefined) {
      if (!ALLOWED_THEMES.includes(body.theme)) throw Err.bad('不支持的主题')
      data.theme = body.theme
    }
    await this.prisma.customer.update({ where: { id: u.id }, data })
    if (body.elderMode !== undefined) await this.wf.event(u.id, 'elder_mode_toggle', { on: body.elderMode })
    if (body.personalization !== undefined) {
      await this.wf.grantConsent(u.id, 'C7', body.personalization)
      await this.wf.event(u.id, 'personalization_toggle', { on: body.personalization })
    }
    return { ok: true }
  }

  @Get('home')
  @Aud('app')
  @OptionalAuth()
  async getHome(@CurrentUser() u?: CustomerUser) {
    const data = await this.home.resolve(u?.id || null)
    await this.wf.event(u?.id || null, 'home_view', { tier: data.tier, elder: data.elderMode, layoutVersion: data.layoutVersion })
    return data
  }

  @Get('modules')
  @Aud('app')
  @OptionalAuth()
  async modules(@CurrentUser() u: CustomerUser | undefined, @Query('category') category?: string) {
    const c = u ? await this.prisma.customer.findUnique({ where: { id: u.id } }) : null
    const list = await this.prisma.module.findMany({ where: category ? { category } : {}, orderBy: { sort: 'asc' } })
    return list.filter(m => moduleVisible(m, { tier: c?.tier || 'C', storeId: c?.storeId, elderMode: !!c?.elderMode })).map(moduleCard)
  }

  @Get('modules/:code')
  @Aud('app')
  @OptionalAuth()
  async moduleDetail(@CurrentUser() u: CustomerUser | undefined, @Param('code') code: string) {
    const m = await this.prisma.module.findUnique({ where: { code } })
    if (!m) throw Err.notFound('模块不存在')
    const c = u ? await this.prisma.customer.findUnique({ where: { id: u.id } }) : null
    const visible = moduleVisible(m, { tier: c?.tier || 'C', storeId: c?.storeId, elderMode: false })
    const tags = c ? await this.wf.activeTags(c.id) : []
    const age = c ? ageOf(c.birthYear) : 0
    // 健康提示：按客户健康标签（或 JSON Logic 条件）命中 health_rules
    const notices = ((m.healthRules as any[]) || []).filter((r) => {
      if (r.always) return true
      if (r.tags?.some((t: string) => tags.includes(t))) return true
      if (r.logic && evalLogic(r.logic, { age, tags })) return true
      return false
    }).map((r, i) => ({ id: `${m.code}_${i}`, text: r.text, requireAck: !!r.require_ack, tags: (r.tags || []).filter((t: string) => tags.includes(t)).map((t: string) => TAG_NAMES[t] || t) }))
    const partner = m.partnerId ? await this.prisma.partner.findUnique({ where: { id: m.partnerId } }) : null
    if (u) {
      await this.wf.event(u.id, 'module_view', { moduleCode: code })
      for (const n of notices) await this.wf.event(u.id, 'health_notice_shown', { moduleCode: code, notice: n.id })
    }
    return {
      ...moduleCard(m), detail: m.detail, entryConfig: m.entryConfig, visible, healthNotices: notices, leadConfig: m.leadConfig,
      partner: partner && m.showPartnerLicense ? { name: partner.name, licenses: partner.licenses } : null,
    }
  }

  @Post('leads')
  @Aud('app')
  async submitLead(@CurrentUser() u: CustomerUser, @Body() body: { moduleCode: string, form: any, ackNotices?: string[] }) {
    const m = await this.prisma.module.findUnique({ where: { code: body.moduleCode } })
    if (!m) throw Err.notFound('模块不存在')
    const c = await this.prisma.customer.findUnique({ where: { id: u.id } })
    const lc: any = m.leadConfig || {}
    const sla = lc.sla_hours || 24
    const lead = await this.prisma.lead.create({
      data: {
        leadNo: genNo('LD'), customerId: u.id, moduleId: m.id, moduleCode: m.code, moduleName: m.name, type: lc.type || 'other', formData: body.form || {},
        healthNotices: (body.ackNotices || []).map(id => ({ id, ackAt: new Date().toISOString() })), assigneeId: c?.advisorId, partnerId: m.partnerId, slaDueAt: addHours(sla),
      },
    })
    await this.wf.createTask({ staffId: c?.advisorId, customerId: u.id, type: 'lead_followup', refTable: 'lead', refId: lead.id, title: `${c?.salutation}提交「${m.name}」意向，请 ${sla} 小时内联系`, hours: sla })
    await this.wf.notifyStaff({ staffIds: [c?.advisorId], roles: sla <= 4 ? ['ops'] : [] }, '新线索', `${c?.salutation}提交「${m.name}」意向${body.form?.people ? `（${body.form.people} 人）` : ''}，请 ${sla} 小时内联系`, sla <= 4 ? 'high' : 'medium', '/marketing/leads')
    await this.wf.event(u.id, 'lead_submit', { moduleCode: m.code, type: lc.type })
    return { leadNo: lead.leadNo, slaHours: sla }
  }

  @Get('tier')
  @Aud('app')
  async tier(@CurrentUser() u: CustomerUser) {
    const c = await this.prisma.customer.findUnique({ where: { id: u.id } })
    const rule = await this.prisma.tierRule.findFirst({ where: { status: 'active' } })
    return {
      tier: c!.tier, tierName: TIER_NAMES[c!.tier], benefits: TIER_BENEFITS[c!.tier], table: BENEFIT_TABLE,
      keepUntil: c!.tierKeepUntil ? fmt(c!.tierKeepUntil, 'YYYY-MM-DD') : null,
      rules: rule ? [
        `近 12 个月实付金额 ≥ ${rule.thresholdA.toLocaleString()} 元为臻享会员`,
        `近 12 个月实付金额 ≥ ${rule.thresholdB.toLocaleString()} 元为尊享会员`,
        '达到条件立即升级；低于条件时有 3 个月保级期',
        '会员价按公开规则计算，同一项目对同等条件的客户价格一致',
      ] : [],
    }
  }

  // ───────── 授权 ─────────

  @Get('consents')
  @Aud('app')
  async consents(@CurrentUser() u: CustomerUser) {
    const texts = await this.prisma.consentText.findMany({ where: { status: 'published' }, orderBy: { type: 'asc' } })
    const recs = await this.prisma.consentRecord.findMany({ where: { customerId: u.id }, orderBy: { id: 'desc' } })
    return texts.map((t) => {
      const r = recs.find(x => x.type === t.type)
      return { type: t.type, title: t.title, version: t.version, summary: t.summary, required: t.required, granted: !!r && r.granted && !r.revokedAt, recordId: r?.id, at: r ? fmt(r.revokedAt || r.grantedAt) : null, revoked: !!r?.revokedAt, channel: r?.channel }
    })
  }

  @Get('consents/texts/:type')
  @Aud('app')
  @OptionalAuth()
  async consentText(@CurrentUser() u: CustomerUser | undefined, @Param('type') type: string) {
    const t = await this.prisma.consentText.findFirst({ where: { type, status: 'published' }, orderBy: { id: 'desc' } })
    if (!t) throw Err.notFound()
    if (u) await this.wf.event(u.id, 'consent_view', { type, version: t.version })
    return t
  }

  @Post('consents')
  @Aud('app')
  async grant(@CurrentUser() u: CustomerUser, @Body() body: { type: string, granted: boolean, scope?: any }) {
    const r = await this.wf.grantConsent(u.id, body.type, body.granted !== false, body.scope)
    if (body.type === 'C7') await this.prisma.customer.update({ where: { id: u.id }, data: { personalization: body.granted !== false } })
    return { id: r.id }
  }

  /** 撤回授权及系统动作（9.10） */
  @Post('consents/:type/revoke')
  @Aud('app')
  async revoke(@CurrentUser() u: CustomerUser, @Param('type') type: string, @Body() body: { keepData?: boolean }) {
    const recs = await this.prisma.consentRecord.findMany({ where: { customerId: u.id, type, granted: true, revokedAt: null } })
    if (!recs.length) throw Err.conflict('当前没有可撤回的授权')
    await this.prisma.consentRecord.updateMany({ where: { id: { in: recs.map(r => r.id) } }, data: { revokedAt: new Date() } })
    const effects: string[] = []
    if (type === 'C2') {
      await this.prisma.plan.updateMany({ where: { customerId: u.id, status: { in: ['draft', 'ready'] } }, data: { status: 'void' } })
      await this.prisma.assessment.updateMany({ where: { customerId: u.id, status: 'in_progress' }, data: { status: 'abandoned' } })
      effects.push('已停止新的健康数据收集，未发送的方案已作废')
      if (body.keepData === false) effects.push('已登记删除健康数据的申请，15 个工作日内处理')
    }
    if (type === 'C3') {
      const refs = await this.prisma.referral.findMany({ where: { customerId: u.id, status: { in: ['created', 'sent', 'accepted', 'booked'] } } })
      for (const r of refs) {
        await this.prisma.referral.update({ where: { id: r.id }, data: { status: 'cancelled', cancelReason: '客户撤回 C3 授权' } })
        if (r.couponId) await this.prisma.coupon.update({ where: { id: r.couponId }, data: { status: 'void', voidReason: '客户撤回 C3 授权' } })
      }
      effects.push(`已取消 ${refs.length} 个未完成的转介，并通知医院`)
    }
    if (type === 'C4') {
      await this.prisma.referral.updateMany({ where: { customerId: u.id }, data: { c4Granted: false } })
      effects.push('医院将不再回传结果')
    }
    if (type === 'C6') {
      await this.prisma.familyLink.updateMany({ where: { elderId: u.id, status: 'active' }, data: { status: 'revoked' } })
      effects.push('已解除家人绑定')
    }
    if (type === 'C7') {
      await this.prisma.customer.update({ where: { id: u.id }, data: { personalization: false } })
      effects.push('首页恢复默认顺序')
    }
    if (type === 'C9') {
      await this.prisma.mirrorMemory.updateMany({ where: { customerId: u.id }, data: { status: 'deleted' } })
      effects.push('已清空小镜的记忆')
    }
    await this.wf.message(u.id, '授权撤回已处理', effects.join('；') || '已处理', '/pkg-me/consents')
    await this.wf.event(u.id, 'consent_revoke', { type })
    return { ok: true, effects }
  }

  // ───────── 家人 ─────────

  @Post('family/invites')
  @Aud('app')
  async invite(@CurrentUser() u: CustomerUser, @Body() body: { relation: string, permissions?: string[] }) {
    const token = createHash('md5').update(`${u.id}-${Date.now()}-${Math.random()}`).digest('hex').slice(0, 12)
    const link = await this.prisma.familyLink.create({ data: { elderId: u.id, relation: body.relation || 'daughter', permissions: body.permissions || ['view_report', 'receive_reminder'], token, invitedBy: 'elder', expiresAt: addHours(72) } })
    await this.wf.event(u.id, 'family_invite', { relation: body.relation })
    return { token, id: link.id, expiresAt: fmt(link.expiresAt), path: `/pkg-family/accept?token=${token}` }
  }

  @Get('family/invites/:token')
  @Aud('app')
  @OptionalAuth()
  async inviteInfo(@Param('token') token: string) {
    const l = await this.prisma.familyLink.findUnique({ where: { token } })
    if (!l) throw Err.notFound('邀请不存在')
    const elder = await this.prisma.customer.findUnique({ where: { id: l.elderId } })
    return { relation: l.relation, status: l.status, expired: !!l.expiresAt && l.expiresAt < new Date(), elder: { salutation: elder?.salutation } }
  }

  @Post('family/invites/:token/accept')
  @Aud('app')
  async accept(@CurrentUser() u: CustomerUser, @Param('token') token: string) {
    const l = await this.prisma.familyLink.findUnique({ where: { token } })
    if (!l || l.status !== 'pending') throw Err.conflict('邀请已失效')
    if (l.expiresAt && l.expiresAt < new Date()) throw Err.conflict('邀请已过期（72 小时有效）')
    if (l.elderId === u.id) throw Err.bad('不能绑定自己')
    await this.prisma.familyLink.update({ where: { id: l.id }, data: { familyId: u.id, status: 'applied' } })
    const me = await this.prisma.customer.findUnique({ where: { id: u.id } })
    await this.wf.message(l.elderId, '家人申请绑定', `${me?.salutation || '您的家人'}申请绑定，请确认并选择可以查看的内容`, '/pkg-family/list')
    return { ok: true }
  }

  /** 客户确认并勾选可见范围（C6，按家人、按范围） */
  @Post('family/links/:id/confirm')
  @Aud('app')
  async confirmLink(@CurrentUser() u: CustomerUser, @Param('id', ParseIntPipe) id: number, @Body() body: { permissions: string[] }) {
    const l = await this.prisma.familyLink.findUnique({ where: { id } })
    if (!l || l.elderId !== u.id) throw Err.notFound()
    await this.wf.grantConsent(u.id, 'C6', true, { family_id: l.familyId, permissions: body.permissions })
    await this.prisma.familyLink.update({ where: { id }, data: { status: 'active', permissions: body.permissions } })
    if (l.familyId) await this.wf.message(l.familyId, '绑定成功', '家人已确认绑定，您可以查看授权范围内的内容了', `/pkg-family/view?elderId=${u.id}`)
    await this.wf.event(u.id, 'family_bind', { relation: l.relation })
    return { ok: true }
  }

  @Get('family/links')
  @Aud('app')
  async links(@CurrentUser() u: CustomerUser) {
    const list = await this.prisma.familyLink.findMany({ where: { OR: [{ elderId: u.id }, { familyId: u.id }], status: { in: ['pending', 'applied', 'active'] } }, orderBy: { id: 'desc' } })
    const ids = [...new Set(list.flatMap(l => [l.elderId, l.familyId]).filter(Boolean) as number[])]
    const people = await this.prisma.customer.findMany({ where: { id: { in: ids } } })
    const name = (id?: number | null) => people.find(p => p.id === id)?.salutation || '待接受'
    return {
      myFamily: list.filter(l => l.elderId === u.id).map(l => ({ id: l.id, relation: l.relation, status: l.status, permissions: l.permissions, name: name(l.familyId), token: l.token, expiresAt: fmt(l.expiresAt) })),
      iCareFor: list.filter(l => l.familyId === u.id && l.status === 'active').map(l => ({ id: l.id, elderId: l.elderId, relation: l.relation, name: name(l.elderId), permissions: l.permissions })),
    }
  }

  @Patch('family/links/:id')
  @Aud('app')
  async patchLink(@CurrentUser() u: CustomerUser, @Param('id', ParseIntPipe) id: number, @Body() body: { permissions: string[] }) {
    const l = await this.prisma.familyLink.findUnique({ where: { id } })
    if (!l || l.elderId !== u.id) throw Err.notFound()
    await this.prisma.familyLink.update({ where: { id }, data: { permissions: body.permissions } })
    await this.wf.grantConsent(u.id, 'C6', true, { family_id: l.familyId, permissions: body.permissions })
    return { ok: true }
  }

  @Delete('family/links/:id')
  @Aud('app')
  async unlink(@CurrentUser() u: CustomerUser, @Param('id', ParseIntPipe) id: number) {
    const l = await this.prisma.familyLink.findUnique({ where: { id } })
    if (!l || (l.elderId !== u.id && l.familyId !== u.id)) throw Err.notFound()
    await this.prisma.familyLink.update({ where: { id }, data: { status: 'revoked' } })
    await this.wf.event(u.id, 'family_unbind', { relation: l.relation })
    return { ok: true }
  }

  /** 家人视角（P-35）：只展示授权范围内的内容 */
  @Get('family/elders/:elderId/overview')
  @Aud('app')
  async elderOverview(@CurrentUser() u: CustomerUser, @Param('elderId', ParseIntPipe) elderId: number) {
    const l = await this.prisma.familyLink.findFirst({ where: { elderId, familyId: u.id, status: 'active' } })
    if (!l) throw Err.forbidden('没有查看权限')
    const perms = (l.permissions as string[]) || []
    const elder = await this.prisma.customer.findUnique({ where: { id: elderId } })
    const out: any = { elder: { salutation: elder?.salutation, relation: l.relation }, permissions: perms }
    if (perms.includes('view_report')) {
      const last = await this.prisma.assessment.findFirst({ where: { customerId: elderId, status: 'completed' }, orderBy: { id: 'desc' } })
      const plan = await this.prisma.plan.findFirst({ where: { customerId: elderId, status: 'sent' }, orderBy: { id: 'desc' } })
      const report = await this.prisma.report.findFirst({ where: { customerId: elderId, type: 'hospital' }, orderBy: { id: 'desc' } })
      const pc: any = plan?.contentCustomer
      const rc: any = report?.content
      out.summary = {
        situation: last ? `最近一次六维测评（${fmt(last.completedAt, 'M月D日')}）指数 ${last.indexScore}，风险等级 ${last.riskLevel === 'L0' ? '平稳' : last.riskLevel === 'L1' ? '建议体检' : '建议就医'}` : '还没有完成六维测评',
        doctor: rc ? `${rc.hospital}${rc.doctor}：${rc.advice}` : '暂无医生建议',
        store: pc ? `${pc.title}：${(pc.storeItems || []).map((s: any) => `${s.name}${s.freq}`).join('；')}` : '暂无门店安排',
        dims: last?.dimensionScores || null,
        index: last?.indexScore ?? null,
      }
    }
    if (perms.includes('receive_reminder')) {
      const card = await this.home.healthCard(elder, 5)
      out.reminders = card.todos
    }
    return out
  }

  // ───────── 魔镜 ─────────

  @Post('mirror/sessions')
  @Aud('app')
  startMirror(@CurrentUser() u: CustomerUser) {
    return this.mirror.start(u.id)
  }

  @Post('mirror/sessions/:id/messages')
  @Aud('app')
  sendMirror(@CurrentUser() u: CustomerUser, @Param('id', ParseIntPipe) id: number, @Body() body: { text: string, inputMethod?: string, quickTopic?: string }) {
    if (body.quickTopic) this.wf.event(u.id, 'mirror_quick_topic', { topic: body.quickTopic })
    return this.mirror.send(u.id, id, body.text, body.inputMethod)
  }

  @Get('mirror/memories')
  @Aud('app')
  memories(@CurrentUser() u: CustomerUser) {
    return this.mirror.memories(u.id)
  }

  @Delete('mirror/memories/:id')
  @Aud('app')
  async delMemory(@CurrentUser() u: CustomerUser, @Param('id', ParseIntPipe) id: number) {
    await this.prisma.mirrorMemory.updateMany({ where: { id, customerId: u.id }, data: { status: 'deleted' } })
    return { ok: true }
  }

  // ───────── 消息、积分、打卡、问答、拼团 ─────────

  @Get('messages')
  @Aud('app')
  async messages(@CurrentUser() u: CustomerUser) {
    const list = await this.prisma.message.findMany({ where: { customerId: u.id }, orderBy: { id: 'desc' }, take: 50 })
    await this.prisma.message.updateMany({ where: { customerId: u.id, read: false }, data: { read: true } })
    return list.map(m => ({ ...m, at: fmt(m.createdAt) }))
  }

  @Get('points')
  @Aud('app')
  async points(@CurrentUser() u: CustomerUser) {
    const list = await this.prisma.pointsLedger.findMany({ where: { customerId: u.id }, orderBy: { id: 'desc' }, take: 50 })
    return { balance: await this.wf.balance(u.id), ledger: list.map(l => ({ ...l, at: fmt(l.createdAt, 'YYYY-MM-DD'), expiresAt: dayjs(l.createdAt).add(12, 'month').format('YYYY-MM-DD') })), items: REDEEM_ITEMS }
  }

  @Post('points/redeem')
  @Aud('app')
  async redeem(@CurrentUser() u: CustomerUser, @Body() body: { code: string }) {
    const item = REDEEM_ITEMS.find(i => i.code === body.code)
    if (!item) throw Err.notFound()
    const bal = await this.wf.balance(u.id)
    if (bal < item.points) throw Err.conflict('积分不够哦')
    await this.wf.addPoints(u.id, -item.points, 'redeem', item.name)
    await this.wf.message(u.id, '兑换成功', `您已兑换「${item.name}」，顾问会联系您安排。`)
    await this.wf.event(u.id, 'points_redeem', { item: item.code })
    return { ok: true, balance: bal - item.points }
  }

  @Get('checkins')
  @Aud('app')
  async checkins(@CurrentUser() u: CustomerUser) {
    const list = await this.prisma.checkin.findMany({ where: { customerId: u.id }, orderBy: { date: 'desc' }, take: 60 })
    const days = [...new Set(list.map(c => c.date))]
    let streak = 0
    let d = dayjs()
    while (days.includes(d.format('YYYY-MM-DD'))) { streak++; d = d.subtract(1, 'day') }
    return { today: list.filter(c => c.date === today()).map(c => c.type), streak, recent: list.slice(0, 20).map(c => ({ type: c.type, date: c.date, data: c.data })) }
  }

  @Post('checkins')
  @Aud('app')
  async checkin(@CurrentUser() u: CustomerUser, @Body() body: { type: string, data?: any }) {
    if (body.type === 'period' && !(await this.wf.hasConsent(u.id, 'C2'))) throw Err.needConsent('C2')
    const exist = await this.prisma.checkin.findUnique({ where: { customerId_type_date: { customerId: u.id, type: body.type, date: today() } } })
    if (exist) {
      await this.prisma.checkin.update({ where: { id: exist.id }, data: { data: body.data } })
      return { ok: true, points: 0 }
    }
    await this.prisma.checkin.create({ data: { customerId: u.id, type: body.type, date: today(), data: body.data } })
    const todayPoints = await this.prisma.pointsLedger.aggregate({ where: { customerId: u.id, reasonCode: 'checkin', createdAt: { gte: dayjs().startOf('day').toDate() } }, _sum: { change: true } })
    let pts = 0
    if ((todayPoints._sum.change || 0) < 6) { pts = 2; await this.wf.addPoints(u.id, 2, 'checkin', `打卡：${{ sleep: '睡眠', exercise: '运动', water: '喝水', period: '经期日记' }[body.type] || body.type}`) }
    if (body.type === 'period' && body.data?.start) await this.wf.setTag(u.id, 'menstruation_now', 'assessment', undefined, dayjs().add(5, 'day').toDate())
    await this.wf.addRecord({ customerId: u.id, recordType: 'checkin', sourceLabel: 'SELF', title: `${{ sleep: '睡眠', exercise: '运动', water: '喝水', period: '经期日记' }[body.type] || ''}打卡`, summary: body.data?.summary || '' })
    await this.wf.event(u.id, 'checkin_submit', { type: body.type })
    return { ok: true, points: pts }
  }

  @Get('quiz/today')
  @Aud('app')
  async quiz(@CurrentUser() u: CustomerUser) {
    const all = await this.prisma.quizQuestion.findMany({ where: { status: 'active' }, orderBy: { id: 'asc' } })
    const seed = Number(dayjs().format('YYYYMMDD'))
    const qs = [0, 1, 2].map(i => all[(seed + i * 7) % all.length]).filter((q, i, arr) => arr.findIndex(x => x.id === q.id) === i)
    const done = await this.prisma.pointsLedger.count({ where: { customerId: u.id, reasonCode: 'quiz', createdAt: { gte: dayjs().startOf('day').toDate() } } })
    return { questions: qs.map(q => ({ id: q.id, title: q.title, options: q.options })), answeredToday: done }
  }

  @Post('quiz/answers')
  @Aud('app')
  async quizAnswer(@CurrentUser() u: CustomerUser, @Body() body: { id: number, answer: number }) {
    const q = await this.prisma.quizQuestion.findUnique({ where: { id: body.id } })
    if (!q) throw Err.notFound()
    const correct = q.answer === Number(body.answer)
    let points = 0
    const done = await this.prisma.pointsLedger.count({ where: { customerId: u.id, reasonCode: 'quiz', createdAt: { gte: dayjs().startOf('day').toDate() } } })
    if (correct && done < 3) { points = 5; await this.wf.addPoints(u.id, 5, 'quiz', '每日健康问答') }
    await this.wf.event(u.id, 'quiz_answer', { correct })
    return { correct, answer: q.answer, knowledge: q.knowledge, points }
  }

  @Get('groupbuys')
  @Aud('app')
  async groupbuys(@CurrentUser() u: CustomerUser) {
    const acts = await this.prisma.groupbuyActivity.findMany({ where: { status: 'online' } })
    const groups = await this.prisma.groupbuyGroup.findMany({ orderBy: { id: 'desc' } })
    const mine = groups.filter(g => (g.members as number[]).includes(u.id))
    const people = await this.prisma.customer.findMany({ where: { id: { in: [...new Set(groups.flatMap(g => g.members as number[]))] } } })
    const view = (g: any) => ({ id: g.id, activityId: g.activityId, status: g.status, expiresAt: fmt(g.expiresAt), members: (g.members as number[]).map(id => people.find(p => p.id === id)?.salutation || '团友'), leaderIsMe: g.leaderId === u.id })
    return {
      activities: acts.map(a => ({ ...a, openGroups: groups.filter(g => g.activityId === a.id && g.status === 'open' && !(g.members as number[]).includes(u.id) && g.expiresAt > new Date()).slice(0, 3).map(view) })),
      mine: mine.map(view),
    }
  }

  @Post('groupbuys/:activityId/groups')
  @Aud('app')
  async openGroup(@CurrentUser() u: CustomerUser, @Param('activityId', ParseIntPipe) activityId: number) {
    const a = await this.prisma.groupbuyActivity.findUnique({ where: { id: activityId } })
    if (!a) throw Err.notFound()
    const g = await this.prisma.groupbuyGroup.create({ data: { activityId, leaderId: u.id, members: [u.id], expiresAt: addHours(a.hours) } })
    await this.wf.event(u.id, 'groupbuy_open', { activityId })
    return { id: g.id }
  }

  @Post('groupbuys/groups/:id/join')
  @Aud('app')
  async joinGroup(@CurrentUser() u: CustomerUser, @Param('id', ParseIntPipe) id: number) {
    const g = await this.prisma.groupbuyGroup.findUnique({ where: { id } })
    if (!g || g.status !== 'open' || g.expiresAt < new Date()) throw Err.conflict('这个团已经结束了')
    const a = await this.prisma.groupbuyActivity.findUnique({ where: { id: g.activityId } })
    const members = [...new Set([...(g.members as number[]), u.id])]
    const success = members.length >= (a?.groupSize || 2)
    await this.prisma.groupbuyGroup.update({ where: { id }, data: { members, status: success ? 'success' : 'open' } })
    if (success) {
      for (const m of members) {
        await this.wf.message(m, '拼团成功', `「${a?.title}」已成团，拼团价 ¥${a?.price}，顾问会联系您确认时间。`, '/pkg-group/detail')
        const c = await this.prisma.customer.findUnique({ where: { id: m } })
        await this.wf.createTask({ staffId: c?.advisorId, customerId: m, type: 'lead_followup', title: `${c?.salutation}「${a?.title}」已成团，请联系确认时间`, hours: 24 })
      }
      await this.wf.event(u.id, 'groupbuy_success', { activityId: g.activityId })
    }
    await this.wf.event(u.id, 'groupbuy_join', { activityId: g.activityId })
    return { ok: true, success }
  }

  @Post('transport/requests')
  @Aud('app')
  async transport(@CurrentUser() u: CustomerUser, @Body() body: any) {
    const c = await this.prisma.customer.findUnique({ where: { id: u.id } })
    const lead = await this.prisma.lead.create({ data: { leadNo: genNo('LD'), customerId: u.id, moduleCode: 'vip_transport', moduleName: '接送车', type: 'transport', formData: body, assigneeId: c?.advisorId, slaDueAt: addHours(24) } })
    await this.wf.createTask({ staffId: c?.advisorId, customerId: u.id, type: 'transport', refTable: 'lead', refId: lead.id, title: `${c?.salutation}预约接送（${body.date || ''} ${body.time || ''}），请确认车辆和司机`, hours: 24 })
    await this.wf.notifyStaff({ staffIds: [c?.advisorId], roles: ['store_manager'], storeId: c?.storeId }, '接送预约', `${c?.salutation}预约接送：${body.date || ''} ${body.time || ''}，${body.from || ''} → ${body.to || ''}`, 'medium')
    return { leadNo: lead.leadNo }
  }

  @Post('data-requests')
  @Aud('app')
  async dataRequest(@CurrentUser() u: CustomerUser, @Body() body: { type: 'export' | 'delete' | 'deactivate' }) {
    await this.wf.audit({ type: 'customer', id: u.id }, `data_request.${body.type}`, { type: 'customer', id: u.id, customerId: u.id })
    await this.wf.message(u.id, '申请已收到', body.type === 'export' ? '数据导出文件生成后会通过站内消息发给您，链接 24 小时有效。' : '我们会在 15 个工作日内处理，处理结果会通知您。')
    return { ok: true }
  }

  @Get('advisor')
  @Aud('app')
  async advisor(@CurrentUser() u: CustomerUser) {
    const c = await this.prisma.customer.findUnique({ where: { id: u.id } })
    const a = c?.advisorId ? await this.prisma.staff.findUnique({ where: { id: c.advisorId } }) : null
    const store = c?.storeId ? await this.prisma.store.findUnique({ where: { id: c.storeId } }) : null
    return { advisor: a ? { name: a.name, phone: a.phone } : null, store, vip: c?.tier === 'A', responseHours: c?.tier === 'A' ? 4 : 24 }
  }

  /** 门店与项目（价格为公开团购价，对所有客户一致，4.15） */
  @Get('store')
  @Aud('app')
  @OptionalAuth()
  async store(@CurrentUser() u?: CustomerUser) {
    const c = u ? await this.prisma.customer.findUnique({ where: { id: u.id } }) : null
    const store = (c?.storeId ? await this.prisma.store.findUnique({ where: { id: c.storeId } }) : null) || (await this.prisma.store.findFirst({ orderBy: { id: 'asc' } }))
    const projects = await this.prisma.project.findMany({ where: { onMeituan: true, status: 'active' }, orderBy: { code: 'asc' } })
    const view = (p: any) => ({ code: p.code, name: p.name, shortName: p.shortName, category: p.category, durationMin: p.durationMin, priceRef: p.priceRef, groupPrice: p.groupPrice, priceNote: p.priceNote, audience: p.audience, salesNote: p.salesNote })
    if (u) await this.wf.event(u.id, 'module_view', { moduleCode: 'store_services' })
    return {
      store: store && { id: store.id, name: store.name, address: store.address, mall: store.mall, district: store.district, phone: store.phone, openHours: store.openHours, category: store.category, facilities: store.facilities, promises: store.promises, rating: store.rating, reviewCount: store.reviewCount },
      groups: [
        { title: '面部护理', items: projects.filter(p => p.category === 'face').map(view) },
        { title: '身体 SPA', items: projects.filter(p => p.category === 'body').map(view) },
      ],
      priceNote: '价格为美团团购公开价，同一项目对所有客户一致；以门店最终报价为准。',
    }
  }

  @Get('about')
  async about() {
    const hospitals = await this.prisma.hospital.findMany({ where: { status: 'active' } })
    const partners = await this.prisma.partner.findMany({ where: { status: 'active' } })
    const stores = await this.prisma.store.findMany({ where: { status: 'active' } })
    return { hospitals: hospitals.map(h => ({ name: h.name, licenseNo: h.licenseNo, level: h.level })), partners: partners.map(p => ({ name: p.name, type: p.type, licenses: p.licenses })), stores }
  }

  @Post('events')
  @Aud('app')
  @OptionalAuth()
  async events(@CurrentUser() u: CustomerUser | undefined, @Body() body: { event: string, props?: any }) {
    await this.wf.event(u?.id || null, body.event, body.props)
    return { ok: true }
  }
}

@Controller('app')
@Aud('app')
export class AppHealthController {
  constructor(
    private prisma: PrismaService,
    private assess: AssessmentService,
    private archive: ArchiveService,
    private checkup: CheckupService,
  ) {}

  @Post('assessments')
  start(@CurrentUser() u: CustomerUser, @Body() body: { mode?: string }) {
    return this.assess.start(u.id, body.mode)
  }

  @Get('assessments/current')
  current(@CurrentUser() u: CustomerUser) {
    return this.assess.current(u.id)
  }

  @Get('assessments/latest-result')
  async latest(@CurrentUser() u: CustomerUser) {
    const a = await this.prisma.assessment.findFirst({ where: { customerId: u.id, status: 'completed' }, orderBy: { id: 'desc' } })
    return a ? this.assess.result(u.id, a.id) : null
  }

  @Get('assessments/history')
  history(@CurrentUser() u: CustomerUser) {
    return this.assess.history(u.id)
  }

  @Get('assessments/:id/levels/:level')
  level(@CurrentUser() u: CustomerUser, @Param('id', ParseIntPipe) id: number, @Param('level') level: string) {
    return this.assess.levelQuestions(u.id, id, level)
  }

  @Put('assessments/:id/answers')
  answer(@CurrentUser() u: CustomerUser, @Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.assess.saveAnswer(u.id, id, body)
  }

  @Post('assessments/:id/levels/:level/complete')
  completeLevel(@CurrentUser() u: CustomerUser, @Param('id', ParseIntPipe) id: number, @Param('level') level: string) {
    return this.assess.completeLevel(u.id, id, level)
  }

  @Post('assessments/:id/demo-fill')
  demoFill(@CurrentUser() u: CustomerUser, @Param('id', ParseIntPipe) id: number) {
    return this.assess.demoFill(u.id, id)
  }

  @Post('assessments/:id/complete')
  complete(@CurrentUser() u: CustomerUser, @Param('id', ParseIntPipe) id: number) {
    return this.assess.complete(u.id, id)
  }

  @Get('assessments/:id/result')
  result(@CurrentUser() u: CustomerUser, @Param('id', ParseIntPipe) id: number) {
    return this.assess.result(u.id, id)
  }

  @Get('archive/overview')
  overview(@CurrentUser() u: CustomerUser) {
    return this.archive.overview(u.id)
  }

  @Get('archive/records')
  records(@CurrentUser() u: CustomerUser, @Query('type') type?: string) {
    return this.archive.records(u.id, type)
  }

  @Get('archive/metrics')
  metrics(@CurrentUser() u: CustomerUser) {
    return this.archive.metricCodes(u.id)
  }

  @Get('archive/metrics/:code/trend')
  trend(@CurrentUser() u: CustomerUser, @Param('code') code: string, @Query('range') range?: string) {
    return this.archive.trend(u.id, code, range)
  }

  @Get('reports')
  reports(@CurrentUser() u: CustomerUser, @Query('type') type?: string) {
    return this.archive.reports(u.id, type)
  }

  @Get('reports/:id')
  report(@CurrentUser() u: CustomerUser, @Param('id', ParseIntPipe) id: number) {
    return this.archive.report(u.id, id)
  }

  @Get('plans/current')
  async currentPlan(@CurrentUser() u: CustomerUser) {
    const plan = await this.prisma.plan.findFirst({ where: { customerId: u.id, status: 'sent' }, orderBy: { id: 'desc' } })
    const pending = await this.prisma.plan.findFirst({ where: { customerId: u.id, status: { in: ['draft', 'ready'] } }, orderBy: { id: 'desc' } })
    const paused = await this.prisma.riskAlert.count({ where: { customerId: u.id, level: { in: ['L2', 'L3'] }, status: { not: 'closed' } } })
    const c = await this.prisma.customer.findUnique({ where: { id: u.id } })
    const advisor = c?.advisorId ? await this.prisma.staff.findUnique({ where: { id: c.advisorId } }) : null
    if (plan) await this.prisma.eventLog.create({ data: { customerId: u.id, event: 'plan_view', props: { packageCode: (plan.skeleton as any)?.packages?.[0]?.code } } })
    return {
      plan: plan ? { id: plan.id, planNo: plan.planNo, content: plan.contentCustomer, skeleton: { packages: (plan.skeleton as any).packages, followUps: (plan.skeleton as any).followUps, riskLevel: plan.riskLevel, doctorAdvice: (plan.skeleton as any).doctorAdvice }, engine: plan.engine, sentAt: fmt(plan.sentAt, 'YYYY-MM-DD'), sentBy: plan.sentBy } : null,
      preparing: !plan && !!pending,
      paused: paused > 0,
      advisor: advisor ? { name: advisor.name, phone: advisor.phone } : null,
    }
  }

  @Get('plans')
  async plans(@CurrentUser() u: CustomerUser) {
    const list = await this.prisma.plan.findMany({ where: { customerId: u.id, status: { in: ['sent', 'completed'] } }, orderBy: { id: 'desc' } })
    return list.map(p => ({ id: p.id, title: (p.contentCustomer as any)?.title, sentAt: fmt(p.sentAt, 'YYYY-MM-DD'), status: p.status }))
  }

  @Get('coupons')
  coupons(@CurrentUser() u: CustomerUser) {
    return this.checkup.myCoupons(u.id)
  }

  @Get('checkup/slots')
  slots(@Query('hospitalId') hospitalId: string, @Query('packageCode') packageCode: string) {
    return this.checkup.slots(Number(hospitalId), packageCode)
  }

  @Post('checkup/bookings')
  book(@CurrentUser() u: CustomerUser, @Body() body: any) {
    return this.checkup.book(u.id, body)
  }

  @Get('referrals')
  async myReferrals(@CurrentUser() u: CustomerUser) {
    const list = await this.prisma.referral.findMany({ where: { customerId: u.id }, orderBy: { id: 'desc' } })
    return Promise.all(list.map(r => this.checkup.referralDetail(r.id, {}).then(d => ({ id: d.id, referralNo: d.referralNo, status: d.status, statusName: d.statusName, hospitalName: d.hospitalName, services: d.serviceList, appointmentAt: d.appointmentAt, createdAt: d.createdAt }))))
  }
}
