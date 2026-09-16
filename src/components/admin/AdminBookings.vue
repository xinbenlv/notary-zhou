<script setup lang="ts">
/**
 * 路边结算台。整页只有中文——使用者只有 George 一个人，不存在第二个读者。
 *
 * 为什么用 Vue 而不是纯脚本：这一页的每次操作都要改动列表、重算金额、
 * 切换两段式确认，手写 DOM 会很快失控。/book 已经引入了 Vue 运行时，
 * 这里复用同一套，不额外增加依赖。
 *
 * 令牌只存在于内存与 localStorage，绝不进 URL：POST 会动钱，
 * 令牌不该留在浏览器历史和访问日志里。
 */
import { ref, computed, onMounted, onUnmounted } from 'vue';

const API = '/api/admin/bookings';
const STORE_KEY = 'nz_admin_token';
/** Stripe 最低收款额，与 settle.ts 的 STRIPE_MIN_CENTS 一致 */
const STRIPE_MIN_CENTS = 50;

interface Doc { label: string; act: string | null; acts: number; feeCents: number; parts: { name: string; count: number }[] }
interface Signer { name: string; idType: string }
interface CancelPlan { tier: 'full' | 'half_travel' | 'notary_only'; captureCents: number; releasedCents: number }
interface LostAuth {
  id: string; startsAt: string; captureBefore: string | null; totalCents: number;
  email: string | null; phone: string | null; cancelReason: string | null; endedAt: string;
}
interface Booking {
  id: string; status: string; startsAt: string; captureBefore: string | null;
  hoursToCapture: number | null; totalCents: number; email: string | null; phone: string | null;
  locationKind: string; address: string | null; serviceMinutes: number;
  cancelNow: CancelPlan | null; notaryFeeCents?: number; travelFeeCents?: number;
  actsBillable?: number; notaryFeePerActCents?: number | null;
  signers?: Signer[]; documents?: Doc[];
}

/** localStorage 在无痕模式、禁用站点数据时会抛错或读回空值，一律当作「没存过」。 */
function readStored(): string {
  try { return window.localStorage.getItem(STORE_KEY) || ''; } catch { return ''; }
}
function writeStored(v: string): void {
  try { v ? window.localStorage.setItem(STORE_KEY, v) : window.localStorage.removeItem(STORE_KEY); }
  catch { /* 存不下就只在本次会话里记着，不打断操作 */ }
}

const token = ref('');
const remember = ref(true);
const authed = ref(false);
const bookings = ref<Booking[]>([]);
const lost = ref<LostAuth[]>([]);
const loading = ref(false);
const error = ref('');
const flash = ref('');
const now = ref(Date.now());

// 打开的操作面板：一次只开一个，手机上同时展开两个没法看
type Kind = 'complete' | 'cancel' | 'release';
const panel = ref<{ id: string; kind: Kind; stage: 'edit' | 'confirm' } | null>(null);
const mode = ref<'acts' | 'dollars'>('acts');
const actsDone = ref(0);
const dollars = ref('');
const reason = ref('');
const busy = ref(false);

const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const fmtTime = (iso: string) => new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'America/Los_Angeles', month: 'long', day: 'numeric',
  weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date(iso));
const fmtShort = (iso: string) => new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'America/Los_Angeles', month: 'numeric', day: 'numeric',
  hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date(iso));

/** 预授权剩余有效期。以 captureBefore 为准并按本地时钟滚动，不必为了倒计时反复请求。 */
function hoursLeft(b: Booking): number | null {
  if (!b.captureBefore) return b.hoursToCapture;
  return (new Date(b.captureBefore).getTime() - now.value) / 3_600_000;
}

