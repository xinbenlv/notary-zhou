<script setup lang="ts">
// 预约流程（四步）。
//
// 分工：这里只负责收集信息与显示；**金额一律以服务端 /api/quote 的返回为准**。
// 第 1 步的公证费预览直接复用 src/lib/booking/pricing.ts 的纯函数，
// 所以前后端不会各写一套规则而算出两个数；服务端仍会重算一遍，不采信前端的价。
import { reactive, computed, watch, nextTick } from 'vue';
import { DOC_TYPES, docType, needsAct, type DocGroup } from '../../lib/booking/doctypes.ts';
import {
  docActs, docFeeCents, notaryFeeCents, serviceMinutes, totalActs, waivedActs,
  NOTARY_FEE_CENTS, type BookingDoc,
} from '../../lib/booking/pricing.ts';
import { MIN_NOTICE_HOURS, MAX_ADVANCE_DAYS } from '../../lib/booking/schedule.ts';
import { STRINGS, ID_TYPES, GROUP_LABELS, RULE_TAGS, ACTS, ACT_HINTS, type Lang } from './strings.ts';

declare global {
  interface Window { google?: any; __gmapsReady?: () => void }
}

const props = defineProps<{ lang: Lang; mapsKey: string; email: string; paymentsEnabled: boolean }>();
const t = STRINGS[props.lang];
const ids = ID_TYPES[props.lang];
const L = (o: { zh: string; en: string }) => (props.lang === 'zh' ? o.zh : o.en);

const TIMEZONE = 'America/Los_Angeles';
const LOCALE = () => (props.lang === 'zh' ? 'zh-CN' : 'en-US');
const GROUP_ORDER: DocGroup[] = ['common', 'free', 'special'];

