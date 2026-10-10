'use strict';

/**
 * oracle.js — 麦门星盘的"神谕"引擎
 *
 * 职责：
 * 1. parseNutritionToon：解析 list-nutrition-foods 的 TOON 紧凑格式 → 餐品营养数组；
 * 2. parseCampaignCalendar：解析 campaign-calendar 返回的 Markdown 文本 → 结构化活动列表；
 * 3. buildOracle：结合人格、今日活动、日期生成"今日麦门指引"（确定性运势）。
 *
 * 说明：官方文档注明活动内容为营销文案，可能含表情符号；解析时保留文本、剔除 markdown 图片标签。
 */

/** 解析 TOON 格式的营养数据。
 *  示例输入：
 *  "[1]{productName,nutritionDescription,energyKj,energyKcal,protein,fat,carbohydrate,sodium,calcium}:\n 猪柳麦满分,null,1288,308,16,16,24,781,213"
 *  @returns {Array<Object>}
 */
function parseNutritionToon(text) {
  if (typeof text !== 'string' || !text.includes('{')) return [];
  const headerMatch = text.match(/\{([^}]+)\}\s*:/);
  if (!headerMatch) return [];

  const fields = headerMatch[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const body = text.slice(headerMatch.index + headerMatch[0].length);
  const rows = [];

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    // 跳过看起来像头部或非数据行（不以数字/引号/汉字开头的辅助行不处理，宽松处理）
    const tokens = line.split(',');
    const excess = tokens.length - fields.length;
    let name;
    let rest;
    if (excess > 0) {
      // 餐品名里可能含逗号：把多出的 token 合并回名称
      name = tokens.slice(0, excess + 1).join(',').trim();
      rest = tokens.slice(excess + 1);
    } else {
      name = (tokens[0] || '').trim();
      rest = tokens.slice(1);
    }
    const item = { productName: name };
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      if (f === 'productName') continue;
      const raw = (rest[i - 1] !== undefined ? rest[i - 1] : '').trim();
      item[f] = raw === '' || raw === 'null' || raw === 'undefined' ? null : toNumber(raw);
    }
    rows.push(item);
  }
  return rows;
}

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : v;
}

/**
 * 解析 campaign-calendar 的 Markdown 文本 → { dateLabel, activities: [{ title, content, image }] }
 * 文本结构（官方示例）：
 *   ### 当前时间：2025-12-09 14:48:42 ### 活动列表：
 *   #### 12月9日 今日
 *   - **活动标题**：xxx
 *   **活动内容介绍**：xxx
 *   **活动图片介绍**：<img ...>
 */
function parseCampaignCalendar(text) {
  if (typeof text !== 'string') return [];
  const marker = text.indexOf('### 活动列表');
  const body = marker >= 0 ? text.slice(marker) : text;

  const sections = body.split(/####\s+/).filter((s) => s.trim());
  const activities = [];

  for (const sec of sections) {
    const lines = sec.split(/\r?\n/).map((l) => l.trim());
    const head = lines[0] || '';
    // 头部形如 "12月9日 今日" / "12月8日 往期回顾"；某些文本中日期与标题可能同行，需宽松提取
    const dateMatch = head.match(/(\d{1,2}月\d{1,2}日)/);
    const statusMatch = head.match(/(今日|明天|昨日|昨天|今天|进行中|即将开始|即将到来|往期回顾|即将持续|未来)/);
    const dateLabel = dateMatch ? dateMatch[1] : head.split(/[\s\-—|:：]+/)[0].trim();
    const status = statusMatch ? statusMatch[1] : '';

    let title = '';
    let content = '';
    let image = '';
    for (const line of lines) {
      // 官方文本中标题/内容行可能带 "- " 列表前缀；个别文本标题与日期头同行，故用宽松前缀
      const t = line.match(/^.*?\*\*活动标题\*\*\s*[:：]\s*(.*)$/);
      if (t) { title = cleanMarkdown(t[1]); continue; }
      const c = line.match(/^.*?\*\*活动内容介绍\*\*\s*[:：]\s*(.*)$/);
      if (c) { content = cleanMarkdown(c[1]); continue; }
      const img = line.match(/^.*?\*\*活动图片介绍\*\*\s*[:：]\s*(.*)$/);
      if (img) {
        const src = img[1].match(/src="([^"]+)"/);
        if (src) image = src[1];
        continue;
      }
      // 官方文本中图片标签可能独立成行（位于"活动图片介绍"下一行）
      const imgTag = line.match(/<img[^>]*\bsrc="([^"]+)"/i);
      if (imgTag && !image) { image = imgTag[1]; }
    }
    if (title || content) {
      activities.push({ dateLabel, status, title, content, image });
    }
  }
  return activities;
}