/** 越近越响。这是整页最该被看见的信息：过了这个点，钱自动释放，这一单白做。 */
function deadline(b: Booking) {
  const h = hoursLeft(b);
  if (h === null) return { level: 'none', head: '尚未授权', sub: '客户还没完成结账，此单暂不占款。' };
  if (h <= 0) return { level: 'expired', head: '预授权已失效', sub: '资金已被银行释放，这一单收不到钱了。' };
  const left = h < 48 ? `${h.toFixed(1)} 小时` : `${(h / 24).toFixed(1)} 天`;
  const by = b.captureBefore ? `${fmtShort(b.captureBefore)} 前必须扣款` : '';
  // 边界与 lifecycle.ts 的 captureUrgency 一致（warn 48h / critical 24h），
  // 只在 critical 之内再分出「不足 6 小时」，让最后那几个钟头看起来不一样。
  if (h < 6)  return { level: 'critical', head: `只剩 ${left}`, sub: `${by}，逾期这笔钱就没了。` };
  if (h < 24) return { level: 'urgent',   head: `剩 ${left}`,   sub: `${by}。今天之内处理掉。` };
  if (h < 48) return { level: 'soon',     head: `剩 ${left}`,   sub: by };
  return { level: 'calm', head: `剩 ${left}`, sub: by };
}

const TIER_TEXT: Record<CancelPlan['tier'], string> = {
  full: '距预约还有 48 小时以上——按政策不收费，整笔预授权撤销。',
  half_travel: '距预约 24–48 小时——按政策收半数交通费，公证费不收。',
  notary_only: '距预约不足 24 小时或客户爽约——按政策收全额交通费，公证费不收。',
};

const urgentCount = computed(() =>
  bookings.value.filter((b) => { const h = hoursLeft(b); return h !== null && h > 0 && h < 24; }).length);
const expiredCount = computed(() =>
  lost.value.length + bookings.value.filter((b) => { const h = hoursLeft(b); return h !== null && h <= 0; }).length);

/**
 * 接口错误里只有 'unauthorized' 是英文的（settle.ts 抛出的都已是中文），
 * 在这里翻掉——这一页不该出现使用者读不懂的字。
 */
class ApiError extends Error { constructor(msg: string, readonly status: number) { super(msg); } }

