// 文件类型目录 —— 前端下拉与服务端计费共用的**唯一**来源。
//
// 为什么必须共用：计费规则（是否免费、是否按人封顶）由文件类型决定。
// 如果服务端直接采信前端传来的 rule，客户只要把一份地契标成 rule='free'
// 就能把公证费刷成 $0。所以接口只接受 typeKey，规则一律由这里查出来。

import type { FeeRule } from './pricing.ts';

export type DocGroup = 'common' | 'free' | 'special' | 'other';

export interface DocType {
  key: string;
  zh: string;
  /** 英文名称。'other' 没有固定英文名，由客户自己填写。 */
  en: string;
  /** 搜索用的别名，中英文混排——两种语言的界面共用同一份。 */
  alias: string;
  group: DocGroup;
  rule: FeeRule;
}

export const DOC_TYPES: DocType[] = [
  { key: 'grant_deed', zh: '房产地契', en: 'Grant Deed', alias: 'deed quitclaim 地契 房产 过户', group: 'common', rule: 'standard' },
  { key: 'poa', zh: '授权委托书', en: 'Power of Attorney', alias: 'poa 委托 授权', group: 'common', rule: 'standard' },
  { key: 'affidavit', zh: '宣誓书', en: 'Affidavit', alias: 'jurat 宣誓 声明', group: 'common', rule: 'standard' },
  { key: 'trust', zh: '生前信托', en: 'Living Trust', alias: 'trust 信托', group: 'common', rule: 'standard' },
  { key: 'loan', zh: '贷款 / 重贷文件包', en: 'Loan / Refi Package', alias: 'loan refinance heloc 贷款 重贷', group: 'common', rule: 'standard' },
  { key: 'minor', zh: '未成年人出行同意书', en: 'Minor Travel Consent', alias: 'travel consent 儿童 孩子 出行 未成年', group: 'common', rule: 'standard' },
  { key: 'china_poa', zh: '房屋出售委托书（中国使用）', en: 'POA for Use in China', alias: '国内 中国 卖房 出售 委托 china', group: 'common', rule: 'standard' },
  { key: 'vbm', zh: '邮寄选票身份信封', en: 'Vote-by-Mail Envelope', alias: '选票 选举 投票 ballot election vote', group: 'free', rule: 'free' },
  { key: 'vet', zh: '退伍军人福利申请', en: 'Veterans Benefits Application', alias: '军人 退伍 veteran va 福利 benefits', group: 'free', rule: 'free' },
  { key: 'imm', zh: '移民表格套件', en: 'Immigration Forms Set', alias: '移民 immigration uscis 绿卡 green card', group: 'special', rule: 'imm' },
  { key: 'poa_copy', zh: 'POA 核证副本', en: 'Certified Copy of POA', alias: '副本 copy 核证 认证 certified', group: 'special', rule: 'copy' },
  { key: 'depo', zh: '庭外取证', en: 'Deposition', alias: '取证 deposition 庭外', group: 'special', rule: 'depo' },
  { key: 'other', zh: '其他（手动填写）', en: 'Other (describe it yourself)', alias: '其他 other misc', group: 'other', rule: 'standard' },
];

const BY_KEY = new Map(DOC_TYPES.map((t) => [t.key, t]));

export const docType = (key: string): DocType | undefined => BY_KEY.get(key);

/** 计费规则。未知 typeKey 返回 undefined —— 调用方必须当作错误，不能兜底成 'standard'。 */
export const ruleFor = (key: string): FeeRule | undefined => BY_KEY.get(key)?.rule;

/** 核证副本与庭外取证本身就是特定的公证行为，不需要客户再选 ack / jurat。 */
export const needsAct = (rule: FeeRule): boolean => rule !== 'copy' && rule !== 'depo';
