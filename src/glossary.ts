/**
 * 公证术语表数据。
 *
 * 收词原则：只收文章正文中实际出现、且读者可能拿去检索的术语。
 * 释义须与已核实的法条一致；`cite` 只在本人核对过原文时填写。
 */
export interface GlossaryTerm {
  /** 英文原词（读者在文件上看到的形式） */
  en: string;
  /** 全站统一译名 */
  zh: string;
  /** 一两句话的释义 */
  def: string;
  /** 法条依据，纯文本；仅在核对过原文时填写 */
  cite?: string;
  /** 展开讲这个术语的文章 slug */
  slug?: string;
  group: GlossaryGroup;
}

export type GlossaryGroup =
  | 'core'
  | 'types'
  | 'people'
  | 'cross-border'
  | 'fees'
  | 'limits';

export const glossaryGroups: Record<GlossaryGroup, { label: string; intro: string }> = {
  core: { label: '基础概念', intro: '公证是什么、由谁做、留下什么。' },
  types: { label: '公证类型与文书', intro: '文件上最常出现的几种公证，选错会被退回。' },
  people: { label: '当事人与身份', intro: '谁必须到场、拿什么证明身份。' },
  'cross-border': { label: '跨境使用', intro: '文件送到中国或其他国家使用时会遇到的词。' },
  fees: { label: '收费', intro: '哪些有法定上限，哪些没有。' },
  limits: { label: '边界与合规', intro: '公证员依法不能做的事，以及相关的执业限制。' },
};