async function api(method: 'GET' | 'POST', body?: unknown) {
  let res: Response;
  try {
    res = await fetch(API, {
      method,
      headers: { 'x-admin-token': token.value, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('连不上服务器。检查一下手机信号，然后重试。', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const raw = (data as any).error as string | undefined;
    const msg = res.status === 401
      ? '令牌不对，或服务端没有配置 ADMIN_TOKEN。'
      : raw || `服务器返回 ${res.status}，请重试。`;
    throw new ApiError(msg, res.status);
  }
  return data as any;
}

async function load(silent = false) {
  if (!token.value) return;
  if (!silent) loading.value = true;
  error.value = '';
  try {
    const data = await api('GET');
    bookings.value = data.pending ?? [];
    lost.value = data.expiredUncaptured ?? [];
    authed.value = true;
    if (remember.value) writeStored(token.value);
  } catch (e) {
    error.value = (e as Error).message;
    if (e instanceof ApiError && e.status === 401) { authed.value = false; writeStored(''); }
  } finally { loading.value = false; }
}

function signOut() {
  token.value = ''; authed.value = false; bookings.value = []; lost.value = []; panel.value = null; writeStored('');
}

function openPanel(b: Booking, kind: Kind) {
  panel.value = { id: b.id, kind, stage: 'edit' };
  mode.value = (b.actsBillable ?? 0) > 0 ? 'acts' : 'dollars';
  actsDone.value = b.actsBillable ?? 0;
  dollars.value = (b.totalCents / 100).toFixed(2);
  reason.value = '';
  // 取消档位随时间推移会跳档。重新拉一次，确保面板上的数字不是过期的。
  if (kind === 'cancel') load(true);
}
const closePanel = () => { panel.value = null; };
const isOpen = (b: Booking, kind: Kind) => panel.value?.id === b.id && panel.value.kind === kind;

const perAct = (b: Booking) => b.notaryFeePerActCents || 1500;

/** 本次实际扣款额。整数美分运算，绝不在中途取整成元。 */
function captureCents(b: Booking): number {
  if (mode.value === 'acts') {
    const missed = Math.max(0, (b.actsBillable ?? 0) - actsDone.value);
    return Math.max(0, b.totalCents - perAct(b) * missed);
  }
  const n = Number(dollars.value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.round(n * 100), b.totalCents);
}
const isReduced = (b: Booking) => captureCents(b) < b.totalCents;
const tooSmall = (b: Booking) => captureCents(b) < STRIPE_MIN_CENTS;

function bumpActs(b: Booking, d: number) {
  actsDone.value = Math.min(Math.max(0, actsDone.value + d), b.actsBillable ?? 0);
}

async function run(b: Booking, kind: Kind) {
  busy.value = true; error.value = '';
  try {
    const body: Record<string, unknown> = { bookingId: b.id, action: kind };
    if (kind === 'complete') { const a = captureCents(b); if (a < b.totalCents) body.amountCents = a; }
    else body.reason = reason.value.trim() || (kind === 'cancel' ? 'admin_cancel' : 'admin_release');
    const r = await api('POST', body);
    flash.value = kind === 'complete'
      ? `已扣款 ${money(r.capturedCents)}${r.releasedCents ? `，释放 ${money(r.releasedCents)}` : ''} · ${b.id}`
      : kind === 'cancel'
        ? `已取消，收取 ${money(r.capturedCents)}${r.releasedCents ? `，释放 ${money(r.releasedCents)}` : ''} · ${b.id}`
        : `已从日程释放，未动钱 · ${b.id}`;
    panel.value = null;
    await load(true);
  } catch (e) { error.value = (e as Error).message; }
  finally { busy.value = false; }
}

let tick: number | undefined;
function onVisible() { if (document.visibilityState === 'visible' && authed.value) load(true); }
onMounted(() => {
  const saved = readStored();
  if (saved) { token.value = saved; load(); }
  tick = window.setInterval(() => {
    now.value = Date.now();
    // 每分钟悄悄对一次账：取消档位按小时跳档，不能让面板上的数字过期
    if (authed.value && !panel.value && document.visibilityState === 'visible') load(true);
  }, 30_000);
  document.addEventListener('visibilitychange', onVisible);
});
onUnmounted(() => {
  if (tick) window.clearInterval(tick);
  document.removeEventListener('visibilitychange', onVisible);
});
</script>

<template>
  <div class="wrap">
    <!-- 令牌门 -->
    <form v-if="!authed" class="gate" @submit.prevent="load()">
      <h1>结算台</h1>
      <p class="hint">输入管理员令牌。令牌只留在这台手机上，不会出现在网址里。</p>
      <input v-model="token" type="password" inputmode="text" autocomplete="off"
             placeholder="ADMIN_TOKEN" class="field" />
      <label class="remember">
        <input type="checkbox" v-model="remember" /> 在这台手机上记住
      </label>
      <button class="btn primary" type="submit" :disabled="!token || loading">
        {{ loading ? '验证中…' : '进入' }}
      </button>
      <p v-if="error" class="err">{{ error }}</p>
    </form>

    <template v-else>
      <header class="bar">
        <div>
          <strong>{{ bookings.length }}</strong> 单待结算
          <span v-if="urgentCount" class="pill urgent">{{ urgentCount }} 单 24 小时内</span>
          <span v-if="expiredCount" class="pill expired">{{ expiredCount }} 单已失效</span>
        </div>
        <div class="bar-act">
          <button class="link" @click="load()" :disabled="loading">{{ loading ? '刷新中…' : '刷新' }}</button>
          <button class="link" @click="signOut">退出</button>
        </div>
      </header>

      <p v-if="flash" class="flash" @click="flash = ''">{{ flash }}</p>
      <p v-if="error" class="err">{{ error }}</p>

      <!-- 授权已到期、钱没收到：没有任何按钮能挽回，只能去找客户另收 -->
      <section v-if="lost.length" class="lost">
        <h2>⚠️ {{ lost.length }} 单预授权已过期，钱没收到</h2>
        <p class="tiny">这些单子的授权已被银行释放，这里点什么都收不回来，只能另行联系客户收款。</p>
        <article v-for="l in lost" :key="l.id" class="lost-row">
          <div class="lost-head">
            <span>{{ fmtTime(l.startsAt) }}</span>
            <b>{{ money(l.totalCents) }}</b>
          </div>
          <div class="tiny">失效于 {{ l.captureBefore ? fmtShort(l.captureBefore) : fmtShort(l.endedAt) }} · {{ l.id }}</div>
          <div class="contact">
            <a v-if="l.phone" :href="`tel:${l.phone}`" class="cbtn">📞 {{ l.phone }}</a>
            <a v-if="l.email" :href="`mailto:${l.email}`" class="cbtn">✉️ {{ l.email }}</a>
          </div>
        </article>
      </section>

      <p v-if="!bookings.length && !loading" class="empty">没有待结算的预约。</p>

      <article v-for="b in bookings" :key="b.id" class="card" :class="'lv-' + deadline(b).level">
        <!-- 授权到期：整页最响的一条信息 -->
        <div class="dl" :class="'lv-' + deadline(b).level">
          <span class="dl-head">{{ deadline(b).head }}</span>
          <span class="dl-sub">{{ deadline(b).sub }}</span>
        </div>

        <div class="head">
          <div class="when">{{ fmtTime(b.startsAt) }}</div>
          <div class="amt">{{ money(b.totalCents) }}</div>
        </div>
        <div class="sub">
          {{ b.serviceMinutes }} 分钟 ·
          公证费 {{ money(b.notaryFeeCents ?? 0) }} + 交通费 {{ money(b.travelFeeCents ?? 0) }}
        </div>

        <a class="row addr" v-if="b.locationKind === 'mobile' && b.address"
           :href="`https://maps.google.com/?q=${encodeURIComponent(b.address)}`" target="_blank" rel="noreferrer">
          📍 {{ b.address }}
        </a>
        <div class="row addr" v-else>📍 Sunnyvale Lakewood Park（客户自取）</div>

        <div class="row" v-if="b.signers?.length">
          👤 <span v-for="(s, i) in b.signers" :key="i" class="sg">{{ s.name || '未填写' }}<em v-if="s.idType">（{{ s.idType }}）</em></span>
        </div>

        <ul class="docs" v-if="b.documents?.length">
          <li v-for="(d, i) in b.documents" :key="i">
            <span>📄 {{ d.label }}<em v-if="d.act"> · {{ d.act }}</em></span>
            <span class="doc-n">{{ d.acts }} 处 · {{ money(d.feeCents) }}</span>
          </li>
        </ul>

        <div class="contact">
          <a v-if="b.phone" :href="`tel:${b.phone}`" class="cbtn">📞 {{ b.phone }}</a>
          <a v-if="b.email" :href="`mailto:${b.email}`" class="cbtn">✉️ {{ b.email }}</a>
        </div>
        <div class="bid">{{ b.id }}</div>

        <!-- 操作 -->
        <div class="acts" v-if="!panel || panel.id !== b.id">
          <button class="btn primary" @click="openPanel(b, 'complete')">完成公证，扣款</button>
          <button class="btn ghost" @click="openPanel(b, 'cancel')">取消预约</button>
          <button class="btn ghost small" @click="openPanel(b, 'release')">释放时段</button>
        </div>

        <!-- 完成公证 -->
        <div v-if="isOpen(b, 'complete')" class="panel">
          <template v-if="panel!.stage === 'edit'">
            <h3>实际扣款</h3>
            <div class="seg" v-if="(b.actsBillable ?? 0) > 0">
              <button :class="{ on: mode === 'acts' }" @click="mode = 'acts'">按签名处</button>
              <button :class="{ on: mode === 'dollars' }" @click="mode = 'dollars'">按金额</button>
            </div>

            <div v-if="mode === 'acts'" class="stepper">
              <span class="lbl">今天实际公证了几处签名？</span>
              <div class="step">
                <button @click="bumpActs(b, -1)" :disabled="actsDone <= 0">−</button>
                <b>{{ actsDone }}</b>
                <button @click="bumpActs(b, 1)" :disabled="actsDone >= (b.actsBillable ?? 0)">+</button>
                <span class="of">预约时 {{ b.actsBillable }} 处</span>
              </div>
              <p class="tiny">每少一处按 §8211 退 {{ money(perAct(b)) }}；交通费照收——车已经开了。</p>
            </div>
            <div v-else class="stepper">
              <span class="lbl">扣款金额（美元）</span>
              <input v-model="dollars" type="text" inputmode="decimal" class="field" />
              <p class="tiny">最多 {{ money(b.totalCents) }}——授权额之上收不了。</p>
            </div>

            <div class="calc">
              <span>将扣款</span><b>{{ money(captureCents(b)) }}</b>
            </div>
            <div class="calc muted" v-if="isReduced(b)">
              <span>释放给客户</span><b>{{ money(b.totalCents - captureCents(b)) }}</b>
            </div>

            <p v-if="isReduced(b)" class="warn">
              ⚠️ 一笔授权<b>只能扣一次</b>。确认后无法再补扣：若之后发现签名处比这个数多，
              只能另开一笔新订单去收差额。
            </p>
            <p v-if="tooSmall(b)" class="warn hard">
              低于 Stripe 最低收款额 {{ money(STRIPE_MIN_CENTS) }}，扣不了。这一单请改用「取消预约」。
            </p>

            <div class="acts">
              <button class="btn primary" :disabled="tooSmall(b)" @click="panel!.stage = 'confirm'">下一步</button>
              <button class="btn ghost" @click="closePanel">返回</button>
            </div>
          </template>

          <template v-else>
            <h3>确认扣款</h3>
            <p class="confirm-line">向客户收取 <b>{{ money(captureCents(b)) }}</b></p>
            <p class="tiny" v-if="isReduced(b)">
              释放 {{ money(b.totalCents - captureCents(b)) }}。这是最后一次扣款机会，之后不能补扣。
            </p>
            <div class="acts">
              <button class="btn danger" :disabled="busy" @click="run(b, 'complete')">
                {{ busy ? '处理中…' : `确认扣款 ${money(captureCents(b))}` }}
              </button>
              <button class="btn ghost" :disabled="busy" @click="panel!.stage = 'edit'">改一下</button>
            </div>
          </template>
        </div>

        <!-- 取消 -->
        <div v-if="isOpen(b, 'cancel')" class="panel">
          <h3>取消预约</h3>
          <template v-if="b.cancelNow">
            <div class="calc"><span>按政策收取</span><b>{{ money(b.cancelNow.captureCents) }}</b></div>
            <div class="calc muted"><span>释放给客户</span><b>{{ money(b.cancelNow.releasedCents) }}</b></div>
            <p class="tiny">{{ TIER_TEXT[b.cancelNow.tier] }}</p>
          </template>
          <p v-else class="tiny">这一单还没有授权，取消不涉及金额。</p>
          <input v-model="reason" class="field" placeholder="原因（选填，会记进订单）" />
          <div class="acts" v-if="panel!.stage === 'edit'">
            <button class="btn primary" @click="panel!.stage = 'confirm'">下一步</button>
            <button class="btn ghost" @click="closePanel">返回</button>
          </div>
          <div class="acts" v-else>
            <button class="btn danger" :disabled="busy" @click="run(b, 'cancel')">
              {{ busy ? '处理中…' : `确认取消，收取 ${money(b.cancelNow?.captureCents ?? 0)}` }}
            </button>
            <button class="btn ghost" :disabled="busy" @click="panel!.stage = 'edit'">改一下</button>
          </div>
        </div>

        <!-- 释放 -->
        <div v-if="isOpen(b, 'release')" class="panel">
          <h3>释放时段</h3>
          <p class="tiny">
            <b>不碰钱。</b>只把这一单从日程和日历上摘下来，用于已经在 Stripe 那边手工结清的订单。
            客户的预授权不会被撤销，也不会被扣款。
          </p>
          <input v-model="reason" class="field" placeholder="原因（选填，会记进订单）" />
          <div class="acts" v-if="panel!.stage === 'edit'">
            <button class="btn primary" @click="panel!.stage = 'confirm'">下一步</button>
            <button class="btn ghost" @click="closePanel">返回</button>
          </div>
          <div class="acts" v-else>
            <button class="btn danger" :disabled="busy" @click="run(b, 'release')">
              {{ busy ? '处理中…' : '确认释放（不动钱）' }}
            </button>
            <button class="btn ghost" :disabled="busy" @click="panel!.stage = 'edit'">改一下</button>
          </div>
        </div>
      </article>
    </template>
  </div>
</template>

<style scoped>
.wrap { max-width: 560px; margin: 0 auto; padding: 16px 14px 64px; }

/* 令牌门 */
.gate { background: var(--bg-white); border: 1px solid var(--border-soft); border-radius: 14px; padding: 20px; }
.gate h1 { font-size: 20px; margin: 0 0 6px; }
.hint { font-size: 13px; color: var(--text-muted); line-height: 1.7; margin: 0 0 14px; }
.remember { display: flex; align-items: center; gap: 8px; font-size: 14px; margin: 10px 0 14px; color: var(--text-muted); }

.field { width: 100%; padding: 13px 12px; font-size: 16px; font-family: inherit;
  border: 1px solid var(--border-soft); border-radius: 10px; background: var(--bg-white); color: var(--text-dark); }
.field:focus { outline: 2px solid var(--brand-green); outline-offset: 1px; }

/* 顶栏 */
.bar { display: flex; justify-content: space-between; align-items: center; gap: 10px;
  flex-wrap: wrap; font-size: 14px; margin-bottom: 12px; }
.bar strong { font-size: 18px; }
.bar-act { display: flex; gap: 12px; }
.link { background: none; border: none; padding: 10px 4px; font: inherit; color: var(--brand-green);
  text-decoration: underline; cursor: pointer; }
.pill { display: inline-block; margin-left: 6px; padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; }
.pill.urgent { background: #FBE3D8; color: #8A3A1B; }
.pill.expired { background: #E6E3DE; color: #5A5750; }

.flash { background: #E4F0EA; border: 1px solid #BFD9CC; color: #1B3B32; padding: 11px 13px;
  border-radius: 10px; font-size: 14px; line-height: 1.6; margin-bottom: 12px; cursor: pointer; }
.err { background: #FBE3E3; border: 1px solid #E8BEBE; color: #8C2020; padding: 11px 13px;
  border-radius: 10px; font-size: 14px; line-height: 1.6; margin: 10px 0 0; }
.empty { color: var(--text-muted); text-align: center; padding: 40px 0; font-size: 15px; }

.lost { background: #FBE3E3; border: 1px solid #E8BEBE; border-radius: 14px; padding: 14px; margin-bottom: 16px; }
.lost h2 { font-size: 15px; margin: 0 0 4px; color: #8C2020; }
.lost .tiny { color: #8C2020; opacity: .85; }
.lost-row { background: var(--bg-white); border-radius: 10px; padding: 10px 12px; margin-top: 10px; }
.lost-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; font-size: 14px; }
.lost-head b { font-size: 17px; }
.lost .contact { padding: 8px 0 0; }

/* 卡片 */
.card { background: var(--bg-white); border: 1px solid var(--border-soft); border-radius: 14px;
  padding: 0 0 14px; margin-bottom: 16px; overflow: hidden; }
.card.lv-critical { border-color: #C0392B; box-shadow: 0 0 0 2px rgba(192, 57, 43, .16); }
.card.lv-urgent { border-color: var(--brand-terra); }
.card.lv-expired { opacity: .72; }

/* 到期横幅 —— 越近越响 */
.dl { display: flex; flex-direction: column; gap: 2px; padding: 11px 14px; }
.dl-head { font-size: 17px; font-weight: 700; letter-spacing: .01em; }
.dl-sub { font-size: 12.5px; line-height: 1.5; opacity: .92; }
.dl.lv-calm { background: var(--bg-alt); color: var(--text-muted); }
.dl.lv-calm .dl-head { font-size: 14px; font-weight: 600; color: var(--text-dark); }
.dl.lv-soon { background: #FDF3DA; color: #6B5312; }
.dl.lv-urgent { background: var(--brand-terra); color: #fff; }
.dl.lv-critical { background: #C0392B; color: #fff; animation: pulse 1.6s ease-in-out infinite; }
.dl.lv-expired { background: #5A5750; color: #fff; }
.dl.lv-none { background: var(--bg-alt); color: var(--text-muted); }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .82; } }
@media (prefers-reduced-motion: reduce) { .dl.lv-critical { animation: none; } }

.head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; padding: 12px 14px 2px; }
.when { font-size: 16px; font-weight: 600; line-height: 1.4; }
.amt { font-size: 21px; font-weight: 700; white-space: nowrap; }
.sub { padding: 0 14px 10px; font-size: 12.5px; color: var(--text-muted); }

.row { padding: 10px 14px; font-size: 14px; line-height: 1.6; border-top: 1px solid var(--border-soft); }
.addr { display: block; color: var(--text-dark); text-decoration: none; }
.addr[href] { color: var(--brand-green); text-decoration: underline; }
.sg { margin-right: 10px; } .sg em { font-style: normal; color: var(--text-muted); font-size: 12.5px; }

.docs { list-style: none; margin: 0; padding: 7px 14px; border-top: 1px solid var(--border-soft); font-size: 14px; }
.docs li { display: flex; justify-content: space-between; gap: 10px; padding: 3px 0; line-height: 1.6; }
.docs em { font-style: normal; color: var(--text-muted); font-size: 12.5px; }
.doc-n { color: var(--text-muted); font-size: 12.5px; white-space: nowrap; }

.contact { display: flex; flex-wrap: wrap; gap: 8px; padding: 10px 14px 0; }
.cbtn { flex: 1 1 auto; text-align: center; padding: 14px 10px; border-radius: 10px; background: var(--bg-alt);
  color: var(--text-dark); text-decoration: none; font-size: 14px; font-weight: 500; }
.bid { padding: 8px 14px 0; font-size: 11.5px; color: var(--text-muted); font-family: ui-monospace, monospace; }

/* 按钮 */
.acts { display: flex; flex-wrap: wrap; gap: 8px; padding: 12px 14px 0; }
.btn { flex: 1 1 100%; padding: 14px 16px; font: inherit; font-weight: 600; font-size: 15px;
  border-radius: 10px; border: 1px solid transparent; cursor: pointer; min-height: 48px; }
.btn:disabled { opacity: .5; cursor: not-allowed; }
.btn.primary { background: var(--brand-green); color: var(--text-light); }
.btn.danger { background: #C0392B; color: #fff; }
.btn.ghost { background: var(--bg-white); border-color: var(--border-soft); color: var(--text-dark); flex: 1 1 45%; }
.btn.small { font-size: 14px; }

/* 操作面板 */
.panel { margin: 12px 14px 0; padding: 14px; background: var(--bg-alt); border-radius: 12px; }
.panel h3 { font-size: 15px; margin: 0 0 10px; }
.panel .acts { padding: 12px 0 0; }
.panel .field { background: var(--bg-white); margin-top: 10px; }

.seg { display: flex; gap: 6px; margin-bottom: 12px; }
.seg button { flex: 1; padding: 9px; font: inherit; font-size: 14px; border-radius: 8px;
  border: 1px solid var(--border-soft); background: var(--bg-white); color: var(--text-muted); cursor: pointer; }
.seg button.on { background: var(--brand-green); color: var(--text-light); border-color: var(--brand-green); font-weight: 600; }

.stepper .lbl { display: block; font-size: 14px; margin-bottom: 8px; }
.step { display: flex; align-items: center; gap: 12px; }
.step button { width: 48px; height: 48px; font-size: 24px; line-height: 1; border-radius: 10px;
  border: 1px solid var(--border-soft); background: var(--bg-white); cursor: pointer; }
.step button:disabled { opacity: .4; }
.step b { font-size: 24px; min-width: 40px; text-align: center; }
.step .of { font-size: 12.5px; color: var(--text-muted); }

.calc { display: flex; justify-content: space-between; align-items: baseline; gap: 10px;
  margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--border-soft); font-size: 14px; }
.calc b { font-size: 20px; }
.calc.muted { border-top: none; padding-top: 2px; color: var(--text-muted); }
.calc.muted b { font-size: 15px; font-weight: 600; }

.tiny { font-size: 12.5px; color: var(--text-muted); line-height: 1.65; margin: 8px 0 0; }
.warn { margin: 12px 0 0; padding: 10px 12px; border-radius: 9px; font-size: 13px; line-height: 1.65;
  background: #FDF3DA; border: 1px solid #E8D49B; color: #6B5312; }
.warn.hard { background: #FBE3E3; border-color: #E8BEBE; color: #8C2020; }
.confirm-line { font-size: 16px; margin: 0; }
.confirm-line b { font-size: 24px; }
</style>
