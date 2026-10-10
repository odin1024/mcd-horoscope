'use strict';

/**
 * persona.js — 麦门星座人格库
 *
 * 12 款人格对应 12 个麦当劳经典餐品与黄道十二宫，
 * 5 题快问快答通过确定性加权算法得出你的"麦门星座"。
 *
 * 设计约束：
 * - 全确定性：相同答案永远得到相同人格（便于测试、可复现）；
 * - 文案合规：只做正面、有梗、有网感的表达，不贬低品牌、不与其他品牌对比；
 * - 结构可扩展：新增人格只需在 PERSONAS 中追加条目。
 */

/** 12 款麦门星座人格 */
const PERSONAS = [
  {
    id: 'big-mac',
    food: '巨无霸',
    title: '巨无霸战略家',
    sign: '狮子座',
    dates: '7.23–8.22',
    element: '双层芝士 · 火',
    motto: '人生如巨无霸：两层都要，酱料拉满，从不空谈。',
    traits: ['目标感极强，敢想敢干', '对“分量”有执念，拒绝将就', '关键时刻稳稳托底', '天生的领队，点单自带主见'],
    lucky: '幸运色焦糖金，幸运数字 2——毕竟巨无霸有两层牛肉饼。',
    advice: '今天适合主动出击，把最难的活儿排在第一位，你扛得住。',
    color: '#C8102E',
    icon: '🍔',
  },
  {
    id: 'spicy',
    food: '麦辣鸡腿堡',
    title: '麦辣骑士',
    sign: '白羊座',
    dates: '3.21–4.19',
    element: '香辣 · 火',
    motto: '要辣就辣到冒汗，要冲就冲到第一。',
    traits: ['行动派，说走就走', '脾气直，藏不住事儿', '越有挑战越兴奋', '朋友眼里的气氛点燃器'],
    lucky: '幸运色辣椒红，幸运数字 3——麦辣三分钟热度也能烧成三倍效率。',
    advice: '今天别犹豫，想做的事立刻去做，第一反应往往就是最好的答案。',
    color: '#E03A2F',
    icon: '🌶️',
  },
  {
    id: 'fries',
    food: '薯条',
    title: '薯条哲学家',
    sign: '处女座',
    dates: '8.23–9.22',
    element: '金黄 · 土',
    motto: '看起来平平无奇，但谁离得开我？',
    traits: ['表面低调，内在讲究', '细节控，眼里容不下歪的薯条', '慢热但一旦认准就很长情', '总能发现别人忽略的小确幸'],
    lucky: '幸运色薯条金，幸运数字 1——一根薯条也是完整的快乐。',
    advice: '今天适合静下心打磨细节，你随手一抠就能做出别人做不到的精致。',
    color: '#F5A623',
    icon: '🍟',
  },
  {
    id: 'twister',
    food: '麦旋风',
    title: '麦旋风甜心',
    sign: '摩羯座',
    dates: '12.22–1.19',
    element: '冰甜 · 水',
    motto: '外表再冷，搅一搅都是甜的。',
    traits: ['外冷内热，反差感拉满', '甜而不腻，相处越久越香', '固执起来连奥利奥碎都掰不动', '对在乎的人无限宠'],
    lucky: '幸运色奶白，幸运数字 7——旋风的甜度刚好是七分甜。',
    advice: '今天试着把温柔拿出来晾一晾，你会发现大家都吃这一套。',
    color: '#8A6FB5',
    icon: '🍦',
  },
  {
    id: 'filet',
    food: '麦香鱼',
    title: '麦香鱼隐士',
    sign: '双鱼座',
    dates: '2.19–3.20',
    element: '鲜柔 · 水',
    motto: '温和不是软弱，是懒得跟你计较。',
    traits: ['性格温和，情绪稳定', '有自己的节奏，不随波逐流', '共情力超强，是绝佳的倾听者', '鲜而不腥，越品越有味道'],
    lucky: '幸运色海蓝，幸运数字 5——每周五的麦香鱼快乐。',
    advice: '今天适合远离噪音，把时间留给真正重要的人和事。',
    color: '#2E86AB',
    icon: '🐟',
  },
  {
    id: 'grill',
    food: '板烧鸡腿堡',
    title: '板烧实干家',
    sign: '金牛座',
    dates: '4.20–5.20',
    element: '炭火 · 土',
    motto: '不整虚的，铁板上的功夫见真章。',
    traits: ['务实稳重，说干就干', '靠谱到连汉堡都替你摆平', '对生活有烟火气的热爱', '认定的事，八头牛都拉不回来'],
    lucky: '幸运色炭火橙，幸运数字 8——实打实的，发得也实在。',
    advice: '今天适合闷头把事做完，成果会比任何话都有说服力。',
    color: '#D35400',
    icon: '🍗',
  },
  {
    id: 'nuggets',
    food: '麦乐鸡',
    title: '麦乐鸡社交家',
    sign: '双子座',
    dates: '5.21–6.21',
    element: '黄金脆 · 风',
    motto: '快乐要成双成对，最好来一盒。',
    traits: ['自来熟，走到哪热闹到哪', '分享欲爆棚，手里有鸡必分你', '灵活多变，见招拆招', '社交能量无限循环'],
    lucky: '幸运色脆皮金，幸运数字 5——一盒五块，快乐翻五倍。',
    advice: '今天适合组局，把朋友叫出来，快乐会自己翻倍。',
    color: '#E8A13A',
    icon: '🍿',
  },
  {
    id: 'cone',
    food: '甜筒',
    title: '甜筒艺术家',
    sign: '射手座',
    dates: '11.23–12.21',
    element: '轻盈 · 风',
    motto: '生活没那么多规矩，尖尖朝上快乐就好。',
    traits: ['自由随性，不按套路出牌', '灵感说来就来，创意常青', '在哪儿都能把日子过出花', '三秒钟就能哄好自己'],
    lucky: '幸运色奶油白，幸运数字 6——六元甜筒，六到飞起。',
    advice: '今天适合跳出计划，去尝试一件没做过的小事，会有惊喜。',
    color: '#F8C7CC',
    icon: '🍨',
  },
  {
    id: 'muffin',
    food: '麦满分',
    title: '麦满分晨型人',
    sign: '天秤座',
    dates: '9.23–10.23',
    element: '晨光 · 木',
    motto: '早餐吃好，一天都是满分。',
    traits: ['自律到可怕，闹钟一响就起', '追求均衡，面面俱到', '效率之王，别人刚醒他已赢一半', '温和但有原则，拒绝内耗'],
    lucky: '幸运色麦香棕，幸运数字 4——早八之前，一切皆可满分。',
    advice: '今天宜早起 15 分钟，把一天最重要的那件事先做完。',
    color: '#A67B4E',
    icon: '🥯',
  },
  {
    id: 'angus',
    food: '安格斯厚牛堡',
    title: '安格斯贵族',
    sign: '天蝎座',
    dates: '10.24–11.22',
    element: '厚实 · 火',
    motto: '可以不贵，但不能不讲究。',
    traits: ['品味在线，拒绝粗糙', '外冷内热，深藏不露', '对品质有种固执的坚持', '要么不做，做就做到顶配'],
    lucky: '幸运色厚牛排棕，幸运数字 10——十分挑剔，也十分靠谱。',
    advice: '今天适合把标准拉满，你认真起来的样子会惊艳所有人。',
    color: '#4A3728',
    icon: '🥩',
  },
  {
    id: 'coffee',
    food: '麦咖啡',
    title: '麦咖啡思考者',
    sign: '水瓶座',
    dates: '1.20–2.18',
    element: '清醒 · 风',
    motto: '世界再吵，我自有一杯清醒。',
    traits: ['理性冷静，脑子转得快', '脑洞清奇，想法总比别人超前半步', '独立，不轻易被带节奏', '咖啡因驱动型选手'],
    lucky: '幸运色咖啡深棕，幸运数字 9——九点后咖啡续命，思路如泉涌。',
    advice: '今天适合独处思考，把卡住的难题拿出来，喝一口再想，通了。',
    color: '#6F4E37',
    icon: '☕',
  },
  {
    id: 'happy',
    food: '开心乐园餐',
    title: '开心乐园收藏家',
    sign: '巨蟹座',
    dates: '6.22–7.22',
    element: '童心 · 水',
    motto: '快乐没有保质期，玩具也是。',
    traits: ['永远年轻，永远热泪盈眶', '收藏控，快乐要一件件攒起来', '内心柔软，特别念旧', '走到哪都把好心情带给别人'],
    lucky: '幸运色乐园红，幸运数字 0——从零开始，快乐随时加满。',
    advice: '今天适合做点“没用但开心”的事，快乐本身就是意义。',
    color: '#E84E1B',
    icon: '🎉',
  },
];

