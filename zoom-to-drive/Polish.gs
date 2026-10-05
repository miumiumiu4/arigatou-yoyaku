/**
 * 清書：ドライブに保存した書き起こしを、Claude が文脈を読んで読みやすく整える
 *
 * 「Zoom書き起こし」フォルダのドキュメントを1時間おきに見て、まだ清書していないものに
 * 「■ 清書」の章を足す。元の書き起こし（原文）は消さずに下に残す。
 * Code.gs・MyNotes.gs が作ったドキュメントのどちらにも使える。
 *
 * スクリプトプロパティ:
 *   ANTHROPIC_API_KEY  必須
 *   POLISH_SINCE       自動（setupPolish を実行した日。これより前の会議は清書しない。
 *                       過去の分も清書したいときは、この日付を手で早める。例: 2025-10-01）
 *
 * 使い方：setupPolish を1回実行する（1時間おきの清書が始まる）
 */

const POLISH_MODEL = 'claude-opus-5-5';
const POLISH_CHUNK_CHARS = 1500;   // 1回に Claude に渡す文字数（大きいと Apps Script の待ち時間の上限に当たる）
const POLISH_PARALLEL = 20;        // 同時に送る数
const POLISH_MAX_TRIES = 3;        // 失敗したドキュメントを何回まで試すか
const POLISH_HEADING = '■ 清書（Claudeが文脈を読んで整えたもの。正確さは下の原文で確認）';

/** 最初に1回だけ実行：清書の開始日を今日にして、1時間おきのトリガーを作る */
function setupPolish() {
  const props = PropertiesService.getScriptProperties();
  mustGet_(props, 'ANTHROPIC_API_KEY');
  if (!props.getProperty('POLISH_SINCE')) {
    props.setProperty('POLISH_SINCE', Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'));
  }
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'runPolish')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('runPolish').timeBased().everyHours(1).create();
  Logger.log('清書を始めました（1時間おき）。対象: ' + props.getProperty('POLISH_SINCE') + ' 以降の会議');
  runPolish();
}

/** 本体：まだ清書していないドキュメントを、時間の許す限り清書する */
function runPolish() {
  const props = PropertiesService.getScriptProperties();
  const key = mustGet_(props, 'ANTHROPIC_API_KEY');
  const since = props.getProperty('POLISH_SINCE') || '9999-12-31';
  const folder = DriveApp.getFolderById(mustGet_(props, 'FOLDER_ID'));
  const started = Date.now();

  const files = [];
  const it = folder.getFilesByType(MimeType.GOOGLE_DOCS);
  while (it.hasNext()) {
    const f = it.next();
    const date = (f.getName().match(/^(\d{4}-\d{2}-\d{2})_/) || [])[1];
    if (!date || date < since) continue;
    const state = props.getProperty('polish_' + f.getId()) || '';
    if (state === 'done' || state === 'fail:' + POLISH_MAX_TRIES) continue;
    files.push(f);
  }
  files.sort((a, b) => b.getName().localeCompare(a.getName())); // 新しい会議から

  for (const f of files) {
    if (Date.now() - started > 3 * 60 * 1000) {
      Logger.log('時間切れが近いので、残りは次の回に清書します');
      return;
    }
    const stateKey = 'polish_' + f.getId();
    try {
      if (polishDoc_(key, f)) Logger.log('清書: ' + f.getName());
      props.setProperty(stateKey, 'done');
    } catch (e) {
      const tries = Number(((props.getProperty(stateKey) || '').match(/^fail:(\d+)$/) || [])[1] || 0) + 1;
      props.setProperty(stateKey, 'fail:' + tries);
      Logger.log('清書に失敗（' + tries + '回目。次の回にまた試します）: ' + f.getName() + ' / ' + e);
    }
  }
}

