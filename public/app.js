'use strict';

/**
 * app.js — 麦门星盘前端逻辑（视觉升级版）
 * 人格图腾 / 营养环形图 / 运势等级光晕 / 12 人格图谱
 */

const state = {
  answers: [],
  step: 0,
  nickname: '',
  personas: [],
};

const $ = (sel) => document.querySelector(sel);
const viewHome = $('#view-home');
const viewQuiz = $('#view-quiz');
const viewResult = $('#view-result');
const viewGallery = $('#view-gallery');

/* ---------- 模式徽标 ---------- */
fetch('/api/health')
  .then((r) => r.json())
  .then((d) => {
    if (d && d.mock) {
      const badge = $('#mode-badge');
      badge.textContent = '演示模式（模拟数据）';
      badge.hidden = false;
    }
  })
  .catch(() => {});

/* ---------- 首页 ---------- */
$('#btn-start').addEventListener('click', () => {
  state.nickname = $('#nickname').value.trim();
  state.answers = [];
  state.step = 0;
  showView(viewHome, false);
  showView(viewResult, false);
  showView(viewGallery, false);
  showView(viewQuiz, true);
  renderQuiz();
});

$('#nickname').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('#btn-start').click();
});

function showView(view, show) {
  view.hidden = !show;
}

/* ---------- 答题 ---------- */
function renderQuiz() {
  const q = QUESTIONS[state.step];
  $('#quiz-progress-text').textContent = `${state.step + 1} / ${QUESTIONS.length}`;
  $('#quiz-progress-fill').style.width = `${((state.step + 1) / QUESTIONS.length) * 100}%`;
  $('#quiz-question').textContent = q.text;
  const box = $('#quiz-options');
  box.innerHTML = '';
  q.options.forEach((opt, idx) => {
    const btn = document.createElement('button');
    btn.className = 'quiz-option';
    btn.textContent = opt;
    btn.addEventListener('click', () => {
      state.answers.push(idx);
      if (state.answers.length < QUESTIONS.length) {
        state.step += 1;
        renderQuiz();
      } else {
        submitTest();
      }
    });
    box.appendChild(btn);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- 提交并渲染结果 ---------- */
async function submitTest() {
  showView(viewQuiz, false);
  try {
    const res = await fetch('/api/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: state.answers }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || '服务异常');
    renderResult(data);
    showView(viewResult, true);
  } catch (err) {
    alert('抱歉，占卜失败：' + err.message);
    state.answers = [];
    state.step = 0;
    showView(viewHome, true);
  }
}

function renderResult(d) {
  const p = d.persona;
  const n = d.nutrition;
  const o = d.oracle;

  document.documentElement.style.setProperty('--card-color', p.color || '#DA291C');

  $('#res-icon').textContent = p.icon || '🍔';
  $('#res-kicker').textContent = `${state.nickname ? state.nickname + ' · ' : ''}你的麦门星座`;
  $('#res-title').textContent = p.title;
  $('#res-food').textContent = `本命餐品：${p.food}`;
  $('#res-sign').textContent = `${p.sign} ${p.dates} · ${p.element}`;
  $('#res-motto').textContent = `“${p.motto}”`;

  const traits = $('#res-traits');
  traits.innerHTML = '';
  p.traits.forEach((t) => {
    const s = document.createElement('span');
    s.textContent = t;
    traits.appendChild(s);
  });

  renderNutrition(n, p);

  // 运势等级
  const fortune = $('#res-fortune');
  const levelClass = o && o.fortune === '大吉' ? 'level-daiji' : o && o.fortune === '中吉' ? 'level-zhongji' : 'level-xiaoji';
  fortune.className = 'oracle-fortune ' + levelClass;
  fortune.innerHTML = o
    ? `<span>今日运势：</span><span class="fortune-mark">${o.fortuneEmoji || ''} ${o.fortune || ''}</span><small>${o.fortuneTip || ''}</small>`
    : '今日运势：暂无';

  $('#res-activity').innerHTML = o && o.luckyActivity
    ? `今日麦门活动：<b>${o.luckyActivity.title}</b>`
    : '';
  $('#res-advice').textContent = o ? `今日指引：${o.advice}` : '';
  $('#res-lucky').textContent = `幸运提示：${p.lucky}`;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- 营养可视化：环形图 + 占比条 ---------- */
function renderNutrition(n, p) {
  const box = $('#res-nutrition');
  if (!n || n.energyKcal == null) {
    box.style.display = 'none';
    return;
  }
  box.style.display = '';

  const dailyKcal = 2000; // 成人每日能量参考（估算口径，文案中已注明）
  const ratio = Math.min(1, n.energyKcal / dailyKcal);
  const circumference = 2 * Math.PI * 50;
  const svg = $('#nut-ring');
  svg.innerHTML = `
    <circle class="nut-ring-track" cx="60" cy="60" r="50"></circle>
    <circle class="nut-ring-fill" cx="60" cy="60" r="50"
      stroke-dasharray="${circumference}"
      stroke-dashoffset="${circumference}" data-target="${(1 - ratio) * circumference}"></circle>`;
  $('#nut-ring-v').textContent = n.energyKcal;

  const setBar = (id, v) => {
    const el = $(id);
    el.style.width = '0%';
    requestAnimationFrame(() => { el.style.width = v + '%'; });
  };
  // 相对本餐三项最大值的比例，仅作视觉排布，数值以右侧克数为准
  const maxG = Math.max(n.protein || 0, n.fat || 0, n.carbohydrate || 0) || 1;
  setBar('#nut-bar-protein', ((n.protein || 0) / maxG) * 100);
  setBar('#nut-bar-fat', ((n.fat || 0) / maxG) * 100);
  setBar('#nut-bar-carb', ((n.carbohydrate || 0) / maxG) * 100);
  $('#nut-bar-protein-v').textContent = (n.protein ?? '-') + 'g';
  $('#nut-bar-fat-v').textContent = (n.fat ?? '-') + 'g';
  $('#nut-bar-carb-v').textContent = (n.carbohydrate ?? '-') + 'g';
  $('#nut-note').textContent = `能量占成人每日参考摄入（2000 千卡）约 ${Math.round(ratio * 100)}% · 数据来自麦当劳 MCP`;

  // 环形动画（依赖下次绘制）
  setTimeout(() => {
    const fill = svg.querySelector('.nut-ring-fill');
    if (fill) fill.setAttribute('stroke-dashoffset', fill.dataset.target);
  }, 60);
}

/* ---------- 12 人格图谱 ---------- */
async function openGallery() {
  if (state.personas.length === 0) {
    try {
      const res = await fetch('/api/personas');
      const d = await res.json();
      state.personas = (d && d.personas) || [];
    } catch { state.personas = []; }
  }
  const grid = $('#gallery-grid');
  grid.innerHTML = '';
  if (state.personas.length === 0) {
    grid.innerHTML = '<div class="empty-tip" style="grid-column:1/-1;text-align:center;color:#8A8178;padding:20px">人格数据暂不可用</div>';
  } else {
    state.personas.forEach((p) => {
      const item = document.createElement('div');
      item.className = 'g-item';
      item.style.setProperty('--g-color', p.color || '#DA291C');
      item.innerHTML = `
        <span class="g-icon">${p.icon || '🍔'}</span>
        <div class="g-title">${p.title}</div>
        <div class="g-food">本命 · ${p.food}</div>
        <div class="g-sign">${p.sign} ${p.dates}</div>`;
      grid.appendChild(item);
    });
  }
  showView(viewResult, false);
  showView(viewQuiz, false);
  showView(viewGallery, true);
  window.scrollTo({ top: 0 });
}

$('#btn-gallery').addEventListener('click', openGallery);
$('#btn-gallery-back').addEventListener('click', () => {
  showView(viewGallery, false);
  showView(viewHome, true);
});

/* ---------- 分享与重测 ---------- */
$('#btn-share').addEventListener('click', async () => {
  const icon = document.querySelector('#res-icon').textContent;
  const text = `【麦门星盘】${state.nickname ? state.nickname + ' 的' : ''}麦门星座揭晓：
${icon} ${document.querySelector('#res-title').textContent}（${document.querySelector('#res-food').textContent}）
今日运势：${document.querySelector('#res-fortune').textContent.replace('今日运势：', '')}
你也来测测你的麦门星座 → https://github.com/odin1024/mcd-horoscope`;
  const tip = $('#share-tip');
  try {
    await copyText(text);
  } catch {
    fallbackCopy(text);
  }
  tip.hidden = false;
  setTimeout(() => { tip.hidden = true; }, 2600);
});

$('#btn-retry').addEventListener('click', () => {
  state.answers = [];
  state.step = 0;
  showView(viewResult, false);
  showView(viewQuiz, false);
  showView(viewGallery, false);
  showView(viewHome, true);
  window.scrollTo({ top: 0 });
});

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
}

/* 题库（与后端 src/persona.js 保持一致） */
const QUESTIONS = [
  { text: '周五晚上八点，你推开麦门，第一眼想看到什么？', options: ['双层厚实、酱料快溢出来的巨无霸', '金黄酥脆、堆成小山的薯条', '火辣滚烫、咬一口就冒汗的麦辣鸡腿堡', '冰爽甜腻、倒杯不洒的麦旋风'] },
  { text: '你的生活节奏更像哪一种？', options: ['早起赶第一班地铁，早餐必须吃好', '深夜还在忙，靠一杯咖啡续命', '见缝插针随时开吃，快乐最重要', '慢下来，认真对待每一餐'] },
  { text: '朋友眼中的你，更接近哪个？', options: ['气氛组担当，有我在就有笑声', '靠谱的决策者，跟着我点单从不踩雷', '有个性有锋芒，敢说敢做', '安静但有想法，深藏不露'] },
  { text: '如果麦门出了隐藏菜单，你会怎么选？', options: ['第一时间尝鲜，新品一个不落', '只点经典，稳定不踩雷', '研究搭配，找出最优解', '分享给所有人，快乐加倍'] },
  { text: '点套餐时，你的第一标准是？', options: ['好吃就完事，爽最重要', '性价比，吃饱又不贵', '营养均衡，身体是革命的本钱', '品质体验，一分钱一分货'] },
];
