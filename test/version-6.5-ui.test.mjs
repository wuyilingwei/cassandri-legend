import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];

function loadComparisonEngine() {
  const element = { classList: { add() {}, remove() {}, toggle() {} } };
  const storage = new Map();
  const context = {
    Math,
    Number,
    Object,
    Array,
    JSON,
    console,
    setTimeout: () => 0,
    clearTimeout() {},
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    document: {
      getElementById: () => element,
      createElement: () => ({ className: '', textContent: '', appendChild() {}, classList: element.classList }),
      addEventListener() {},
    },
  };
  const instrumented = script.replace(/initApp\(\);\s*$/, `
    globalThis.__comparison = {
      deriveBuild, compareCandidate, equipmentRecommendationHtml, percentDeltaHtml,
      trendGlyph, getDropRecommendation, snapshotRun, validateRunSnapshot, writeRunSave, readRunSave,
      getSurvivalPressure, classifyRecommendation,
      setState({ player: playerState, enemy: enemyState, slots }) {
        Object.assign(player, playerState);
        player.slots = slots;
        Object.assign(enemy, enemyState);
        gameState = "battle";
      },
      slots: () => JSON.stringify(player.slots),
      setLastBattle(target) { lastBattleSnapshot = target; },
    };
  `);
  vm.createContext(context);
  vm.runInContext(instrumented, context);
  return context.__comparison;
}

function loadInteractiveEngine() {
  const storage = new Map();
  const elements = new Map();
  function makeElement() {
    return {
      hidden: false,
      innerHTML: '',
      textContent: '',
      scrollTop: 0,
      scrollHeight: 0,
      style: {},
      children: [],
      classList: { add() {}, remove() {}, toggle() {} },
      appendChild(child) { this.children.push(child); },
      append(child) { this.children.push(child); },
      prepend(child) { this.children.unshift(child); },
    };
  }
  const context = {
    Math,
    Number,
    Object,
    Array,
    JSON,
    console,
    setTimeout: () => 0,
    clearTimeout() {},
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    document: {
      getElementById: (id) => {
        if (!elements.has(id)) elements.set(id, makeElement());
        return elements.get(id);
      },
      createElement: makeElement,
      querySelectorAll: () => [],
      addEventListener() {},
    },
  };
  const instrumented = script.replace(/initApp\(\);\s*$/, `
    globalThis.__interactive = {
      openShop, showLootChoice, openSaveManager, deferLootChoice, resumeLootChoice,
      renderReplacementChoices, showSetInfo, openSettings, closeSettings,
      setState({ player: playerState, enemy: enemyState, slots, state = "battle" }) {
        Object.assign(player, playerState);
        player.slots = slots;
        Object.assign(enemy, enemyState);
        gameState = state;
      },
      element(id) { return document.getElementById(id); },
      paused() { return gamePaused; },
    };
  `);
  vm.createContext(context);
  vm.runInContext(instrumented, context);
  return context.__interactive;
}

test('6.5 page keeps restored UI, comparison, and battle scene markers', () => {
  new Function(script);
  for (const marker of [
    'id="welcomeOverlay"',
    'id="battleArena"',
    'id="shopOverlay"',
    'id="saveOverlay"',
    'id="lootOverlay"',
    'id="setOverlay"',
    '#settingsOverlay{z-index:200;}',
    'function deriveBuild(slots)',
    'function snapshotRun()',
    'function deferLootChoice()',
    'function openSettings()',
    'function getDropRecommendation(items)',
    'function equipmentRecommendationHtml(item)',
    'function showBattleFeedback(side,text,type="damage")',
    '#terminal-wrap #battleArena',
  ]) assert.ok(html.includes(marker), `missing ${marker}`);
});