/** 5 题快问快答：每题 4 个选项，选项映射到人格加分 */
const QUESTIONS = [
  {
    id: 'q1',
    text: '周五晚上八点，你推开麦门，第一眼想看到什么？',
    options: [
      { text: '双层厚实、酱料快溢出来的巨无霸', scores: { 'big-mac': 2, angus: 1 } },
      { text: '金黄酥脆、堆成小山的薯条', scores: { fries: 2, filet: 1 } },
      { text: '火辣滚烫、咬一口就冒汗的麦辣鸡腿堡', scores: { spicy: 2, grill: 1 } },
      { text: '冰爽甜腻、倒杯不洒的麦旋风', scores: { twister: 2, cone: 1 } },
    ],
  },
  {
    id: 'q2',
    text: '你的生活节奏更像哪一种？',
    options: [
      { text: '早起赶第一班地铁，早餐必须吃好', scores: { muffin: 2, coffee: 1 } },
      { text: '深夜还在忙，靠一杯咖啡续命', scores: { coffee: 2, cone: 1 } },
      { text: '见缝插针随时开吃，快乐最重要', scores: { nuggets: 2, happy: 1 } },
      { text: '慢下来，认真对待每一餐', scores: { filet: 2, angus: 1, muffin: 1 } },
    ],
  },
  {
    id: 'q3',
    text: '朋友眼中的你，更接近哪个？',
    options: [
      { text: '气氛组担当，有我在就有笑声', scores: { nuggets: 2, happy: 2, twister: 1 } },
      { text: '靠谱的决策者，跟着我点单从不踩雷', scores: { 'big-mac': 2, grill: 2 } },
      { text: '有个性有锋芒，敢说敢做', scores: { spicy: 2 } },
      { text: '安静但有想法，深藏不露', scores: { fries: 2, filet: 1, coffee: 1 } },
    ],
  },
  {
    id: 'q4',
    text: '如果麦门出了隐藏菜单，你会怎么选？',
    options: [
      { text: '第一时间尝鲜，新品一个不落', scores: { cone: 2, twister: 1 } },
      { text: '只点经典，稳定不踩雷', scores: { grill: 2, 'big-mac': 1, angus: 1 } },
      { text: '研究搭配，找出最优解', scores: { muffin: 2, coffee: 1 } },
      { text: '分享给所有人，快乐加倍', scores: { happy: 2, nuggets: 1 } },
    ],
  },
  {
    id: 'q5',
    text: '点套餐时，你的第一标准是？',
    options: [
      { text: '好吃就完事，爽最重要', scores: { spicy: 2, twister: 1, cone: 1 } },
      { text: '性价比，吃饱又不贵', scores: { grill: 2, nuggets: 1 } },
      { text: '营养均衡，身体是革命的本钱', scores: { filet: 2, muffin: 1, happy: 1 } },
      { text: '品质体验，一分钱一分货', scores: { angus: 2, 'big-mac': 1 } },
    ],
  },
];

