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

/**
 * HTML内の既存 <script>const VAR = ...;</script> ブロックを置換する。
 * 見つからない場合は </head> 直前に挿入する。
 */
function replaceOrInsertScript(html, varName, jsonStr) {
  const block = `<script>\nconst ${varName} = ${jsonStr};\n</script>`;
  // 既存ブロックを正規表現で検索して置換（複数あれば最初の1つだけ残す）
  const re = new RegExp(`<script>\\s*const ${varName}\\s*=[\\s\\S]*?;\\s*</script>`, 'g');
  const matches = html.match(re);
  if (matches && matches.length > 0) {
    // 最初のマッチを新しいブロックで置換し、残りは除去
    let replaced = false;
    html = html.replace(re, () => {
      if (!replaced) { replaced = true; return block; }
      return '';  // 2個目以降は削除
    });
    return html;
  }
  // 見つからない場合は </head> 直前に挿入
  return html.replace('</head>', block + '\n</head>');
}

// ---------------------------------------------------------------------------
// 全敵.html
// ---------------------------------------------------------------------------
function fixZenteki() {
  const filePath = path.join(DOCS, '全敵.html');
  let html = fs.readFileSync(filePath, 'utf8');

  const enemiesJson = readJson('enemies.json');
  html = replaceOrInsertScript(html, 'ENEMIES_DATA', enemiesJson);

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

  html = replaceOrInsertScript(html, 'BOSSES_DATA', bossesJson);

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

  html = replaceOrInsertScript(html, 'ITEMS_DATA',   itemsJson);
  html = replaceOrInsertScript(html, 'WEAPONS_DATA', weaponsJson);
  html = replaceOrInsertScript(html, 'TOOLS_DATA',   toolsJson);

  html = html.replace(
    /    async function init\(\) \{\n      try \{\n        const \[rItems, rWeapons, rTools\] = await Promise\.all\(\[\n          fetch\('\.\.\/src\/game\/assets\/data\/items\.json'\),\n          fetch\('\.\.\/src\/game\/assets\/data\/weapons\.json'\),\n          fetch\('\.\.\/src\/game\/assets\/data\/tools-equipment\.json'\)\n        \]\);\n        if \(!rItems\.ok \|\| !rWeapons\.ok \|\| !rTools\.ok\) throw new Error\('fetch failed'\);\n        allItems = await rItems\.json\(\);\n        allWeapons = await rWeapons\.json\(\);\n        allTools = await rTools\.json\(\);\n      \} catch \(e\) \{\n        document\.getElementById\('loading'\)\.style\.display = 'none';\n        document\.getElementById\('error'\)\.style\.display = 'block';\n        document\.getElementById\('error'\)\.textContent = 'JSONの読み込みに失敗しました: ' \+ e\.message;\n        return;\n      \}/,
    `    function init() {\n      allItems   = ITEMS_DATA;\n      allWeapons = WEAPONS_DATA;\n      allTools   = TOOLS_DATA;`
  );

  fs.writeFileSync(filePath, html, 'utf8');
  console.log('全アイテム.html: 書き込み完了 (' + fs.statSync(filePath).size + ' bytes)');
}

// ---------------------------------------------------------------------------
// 主人公.html
// ---------------------------------------------------------------------------
function fixShujinko() {
  const filePath = path.join(DOCS, '主人公.html');
  let html = fs.readFileSync(filePath, 'utf8');

  // ドット絵タブの「note」ブロックを新しいデザイン仕様に差し替える
  const noteBlock = `    <div class="note">
      主人公スプライトはアルファベット文字をモチーフにしたデザイン。ステータスに応じて表示文字が変わる。<br>
      ファイルパス: <code>public/sprites/player/</code><br>
      優先順: <strong>瀕死(D)</strong> &gt; <strong>攻撃バフ(A)</strong> &gt; <strong>防御バフ(B)</strong> &gt; <strong>スピードバフ(S)</strong> &gt; <strong>HP満タン(F)</strong> &gt; <strong>通常(H)</strong><br>
      ※ H = 通常状態。<strong>cover.png と同配色</strong>（ダークネイビー胴体 / シアン <code>#00e5ff</code> アウトライン / 赤 <code>#ff3333</code> 目）。<br>
      ※ F = HP 100%時に表示。ただし<strong>ゲーム開始直後は H を表示</strong>し、一度でもダメージを受けて HP 回復後に F へ切り替わる。ゴールドカラーのフルパワー状態。<br>
      ※ D = 瀕死。明るい青灰系カラー。<br>
      <strong>方向表現:</strong><br>
      &nbsp;&nbsp;下↓ = 正面（赤い大きな目/鼻/口 を大きく表示）<br>
      &nbsp;&nbsp;上↑ = 背面（顔パーツ非表示・頭部ベントライン3本＋ボディベント表示）<br>
      &nbsp;&nbsp;左右←→ = シアー変形（体全体45°傾き）＋顔を左右端に大きくずらし＋反対側ボディにベントライン（背中ハーフ表示）<br>
      <strong>攻撃:</strong> frame1でキャラが攻撃方向にオフセット＋拳/腕を派手に突き出す＋衝撃波エフェクト<br>
      <strong>被弾:</strong> frame0で白い強膜を持つ大きな目が飛び出る＋キャラが左上に吹き飛び＋フラッシュ＋亀裂
    </div>`;

  // 既存 note ブロック（正規表現で検索）を新しい内容で置換
  const re = /<div class="note">[\s\S]*?<\/div>/;
  if (re.test(html)) {
    html = html.replace(re, noteBlock);
    fs.writeFileSync(filePath, html, 'utf8');
    console.log('主人公.html: 書き込み完了 (' + fs.statSync(filePath).size + ' bytes)');
  } else {
    console.log('主人公.html: note ブロックのパターンが見つかりません（スキップ）');
  }
}

// ---------------------------------------------------------------------------
// ショップ.html
// ---------------------------------------------------------------------------
function fixShopDoc() {
  const filePath = path.join(DOCS, 'ショップ.html');
  let html = fs.readFileSync(filePath, 'utf8');

  // SHOP_PRICES を埋め込み直す
  const shopPricesJson = readJson('shop-prices.json');
  html = replaceOrInsertScript(html, 'SHOP_PRICES', shopPricesJson);

  // 修理タブの info-box を新しい内容に置き換え
  const newRepairTab = `  <!-- 修理タブ -->
  <div class="table-wrap" id="tab-repair">
    <div class="info-box">
      <p><strong>🔧 修理屋 — 修理コスト</strong></p>
      <p style="margin-top:8px">耐久度1あたりの修理費用: <span class="repair-cost">15G</span></p>
      <p style="color:#aaa;font-size:0.82rem;margin-top:8px">
        修理費用 = 回復する耐久量 × 15G<br>
        例: 最大耐久30の武器が耐久10の場合、50%修理 → 回復量15 × 15G = <strong style="color:#ffcc88">225G</strong>
      </p>
      <table style="margin-top:12px;width:100%;border-collapse:collapse;font-size:0.82rem">
        <thead>
          <tr>
            <th style="text-align:left;padding:5px 8px;background:#0f3460;color:#7ecfff;border-bottom:1px solid #2a2a5e">修理プラン</th>
            <th style="text-align:left;padding:5px 8px;background:#0f3460;color:#7ecfff;border-bottom:1px solid #2a2a5e">回復量</th>
            <th style="text-align:left;padding:5px 8px;background:#0f3460;color:#7ecfff;border-bottom:1px solid #2a2a5e">費用目安（MaxDUR=30）</th>
          </tr>
        </thead>
        <tbody>
          <tr style="border-bottom:1px solid #1e1e3e">
            <td style="padding:5px 8px">25%修理</td>
            <td style="padding:5px 8px;color:#88ccff">MaxDUR × 25%</td>
            <td style="padding:5px 8px;color:#ffcc88">8 × 15 = 120G</td>
          </tr>
          <tr style="border-bottom:1px solid #1e1e3e">
            <td style="padding:5px 8px">50%修理</td>
            <td style="padding:5px 8px;color:#88ccff">MaxDUR × 50%</td>
            <td style="padding:5px 8px;color:#ffcc88">15 × 15 = 225G</td>
          </tr>
          <tr>
            <td style="padding:5px 8px">全回復</td>
            <td style="padding:5px 8px;color:#88ccff">消耗量すべて</td>
            <td style="padding:5px 8px;color:#ffcc88">（消耗量）× 15G</td>
          </tr>
        </tbody>
      </table>
      <p style="color:#cc8888;font-size:0.78rem;margin-top:10px">⚠ 各装備につき修理は1回のみ（修理済みバッジが表示される）</p>
    </div>

    <div class="info-box" style="margin-top:0">
      <p><strong>🎲 修理ランダムイベント</strong></p>
      <table style="margin-top:10px;width:100%;border-collapse:collapse;font-size:0.82rem">
        <thead>
          <tr>
            <th style="text-align:left;padding:5px 8px;background:#0f3460;color:#7ecfff;border-bottom:1px solid #2a2a5e">確率</th>
            <th style="text-align:left;padding:5px 8px;background:#0f3460;color:#7ecfff;border-bottom:1px solid #2a2a5e">結果</th>
          </tr>
        </thead>
        <tbody>
          <tr style="border-bottom:1px solid #1e1e3e">
            <td style="padding:5px 8px;color:#ff8888">5%</td>
            <td style="padding:5px 8px;color:#ff8888">⚠ 失敗 — 耐久値が修理予定量の半分だけ逆に減少（最低1）</td>
          </tr>
          <tr style="border-bottom:1px solid #1e1e3e">
            <td style="padding:5px 8px;color:#aaddee">60%</td>
            <td style="padding:5px 8px">✓ 成功 — 通常通りに修理</td>
          </tr>
          <tr style="border-bottom:1px solid #1e1e3e">
            <td style="padding:5px 8px;color:#88eebb">25%</td>
            <td style="padding:5px 8px;color:#88eebb">★ 好調 — 修理量 +10%ボーナス</td>
          </tr>
          <tr>
            <td style="padding:5px 8px;color:#ffdd44">10%</td>
            <td style="padding:5px 8px;color:#ffdd44">✦ 最高 — 修理量に加え ATK+1 または MaxDUR+5 のいずれかランダム上昇</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="info-box" style="margin-top:0">
      <p><strong>⬆ 修理屋 — 強化メニュー</strong></p>
      <p style="color:#aaa;font-size:0.82rem;margin-top:6px">
        強化費用 = 耐久あり武器: <span style="color:#ffcc88">MaxDUR × 25G</span>　／　耐久なし武器: <span style="color:#ffcc88">ATK × 50G</span>
      </p>
      <table style="margin-top:10px;width:100%;border-collapse:collapse;font-size:0.82rem">
        <thead>
          <tr>
            <th style="text-align:left;padding:5px 8px;background:#0f3460;color:#7ecfff;border-bottom:1px solid #2a2a5e">強化プラン</th>
            <th style="text-align:left;padding:5px 8px;background:#0f3460;color:#7ecfff;border-bottom:1px solid #2a2a5e">効果</th>
            <th style="text-align:left;padding:5px 8px;background:#0f3460;color:#7ecfff;border-bottom:1px solid #2a2a5e">費用例（MaxDUR=40）</th>
          </tr>
        </thead>
        <tbody>
          <tr style="border-bottom:1px solid #1e1e3e">
            <td style="padding:5px 8px">攻撃強化</td>
            <td style="padding:5px 8px;color:#88ccff">ATK +2</td>
            <td style="padding:5px 8px;color:#ffcc88">40 × 25 = 1000G</td>
          </tr>
          <tr>
            <td style="padding:5px 8px">耐久強化</td>
            <td style="padding:5px 8px;color:#88ccff">MaxDUR +10（耐久なし武器は不可）</td>
            <td style="padding:5px 8px;color:#ffcc88">40 × 25 = 1000G</td>
          </tr>
        </tbody>
      </table>
      <p style="color:#cc8888;font-size:0.78rem;margin-top:10px">⚠ 各装備につき強化は1回のみ（強化済みバッジが表示される）</p>
    </div>

    <div class="info-box" style="margin-top:0">
      <p><strong>🛒 ショップ仕様</strong></p>
      <table style="margin-top:10px;width:100%;border-collapse:collapse;font-size:0.82rem">
        <thead>
          <tr>
            <th style="text-align:left;padding:5px 8px;background:#0f3460;color:#7ecfff;border-bottom:1px solid #2a2a5e">項目</th>
            <th style="text-align:left;padding:5px 8px;background:#0f3460;color:#7ecfff;border-bottom:1px solid #2a2a5e">値</th>
          </tr>
        </thead>
        <tbody>
          <tr style="border-bottom:1px solid #1e1e3e">
            <td style="padding:5px 8px">仕入れ数（武器）</td>
            <td style="padding:5px 8px;color:#ffcc88">3〜5点、各在庫1個</td>
          </tr>
          <tr style="border-bottom:1px solid #1e1e3e">
            <td style="padding:5px 8px">仕入れ数（アイテム）</td>
            <td style="padding:5px 8px;color:#ffcc88">3〜4点、各在庫1〜3個</td>
          </tr>
          <tr style="border-bottom:1px solid #1e1e3e">
            <td style="padding:5px 8px">在庫切れ</td>
            <td style="padding:5px 8px;color:#aaa">購入不可（売切バッジ表示）。別ショップには独立した在庫あり</td>
          </tr>
          <tr style="border-bottom:1px solid #1e1e3e">
            <td style="padding:5px 8px">ショップ出現確率（休憩所以外）</td>
            <td style="padding:5px 8px;color:#ffcc88">10%（SHOP_SPAWN_RATE = 0.10）</td>
          </tr>
          <tr>
            <td style="padding:5px 8px">修理屋出現確率（休憩所以外）</td>
            <td style="padding:5px 8px;color:#ffcc88">2%（REPAIR_SPAWN_RATE = 0.02）</td>
          </tr>
        </tbody>
      </table>
      <p style="color:#aaa;font-size:0.78rem;margin-top:8px">退出するとショップ在庫は更新されます。売却価格は購入価格の約45〜50%。</p>
    </div>
  </div>`;

  // 既存の修理タブブロックを置換
  const reRepairTab = /  <!-- 修理タブ -->[\s\S]*?<\/div>\n\n/;
  if (reRepairTab.test(html)) {
    html = html.replace(reRepairTab, newRepairTab + '\n\n');
  } else {
    // fallback: id="tab-repair" ブロックを置換
    const re2 = /<div class="table-wrap" id="tab-repair">[\s\S]*?<\/div>\n/;
    html = html.replace(re2, newRepairTab.replace(/  <!-- 修理タブ -->\n/, '') + '\n');
  }

  fs.writeFileSync(filePath, html, 'utf8');
  console.log('ショップ.html: 書き込み完了 (' + fs.statSync(filePath).size + ' bytes)');
}

// ---------------------------------------------------------------------------
// 実行
// ---------------------------------------------------------------------------
fixZenteki();
fixZenboss();
fixZenitem();
fixShujinko();
fixShopDoc();
console.log('\n既存5ファイルの修正完了。');