/** 美元显示：整数不带小数点，有分才显示两位 */
function money(cents: number): string {
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}
/** 太平洋时区的 YYYY-MM-DD —— 不用浏览器本地时区，否则外州访客会看到错的「今天」 */
function pacificDay(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

let uid = 0;
const newDoc = () => ({
  id: ++uid, typeKey: '', customName: '', act: '' as '' | 'ack' | 'jurat' | 'unsure',
  parts: [] as Array<{ pid: number; count: number }>,
  open: false, query: '',
  adding: false, newName: '', newId: ids[0] as string,
});
type UiDoc = ReturnType<typeof newDoc>;

interface Slot {
  startsAt: string;
  available: boolean;
  reason?: string;
  notaryFeeCents?: number;
  travelFeeCents?: number;
  totalCents?: number;
  outboundMinutes?: number;
  returnMinutes?: number;
}

const s = reactive({
  step: 1,
  signers: [] as Array<{ id: number; name: string; idType: string }>,
  docs: [newDoc()],
  location: 'mobile' as 'mobile' | 'park',
  address: '',
  resolved: null as null | { label: string; placeId: string; mi: number; min: number },
  addrError: '',
  addrBusy: false,
  suggestions: [] as Array<{ id: string; text: string }>,
  dateStr: pacificDay(Math.ceil(MIN_NOTICE_HOURS / 24)),
  slots: [] as Slot[],
  selected: null as Slot | null,
  quoteLoading: false,
  quoteError: '',
  agreed: false,
  payError: '',
});

// ── 第 1 步：文件与签署人 ─────────────────────────────────────
const nameOf = (pid: number) => {
  const p = s.signers.find((x) => x.id === pid);
  return p ? p.name || '…' : '?';
};
const typeOf = (d: UiDoc) => docType(d.typeKey);
const ruleOf = (d: UiDoc) => typeOf(d)?.rule;

/** UI 状态 → 计价用的结构，供 pricing.ts 的纯函数使用 */
function asBookingDoc(d: UiDoc): BookingDoc {
  return {
    typeKey: d.typeKey,
    rule: ruleOf(d) ?? 'standard',
    act: (d.act || undefined) as BookingDoc['act'],
    parts: d.parts.map((p) => ({ name: nameOf(p.pid), count: p.count })),
  };
}
const priced = computed(() => s.docs.filter((d) => d.typeKey).map(asBookingDoc));
const acts = computed(() => totalActs(priced.value));
const waived = computed(() => waivedActs(priced.value));
const notaryCents = computed(() => notaryFeeCents(priced.value));
const svcMin = computed(() => serviceMinutes(priced.value));

const docActsOf = (d: UiDoc) => (d.typeKey ? docActs(asBookingDoc(d)) : 0);
const docCentsOf = (d: UiDoc) => (d.typeKey ? docFeeCents(asBookingDoc(d)) : 0);
function docFeeLabel(d: UiDoc): string {
  const r = ruleOf(d);
  const zh = props.lang === 'zh';
  if (r === 'copy') return zh ? '核证副本 $15/份' : 'Certified copy, $15 each';
  if (r === 'depo') return zh ? '$30 + 宣誓 $7 + 证书 $7' : '$30 + $7 oath + $7 certificate';
  if (r === 'imm') return zh ? `${d.parts.length} 人 × $15（每人封顶）` : `${d.parts.length} × $15 (per-person cap)`;
  return zh ? `${docActsOf(d)} 签名处 × $15` : `${docActsOf(d)} × $15`;
}

const actApplies = (d: UiDoc) => !!d.typeKey && needsAct(ruleOf(d) ?? 'standard');
const actHint = (d: UiDoc) => ACT_HINTS[props.lang][d.act || ''];

function filteredGroups(d: UiDoc) {
  const q = d.query.trim().toLowerCase();
  return GROUP_ORDER.map((g) => ({
    key: g,
    label: GROUP_LABELS[props.lang][g],
    items: DOC_TYPES.filter(
      (x) => x.group === g && (!q || `${x.zh} ${x.en} ${x.alias}`.toLowerCase().includes(q)),
    ),
  })).filter((g) => g.items.length > 0);
}
const typeLabel = (d: UiDoc) => {
  if (d.typeKey === 'other') {
    return d.customName
      ? (props.lang === 'zh' ? `其他：${d.customName}` : `Other: ${d.customName}`)
      : L({ zh: '其他（手动填写）', en: 'Other' });
  }
  const x = typeOf(d);
  return x ? L(x) : '';
};
const docMeta = (d: UiDoc) => {
  const r = ruleOf(d);
  if (!r || !needsAct(r)) return '';
  const a = ACTS.find((x) => x.key === d.act);
  const n = d.parts.length;
  return props.lang === 'zh'
    ? `（${a ? a.zh : ''} · ${n} 人 · ${docActsOf(d)} 签名处）`
    : ` (${a ? a.en : ''} · ${n} signer(s) · ${docActsOf(d)} signature(s))`;
};

const openCombo = (d: UiDoc) => { d.open = true; d.query = ''; };
const onQuery = (d: UiDoc, e: Event) => { d.query = (e.target as HTMLInputElement).value; };
// 延迟关闭，否则 blur 会先于选项的 mousedown 触发，点击落空
const closeComboSoon = (d: UiDoc) => { setTimeout(() => { d.open = false; }, 150); };
const pickTypeFor = (d: UiDoc, key: string) => { d.typeKey = key; d.open = false; d.query = ''; };

const addDoc = () => s.docs.push(newDoc());
const removeDoc = (id: number) => { s.docs = s.docs.filter((d) => d.id !== id); };
const removeSigner = (id: number) => {
  s.signers = s.signers.filter((p) => p.id !== id);
  s.docs.forEach((d) => { d.parts = d.parts.filter((x) => x.pid !== id); });
};
const docAddable = (d: UiDoc) => s.signers.filter((p) => p.name && !d.parts.some((x) => x.pid === p.id));
const attach = (d: UiDoc, pid: number) => d.parts.push({ pid, count: 1 });
const detach = (d: UiDoc, pid: number) => { d.parts = d.parts.filter((x) => x.pid !== pid); };
function createSigner(d: UiDoc) {
  if (!d.newName) return;
  const p = { id: ++uid, name: d.newName, idType: d.newId };
  s.signers.push(p);
  d.parts.push({ pid: p.id, count: 1 });
  d.newName = ''; d.newId = ids[0]; d.adding = false;
}

const step1ok = computed(() =>
  s.docs.length > 0 &&
  s.signers.every((p) => p.name) &&
  s.docs.every((d) => {
    const r = ruleOf(d);
    if (!r) return false;
    if (d.typeKey === 'other' && !d.customName) return false;
    if (!needsAct(r)) return true;
    // 「不确定」不可预约：公证员依法不能替客户选择公证类型
    if (d.act !== 'ack' && d.act !== 'jurat') return false;
    return d.parts.length > 0;
  }));
const step1Hint = computed(() =>
  s.docs.some((d) => d.act === 'unsure') ? t.step1HintUnsure : t.step1Hint);

// ── 第 2 步：地点 ───────────────────────────────────────────
let acTimer: ReturnType<typeof setTimeout> | undefined;

async function fetchSuggestions(input: string) {
  const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': props.mapsKey },
    body: JSON.stringify({
      input,
      includedRegionCodes: ['us'],
      // locationBias 的 radius 上限是 50 km，超过会被拒
      locationBias: { circle: { center: { latitude: 37.4057, longitude: -122.018 }, radius: 50000 } },
    }),
  });
  if (!res.ok) throw new Error(`autocomplete ${res.status}`);
  const j = await res.json();
  return (j.suggestions || [])
    .filter((x: any) => x.placePrediction)
    .map((x: any) => ({ id: x.placePrediction.placeId, text: x.placePrediction.text.text }));
}

function onAddrInput() {
  s.resolved = null;
  s.addrError = '';
  clearTimeout(acTimer);
  if (!props.mapsKey) { s.addrError = t.addrKeyMissing; return; }
  const v = s.address;
  if (!v || v.length < 3) { s.suggestions = []; return; }
  acTimer = setTimeout(async () => {
    try { s.suggestions = await fetchSuggestions(v); }
    catch { s.suggestions = []; s.addrError = t.addrSearchFailed; }
  }, 300);
}

