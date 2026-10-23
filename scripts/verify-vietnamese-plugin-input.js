// Exercise the local plugin's actual input handler without starting Blockbench.
// node scripts/verify-vietnamese-plugin-input.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { vietnameseCreeperCharacters } from './vietnamese-character-map.js';

const source = fs.readFileSync(new URL('../plugin/minecraft_title_generator.js', import.meta.url), 'utf8');
const characters = JSON.parse(fs.readFileSync(new URL('../fonts/minecraft-ten-vietnamese/characters.json', import.meta.url), 'utf8'));
const fontId = 'minecraft-ten-vietnamese';
const helper = source.match(/  function prepareFontText\(text, fontId\) \{[\s\S]*?\n  \}/)?.[0];
const handler = source.match(/        onConfirm\(\) \{[\s\S]*?\n        \},\r?\n        async onBuild/)?.[0].replace(/,\r?\n        async onBuild$/, '');
assert.ok(helper && handler, 'Cannot locate plugin input handler');
let result, closed, warning;
const context = vm.createContext({
  fonts: { [fontId]: { type: 'font', characters }, other: { type: 'font' }, shape: { type: 'shape' } },
  dialog: { close() { closed = true; } },
  getArgs: vue => ({ font: vue.font }),
  addText(text, args) { result = { text, font: args.font }; },
  Blockbench: { showQuickMessage(message) { warning = message; } },
});
vm.runInContext(`${helper}\nglobalThis.handler = ({${handler}}).onConfirm;`, context);
let cases = 0;
function check(input, expected, font = fontId) {
  result = undefined;
  closed = false;
  warning = undefined;
  context.handler.call({ content_vue: { text: input, font } });
  assert.equal(result?.text, expected, JSON.stringify({ input, font }));
  assert.equal(result?.font, font);
  assert.equal(closed, true);
  assert.equal(warning, undefined);
  if (font === fontId) {
    for (const char of expected) {
      if (/\s/.test(char)) continue;
      assert.ok(characters[char]?.length, `Missing actual model for ${char}`);
    }
  }
  cases++;
}

const creepers = Object.values(vietnameseCreeperCharacters);
assert.equal(creepers.length, 17);
for (const char of creepers) {
  for (const form of ['NFC', 'NFD']) {
    check(char.normalize(form), char);
    check(char.toLowerCase().normalize(form), char.toLowerCase());
  }
  assert.notDeepEqual(characters[char], characters[char.toLowerCase()]);
}
// All other Vietnamese letters still select their ordinary lowercase models.
for (const char of Object.keys(characters).filter(char => /^[a-zđà-ỹ]$/.test(char))) {
  if (char === 'a' || creepers.includes(char.toUpperCase())) continue;
  for (const form of ['NFC', 'NFD']) check(char.toUpperCase().normalize(form), char);
}
check('  A a À à Ắ ắ Ậ ậ B Đ Ệ Ơ Ư  ', '😳 a À à Ắ ắ Ậ ậ b đ ệ ơ ư');
check('A\u0306\u0301\na\u0306\u0301', 'Ắ\nắ');
check(`"Ắ" 'À'`, `😩😩Ắ'' 😩À'`);
check('anything', 'a', 'shape');

const oldInput = text => text.replace(/A/g, '😳').replace(/(\s|^)'/g, '$1😩').replace(/(\s|^)"/g, '$1😩😩').replace(/"/g, "''").toLowerCase().trim();
for (const input of ['A B a', ...creepers, 'A\u0306\u0301', 'Й й Б В', 'ΟΣ', `  "A" 'B'\nABC  `]) {
  check(input, oldInput(input), 'other');
}
result = undefined;
closed = false;
context.handler.call({ content_vue: { text: ' \n\t ', font: fontId } });
assert.equal(result, undefined);
assert.equal(closed, false);
assert.equal(warning, 'Please provide some text');

// Run the actual character-spacing block: surrogate pairs must stay intact.
const spacing = source.match(/    if \(\r?\n      !args.debug &&\r?\n      args.characterSpacing &&[\s\S]*?\n    \}/)?.[0];
assert.ok(spacing, 'Cannot locate character-spacing block');
context.fonts.spacingFont = { characters: { ...characters, '\u200b': [] } };
const spaced = vm.runInContext(`(() => {
  let text = '😳Ắ😩';
  const args = { font: 'spacingFont', characterSpacing: 3 };
  ${spacing}
  return { text, width: args.spacerWidth, spacing: args.characterSpacing };
})()`, context);
assert.equal(spaced.text, '😳\u200bẮ\u200b😩');
assert.equal(spaced.width, 2);
assert.equal(spaced.spacing, 0);
// Outliner groups and texture names use lowercase labels, as the original Creeper does.
const naming = source.match(/  const makeName = \(str, fontId\) =>[\s\S]*?;\r?\n/)?.[0];
assert.ok(naming, 'Cannot locate plugin naming function');
vm.runInContext(`${naming}\nglobalThis.makeName = makeName;`, context);
for (const char of creepers) {
  assert.equal(context.makeName(char, fontId), char.toLowerCase());
  assert.equal(context.makeName(char.toLowerCase(), fontId), char.toLowerCase());
  assert.equal(context.makeName(char, 'other'), char);
}
assert.equal(context.makeName('😳 a À à Ắ ắ Ậ ậ', fontId), 'a_a_à_à_ắ_ắ_ậ_ậ');
assert.equal(context.makeName('😩😳\u200b┣ ┫', fontId), "'a_");
console.log(`PASS: ${cases} input cases; 17 Creeper variants in NFC/NFD; model lookups; spacing; empty input; lowercase group/texture names; other-font regression.`);