/** ドキュメント1つを清書する。清書済み・書き起こしが無いものは何もせず false を返す */
function polishDoc_(key, file) {
  const doc = DocumentApp.openById(file.getId());
  const body = doc.getBody();
  const paras = body.getParagraphs();
  if (paras.some(p => p.getText().indexOf('■ 清書') === 0)) return false;

  // 書き起こしの場所：My Notes は「■ 書き起こし」の見出しの下、録画の分は「Zoom会議ID:」の行より下
  let insertAt = -1;
  let raw = '';
  const h = paras.findIndex(p => p.getText().indexOf('■ 書き起こし') === 0);
  if (h >= 0) {
    insertAt = body.getChildIndex(paras[h]);
    raw = paras.slice(h + 1).map(p => p.getText()).join('\n');
  } else {
    const idLine = paras.findIndex(p => p.getText().indexOf('Zoom会議ID:') === 0);
    if (idLine < 0) return false;
    insertAt = body.getChildIndex(paras[idLine]) + 1;
    raw = paras.slice(idLine + 1).map(p => p.getText()).join('\n');
  }
  raw = raw.trim();
  if (!raw || raw === '（なし）') return false;

  const context = paras.slice(0, 8).map(p => p.getText()).join('\n'); // 題名・予定名など（名前の誤変換を直す手がかり）
  const polished = polishText_(key, context, raw);

  body.insertParagraph(insertAt, polished);
  body.insertParagraph(insertAt, POLISH_HEADING).setHeading(DocumentApp.ParagraphHeading.HEADING2);
  doc.saveAndClose();
  return true;
}

/** 書き起こしを区切って Claude に並べて送り、清書した文をつなげて返す */
function polishText_(key, context, raw) {
  const lines = raw.split('\n');
  const chunks = [];
  let cur = '';
  lines.forEach(l => {
    if (cur && (cur.length + l.length) > POLISH_CHUNK_CHARS) { chunks.push(cur); cur = ''; }
    cur += (cur ? '\n' : '') + l;
  });
  if (cur) chunks.push(cur);

  const out = [];
  for (let i = 0; i < chunks.length; i += POLISH_PARALLEL) {
    const batch = chunks.slice(i, i + POLISH_PARALLEL);
    const reqs = batch.map((c, j) => polishRequest_(key, context, i + j > 0 ? chunks[i + j - 1].slice(-300) : '', c));
    const res = UrlFetchApp.fetchAll(reqs);
    res.forEach((r, j) => {
      if (r.getResponseCode() !== 200) throw new Error('Claude ' + r.getResponseCode() + ' ' + r.getContentText().slice(0, 200));
      const msg = JSON.parse(r.getContentText());
      if (msg.stop_reason === 'refusal') { out.push(batch[j]); return; } // 断られた部分は原文のまま
      const text = (msg.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
      out.push(text || batch[j]);
    });
  }
  return out.join('\n');
}

function polishRequest_(key, context, before, chunk) {
  const system =
    'あなたは日本語の面談記録の清書係です。Zoomの自動書き起こしを、意味を変えずに読みやすく整えます。\n'
    + '・誤変換や聞き間違いは、前後の文脈から明らかな場合だけ直す（例：人名・会社名・業界用語）。分からない所はそのまま残す\n'
    + '・「えー」「あの」「なんか」などの言いよどみ、同じ言葉のくり返し、途中で切れた言い直しは取り除く\n'
    + '・句読点を整え、1つの発言が長いときは読みやすく区切る\n'
    + '・話者名と時刻は残す。同じ話者が続く行は1つにまとめ、最初の時刻を使う。形は「時刻 話者: 発言」\n'
    + '・要約しない。言っていないことを足さない。発言の順番を変えない\n'
    + '・出力は清書した本文だけ。前置きや説明は書かない';
  const user =
    '【会議の情報（名前の誤変換を直す手がかり）】\n' + context + '\n\n'
    + (before ? '【直前の部分（参考。出力しない）】\n' + before + '\n\n' : '')
    + '【清書する部分】\n<transcript>\n' + chunk + '\n</transcript>';
  return {
    url: 'https://api.anthropic.com/v1/messages',
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'server-side-fallback-2026-07-01',
    },
    payload: JSON.stringify({
      model: POLISH_MODEL,
      max_tokens: 16000,
      output_config: { effort: 'low' },
      fallbacks: 'default',
      system: system,
      messages: [{ role: 'user', content: user }],
    }),
  };
}
