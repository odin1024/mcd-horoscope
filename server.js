'use strict';

/**
 * server.js — 麦门星盘 HTTP 服务
 *
 * 能力：
 * - 托管前端页面（public/）
 * - POST /api/test：5 题答案 → 麦门星座人格 + 真实营养数据 + 今日麦门指引
 * - GET  /api/health：健康检查（含当前模式：REAL / MOCK）
 *
 * 运行：
 *   export MCD_MCP_TOKEN=你的Token   # 真实模式
 *   node server.js
 * 未配置 Token 时自动进入 MOCK（演示）模式，使用 examples/mock-data.json。
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const { McpClient } = require('./src/mcp-client');
const { PERSONAS, computePersona } = require('./src/persona');
const {
  parseNutritionToon,
  parseCampaignCalendar,
  buildOracle,
  matchNutrition,
} = require('./src/oracle');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');

const NUTRITION_TTL_MS = 60 * 60 * 1000; // 营养数据缓存 1 小时
const CAMPAIGN_TTL_MS = 30 * 60 * 1000; // 活动日历缓存 30 分钟

const MOCK_DATA = loadJson(path.join(ROOT, 'examples', 'mock-data.json'));
const client = new McpClient({ mockData: MOCK_DATA });

const nutritionCache = { data: null, at: 0 };
const campaignCache = { data: null, at: 0 };

/** 读取 JSON 文件（带友好报错） */
function loadJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`[mcd-horoscope] 读取 ${file} 失败: ${err.message}`);
    return {};
  }
}

/** 获取营养数据（带缓存） */
async function getNutrition() {
  const now = Date.now();
  if (nutritionCache.data && now - nutritionCache.at < NUTRITION_TTL_MS) {
    return nutritionCache.data;
  }
  const res = await client.callTool('list-nutrition-foods');
  const rows = parseNutritionToon(res.data);
  nutritionCache.data = rows;
  nutritionCache.at = now;
  return rows;
}

/** 获取活动日历（带缓存） */
async function getCampaign() {
  const now = Date.now();
  if (campaignCache.data && now - campaignCache.at < CAMPAIGN_TTL_MS) {
    return campaignCache.data;
  }
  const res = await client.callTool('campaign-calendar');
  const activities = parseCampaignCalendar(res.data);
  campaignCache.data = activities;
  campaignCache.at = now;
  return activities;
}

/** 处理 JSON 请求体 */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > 64 * 1024) {
        reject(new Error('请求体过大'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('请求体不是合法 JSON'));
      }
    });
    req.on('error', reject);
  });
}

/** 静态文件服务（防目录穿越） */
function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Forbidden');
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }
    const ext = path.extname(file).toLowerCase();
    const types = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.ico': 'image/x-icon',
    };
    res.writeHead(200, {
      'Content-Type': types[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

function sendJson(res, status, obj) {
  const payload = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

async function handleTest(req, res) {
  const body = await readJsonBody(req);
  const answers = body.answers;
  if (!Array.isArray(answers) || answers.length !== 5) {
    return sendJson(res, 400, { ok: false, error: 'answers 必须是长度为 5 的选项索引数组（0-3）' });
  }
  if (answers.some((a) => !Number.isInteger(a) || a < 0 || a > 3)) {
    return sendJson(res, 400, { ok: false, error: 'answers 每项必须是 0-3 的整数' });
  }

  try {
    const persona = computePersona(answers);
    const [nutritionList, activities] = await Promise.all([
      getNutrition().catch(() => []),
      getCampaign().catch(() => []),
    ]);
    const nutrition = matchNutrition(persona, nutritionList);
    const oracle = buildOracle(persona, activities);

    sendJson(res, 200, {
      ok: true,
      mock: client.isMock,
      persona: {
        id: persona.id,
        food: persona.food,
        title: persona.title,
        sign: persona.sign,
        dates: persona.dates,
        element: persona.element,
        motto: persona.motto,
        traits: persona.traits,
        lucky: persona.lucky,
        color: persona.color,
        icon: persona.icon,
      },
      nutrition: nutrition
        ? {
            productName: nutrition.productName,
            energyKcal: nutrition.energyKcal,
            protein: nutrition.protein,
            fat: nutrition.fat,
            carbohydrate: nutrition.carbohydrate,
            sodium: nutrition.sodium,
            calcium: nutrition.calcium,
          }
        : null,
      oracle,
    });
  } catch (err) {
    console.error('[mcd-horoscope] /api/test 失败:', err.message);
    sendJson(res, 502, {
      ok: false,
      error: err.message,
      hint: client.isMock
        ? 'Mock 模式执行失败（检查 examples/mock-data.json）'
        : '真实模式调用失败，请检查 MCD_MCP_TOKEN 与网络',
    });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);

  try {
    if (req.method === 'GET' && pathname === '/api/health') {
      return sendJson(res, 200, {
        ok: true,
        app: 'mcd-horoscope',
        version: '1.0.0',
        mock: client.isMock,
        tools: ['list-nutrition-foods', 'campaign-calendar'],
      });
    }
    if (req.method === 'POST' && pathname === '/api/test') {
      return await handleTest(req, res);
    }
    if (req.method === 'GET' && pathname === '/api/personas') {
      return sendJson(res, 200, {
        ok: true,
        personas: PERSONAS.map((p) => ({
          id: p.id,
          food: p.food,
          title: p.title,
          sign: p.sign,
          dates: p.dates,
          element: p.element,
          motto: p.motto,
          color: p.color,
          icon: p.icon,
        })),
      });
    }
    if (pathname.startsWith('/api/')) {
      return sendJson(res, 404, { ok: false, error: '接口不存在' });
    }
    return serveStatic(req, res, pathname);
  } catch (err) {
    console.error('[mcd-horoscope] 请求处理异常:', err.message);
    return sendJson(res, 500, { ok: false, error: err.message });
  }
});

server.listen(PORT, () => {
  const mode = client.isMock ? 'MOCK（模拟数据，未配置 Token）' : 'REAL（真实麦当劳 MCP）';
  console.log('========================================');
  console.log('  麦门星盘 mcd-horoscope v1.0.0');
  console.log(`  运行模式: ${mode}`);
  console.log(`  打开浏览器: http://localhost:${PORT}`);
  console.log('  配置真实 Token: export MCD_MCP_TOKEN=<你的Token>');
  console.log('========================================');
});