test('equipment comparison is pure and highlights a light one-percent decrease', () => {
  const engine = loadComparisonEngine();
  const equipped = { name: '守望短剑', element: '火', atk: 20, hp: 50, bj: 0.04, bs: 0.05, crt: 0.02, trait: null };
  const candidate = { name: '厚重骨盾', element: '水', atk: 18, hp: 90, bj: 0.03, bs: 0.05, crt: 0.02, trait: null };
  engine.setState({
    player: { job: '战士', blessing: '战士的祝福', blessAtkAdd: 0, blessHpAdd: 0, blessBjAdd: 0, blessBsAdd: 0, blessCrtAdd: 0, permAtkAdd: 0, permHpAdd: 0, wave: 4 },
    enemy: { name: '测试敌人', hp: 800, maxHp: 800, atk: 100, traits: [], shield: 0 },
    slots: [equipped, null, null, null],
  });
  const before = engine.slots();
  const comparison = engine.compareCandidate(candidate, 0);
  assert.equal(engine.slots(), before, 'preview must not mutate real slots');
  assert.ok(Number.isFinite(comparison.damageDelta));
  assert.ok(Number.isFinite(comparison.survivalDelta));
  const recommendation = engine.equipmentRecommendationHtml(candidate);
  assert.match(recommendation, /输出/);
  assert.match(recommendation, /生存/);
  assert.match(engine.percentDeltaHtml(-0.01), /轻微下降/);
  assert.match(engine.percentDeltaHtml(-0.01), /delta-slight/);
});

test('drop recommendation selects one item against the previous battle and grades change with triangles', () => {
  const engine = loadComparisonEngine();
  const equipped = { name: '旧剑', element: '火', atk: 20, hp: 40, bj: 0.02, bs: 0.05, crt: 0.01, trait: null };
  const weakDrop = { name: '破布', element: '水', atk: 10, hp: 10, bj: 0, bs: 0, crt: 0, trait: null };
  const strongDrop = { name: '雷鸣斧', element: '雷', atk: 80, hp: 140, bj: 0.08, bs: 0.15, crt: 0.04, trait: null };
  engine.setState({
    player: { job: '战士', blessing: '战士的祝福', blessAtkAdd: 0, blessHpAdd: 0, blessBjAdd: 0, blessBsAdd: 0, blessCrtAdd: 0, permAtkAdd: 0, permHpAdd: 0, wave: 7 },
    enemy: { name: '已倒下的怪物', hp: 0, maxHp: 1, atk: 1, traits: [], shield: 0 },
    slots: [equipped, null, null, null],
  });
  engine.setLastBattle({ name: '巨岩兽', hp: 2600, maxHp: 2600, atk: 320, traits: [] });
  const choice = engine.getDropRecommendation([weakDrop, strongDrop]);
  assert.equal(choice.index, 1, 'the best item is selected from both drops');
  assert.doesNotMatch(engine.equipmentRecommendationHtml(strongDrop), /巨岩兽/);
  assert.equal(engine.trendGlyph(0.01), '▲');
  assert.equal(engine.trendGlyph(-0.05), '▼▼');
  assert.equal(engine.trendGlyph(0.15), '▲▲▲');
  const snapshot = engine.snapshotRun();
  assert.equal(snapshot.state, 'battle');
  assert.equal(engine.validateRunSnapshot(snapshot).player.job, '战士');
  assert.equal(engine.writeRunSave('1').ok, true);
  assert.equal(engine.readRunSave('1').state, 'battle');
});

test('survival pressure rejects a fragile damage-only replacement', () => {
  const engine = loadComparisonEngine();
  const equipped = { name: '厚甲', element: '水', atk: 10, hp: 160, bj: 0, bs: 0, crt: 0, trait: null };
  const candidate = { name: '薄刃', element: '火', atk: 120, hp: 0, bj: 0, bs: 0, crt: 0, trait: null };
  engine.setState({
    player: { job: '战士', blessing: '战士的祝福', blessAtkAdd: 0, blessHpAdd: 0, blessBjAdd: 0, blessBsAdd: 0, blessCrtAdd: 0, permAtkAdd: 0, permHpAdd: 0, wave: 8 },
    enemy: { name: '重击兽', hp: 1000, maxHp: 1000, atk: 900, traits: [], shield: 0 },
    slots: [equipped, null, null, null],
  });
  const comparison = engine.compareCandidate(candidate, 0);
  assert.equal(engine.getSurvivalPressure(comparison.current).level, 'critical');
  assert.match(engine.classifyRecommendation(comparison).text, /生存压力高/);
});

