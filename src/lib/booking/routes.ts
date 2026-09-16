// Google Routes API 封装。只在服务端调用——金额必须服务端算出，
// 否则前端可以篡改车程分钟数进而篡改价格。
//
// 注意：新建的 GCP 项目已无法使用旧版 Directions/Distance Matrix
// （返回 REQUEST_DENIED），必须用 Routes API。

const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';

/** 出发地。改动这里等于改动全部交通费，务必与线上文案一致。 */
export const ORIGIN_ADDRESS = 'Lakewood Park, Sunnyvale, CA 94089';

export interface Leg { minutes: number; meters: number }

interface RoutesResponse {
  routes?: Array<{
    distanceMeters?: number;
    duration?: string;        // "2092s"
    staticDuration?: string;  // 畅通时长
    polyline?: { encodedPolyline?: string };
  }>;
  error?: { message?: string };
}

const parseSeconds = (v?: string) => (v ? parseInt(v, 10) : 0);

/**
 * 查询单程车程。
 * @param departureTime 出发时刻——必须是未来时间，Routes 才会给预测路况。
 *                      传历史时间会被拒绝。
 */
async function computeLeg(
  apiKey: string,
  origin: Record<string, unknown>,
  destination: Record<string, unknown>,
  departureTime: Date,
): Promise<Leg> {
  const res = await fetch(ROUTES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'routes.duration,routes.staticDuration,routes.distanceMeters',
    },
    body: JSON.stringify({
      origin,
      destination,
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
      departureTime: departureTime.toISOString(),
    }),
  });

  const json = (await res.json()) as RoutesResponse;
  if (!res.ok || !json.routes?.length) {
    throw new Error(`Routes API: ${json.error?.message ?? res.status}`);
  }
  const r = json.routes[0];
  return {
    minutes: Math.round(parseSeconds(r.duration) / 60),
    meters: r.distanceMeters ?? 0,
  };
}

/** 出发地 → 客户地址（去程） */
export function legToCustomer(apiKey: string, placeId: string, departAt: Date): Promise<Leg> {
  return computeLeg(apiKey, { address: ORIGIN_ADDRESS }, { placeId }, departAt);
}

/** 客户地址 → 出发地（回程） */
export function legToOrigin(apiKey: string, placeId: string, departAt: Date): Promise<Leg> {
  return computeLeg(apiKey, { placeId }, { address: ORIGIN_ADDRESS }, departAt);
}

/** 畅通时长基准，用于反推出发时刻的首轮估计 */
export async function baselineMinutes(apiKey: string, placeId: string): Promise<number> {
  const inAnHour = new Date(Date.now() + 3_600_000);
  const res = await fetch(ROUTES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'routes.staticDuration,routes.distanceMeters',
    },
    body: JSON.stringify({
      origin: { address: ORIGIN_ADDRESS },
      destination: { placeId },
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
      departureTime: inAnHour.toISOString(),
    }),
  });
  const json = (await res.json()) as RoutesResponse;
  if (!res.ok || !json.routes?.length) {
    throw new Error(`Routes API: ${json.error?.message ?? res.status}`);
  }
  return Math.round(parseSeconds(json.routes[0].staticDuration) / 60);
}

/**
 * 某个预约时刻的往返车程。
 * 去程：目标是提前 15 分钟到达，先用畅通时长反推出发时刻，再按该时刻查预测
 *       （Routes 的 DRIVE 模式没有 arrivalTime 参数，只能这样迭代一次）。
 * 回程：服务结束 + 15 分钟 buffer 后才出发，按那个时刻单独查——
 *       这正是不能简单把去程 ×2 的原因：两个时刻的路况往往不同。
 */
export async function roundTrip(
  apiKey: string,
  placeId: string,
  startsAt: Date,
  serviceMinutes: number,
  baseline: number,
  arriveEarlyMin = 15,
  departBufferMin = 15,
): Promise<{ outbound: Leg; inbound: Leg }> {
  const departAt = new Date(startsAt.getTime() - (baseline + arriveEarlyMin) * 60_000);
  const outbound = await legToCustomer(apiKey, placeId, departAt);

  const leaveAt = new Date(startsAt.getTime() + (serviceMinutes + departBufferMin) * 60_000);
  const inbound = await legToOrigin(apiKey, placeId, leaveAt);

  return { outbound, inbound };
}

export interface RoutePreview {
  /** 畅通时长（分钟），与各时段的预测时长区分开：这只是「大概多远」的基准 */
  minutes: number;
  miles: number;
  /** Google 编码折线，供前端用 Maps JS 画出路线 */
  polyline: string;
}

/**
 * 步骤二的地址核验与路线预览。
 * 必须走服务端：浏览器密钥只开了 Maps JS 与 Places，没开 Routes
 * （也不该开——前端能查车程就能推算价格，进而有篡改的余地）。
 */
export async function previewRoute(apiKey: string, placeId: string): Promise<RoutePreview> {
  const inAnHour = new Date(Date.now() + 3_600_000);
  const res = await fetch(ROUTES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask':
        'routes.staticDuration,routes.distanceMeters,routes.polyline.encodedPolyline',
    },
    body: JSON.stringify({
      origin: { address: ORIGIN_ADDRESS },
      destination: { placeId },
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
      departureTime: inAnHour.toISOString(),
    }),
  });
  const json = (await res.json()) as RoutesResponse;
  if (!res.ok || !json.routes?.length) {
    throw new Error(`Routes API: ${json.error?.message ?? res.status}`);
  }
  const r = json.routes[0];
  return {
    minutes: Math.round(parseSeconds(r.staticDuration) / 60),
    miles: Math.round((r.distanceMeters ?? 0) / 1609.34),
    polyline: r.polyline?.encodedPolyline ?? '',
  };
}
