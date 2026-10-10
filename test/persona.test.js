'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PERSONAS,
  QUESTIONS,
  computePersona,
  personaById,
} = require('../src/persona');

test('题库结构：5 题 × 4 选项，且每题选项都有分数映射', () => {
  assert.equal(QUESTIONS.length, 5);
  for (const q of QUESTIONS) {
    assert.equal(q.options.length, 4);
    for (const opt of q.options) {
      assert.ok(opt.scores && Object.keys(opt.scores).length >= 1, '选项必须有分数映射');
      for (const pid of Object.keys(opt.scores)) {
        assert.ok(personaById(pid), `分数映射指向不存在的人格: ${pid}`);
      }
    }
  }
});

test('人格库：12 款人格字段完整', () => {
  assert.equal(PERSONAS.length, 12);
  const ids = new Set();
  for (const p of PERSONAS) {
    assert.ok(p.id && p.food && p.title && p.sign && p.dates);
    assert.ok(p.element && p.motto && Array.isArray(p.traits) && p.traits.length >= 3);
    assert.ok(p.lucky && p.advice && p.color);
    assert.ok(!ids.has(p.id), `人格 id 重复: ${p.id}`);
    ids.add(p.id);
  }
});

test('确定性：相同答案两次计算结果一致', () => {
  const answers = [0, 1, 2, 3, 0];
  assert.equal(computePersona(answers).id, computePersona(answers).id);
});

test('所有答案组合都返回有效人格（无抛错、无 undefined）', () => {
  const total = Math.pow(4, QUESTIONS.length);
  let combinations = 0;
  const seen = new Set();
  const recurse = (idx, acc) => {
    if (idx === QUESTIONS.length) {
      combinations += 1;
      const p = computePersona(acc);
      assert.ok(p && p.id);
      seen.add(p.id);
      return;
    }
    for (let i = 0; i < 4; i++) {
      recurse(idx + 1, acc.concat(i));
    }
  };
  recurse(0, []);
  assert.equal(combinations, total, '应枚举全部组合');
  assert.ok(seen.size >= 10, `人格覆盖不足：只覆盖 ${seen.size}/12`);
});

test('人格覆盖：枚举后 12 款人格均应可达', () => {
  const seen = new Set();
  const recurse = (idx, acc) => {
    if (idx === QUESTIONS.length) {
      seen.add(computePersona(acc).id);
      return;
    }
    for (let i = 0; i < 4; i++) recurse(idx + 1, acc.concat(i));
  };
  recurse(0, []);
  const missing = PERSONAS.map((p) => p.id).filter((id) => !seen.has(id));
  assert.equal(missing.length, 0, `以下人格无法通过任何答案组合获得: ${missing.join(', ')}`);
});

test('非法输入：答案长度错误抛 TypeError', () => {
  assert.throws(() => computePersona([0, 1, 2]), TypeError);
  assert.throws(() => computePersona([]), TypeError);
});

test('非法输入：选项越界抛 RangeError', () => {
  assert.throws(() => computePersona([0, 1, 2, 3, 4]), RangeError);
  assert.throws(() => computePersona([-1, 0, 0, 0, 0]), RangeError);
});

test('典型答案可复现（回归锚点）', () => {
  // 全选第一个选项 → 麦旋风系得分最高（twister）
  assert.equal(computePersona([0, 0, 0, 0, 0]).id, 'twister');
  // 全选第二个选项 → 板烧实干家（grill）
  assert.equal(computePersona([1, 1, 1, 1, 1]).id, 'grill');
  // 巨无霸战略家专属组合
  assert.equal(computePersona([0, 0, 1, 1, 3]).id, 'big-mac');
  // 甜筒艺术家专属组合
  assert.equal(computePersona([3, 1, 2, 0, 0]).id, 'cone');
});
