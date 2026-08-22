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
  const context = {
    Math,
    Number,
    Object,
    Array,
    JSON,
    console,
    setTimeout: () => 0,
    clearTimeout() {},
    localStorage: { getItem: () => null, setItem() {} },
    document: {
      getElementById: () => element,
      createElement: () => ({ className: '', textContent: '', appendChild() {}, classList: element.classList }),
      addEventListener() {},
    },
  };
  const instrumented = script.replace(/initApp\(\);\s*$/, `
    globalThis.__comparison = {
      deriveBuild, compareCandidate, equipmentRecommendationHtml, percentDeltaHtml,
      setState({ player: playerState, enemy: enemyState, slots }) {
        Object.assign(player, playerState);
        player.slots = slots;
        Object.assign(enemy, enemyState);
        gameState = "battle";
      },
      slots: () => JSON.stringify(player.slots),
    };
  `);
  vm.createContext(context);
  vm.runInContext(instrumented, context);
  return context.__comparison;
}

test('6.5 page keeps restored UI, comparison, and battle scene markers', () => {
  new Function(script);
  for (const marker of [
    'id="welcomeOverlay"',
    'id="battleArena"',
    'function deriveBuild(slots)',
    'function equipmentRecommendationHtml(item)',
    'function showBattleFeedback(side,text,type="damage")',
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