/** 只认 Places 选中的 placeId：自由文本会被 Routes 猜到别处去，静默算出错的价 */
async function pickPlace(sug: { id: string; text: string }) {
  s.address = sug.text;
  s.suggestions = [];
  s.addrBusy = true;
  s.addrError = '';
  try {
    const res = await fetch('/api/route-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ placeId: sug.id }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || res.status);
    s.resolved = { label: sug.text, placeId: sug.id, mi: j.miles, min: j.minutes };
    await nextTick();
    drawRoute(j.polyline);
  } catch {
    s.resolved = null;
    s.addrError = t.addrNoRoute;
  } finally {
    s.addrBusy = false;
  }
}

function resolveAddress() {
  if (s.location !== 'mobile' || !s.address || s.resolved || s.addrBusy) return;
  if (!s.suggestions.length) s.addrError = t.addrMustPick;
}

// Maps JS 只用来画那条折线；路线本身由服务端算好传过来
let mapsPromise: Promise<void> | null = null;
function loadMaps(): Promise<void> {
  if (window.google?.maps) return Promise.resolve();
  if (mapsPromise) return mapsPromise;
  mapsPromise = new Promise((resolve, reject) => {
    (window as any).__gmapsReady = () => resolve();
    const el = document.createElement('script');
    el.async = true;
    el.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(props.mapsKey)}`
      + `&libraries=geometry&language=${props.lang === 'zh' ? 'zh-CN' : 'en'}&region=US&callback=__gmapsReady`;
    el.onerror = () => reject(new Error('maps'));
    document.head.appendChild(el);
    setTimeout(() => reject(new Error('timeout')), 12_000);
  });
  return mapsPromise;
}

async function drawRoute(encoded: string) {
  if (!encoded || !props.mapsKey) return;
  try { await loadMaps(); } catch { return; }   // 地图画不出来不影响下单
  const el = document.getElementById('route-map');
  if (!el || !window.google?.maps) return;
  const g = window.google.maps;
  const path = g.geometry.encoding.decodePath(encoded);
  const map = new g.Map(el, {
    mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
  });
  new g.Polyline({ path, strokeColor: '#1B3B32', strokeWeight: 5, strokeOpacity: 0.9, map });
  // 用像素尺寸的符号：按米计的圆在长途路线下会小到看不见
  const dot = (pos: any, color: string) => new g.Marker({
    position: pos, map, zIndex: 5,
    icon: { path: g.SymbolPath.CIRCLE, scale: 7, fillColor: color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 },
  });
  dot(path[0], '#1B3B32');
  dot(path[path.length - 1], '#D88465');
  const b = new g.LatLngBounds();
  path.forEach((p: any) => b.extend(p));
  map.fitBounds(b, 24);
}

const step2ok = computed(() => s.location === 'park' || !!s.resolved);

// ── 第 3 步：时段与报价 ─────────────────────────────────────
const quotePayload = computed(() => ({
  date: s.dateStr,
  locationKind: s.location,
  placeId: s.location === 'mobile' ? s.resolved?.placeId ?? null : null,
  documents: s.docs.filter((d) => d.typeKey).map((d) => ({
    typeKey: d.typeKey,
    act: d.act || undefined,
    parts: d.parts.map((p) => ({ name: nameOf(p.pid), count: p.count })),
  })),
}));

let quoteSeq = 0;
async function loadQuote() {
  if (s.step !== 3 || !step1ok.value || !step2ok.value) return;
  const seq = ++quoteSeq;
  const payload = JSON.parse(JSON.stringify(quotePayload.value));
  s.quoteLoading = true;
  s.quoteError = '';
  s.selected = null;
  try {
    const res = await fetch('/api/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const j = await res.json();
    if (seq !== quoteSeq) return;                 // 参数已变，丢弃过期结果
    if (!res.ok) throw new Error(j.error || res.status);
    s.slots = j.slots ?? [];
  } catch {
    if (seq !== quoteSeq) return;
    s.slots = [];
    s.quoteError = t.slotsFailed;
  } finally {
    if (seq === quoteSeq) s.quoteLoading = false;
  }
}

watch(
  () => (s.step === 3 ? JSON.stringify(quotePayload.value) : ''),
  (key) => { if (key) loadQuote(); },
);

const slotTime = (iso: string) =>
  new Intl.DateTimeFormat(LOCALE(), { timeZone: TIMEZONE, hour: 'numeric', minute: '2-digit' })
    .format(new Date(iso));
const prettyDate = computed(() =>
  new Intl.DateTimeFormat(LOCALE(), { timeZone: TIMEZONE, month: 'long', day: 'numeric', weekday: 'short' })
    .format(new Date(`${s.dateStr}T20:00:00Z`)));

// 与服务端同源：候选时段由 candidateSlots 用这两个常量过滤，
// 日期选择器只是提前把不可能的日子灰掉，避免用户白等一次查询。
const MIN_DAYS = Math.ceil(MIN_NOTICE_HOURS / 24);
const minDate = pacificDay(MIN_DAYS);
const maxDate = pacificDay(MAX_ADVANCE_DAYS);

// ── 第 4 步：确认 ───────────────────────────────────────────
const grandCents = computed(() => s.selected?.totalCents ?? 0);
const travelCents = computed(() => s.selected?.travelFeeCents ?? 0);
const paidActs = computed(() => acts.value - waived.value);
const roundTripMin = computed(() =>
  (s.selected?.outboundMinutes ?? 0) + (s.selected?.returnMinutes ?? 0));

const mailtoHref = computed(() => {
  const lines = [
    `${t.rowTime}: ${prettyDate.value} ${s.selected ? slotTime(s.selected.startsAt) : ''} (PT)`,
    `${t.rowPlace}: ${s.location === 'park' ? 'Sunnyvale Lakewood Park' : s.address}`,
    `${t.rowSigners}: ${s.signers.map((p) => `${p.name} (${p.idType})`).join(' / ')}`,
    ...s.docs.filter((d) => d.typeKey).map((d) => `- ${typeLabel(d)}${docMeta(d)}`),
    `${t.grandTotal}: ${money(grandCents.value)}`,
  ];
  const subject = props.lang === 'zh' ? '预约公证' : 'Notarization booking request';
  return `mailto:${props.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
});

async function pay() {
  s.payError = '';
  if (!s.selected) return;
  try {
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...quotePayload.value, startsAt: s.selected.startsAt }),
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok && j.url) { window.location.href = j.url; return; }
    // 报价在服务端重算——对不上说明时段或路况变了，必须让客户重选
    s.payError = j.code === 'slot_taken' || j.code === 'price_changed' ? t.priceExpired : t.payUnavailable;
    if (j.code === 'slot_taken' || j.code === 'price_changed') { s.step = 3; loadQuote(); }
  } catch {
    s.payError = t.payUnavailable;
  }
}
</script>

