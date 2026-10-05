/**
 * Zoom書き起こし → Googleドライブ 自動保存
 *
 * 1時間おきにZoomのクラウド録画を見に行き、新しい書き起こしがあれば
 * 「Zoom書き起こし」フォルダにGoogleドキュメントとして保存する。
 * ファイル名の名前は、同じ時間のGoogleカレンダーの予定から取る
 * （Zoomの表示名は「K」「クリア」のように当てにならないため）。
 *
 * スクリプトプロパティ（プロジェクトの設定 → スクリプト プロパティ）:
 *   ZOOM_ACCOUNT_ID / ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET  必須（Server-to-Server OAuthアプリ）
 *   ZOOM_USER_EMAIL     必須（Zoomにログインしているメールアドレス）
 *   ANTHROPIC_API_KEY   任意（あればClaudeがファイル名に内容の数語を付ける）
 *   FOLDER_ID           自動（setup() が作ったフォルダのID）
 */

const FOLDER_NAME = 'Zoom書き起こし';
const LOOKBACK_DAYS = 7;
const TZ = 'Asia/Tokyo';
const CLAUDE_MODEL = 'claude-opus-5-5';

/** 最初に1回だけ実行：フォルダと1時間おきのトリガーを作る */
function setup() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('FOLDER_ID')) {
    const it = DriveApp.getFoldersByName(FOLDER_NAME);
    const folder = it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
    props.setProperty('FOLDER_ID', folder.getId());
  }
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'run')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('run').timeBased().everyHours(1).create();
  Logger.log('準備完了。フォルダ: ' + DriveApp.getFolderById(props.getProperty('FOLDER_ID')).getUrl());
}

/** 本体：新しい書き起こしをドライブに保存する（トリガーから呼ばれる。手動実行も可） */
function run() {
  const props = PropertiesService.getScriptProperties();
  const folder = DriveApp.getFolderById(mustGet_(props, 'FOLDER_ID'));
  const token = zoomToken_(props);

  const to = new Date();
  const from = new Date(to.getTime() - LOOKBACK_DAYS * 24 * 3600 * 1000);
  const meetings = listRecordings_(token, mustGet_(props, 'ZOOM_USER_EMAIL'), from, to);

  meetings.forEach(m => {
    const doneKey = 'done_' + m.uuid;
    if (props.getProperty(doneKey)) return;
    const file = (m.recording_files || []).find(f => f.file_type === 'TRANSCRIPT' && f.status === 'completed');
    if (!file) return; // 書き起こしがまだ（または無い）会議は、次の回にまた見る

    const vtt = UrlFetchApp.fetch(file.download_url, {
      headers: { Authorization: 'Bearer ' + token },
      followRedirects: true,
    }).getContentText('UTF-8');

    const start = new Date(m.start_time);
    const lines = parseVtt_(vtt, start);
    const speakers = [...new Set(lines.map(l => l.speaker).filter(Boolean))];
    const event = findCalendarEvent_(start);
    const text = lines.map(l => `${l.time} ${l.speaker ? l.speaker + ': ' : ''}${l.text}`).join('\n');

    const title = makeTitle_(props, start, event, m.topic, text);
    const doc = DocumentApp.create(title);
    const body = doc.getBody();
    body.appendParagraph(title).setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph('開始: ' + Utilities.formatDate(start, TZ, 'yyyy-MM-dd HH:mm'));
    body.appendParagraph('Zoomの会議名: ' + (m.topic || ''));
    body.appendParagraph('カレンダーの予定: ' + (event ? event.getTitle() : '（見つからず）'));
    body.appendParagraph('Zoom上の話者名: ' + speakers.join('、'));
    body.appendParagraph('Zoom会議ID: ' + m.id + ' / UUID: ' + m.uuid);
    body.appendHorizontalRule();
    body.appendParagraph(text);
    doc.saveAndClose();
    DriveApp.getFileById(doc.getId()).moveTo(folder);

    props.setProperty(doneKey, doc.getId());
    Logger.log('保存: ' + title);
  });
}

// ---- Zoom ----

function zoomToken_(props) {
  const id = mustGet_(props, 'ZOOM_CLIENT_ID');
  const secret = mustGet_(props, 'ZOOM_CLIENT_SECRET');
  const account = mustGet_(props, 'ZOOM_ACCOUNT_ID');
  const res = UrlFetchApp.fetch(
    'https://zoom.us/oauth/token?grant_type=account_credentials&account_id=' + encodeURIComponent(account),
    { method: 'post', headers: { Authorization: 'Basic ' + Utilities.base64Encode(id + ':' + secret) } },
  );
  return JSON.parse(res.getContentText()).access_token;
}

