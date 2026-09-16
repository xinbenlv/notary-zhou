// Webhook 验签是整条收款链上唯一"验错了会静默放行"的环节：
// 放行意味着任何人都能伪造一条 checkout.session.completed，凭空造出已付款的订单。
// 这组测试不需要任何 Stripe 密钥——签名在本地就能构造。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import { verifyWebhook, formEncode, WEBHOOK_TOLERANCE_SEC } from '../src/lib/booking/stripe.ts';

const SECRET = 'whsec_testsecret_do_not_use';
const BODY = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed', data: { object: { id: 'cs_1' } } });

const sign = (body, secret, ts) =>
  createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
const header = (body, secret, ts) => `t=${ts},v1=${sign(body, secret, ts)}`;

const NOW = 1_800_000_000;

test('合法签名通过并解析出事件', () => {
  const ev = verifyWebhook(BODY, header(BODY, SECRET, NOW), SECRET, NOW);
  assert.equal(ev.id, 'evt_1');
  assert.equal(ev.type, 'checkout.session.completed');
});

test('密钥不对要拒绝', () => {
  assert.throws(() => verifyWebhook(BODY, header(BODY, 'whsec_other', NOW), SECRET, NOW), /签名不匹配/);
});

test('请求体被改过要拒绝（哪怕只差一个字节）', () => {
  const h = header(BODY, SECRET, NOW);
  const tampered = BODY.replace('cs_1', 'cs_2');
  assert.throws(() => verifyWebhook(tampered, h, SECRET, NOW), /签名不匹配/);
});

test('重放：超出容忍窗口的时间戳要拒绝', () => {
  const old = NOW - WEBHOOK_TOLERANCE_SEC - 1;
  assert.throws(() => verifyWebhook(BODY, header(BODY, SECRET, old), SECRET, NOW), /时间戳超出容忍范围/);
  // 边界内仍然放行
  const edge = NOW - WEBHOOK_TOLERANCE_SEC;
  assert.equal(verifyWebhook(BODY, header(BODY, SECRET, edge), SECRET, NOW).id, 'evt_1');
});

test('未来时间戳同样受容忍窗口约束', () => {
  const future = NOW + WEBHOOK_TOLERANCE_SEC + 1;
  assert.throws(() => verifyWebhook(BODY, header(BODY, SECRET, future), SECRET, NOW), /时间戳超出容忍范围/);
});

test('缺头、缺 t、缺 v1 都要拒绝，不能当成"没签名就放行"', () => {
  assert.throws(() => verifyWebhook(BODY, null, SECRET, NOW), /缺少 Stripe-Signature/);
  assert.throws(() => verifyWebhook(BODY, `v1=${sign(BODY, SECRET, NOW)}`, SECRET, NOW), /时间戳/);
  assert.throws(() => verifyWebhook(BODY, `t=${NOW}`, SECRET, NOW), /缺少 v1/);
  assert.throws(() => verifyWebhook(BODY, `t=abc,v1=${sign(BODY, SECRET, NOW)}`, SECRET, NOW), /时间戳/);
});

test('密钥轮换期间多个 v1，命中任意一个即通过', () => {
  const h = `t=${NOW},v1=${sign(BODY, 'whsec_old', NOW)},v1=${sign(BODY, SECRET, NOW)}`;
  assert.equal(verifyWebhook(BODY, h, SECRET, NOW).id, 'evt_1');
});

test('长度不符或非十六进制的签名不能让比较函数抛错', () => {
  // timingSafeEqual 对长度不等会抛 RangeError，必须在比较前挡掉，
  // 否则错误类型不同，上层可能误判成"服务器故障"而不是"签名无效"
  for (const bad of ['deadbeef', 'zz'.repeat(32), '']) {
    assert.throws(() => verifyWebhook(BODY, `t=${NOW},v1=${bad}`, SECRET, NOW), /签名(不匹配|头缺少 v1)/);
  }
});

test('未设置 webhook secret 时直接报错，不放行', () => {
  assert.throws(() => verifyWebhook(BODY, header(BODY, SECRET, NOW), '', NOW), /未设置/);
});

test('表单编码：嵌套对象与数组按 Stripe 的写法展开', () => {
  const out = formEncode({
    mode: 'payment',
    payment_intent_data: { capture_method: 'manual' },
    line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: 11500 } }],
  });
  assert.deepEqual(out, [
    'mode=payment',
    'payment_intent_data%5Bcapture_method%5D=manual',
    'line_items%5B0%5D%5Bquantity%5D=1',
    'line_items%5B0%5D%5Bprice_data%5D%5Bcurrency%5D=usd',
    'line_items%5B0%5D%5Bprice_data%5D%5Bunit_amount%5D=11500',
  ]);
});

test('表单编码跳过 undefined —— Stripe 把空串当作显式清空', () => {
  assert.deepEqual(formEncode({ a: 1, b: undefined, c: null, d: '' }), ['a=1', 'd=']);
});