<template>
  <div class="bk">
    <ol class="dots" :aria-label="t.pageTitle">
      <li v-for="(label, i) in t.steps" :key="label"
          :class="{ on: i + 1 <= s.step, cur: i + 1 === s.step }">
        <span>{{ label }}</span>
      </li>
    </ol>

    <!-- 第 1 步 · 文件与签署人 -->
    <section v-if="s.step === 1">
      <h2>{{ t.s1Title }}</h2>
      <p class="sub">{{ t.s1Sub }}</p>

      <div class="card" v-for="(d, i) in s.docs" :key="d.id">
        <div class="rowtop">
          <span class="tag">{{ t.docN(i + 1) }}</span>
          <button v-if="s.docs.length > 1" @click="removeDoc(d.id)">{{ t.remove }}</button>
        </div>

        <label class="f" :for="`dt-${d.id}`">{{ t.docTypeLabel }}</label>
        <div class="combo">
          <input :id="`dt-${d.id}`" type="text" autocomplete="off"
            :value="d.open ? d.query : typeLabel(d)"
            :placeholder="d.open ? t.docTypeSearching : t.docTypePick"
            @focus="openCombo(d)"
            @input="onQuery(d, $event)"
            @blur="closeComboSoon(d)" />
          <div class="panel" v-if="d.open">
            <template v-for="g in filteredGroups(d)" :key="g.key">
              <div class="ghead">{{ g.label }}</div>
              <div class="opt" v-for="x in g.items" :key="x.key"
                   @mousedown.prevent="pickTypeFor(d, x.key)">
                <span>{{ L(x) }}<template v-if="lang === 'zh' && x.en"> · {{ x.en }}</template></span>
                <em :class="{ free: x.rule === 'free' }">{{ RULE_TAGS[lang][x.rule] }}</em>
              </div>
            </template>
            <div class="ghead" v-if="filteredGroups(d).length === 0">{{ t.noMatch }}</div>
            <div class="opt" @mousedown.prevent="pickTypeFor(d, 'other')">
              <span>{{ t.otherManual }}</span>
            </div>
          </div>
        </div>
        <span class="badge-free" v-if="ruleOf(d) === 'free'">{{ t.freeBadge }}</span>

        <template v-if="d.typeKey === 'other'">
          <label class="f" :for="`dn-${d.id}`">{{ t.docNameLabel }}</label>
          <input :id="`dn-${d.id}`" type="text" v-model.trim="d.customName" :placeholder="t.docNamePlaceholder" />
        </template>

        <template v-if="actApplies(d)">
          <span class="f">{{ t.actLabel }}</span>
          <div class="seg">
            <button v-for="a in ACTS" :key="a.key" :class="{ on: d.act === a.key }"
                    :aria-pressed="d.act === a.key" @click="d.act = a.key">
              {{ lang === 'zh' ? a.zh : a.en }}<small>{{ lang === 'zh' ? a.en : '' }}</small>
            </button>
          </div>
          <p class="chiphint" :class="{ warn: d.act === 'unsure' }">{{ actHint(d) }}</p>
        </template>

        <template v-if="d.typeKey && ruleOf(d) !== 'copy'">
          <span class="f">{{ t.signersLabel }}</span>
          <div class="chips">
            <span class="chip" v-for="p in d.parts" :key="p.pid">
              <b>{{ nameOf(p.pid) }}</b>
              <span class="step">
                <button :disabled="p.count <= 1" @click="p.count = Math.max(1, p.count - 1)" aria-label="−">−</button>
                <i>{{ p.count }}</i>
                <button :disabled="p.count >= 10" @click="p.count = Math.min(10, p.count + 1)" aria-label="+">+</button>
              </span>
              <button class="rm" @click="detach(d, p.pid)" aria-label="×">×</button>
            </span>
            <span class="chip add" v-for="p in docAddable(d)" :key="`a${p.id}`" @click="attach(d, p.id)">
              ＋ {{ p.name }}
            </span>
            <span class="chip add new" @click="d.adding = !d.adding">{{ t.newSigner }}</span>
          </div>
          <p class="chiphint" v-if="d.parts.length > 0">{{ t.signerCountHint }}</p>

          <div class="newform" v-if="d.adding">
            <label class="f" style="margin-top:0" :for="`nn-${d.id}`">{{ t.legalNameLabel }}</label>
            <input :id="`nn-${d.id}`" type="text" v-model.trim="d.newName"
                   :placeholder="t.legalNamePlaceholder" autocapitalize="characters"
                   @keydown.enter.prevent="createSigner(d)" />
            <label class="f" :for="`ni-${d.id}`">{{ t.idLabel }}</label>
            <select :id="`ni-${d.id}`" v-model="d.newId">
              <option v-for="x in ids" :key="x" :value="x">{{ x }}</option>
            </select>
            <div class="btnrow">
              <button class="mini" :disabled="!d.newName" @click="createSigner(d)">{{ t.add }}</button>
              <button class="mini ghost" @click="d.adding = false">{{ t.cancel }}</button>
            </div>
          </div>
        </template>

        <div class="docfee" v-if="d.typeKey">
          <template v-if="ruleOf(d) === 'free'">
            <s>{{ money(NOTARY_FEE_CENTS * docActsOf(d)) }}</s><span class="free">{{ t.freeStruck }}</span>
          </template>
          <template v-else>{{ docFeeLabel(d) }} <b>{{ money(docCentsOf(d)) }}</b></template>
        </div>
      </div>

      <button class="addbtn" @click="addDoc">{{ t.addDoc }}</button>

      <div class="card roster" v-if="s.signers.length > 0">
        <div class="rowtop"><span class="tag">{{ t.rosterTitle }}</span></div>
        <div class="rowline" v-for="p in s.signers" :key="p.id">
          <input type="text" v-model.trim="p.name" :aria-label="t.legalNameLabel" />
          <select v-model="p.idType" :aria-label="t.idLabel">
            <option v-for="x in ids" :key="x" :value="x">{{ x }}</option>
          </select>
          <button @click="removeSigner(p.id)">{{ t.remove }}</button>
        </div>
      </div>

      <div class="totals" v-if="acts > 0">
        {{ t.summaryLine(priced.length, acts, svcMin) }}<br />
        <span class="fee">{{ t.notaryFee(money(notaryCents)) }}</span>
        <template v-if="waived > 0">{{ t.waivedNote(waived) }}</template>
      </div>
      <p class="hint" v-if="!step1ok">{{ step1Hint }}</p>
      <div class="nav">
        <button class="btn primary" :disabled="!step1ok" @click="s.step = 2">{{ t.next }}</button>
      </div>
    </section>

    <!-- 第 2 步 · 地点 -->
    <section v-if="s.step === 2">
      <h2>{{ t.s2Title }}</h2>
      <p class="sub">{{ t.s2Sub }}</p>

      <label class="radio" :class="{ sel: s.location === 'mobile' }">
        <input type="radio" value="mobile" v-model="s.location" />
        <span>
          <span class="tt">{{ t.mobileTitle }}</span>
          <span class="dd">{{ t.mobileDesc }}</span>
        </span>
      </label>
      <label class="radio" :class="{ sel: s.location === 'park' }">
        <input type="radio" value="park" v-model="s.location" />
        <span>
          <span class="tt">{{ t.parkTitle }}</span>
          <span class="dd">{{ t.parkDesc }}</span>
        </span>
      </label>

      <div class="card" v-if="s.location === 'mobile'">
        <label class="f" for="addr">{{ t.addrLabel }}</label>
        <input id="addr" type="text" autocomplete="off" v-model.trim="s.address"
          :placeholder="t.addrPlaceholder" @input="onAddrInput" @blur="resolveAddress" />

        <div class="combo" v-if="s.suggestions.length">
          <div class="panel stat">
            <div class="opt" v-for="x in s.suggestions" :key="x.id" @mousedown.prevent="pickPlace(x)">
              <span>{{ x.text }}</span>
            </div>
          </div>
        </div>

        <p class="addrstate ok" v-if="s.resolved">
          {{ t.addrVerified }}<span class="fixed">{{ s.resolved.label }}</span>
        </p>
        <p class="addrstate bad" v-else-if="s.addrError">✕ {{ s.addrError }}</p>
        <p class="addrstate muted" v-else-if="s.addrBusy">{{ t.addrChecking }}</p>

        <div class="maproute" v-if="s.resolved">
          <div id="route-map" class="canvas"></div>
          <div class="legline">
            <span>{{ t.legLabel }}</span>
            <b>{{ t.legValue(s.resolved.mi, s.resolved.min) }}</b>
          </div>
          <div class="peakbar"><span>⏱</span><span>{{ t.peakNote }}</span></div>
        </div>
      </div>

      <p class="hint" v-if="!step2ok">{{ t.step2Hint }}</p>
      <div class="nav">
        <button class="btn ghost" @click="s.step = 1">{{ t.back }}</button>
        <button class="btn primary" :disabled="!step2ok" @click="s.step = 3">{{ t.next }}</button>
      </div>
    </section>

    <!-- 第 3 步 · 日期与时间 -->
    <section v-if="s.step === 3">
      <h2>{{ t.s3Title }}</h2>
      <p class="sub">
        {{ s.location === 'mobile' ? t.s3SubMobile(money(notaryCents)) : t.s3SubPark }}
      </p>

      <label class="f" for="day">{{ t.dateLabel }}</label>
      <input id="day" type="date" v-model="s.dateStr" :min="minDate" :max="maxDate" />
      <p class="chiphint">{{ t.dateWindow(MIN_NOTICE_HOURS, MAX_ADVANCE_DAYS) }}</p>

      <p class="muted sm" v-if="s.quoteLoading">{{ t.slotsLoading }}</p>
      <p class="hint" v-else-if="s.quoteError">
        {{ s.quoteError }} <button class="linkbtn" @click="loadQuote">{{ t.retry }}</button>
      </p>
      <p class="muted sm" v-else-if="!s.slots.length">{{ t.noSlots }}</p>

      <div class="slots" v-if="s.slots.length && !s.quoteLoading">
        <button class="slot" v-for="x in s.slots" :key="x.startsAt"
          :class="{ sel: s.selected?.startsAt === x.startsAt }" :disabled="!x.available"
          @click="s.selected = x">
          {{ slotTime(x.startsAt) }}
          <small v-if="!x.available">{{ x.reason === 'routes_failed' ? t.slotUnavailable : t.slotBusy }}</small>
          <small v-else-if="s.location === 'park'">{{ t.slotFree }}</small>
          <small v-else>{{ t.slotTravel(money(x.travelFeeCents ?? 0)) }}</small>
        </button>
      </div>
      <p class="peakhint">{{ t.serviceNote(svcMin, money(notaryCents)) }} · {{ t.tzNote }}</p>

      <p class="hint" v-if="!s.selected && s.slots.length">{{ t.step3Hint }}</p>
      <div class="nav">
        <button class="btn ghost" @click="s.step = 2">{{ t.back }}</button>
        <button class="btn primary" :disabled="!s.selected" @click="s.step = 4">{{ t.next }}</button>
      </div>
    </section>

    <!-- 第 4 步 · 确认并支付 -->
    <section v-if="s.step === 4 && s.selected">
      <h2>{{ t.s4Title }}</h2>
      <p class="sub">{{ paymentsEnabled ? t.s4Sub : t.s4SubNoPay }}</p>

      <div class="card sum">
        <div class="line"><span>{{ t.rowTime }}</span><span>{{ prettyDate }} {{ slotTime(s.selected.startsAt) }}</span></div>
        <div class="line"><span>{{ t.rowPlace }}</span><span>{{ s.location === 'park' ? 'Sunnyvale Lakewood Park' : s.address }}</span></div>
        <div class="line"><span>{{ t.rowSigners }}</span><span>{{ s.signers.map(p => p.name).join(' · ') }}</span></div>
        <div class="line" v-for="d in s.docs.filter(x => x.typeKey)" :key="d.id">
          <span>{{ t.rowDocs }}</span><span>{{ typeLabel(d) }}{{ docMeta(d) }}</span>
        </div>
      </div>

      <div class="card sum">
        <div class="line">
          <span>{{ t.feeLineNotary(paidActs, money(NOTARY_FEE_CENTS)) }}</span>
          <span>{{ money(s.selected.notaryFeeCents ?? 0) }}</span>
        </div>
        <div class="line" v-if="waived > 0">
          <span>{{ t.feeLineWaived(waived) }}</span><span class="green">−$0</span>
        </div>
        <div class="line" v-if="s.location === 'mobile'">
          <span>{{ t.feeLineTravel(roundTripMin) }}</span><span>{{ money(travelCents) }}</span>
        </div>
        <div class="line" v-else><span>{{ t.feeLineNoTravel }}</span><span>$0</span></div>
        <div class="line grand"><span>{{ t.grandTotal }}</span><span>{{ money(grandCents) }}</span></div>
      </div>

      <label class="agree">
        <input type="checkbox" v-model="s.agreed" />
        <span>{{ t.agreeText }}</span>
      </label>

      <!-- 支付通道未开通时不摆一个按下去会失败的付款按钮，直接给可用的替代路径 -->
      <div class="payfail" v-if="!paymentsEnabled">
        <p>{{ t.payUnavailable }}</p>
        <p>{{ t.payUnavailableCta }}</p>
      </div>

      <div class="nav">
        <button class="btn ghost" @click="s.step = 3">{{ t.back }}</button>
        <button v-if="paymentsEnabled" class="btn primary" :disabled="!s.agreed" @click="pay">
          {{ t.payBtn(money(grandCents)) }}
        </button>
        <a v-else class="btn primary mail" :class="{ off: !s.agreed }"
           :href="s.agreed ? mailtoHref : undefined" :aria-disabled="!s.agreed">{{ t.emailUs }}</a>
      </div>

      <div class="payfail" v-if="paymentsEnabled && s.payError"><p>{{ s.payError }}</p></div>
      <p class="holdnote" v-else-if="paymentsEnabled">{{ t.holdNote }}<br />{{ t.holdNote2 }}</p>
    </section>
  </div>