test('shop, save, and loot interactions render inside modal overlays', () => {
  const engine = loadInteractiveEngine();
  engine.openShop();
  assert.equal(engine.element('shopOverlay').hidden, false);
  assert.match(engine.element('shopContent').innerHTML, /美味的鸡蛋/);

  const firstDrop = { name: '风蚀短剑', element: '火', atk: 30, hp: 35, bj: 0.02, bs: 0.04, crt: 0.01, trait: null };
  const secondDrop = { name: '守望护符', element: '水', atk: 18, hp: 90, bj: 0.01, bs: 0.02, crt: 0.04, trait: null };
  engine.setState({
    player: { job: '战士', blessing: '战士的祝福', blessAtkAdd: 0, blessHpAdd: 0, blessBjAdd: 0, blessBsAdd: 0, blessCrtAdd: 0, permAtkAdd: 0, permHpAdd: 0, wave: 5 },
    enemy: { name: '试炼兽', hp: 0, maxHp: 1200, atk: 150, traits: [], shield: 0 },
    slots: [null, null, null, null],
    state: 'loot',
  });
  engine.showLootChoice(firstDrop, secondDrop, 'loot');
  assert.equal(engine.element('lootOverlay').hidden, false);
  assert.match(engine.element('lootContent').innerHTML, /本次优先选择/);
  assert.doesNotMatch(engine.element('lootContent').innerHTML, /上一战基准/);
  assert.doesNotMatch(engine.element('lootContent').innerHTML, /▲ \/ ▲▲ \/ ▲▲▲/);
  engine.deferLootChoice();
  assert.equal(engine.element('lootOverlay').hidden, true);
  assert.match(engine.element('statContent').innerHTML, /继续选择装备/);
  engine.resumeLootChoice();
  assert.equal(engine.element('lootOverlay').hidden, false);

  engine.openSaveManager();
  assert.equal(engine.element('saveOverlay').hidden, false);
  assert.match(engine.element('saveContent').innerHTML, /手动槽位 1/);
  engine.openSettings();
  assert.equal(engine.paused(), true);
  engine.closeSettings();
  assert.equal(engine.paused(), false);
});

test('set detail opens in a modal and reports active and inactive tiers', () => {
  const engine = loadInteractiveEngine();
  engine.setState({
    player: { job: '战士', blessing: '战士的祝福' },
    enemy: { name: '试炼兽', hp: 100, maxHp: 100, atk: 20, traits: [], shield: 0 },
    slots: [
      { element: '火' }, { element: '火' }, { element: '火' }, { element: '水' },
    ],
  });
  engine.showSetInfo();
  assert.equal(engine.element('setOverlay').hidden, false);
  const content = engine.element('setContent').innerHTML;
  assert.match(content, /【火】 当前 3 件/);
  assert.match(content, /二件套 · 已激活/);
  assert.match(content, /四件套 · 未激活 · 还差 1 件/);
});

test('replacement highlights one slot while preserving details and changes', () => {
  const engine = loadInteractiveEngine();
  const slots = [
    { name: '寒冰盾牌', element: '水', atk: 10, hp: 120, bj: 0, bs: 0, crt: 0, trait: null },
    { name: '破损洗衣机', element: '草', atk: 20, hp: 10, bj: 0, bs: 0, crt: 0, trait: null },
    { name: '会尖叫的镰刀', element: '火', atk: 60, hp: 0, bj: 0, bs: 0, crt: 0, trait: null },
    { name: '诅咒靴子', element: '雷', atk: 5, hp: 30, bj: 0, bs: 0, crt: 0, trait: null },
  ];
  const candidate = { name: '晨星法杖', element: '水', atk: 75, hp: 180, bj: 0.04, bs: 0.05, crt: 0.03, trait: null };
  engine.setState({
    player: { job: '战士', blessing: '战士的祝福', blessAtkAdd: 0, blessHpAdd: 0, blessBjAdd: 0, blessBsAdd: 0, blessCrtAdd: 0, permAtkAdd: 0, permHpAdd: 0, wave: 9 },
    enemy: { name: '试炼兽', hp: 1200, maxHp: 1200, atk: 250, traits: [], shield: 0 },
    slots,
    state: 'loot',
  });
  engine.renderReplacementChoices(candidate, 1);
  const replacement = engine.element('lootContent').innerHTML;
  const slotList = replacement.split('<div class="modal-grid">')[1];
  assert.match(replacement, /is-recommended/);
  assert.doesNotMatch(replacement, /推荐替换/);
  assert.doesNotMatch(replacement, /晨星法杖/);
  assert.match(slotList, /寒冰盾牌/);
  assert.match(slotList, /更换后：/);
  assert.match(slotList, /输出/);
  assert.match(slotList, /生存/);
  assert.doesNotMatch(replacement, /百分点/);
});

test('battle arena stays between terminal output and action buttons', () => {
  const terminal = html.indexOf('id="terminal"');
  const arena = html.indexOf('id="battleArena"');
  const choices = html.indexOf('id="choices"');
  assert.ok(terminal < arena && arena < choices);
});
