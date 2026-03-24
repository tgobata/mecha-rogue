/**
 * embed-json-in-docs.js
 * JSONデータをHTMLドキュメントに直接埋め込むスクリプト。
 * fetch()によるCORSエラーを回避するため、<script>タグに変数として埋め込む。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'src', 'game', 'assets', 'data');
const DOCS = path.join(ROOT, 'docs');

/**
 * JSONファイルを読み込んで整形済み文字列を返す（2スペースインデント）
 */
function readJson(filename) {
  const raw = fs.readFileSync(path.join(DATA, filename), 'utf8');
  return JSON.stringify(JSON.parse(raw), null, 2);
}

/**
 * <script>const VAR = DATA;</script> のブロックを生成する
 */
function embedScript(varName, jsonStr) {
  return `<script>\nconst ${varName} = ${jsonStr};\n</script>`;
}

// ---------------------------------------------------------------------------
// 全敵.html
// ---------------------------------------------------------------------------
function fixZenteki() {
  const filePath = path.join(DOCS, '全敵.html');
  let html = fs.readFileSync(filePath, 'utf8');

  const enemiesJson = readJson('enemies.json');
  const embedBlock = embedScript('ENEMIES_DATA', enemiesJson);

  // <head>の閉じタグ直前にデータを埋め込む
  html = html.replace('</head>', embedBlock + '\n</head>');

  // async function init() { ... fetch部分 ... } を同期版に置き換え
  html = html.replace(
    /    async function init\(\) \{\n      try \{\n        const res = await fetch\('\.\.\/src\/game\/assets\/data\/enemies\.json'\);\n        if \(!res\.ok\) throw new Error\('fetch failed: ' \+ res\.status\);\n        allEnemies = await res\.json\(\);\n      \} catch \(e\) \{\n        document\.getElementById\('loading'\)\.style\.display = 'none';\n        document\.getElementById\('error'\)\.style\.display = 'block';\n        document\.getElementById\('error'\)\.textContent = 'enemies\.json の読み込みに失敗しました: ' \+ e\.message;\n        return;\n      \}/,
    `    function init() {\n      allEnemies = ENEMIES_DATA;`
  );

  // init(); の呼び出し（asyncでなくなるので問題なし）
  fs.writeFileSync(filePath, html, 'utf8');
  console.log('全敵.html: 書き込み完了 (' + fs.statSync(filePath).size + ' bytes)');
}

// ---------------------------------------------------------------------------
// 全ボス.html
// ---------------------------------------------------------------------------
function fixZenboss() {
  const filePath = path.join(DOCS, '全ボス.html');
  let html = fs.readFileSync(filePath, 'utf8');

  const bossesJson = readJson('bosses.json');
  const embedBlock = embedScript('BOSSES_DATA', bossesJson);

  html = html.replace('</head>', embedBlock + '\n</head>');

  html = html.replace(
    /    async function init\(\) \{\n      try \{\n        const res = await fetch\('\.\.\/src\/game\/assets\/data\/bosses\.json'\);\n        if \(!res\.ok\) throw new Error\('fetch failed: ' \+ res\.status\);\n        allBosses = await res\.json\(\);\n      \} catch \(e\) \{\n        document\.getElementById\('loading'\)\.style\.display = 'none';\n        document\.getElementById\('error'\)\.style\.display = 'block';\n        document\.getElementById\('error'\)\.textContent = 'bosses\.json の読み込みに失敗しました: ' \+ e\.message;\n        return;\n      \}/,
    `    function init() {\n      allBosses = BOSSES_DATA;`
  );

  fs.writeFileSync(filePath, html, 'utf8');
  console.log('全ボス.html: 書き込み完了 (' + fs.statSync(filePath).size + ' bytes)');
}

// ---------------------------------------------------------------------------
// 全アイテム.html
// ---------------------------------------------------------------------------
function fixZenitem() {
  const filePath = path.join(DOCS, '全アイテム.html');
  let html = fs.readFileSync(filePath, 'utf8');

  const itemsJson   = readJson('items.json');
  const weaponsJson = readJson('weapons.json');
  const toolsJson   = readJson('tools-equipment.json');

  const embedBlock = [
    embedScript('ITEMS_DATA',   itemsJson),
    embedScript('WEAPONS_DATA', weaponsJson),
    embedScript('TOOLS_DATA',   toolsJson),
  ].join('\n');

  html = html.replace('</head>', embedBlock + '\n</head>');

  html = html.replace(
    /    async function init\(\) \{\n      try \{\n        const \[rItems, rWeapons, rTools\] = await Promise\.all\(\[\n          fetch\('\.\.\/src\/game\/assets\/data\/items\.json'\),\n          fetch\('\.\.\/src\/game\/assets\/data\/weapons\.json'\),\n          fetch\('\.\.\/src\/game\/assets\/data\/tools-equipment\.json'\)\n        \]\);\n        if \(!rItems\.ok \|\| !rWeapons\.ok \|\| !rTools\.ok\) throw new Error\('fetch failed'\);\n        allItems = await rItems\.json\(\);\n        allWeapons = await rWeapons\.json\(\);\n        allTools = await rTools\.json\(\);\n      \} catch \(e\) \{\n        document\.getElementById\('loading'\)\.style\.display = 'none';\n        document\.getElementById\('error'\)\.style\.display = 'block';\n        document\.getElementById\('error'\)\.textContent = 'JSONの読み込みに失敗しました: ' \+ e\.message;\n        return;\n      \}/,
    `    function init() {\n      allItems   = ITEMS_DATA;\n      allWeapons = WEAPONS_DATA;\n      allTools   = TOOLS_DATA;`
  );

  fs.writeFileSync(filePath, html, 'utf8');
  console.log('全アイテム.html: 書き込み完了 (' + fs.statSync(filePath).size + ' bytes)');
}

// ---------------------------------------------------------------------------
// 実行
// ---------------------------------------------------------------------------
fixZenteki();
fixZenboss();
fixZenitem();
console.log('\n既存3ファイルの修正完了。');