</template>

<style scoped>
.bk { max-width: 460px; margin: 0 auto; }
.bk h2 { font-size: 20px; margin-bottom: 4px; }
.sub { font-size: 13.5px; color: var(--text-muted); margin-bottom: 16px; line-height: 1.6; }
.muted { color: var(--text-muted); }
.sm { font-size: 13px; margin-top: 12px; }
.green { color: #1E7A46; }

.dots { display: flex; gap: 4px; list-style: none; padding: 0; margin: 0 0 20px; }
.dots li { flex: 1; font-size: 10.5px; color: var(--text-muted); text-align: center; line-height: 1.3; }
.dots li::before {
  content: ''; display: block; height: 4px; border-radius: 2px;
  background: var(--border-soft); margin-bottom: 6px;
}
.dots li.on::before { background: var(--brand-green); }
.dots li.cur { color: var(--brand-green); font-weight: 600; }
.dots li.cur::before { background: var(--brand-yellow); }

.card {
  background: var(--bg-white); border: 1px solid var(--border-soft);
  border-radius: 12px; padding: 14px; margin-bottom: 10px;
}
.rowtop { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
.rowtop .tag { font-size: 12px; color: var(--text-muted); font-weight: 600; }
.rowtop button { border: 0; background: none; color: var(--brand-terra); font-size: 12px; cursor: pointer; }
.f { display: block; font-size: 12px; color: var(--text-muted); margin: 10px 0 4px; }
input[type="text"], input[type="date"], select {
  width: 100%; padding: 10px; border: 1px solid var(--border-soft); border-radius: 8px;
  font-size: 15px; background: var(--bg-cream); color: var(--text-dark);
  font-family: inherit;
}
input:focus, select:focus { outline: 2px solid var(--brand-yellow); border-color: transparent; }

.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.chip {
  display: inline-flex; align-items: center; gap: 6px; background: var(--bg-alt);
  border: 1px solid var(--border-soft); border-radius: 999px;
  padding: 4px 8px 4px 10px; font-size: 13px;
}
.chip b { font-weight: 600; }
.chip .step {
  display: inline-flex; align-items: center; gap: 2px; background: var(--bg-white);
  border: 1px solid var(--border-soft); border-radius: 999px; padding: 1px;
}
.chip .step button {
  border: 0; background: none; color: var(--brand-green); width: 22px; height: 22px;
  border-radius: 50%; font-size: 15px; line-height: 1; cursor: pointer; font-weight: 700;
}
.chip .step button:hover:not(:disabled) { background: var(--bg-alt); }
.chip .step button:disabled { color: var(--border-soft); cursor: not-allowed; }
.chip .step i { font-style: normal; min-width: 14px; text-align: center; font-size: 13px; font-weight: 600; }
.chip .rm {
  border: 0; background: var(--border-soft); color: var(--text-muted); width: 18px; height: 18px;
  border-radius: 50%; line-height: 16px; font-size: 12px; cursor: pointer; padding: 0;
}
.chip.add { background: none; border-style: dashed; color: var(--text-muted); cursor: pointer; }
.chip.add.new { color: var(--brand-green); font-weight: 600; }
.chiphint { font-size: 11.5px; color: var(--text-muted); margin-top: 6px; line-height: 1.5; }
.chiphint.warn { color: var(--brand-terra); }

.seg { display: flex; gap: 6px; margin-top: 4px; flex-wrap: wrap; }
.seg button {
  flex: 1; min-width: 96px; padding: 9px 6px; border-radius: 8px; border: 1px solid var(--border-soft);
  background: var(--bg-cream); color: var(--text-dark); font-size: 13px; cursor: pointer;
  line-height: 1.35; font-family: inherit;
}
.seg button small { display: block; color: var(--text-muted); font-size: 10.5px; margin-top: 1px; }
.seg button.on { border-color: var(--brand-green); background: var(--brand-green); color: var(--text-light); }
.seg button.on small { color: var(--brand-yellow); }

.newform {
  background: var(--bg-cream); border: 1px dashed var(--border-soft);
  border-radius: 10px; padding: 12px; margin-top: 10px;
}
.btnrow { display: flex; gap: 8px; margin-top: 10px; }
.mini {
  padding: 9px 16px; border-radius: 8px; border: 0; font-size: 14px;
  background: var(--brand-green); color: var(--text-light); cursor: pointer;
  font-weight: 600; font-family: inherit;
}
.mini:disabled { opacity: .4; cursor: not-allowed; }
.mini.ghost { background: none; border: 1px solid var(--border-soft); color: var(--text-muted); }

.combo { position: relative; }
.panel {
  position: absolute; z-index: 30; left: 0; right: 0; top: calc(100% + 4px);
  background: var(--bg-white); border: 1px solid var(--border-soft); border-radius: 10px;
  max-height: 280px; overflow: auto; box-shadow: 0 8px 24px rgba(17, 24, 22, .12);
}
.panel.stat { position: static; margin-top: 6px; box-shadow: none; }
.ghead { font-size: 11px; color: var(--text-muted); padding: 8px 12px 4px; letter-spacing: .06em; }
.opt { padding: 9px 12px; font-size: 14px; cursor: pointer; display: flex; justify-content: space-between; gap: 8px; }
.opt:hover { background: var(--bg-cream); }
.opt em { font-style: normal; color: var(--text-muted); font-size: 12px; white-space: nowrap; }
.opt em.free { color: #1E7A46; font-weight: 600; }

.badge-free {
  display: inline-block; font-size: 12px; color: #1E7A46; background: #E8F4EC;
  border-radius: 6px; padding: 3px 8px; margin-top: 8px;
}
.docfee { text-align: right; font-size: 13.5px; margin-top: 10px; }
.docfee s { color: var(--text-muted); margin-right: 6px; }
.docfee .free { color: #1E7A46; font-weight: 600; }

.addbtn {
  width: 100%; padding: 11px; border-radius: 10px; border: 1px dashed var(--border-soft);
  background: none; color: var(--brand-green); font-size: 14px; cursor: pointer;
  margin-bottom: 10px; font-family: inherit;
}
.roster .rowline { display: flex; gap: 6px; margin-top: 8px; align-items: center; }
.roster .rowline input { flex: 1.2; }
.roster .rowline select { flex: 1; }
.roster .rowline button { border: 0; background: none; color: var(--brand-terra); font-size: 12px; cursor: pointer; white-space: nowrap; }

.totals {
  border-top: 1px solid var(--border-soft); padding-top: 12px; margin-top: 6px;
  font-size: 13.5px; color: var(--text-muted); line-height: 1.7;
}
.totals .fee { color: var(--text-dark); font-weight: 600; }

.radio {
  display: flex; gap: 10px; align-items: flex-start; background: var(--bg-white);
  border: 1px solid var(--border-soft); border-radius: 12px; padding: 14px;
  margin-bottom: 10px; cursor: pointer;
}
.radio.sel { border-color: var(--brand-green); outline: 1px solid var(--brand-green); }
.radio input { margin-top: 3px; flex: 0 0 auto; }
.radio .tt { display: block; font-size: 14.5px; font-weight: 600; }
.radio .dd { display: block; font-size: 13px; color: var(--text-muted); margin-top: 3px; line-height: 1.55; }

.slots { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 12px; }
.slot {
  padding: 10px 4px; border-radius: 10px; border: 1px solid var(--border-soft);
  background: var(--bg-white); font-size: 13.5px; cursor: pointer; text-align: center;
  color: var(--text-dark); font-family: inherit;
}
.slot small { display: block; color: var(--text-muted); font-size: 11.5px; margin-top: 3px; }
.slot.sel { border-color: var(--brand-green); background: var(--brand-green); color: var(--text-light); }
.slot.sel small { color: var(--brand-yellow); }
.slot:disabled { opacity: .4; cursor: not-allowed; }
.peakhint { font-size: 11.5px; color: var(--text-muted); margin-top: 10px; line-height: 1.6; }

.maproute { margin-top: 12px; }
.canvas { height: 190px; border-radius: 10px; overflow: hidden; border: 1px solid var(--border-soft); background: var(--bg-alt); }
.legline { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; margin-top: 8px; }
.legline b { font-weight: 600; }
.peakbar {
  display: flex; gap: 6px; align-items: flex-start; background: #FDF4E3; border: 1px solid #F3E0B8;
  border-radius: 8px; padding: 9px 11px; margin-top: 8px; font-size: 12px; color: #7A5A16; line-height: 1.55;
}
.addrstate { font-size: 12.5px; margin-top: 8px; line-height: 1.55; }
.addrstate.ok { color: #1E7A46; }
.addrstate.bad { color: var(--brand-terra); }
.addrstate.muted { color: var(--text-muted); }
.addrstate .fixed { color: var(--text-dark); font-weight: 600; }

.sum .line { display: flex; justify-content: space-between; font-size: 14px; padding: 5px 0; gap: 12px; }
.sum .line span:first-child { color: var(--text-muted); }
.sum .line span:last-child { text-align: right; }
.sum .grand {
  border-top: 1px solid var(--border-soft); margin-top: 6px; padding-top: 10px;
  font-size: 16px; font-weight: 700;
}
.sum .grand span:first-child { color: var(--text-dark); }
.agree { display: flex; gap: 8px; font-size: 12.5px; color: var(--text-muted); margin: 14px 0; line-height: 1.6; }
.agree input { margin-top: 3px; flex: 0 0 auto; }

.nav { display: flex; gap: 10px; margin-top: 16px; }
.btn {
  flex: 1; padding: 13px; border-radius: 10px; border: 0; font-size: 15px;
  font-weight: 600; cursor: pointer; font-family: inherit;
}
.btn.primary { background: var(--brand-green); color: var(--text-light); }
.btn.primary:hover:not(:disabled) { background: var(--brand-green-hover); }
.btn.primary:disabled { opacity: .35; cursor: not-allowed; }
.btn.ghost { background: none; border: 1px solid var(--border-soft); color: var(--text-muted); flex: 0 0 auto; padding: 13px 18px; }
.btn.mail { display: flex; align-items: center; justify-content: center; text-decoration: none; }
.btn.mail.off { opacity: .35; pointer-events: none; }
.linkbtn { border: 0; background: none; color: var(--brand-green); text-decoration: underline; cursor: pointer; font-size: inherit; font-family: inherit; }
.hint { font-size: 12.5px; color: var(--brand-terra); margin-top: 10px; line-height: 1.6; }
.holdnote { text-align: center; font-size: 11.5px; color: var(--text-muted); margin-top: 12px; line-height: 1.7; }
.payfail {
  margin-top: 14px; padding: 12px 14px; border-radius: 10px;
  background: #FDF4E3; border: 1px solid #F3E0B8; color: #7A5A16;
  font-size: 13px; line-height: 1.6;
}
.payfail p { margin: 0 0 4px; }
</style>
