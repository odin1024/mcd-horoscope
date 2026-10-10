'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { McpClient } = require('../src/mcp-client');
const {
  parseNutritionToon,
  parseCampaignCalendar,
  buildOracle,
  matchNutrition,
  hashOf,
} = require('../src/oracle');

/* ---------------- MCP 客户端（Mock 模式） ---------------- */

test('Mock 模式：无 Token 时自动进入 Mock', () => {
  const c = new McpClient({ token: '', mockData: {} });
  assert.equal(c.isMock, true);
});

test('Mock 模式：工具调用返回模拟文本并正确解包', async () => {
  const c = new McpClient({
    token: '',
    mockData: { 'campaign-calendar': '### 活动列表： #### 10月10日 今日 - **活动标题**：会员日' },
  });
  const res = await c.callTool('campaign-calendar');
  assert.equal(res.ok, true);
  assert.ok(typeof res.data === 'string');
  assert.ok(res.data.includes('会员日'));
});

test('Mock 模式：JSON 信封正确解包出 data', async () => {
  const c = new McpClient({
    token: '',
    mockData: {
      'query-my-account': { success: true, code: 200, message: 'ok', data: { availablePoint: '1000' } },
    },
  });
  const res = await c.callTool('query-my-account');
  assert.equal(res.ok, true);
  assert.equal(res.data.availablePoint, '1000');
});

test('真实模式解析：MCP 信封 + JSON data', () => {
  const c = new McpClient({ token: 'x', mock: true });
  const { ok, data } = c._unwrap(
    JSON.stringify({ success: true, code: 200, message: 'ok', data: { a: 1 } }),
    {}
  );
  assert.equal(ok, true);
  assert.deepEqual(data, { a: 1 });
});

test('真实模式解析：纯文本返回原样', () => {
  const c = new McpClient({ token: 'x', mock: true });
  const { ok, data } = c._unwrap('### 麦麦省优惠券列表： - 优惠券标题：11.9元麦乐鸡', {});
  assert.equal(ok, true);
  assert.equal(data, '### 麦麦省优惠券列表： - 优惠券标题：11.9元麦乐鸡');
});

test('真实模式解析：官方"字段说明包装"文本内嵌 JSON 正确解包', () => {
  const c = new McpClient({ token: 'x', mock: true });
  const wrapped =
    '# API Response Information\n\nBelow is the response...\n\n## Original Response\n\n{"success":true,"code":200,"message":"ok","data":"[1]{a,b}:\\n  餐品,1,2"}';
  const { ok, data } = c._unwrap(wrapped, {});
  assert.equal(ok, true);
  assert.equal(typeof data, 'string');
  assert.ok(data.includes('餐品'));
});

/* ---------------- TOON 营养解析 ---------------- */

test('TOON 解析：官方示例格式', () => {
  const text =
    '[1]{productName,nutritionDescription,energyKj,energyKcal,protein,fat,carbohydrate,sodium,calcium}:\n 猪柳麦满分,null,1288,308,16,16,24,781,213';
  const rows = parseNutritionToon(text);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].productName, '猪柳麦满分');
  assert.equal(rows[0].energyKcal, 308);
  assert.equal(rows[0].protein, 16);
  assert.equal(rows[0].sodium, 781);
});

test('TOON 解析：多行数据', () => {
  const text =
    '[1]{productName,nutritionDescription,energyKj,energyKcal,protein,fat,carbohydrate,sodium,calcium}:\n 巨无霸,null,2210,528,27,27,45,900,180\n 麦辣鸡腿堡,null,2080,497,26,24,44,1020,150';
  const rows = parseNutritionToon(text);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].productName, '巨无霸');
  assert.equal(rows[1].productName, '麦辣鸡腿堡');
  assert.equal(rows[1].energyKcal, 497);
});

test('TOON 解析：空/非法输入返回空数组', () => {
  assert.deepEqual(parseNutritionToon(''), []);
  assert.deepEqual(parseNutritionToon(null), []);
  assert.deepEqual(parseNutritionToon('没有花括号的文本'), []);
});

/* ---------------- 活动日历解析 ---------------- */