/** 清洗 markdown 残留（图片标签、硬换行符 \、行尾多余符号） */
function cleanMarkdown(s) {
  return s
    .replace(/<img[^>]*>/gi, '')
    .replace(/\\/g, '')
    .replace(/[ \t]+$/g, '')
    .trim();
}

/** djb2 确定性哈希 → 0..mod-1 */
function hashOf(str, mod) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  }
  return h % mod;
}

const FORTUNES = [
  { level: '大吉', emoji: '▲▲▲', tip: '诸事皆宜，麦门护体，今天冲就完了。' },
  { level: '中吉', emoji: '▲▲', tip: '稳中有进，别贪快，按自己的节奏来。' },
  { level: '小吉', emoji: '▲', tip: '微调即顺，把小事做漂亮，好运自然来。' },
];

/**
 * 构建"今日麦门指引"。
 * @param {Object} persona 人格对象
 * @param {Array} activities 活动列表（可空）
 * @param {string} dateStr 日期字符串 yyyy-MM-dd（可空，默认本地当天）
 * @returns {Object} { fortune, fortuneTip, luckyActivity, luckyFood, advice, shareText }
 */
function buildOracle(persona, activities = [], dateStr) {
  const today = dateStr || new Date().toISOString().slice(0, 10);
  const fortune = FORTUNES[hashOf(today + ':' + persona.id, FORTUNES.length)];

  // 优先选"今日/进行中"的活动，否则取第一条
  let luckyActivity = null;
  if (Array.isArray(activities) && activities.length > 0) {
    const todayLike = activities.find((a) =>
      /今日|今天|进行中|即将开始/.test(`${a.dateLabel || ''} ${a.status || ''}`)
    );
    luckyActivity = todayLike || activities[0];
  }

  const shareText = [
    `【麦门星盘】我的麦门星座是「${persona.title}」`,
    `本命餐品：${persona.food}（${persona.sign} ${persona.dates}）`,
    `今日运势：${fortune.level}${fortune.tip}`,
    luckyActivity ? `今日麦门活动：${luckyActivity.title}` : '',
    '你也来测测你的麦门星座 →',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    fortune: fortune.level,
    fortuneEmoji: fortune.emoji,
    fortuneTip: fortune.tip,
    luckyActivity: luckyActivity ? { title: luckyActivity.title, content: luckyActivity.content } : null,
    luckyFood: persona.food,
    advice: persona.advice,
    shareText,
  };
}

/**
 * 在营养数据中匹配人格本命餐品。
 * 匹配规则：营养餐品名包含人格 food 关键词（如"巨无霸"），
 * 找不到时返回最近似的首条。
 */
function matchNutrition(persona, nutritionList) {
  if (!Array.isArray(nutritionList) || nutritionList.length === 0) return null;
  const key = persona.food.replace(/[（(].*?[)）]/g, '');
  const hit = nutritionList.find((n) => n.productName && n.productName.includes(key));
  if (hit) return hit;
  return nutritionList.find((n) => n.productName) || null;
}

module.exports = {
  parseNutritionToon,
  parseCampaignCalendar,
  buildOracle,
  matchNutrition,
  hashOf,
  cleanMarkdown,
};