function listRecordings_(token, user, from, to) {
  const out = [];
  let next = '';
  do {
    const url = 'https://api.zoom.us/v2/users/' + encodeURIComponent(user) + '/recordings'
      + '?page_size=300&from=' + Utilities.formatDate(from, TZ, 'yyyy-MM-dd')
      + '&to=' + Utilities.formatDate(to, TZ, 'yyyy-MM-dd')
      + (next ? '&next_page_token=' + encodeURIComponent(next) : '');
    const data = JSON.parse(UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + token } }).getContentText());
    (data.meetings || []).forEach(m => out.push(m));
    next = data.next_page_token || '';
  } while (next);
  return out;
}

/** WebVTTを「時刻・話者・本文」の行にする。時刻は会議の開始時刻を足した実際の時刻 */
function parseVtt_(vtt, start) {
  const out = [];
  const blocks = vtt.replace(/\r/g, '').split(/\n\n+/);
  blocks.forEach(b => {
    const rows = b.split('\n');
    const i = rows.findIndex(r => r.includes('-->'));
    if (i < 0) return;
    const m = rows[i].match(/(\d+):(\d+):(\d+)(?:\.(\d+))?/);
    if (!m) return;
    const offsetMs = ((+m[1] * 60 + +m[2]) * 60 + +m[3]) * 1000;
    const body = rows.slice(i + 1).join(' ').trim();
    if (!body) return;
    const sp = body.match(/^([^:：]{1,40})[:：]\s*(.*)$/);
    out.push({
      time: Utilities.formatDate(new Date(start.getTime() + offsetMs), TZ, 'HH:mm:ss'),
      speaker: sp ? sp[1].trim() : '',
      text: sp ? sp[2] : body,
    });
  });
  return out;
}

// ---- カレンダーとファイル名 ----

/** 開始時刻の前後30分にある予定のうち、開始が一番近いもの（終日予定は除く） */
function findCalendarEvent_(start) {
  const events = CalendarApp.getDefaultCalendar()
    .getEvents(new Date(start.getTime() - 30 * 60000), new Date(start.getTime() + 30 * 60000))
    .filter(e => !e.isAllDayEvent());
  if (!events.length) return null;
  events.sort((a, b) => Math.abs(a.getStartTime() - start) - Math.abs(b.getStartTime() - start));
  return events[0];
}

function makeTitle_(props, start, event, topic, text) {
  const stamp = Utilities.formatDate(start, TZ, 'yyyy-MM-dd_HHmm');
  const calTitle = event ? event.getTitle() : '';
  let rest = '';
  const key = props.getProperty('ANTHROPIC_API_KEY');
  if (key) {
    try {
      rest = claudeTitle_(key, calTitle, topic, text);
    } catch (e) {
      Logger.log('Claudeでの名前付けに失敗（予定名で保存します）: ' + e);
    }
  }
  if (!rest) rest = (calTitle || topic || '').replace(/\s+/g, ' ').trim().slice(0, 30) + '_Zoom書き起こし';
  return (stamp + '_' + rest).replace(/[\\/:*?"<>|\n]/g, ' ').slice(0, 120);
}

/** 「名前_面談の種類_内容の数語」を1行で返す */
function claudeTitle_(key, calTitle, topic, text) {
  const prompt =
    'Zoom面談の書き起こしから、Googleドライブで後から探しやすいファイル名を作ってください。\n'
    + '形式は「相手の名前_面談の種類_内容を表す数語」の1行だけで、他は何も書かないでください。\n'
    + '相手の名前は、書き起こしの表示名ではなくカレンダーの予定名を優先してください（表示名は誤変換が多いため）。\n'
    + '例: 栗谷さん_個別面談_SEから転身4ヶ月・お金の不安\n\n'
    + 'カレンダーの予定名: ' + (calTitle || '（なし）') + '\n'
    + 'Zoomの会議名: ' + (topic || '（なし）') + '\n\n'
    + '<transcript>\n' + text + '\n</transcript>';
  const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'server-side-fallback-2026-07-01',
    },
    payload: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      output_config: { effort: 'low' },
      fallbacks: 'default',
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (res.getResponseCode() !== 200) throw new Error(res.getResponseCode() + ' ' + res.getContentText().slice(0, 300));
  const msg = JSON.parse(res.getContentText());
  if (msg.stop_reason === 'refusal') return '';
  const t = (msg.content || []).filter(c => c.type === 'text').map(c => c.text).join('').trim();
  return t.split('\n')[0].trim();
}

function mustGet_(props, name) {
  const v = props.getProperty(name);
  if (!v) throw new Error('スクリプトプロパティ ' + name + ' が未設定です');
  return v;
}