test('活动日历解析：官方示例结构', () => {
  const text =
    '### 当前时间：2025-12-09 14:48:42 ### 活动列表： #### 12月9日 今日\n- **活动标题**：⏳倒计时！超人气回归\\\n **活动内容介绍**：🍔松软芝芝火腿扒堡搭配鲜萃咖啡 💥一堡+一咖啡！\\\n **活动图片介绍**：\\\n <img src="https://example.com/a.png" alt="" height="300" width="auto">';
  const acts = parseCampaignCalendar(text);
  assert.equal(acts.length, 1);
  assert.equal(acts[0].dateLabel, '12月9日');
  assert.ok(acts[0].title.includes('超人气回归'));
  assert.equal(acts[0].image, 'https://example.com/a.png');
});

test('活动日历解析：标题与日期同行（宽松兼容）', () => {
  const text =
    '### 活动列表： #### 10月10日 今日 - **活动标题**：会员日\\\n **活动内容介绍**：内容B';
  const acts = parseCampaignCalendar(text);
  assert.equal(acts.length, 1);
  assert.equal(acts[0].dateLabel, '10月10日');
  assert.equal(acts[0].title, '会员日');
});

test('活动日历解析：多日多活动', () => {
  const text =
    '### 活动列表： #### 10月9日 往期回顾\n- **活动标题**：预热活动\\\n **活动内容介绍**：内容A #### 10月10日 今日\n- **活动标题**：会员日\\\n **活动内容介绍**：内容B';
  const acts = parseCampaignCalendar(text);
  assert.equal(acts.length, 2);
  assert.equal(acts[0].dateLabel, '10月9日');
  assert.equal(acts[1].dateLabel, '10月10日');
  assert.equal(acts[1].title, '会员日');
});

test('活动日历解析：空输入返回空数组', () => {
  assert.deepEqual(parseCampaignCalendar(''), []);
  assert.deepEqual(parseCampaignCalendar(null), []);
});

/* ---------------- 指引生成 ---------------- */

test('buildOracle：确定性运势 + 幸运活动 + 分享文案', () => {
  const persona = {
    id: 'big-mac',
    food: '巨无霸',
    title: '巨无霸战略家',
    sign: '狮子座',
    dates: '7.23–8.22',
    lucky: '幸运色焦糖金',
    advice: '今天适合主动出击',
    share: '测测你的麦门星座',
    color: '#C8102E',
  };
  const acts = [
    { dateLabel: '10月10日 今日', title: '会员日', content: '积分双倍' },
    { dateLabel: '10月11日 即将开始', title: '新品上新', content: '新茶' },
  ];
  const o1 = buildOracle(persona, acts, '2026-10-10');
  const o2 = buildOracle(persona, acts, '2026-10-10');
  assert.deepEqual(o1, o2, '同一天结果必须一致（确定性）');
  assert.ok(['大吉', '中吉', '小吉'].includes(o1.fortune));
  assert.equal(o1.luckyActivity.title, '会员日', '应优先选中“今日”活动');
  assert.ok(o1.shareText.includes('巨无霸战略家'));
  assert.ok(o1.shareText.includes('会员日'));
});

test('buildOracle：不同日期运势可能不同且无活动时优雅降级', () => {
  const persona = { id: 'fries', food: '薯条', title: '薯条哲学家', lucky: 'x', advice: 'y', share: 'z' };
  const o = buildOracle(persona, [], '2026-10-10');
  assert.ok(['大吉', '中吉', '小吉'].includes(o.fortune));
  assert.equal(o.luckyActivity, null);
  assert.ok(o.shareText.length > 0);
});

test('matchNutrition：按本命餐品关键词匹配', () => {
  const persona = { id: 'big-mac', food: '巨无霸' };
  const list = [
    { productName: '麦辣鸡腿堡', energyKcal: 497 },
    { productName: '巨无霸', energyKcal: 528 },
  ];
  const hit = matchNutrition(persona, list);
  assert.equal(hit.productName, '巨无霸');
  assert.equal(hit.energyKcal, 528);
});

test('hashOf：确定性且范围正确', () => {
  assert.equal(hashOf('a', 3), hashOf('a', 3));
  for (let i = 0; i < 20; i++) {
    const v = hashOf('seed' + i, 3);
    assert.ok(v >= 0 && v < 3);
  }
});