export const glossary: GlossaryTerm[] = [
  // —— 基础概念 ——
  { en: 'Notary Public', zh: '公证员', group: 'core', slug: 'us-notary-vs-china-notary',
    def: '由加州州务卿委任的个人，任期四年。职责是核验签署人身份、见证签署或主持宣誓，并出具公证证词——不是一个机关，也不审查文件内容。',
    cite: 'Gov. Code §8205' },
  { en: 'Notarization', zh: '公证（行为）', group: 'core', slug: 'us-notary-vs-china-notary',
    def: '公证员依法完成的证明行为。在加州只证明“这个人、在我面前、签了这个字”或作了宣誓，不证明文件内容真实或合法。' },
  { en: 'Notarial certificate', zh: '公证证词', group: 'core', slug: 'acknowledgment-vs-jurat',
    def: '附在文件上的一段法定格式文字，载明时间、地点、签署人以及验明身份的方式。措辞由法律规定，不能随意改动。',
    cite: 'Civil Code §1188、§1189' },
  { en: 'Preprinted certificate', zh: '预印证词', group: 'core', slug: 'acknowledgment-vs-jurat',
    def: '文件上已经印好的公证证词。它决定了这份文件要办哪一种公证。' },
  { en: 'Loose certificate', zh: '活页证词', group: 'core', slug: 'china-power-of-attorney',
    def: '文件本身没有预印证词时，另附一页的公证证词，须与文件装订在一起。' },
  { en: 'Notary journal', zh: '公证登记簿', group: 'core', slug: 'california-notary-fees',
    def: '公证员依法逐笔记录每次公证的簿册，包括时间、文件种类、身份核验方式与当事人签名指纹。',
    cite: 'Gov. Code §8206' },
  { en: 'Mobile notary', zh: '上门公证', group: 'core', slug: 'california-notary-fees',
    def: '公证员前往客户所在地（住家、医院、律师楼、咖啡馆）办理。上门产生的交通费不属于法定公证费。' },

  // —— 公证类型与文书 ——
  { en: 'Acknowledgment', zh: '签名确认', group: 'types', slug: 'acknowledgment-vs-jurat',
    def: '签署人向公证员确认这份文件系其本人签署。可以事先签好再来办；公证员核验的是身份与这份确认。',
    cite: 'Civil Code §1189' },
  { en: 'Jurat', zh: '宣誓书公证', group: 'types', slug: 'acknowledgment-vs-jurat',
    def: '签署人必须在公证员面前签署，并当面宣誓所述内容属实。作伪要负伪证责任。',
    cite: 'Gov. Code §8202' },
  { en: 'Oath / Affirmation', zh: '宣誓 / 郑重确认', group: 'types', slug: 'acknowledgment-vs-jurat',
    def: '前者带宗教意味，后者是不援引宗教的等效形式，法律效力相同，可自行选择。' },
  { en: 'Affiant', zh: '宣誓人', group: 'types', slug: 'acknowledgment-vs-jurat',
    def: '在 jurat 中作出宣誓并签署文件的人。',
    cite: 'Gov. Code §8202' },
  { en: 'Affidavit', zh: '宣誓书', group: 'types', slug: 'acknowledgment-vs-jurat',
    def: '宣誓人具结“所述属实”的书面声明。同一人声明、单身声明、健在证明多属此类。' },
  { en: 'Unsworn declaration', zh: '未经宣誓的声明', group: 'types', slug: 'acknowledgment-vs-jurat',
    def: '以“依伪证罪处罚”具结的书面声明。加州法律允许在多数情形下用它替代宣誓书。',
    cite: 'Code Civ. Proc. §2015.5' },
  { en: 'Certified copy', zh: '核证副本', group: 'types', slug: 'what-notaries-cannot-do',
    def: '由有权机关出具、证明与原件一致的副本。加州公证员能核证的只有授权委托书副本这一种。',
    cite: 'Probate Code §4307' },
  { en: 'Deposition', zh: '庭外取证', group: 'types', slug: 'california-notary-fees',
    def: '诉讼程序中在法庭外进行的证人取证，公证员可主持宣誓；收费另有法定标准。',
    cite: 'Gov. Code §8211' },
  { en: 'Power of Attorney (POA)', zh: '授权委托书', group: 'types', slug: 'china-power-of-attorney',
    def: '委托他人代为处理特定事务的文件。人在美国、事在国内时最常办的一类。' },

  // —— 当事人与身份 ——
  { en: 'Satisfactory evidence of identity', zh: '充分身份证明', group: 'people', slug: 'us-notary-vs-china-notary',
    def: '法律要求的身份核验标准。可接受证件由法条穷尽列举——中国护照在列，绿卡不在列。',
    cite: 'Civil Code §1185' },
  { en: 'Personally appeared', zh: '本人亲自到场', group: 'people', slug: 'what-notaries-cannot-do',
    def: '公证证词中的法定用语。签署人必须亲自出现在公证员面前，代办、视频、代签一律不成立。',
    cite: 'Civil Code §1189' },
  { en: 'Credible witness', zh: '可信证人', group: 'people',
    def: '签署人拿不出合规证件时的替代路径：由认识其本人的第三方向公证员宣誓证明其身份。法定条件较严。',
    cite: 'Civil Code §1185' },

  // —— 跨境使用 ——
  { en: 'Apostille', zh: '附加证明书', group: 'cross-border', slug: 'china-power-of-attorney',
    def: '1961 年海牙公约下的认证证书，由文件签发国的主管机关出具（加州为州务卿）。它认证的是签字人身份与印章，不审查文件内容。' },
  { en: 'Consular legalization', zh: '领事认证', group: 'cross-border', slug: 'us-notary-vs-china-notary',
    def: '旧流程。海牙公约 2023 年 11 月 7 日对中国生效后，中国驻美使领馆已停办该项业务。' },
  { en: 'Competent authority', zh: '主管机关', group: 'cross-border', slug: 'china-power-of-attorney',
    def: '有权签发附加证明书的机关。加州文件由加州州务卿签发。' },

  // —— 收费 ——
  { en: 'Statutory maximum fee', zh: '法定收费上限', group: 'fees', slug: 'california-notary-fees',
    def: '加州法律为各项公证订的收费天花板，按每个签名计而非每份文件。可以少收，不能多收。',
    cite: 'Gov. Code §8211' },
  { en: 'Travel fee', zh: '上门费 / 交通费', group: 'fees', slug: 'california-notary-fees',
    def: '上门服务的交通费用。不属于公证费，不受法定上限约束，但须事先报价并经客户同意。' },

  // —— 边界与合规 ——
  { en: 'Unauthorized practice of law (UPL)', zh: '未经授权执业法律', group: 'limits', slug: 'what-notaries-cannot-do',
    def: '没有加州律师执照就不得执业法律。这是公证员不能给法律意见、不能替你选公证类型的根本原因。',
    cite: 'Bus. & Prof. Code §6125' },
  { en: 'Direct financial or beneficial interest', zh: '直接财产利益', group: 'limits', slug: 'what-notaries-cannot-do',
    def: '公证员在一笔交易中有此利益时，不得就该交易办理公证。但以代理人、雇员、保险人、律师、托管方或放款方身份为当事人服务的，依法不视为有此利益。',
    cite: 'Gov. Code §8224' },
  { en: 'Certification of translation accuracy', zh: '翻译准确性证明', group: 'limits', slug: 'what-notaries-cannot-do',
    def: '由译者本人作出的声明。公证员公证的是译者的签名，不是译文准不准。' },
  { en: 'Immigration consultant', zh: '移民咨询师', group: 'limits', slug: 'what-notaries-cannot-do',
    def: '加州另设执照与保证金制度。非律师公证员不得自称移民专家，也不得代客户在移民表格上填写数据。',
    cite: 'Gov. Code §8223' },
  { en: 'Vital records', zh: '生命记录', group: 'limits', slug: 'what-notaries-cannot-do',
    def: '出生、死亡、婚姻等官方记录。其核证副本只能由州登记官、地方登记官或县书记官出具，公证员办不了。',
    cite: 'Health & Safety Code §103545' },
];