/**
 * 根据 5 题答案计算麦门星座人格（确定性算法）。
 * @param {number[]} answers 长度为 5 的选项索引数组，取值 0–3
 * @returns {Object} 人格对象（PERSONAS 中的一项）
 */
function computePersona(answers) {
  if (!Array.isArray(answers) || answers.length !== QUESTIONS.length) {
    throw new TypeError(`answers 必须是长度为 ${QUESTIONS.length} 的数组`);
  }

  const scores = {};
  for (const p of PERSONAS) scores[p.id] = 0;

  for (let i = 0; i < QUESTIONS.length; i++) {
    const idx = answers[i];
    const option = QUESTIONS[i].options[idx];
    if (!option) {
      throw new RangeError(`第 ${i + 1} 题答案越界: ${idx}`);
    }
    for (const [pid, score] of Object.entries(option.scores)) {
      scores[pid] += score;
    }
  }

  // 取最高分；并列取 PERSONAS 顺序中靠前的（确定性）
  let best = PERSONAS[0];
  let bestScore = -1;
  for (const p of PERSONAS) {
    if (scores[p.id] > bestScore) {
      bestScore = scores[p.id];
      best = p;
    }
  }
  return best;
}

/** 返回人格查询表（id → persona），供服务端快速定位 */
function personaById(id) {
  return PERSONAS.find((p) => p.id === id) || null;
}

module.exports = { PERSONAS, QUESTIONS, computePersona, personaById };
