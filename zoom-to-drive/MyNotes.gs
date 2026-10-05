/**
 * Zoom My Notes → Googleドライブ 自動保存（本人ログイン型）
 *
 * 会社の鍵（Server-to-Server）では My Notes が読めないため、三浦さん本人の Zoom ログインで読む。
 * 最初に1回だけ「連携」をすると、あとは1時間おきに新しいノートを「Zoom書き起こし」フォルダに保存する。
 * Code.gs の関数（findCalendarEvent_ / makeTitle_ / mustGet_ など）を使う。
 *
 * スクリプトプロパティ（Code.gs の分に加えて）:
 *   ZOOM_USER_CLIENT_ID / ZOOM_USER_CLIENT_SECRET  必須（Zoom の General App の Client ID / Client Secret）
 *
 * 使い方:
 *   1. showMyNotesRedirectUrl を実行 → ログに出たURLを Zoom アプリの「Redirect URL」と「Allow List」に入れる
 *   2. showMyNotesLoginUrl を実行 → ログに出たURLを開いて Zoom で「許可」→「連携できました」と出れば完了
 *   3. probeMyNotesUser を実行 → ノート一覧の形をログで確かめる
 *   4. setupMyNotes を実行 → 1時間おきの自動保存を始める（初回は過去のノートもまとめて保存）
 */

const MYNOTES_TOKEN_KEY = 'MYNOTES_TOKEN';

/** 手順1：Zoom アプリに登録するURL（戻り先）をログに出す */
function showMyNotesRedirectUrl() {
  Logger.log('Redirect URL / Allow List に入れるURL: ' + myNotesRedirectUri_());
}

/** 手順2：Zoom で許可するためのURLをログに出す */
function showMyNotesLoginUrl() {
  const props = PropertiesService.getScriptProperties();
  const state = ScriptApp.newStateToken().withMethod('myNotesAuthCallback').withTimeout(3600).createToken();
  const url = 'https://zoom.us/oauth/authorize?response_type=code'
    + '&client_id=' + encodeURIComponent(mustGet_(props, 'ZOOM_USER_CLIENT_ID'))
    + '&redirect_uri=' + encodeURIComponent(myNotesRedirectUri_())
    + '&state=' + encodeURIComponent(state);
  Logger.log('このURLを開いて、Zoom で「許可」を押してください（1時間有効）:\n' + url);
}

/** Zoom から戻ってきたときに呼ばれる */
function myNotesAuthCallback(request) {
  const code = request.parameter.code;
  if (!code) {
    return HtmlService.createHtmlOutput('連携できませんでした：' + (request.parameter.error || '許可されませんでした'));
  }
  saveToken_(requestToken_({
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: myNotesRedirectUri_(),
  }));
  return HtmlService.createHtmlOutput('<p style="font-size:18px">連携できました。このタブは閉じて大丈夫です。</p>');
}

/** 手順3：ノート一覧とノート1件の「形」だけをログに出す（中身は出さない） */
function probeMyNotesUser() {
  const token = myNotesToken_();
  const list = zoomUserGet_(token, '/my_notes/notes?page_size=10');
  Logger.log('一覧: ' + list.code + ' ' + (list.code === 200 ? describe_(list.json) : JSON.stringify(list.json)));
  const notes = (list.json && list.json.notes) || [];
  if (!notes.length) return;
  const c = zoomUserGet_(token, '/my_notes/notes/' + encodeURIComponent(notes[0].note_id) + '/content?include=transcript');
  Logger.log('1件目の中身: ' + c.code + ' ' + (c.code === 200 ? shapeOf_(c.json) : JSON.stringify(c.json)));
}

/** 手順4：1時間おきの自動保存を始める */
function setupMyNotes() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'runMyNotes')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('runMyNotes').timeBased().everyHours(1).create();
  Logger.log('My Notes の自動保存を始めました（1時間おき）');
  runMyNotes();
}

/** 本体：まだ保存していないノートをドライブに保存する */
function runMyNotes() {
  const props = PropertiesService.getScriptProperties();
  const folder = DriveApp.getFolderById(mustGet_(props, 'FOLDER_ID'));
  const token = myNotesToken_();
  const started = Date.now();

  let next = '';
  do {
    const list = zoomUserGet_(token, '/my_notes/notes?page_size=50' + (next ? '&next_page_token=' + encodeURIComponent(next) : ''));
    if (list.code !== 200) throw new Error('ノート一覧の取得に失敗: ' + list.code + ' ' + JSON.stringify(list.json));
    const notes = list.json.notes || [];

    for (const n of notes) {
      const doneKey = 'note_' + n.note_id;
      // 一度保存したノートでも、あとで書き足された（更新日時が変わった）ら保存し直す
      if (props.getProperty(doneKey) === String(n.modified_time)) continue;
      if (Date.now() - started > 5 * 60 * 1000) {
        Logger.log('時間切れが近いので、残りは次の回に保存します');
        return;
      }
      const c = zoomUserGet_(token, '/my_notes/notes/' + encodeURIComponent(n.note_id) + '/content?include=transcript');
      if (c.code !== 200) {
        Logger.log('中身の取得に失敗（飛ばします）: ' + n.note_name + ' ' + c.code);
        continue;
      }
      saveNote_(props, folder, n, c.json);
      props.setProperty(doneKey, String(n.modified_time));
    }
    next = list.json.next_page_token || '';
  } while (next);
}

// ---- 保存 ----

function saveNote_(props, folder, n, content) {
  const start = new Date(n.created_time);
  const event = findCalendarEvent_(start);
  const transcript = transcriptText_(content);
  const memo = content.manual_note_content || '';
  const title = makeTitle_(props, start, event, n.note_name, (memo + '\n' + transcript).slice(0, 200000))
    .replace(/_Zoom書き起こし$/, '_My Notes');

  const doc = DocumentApp.create(title);
  const body = doc.getBody();
  body.appendParagraph(title).setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph('種類: Zoom My Notes');
  body.appendParagraph('開始: ' + Utilities.formatDate(start, TZ, 'yyyy-MM-dd HH:mm'));
  body.appendParagraph('ノート名: ' + (n.note_name || ''));
  body.appendParagraph('カレンダーの予定: ' + (event ? event.getTitle() : '（見つからず）'));
  body.appendParagraph('Zoomのノート: ' + (n.note_link || ''));
  body.appendParagraph('ノートID: ' + n.note_id + ' / 更新: ' + n.modified_time);
  body.appendHorizontalRule();
  body.appendParagraph('■ 自分のメモ').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(memo || '（なし）');
  body.appendParagraph('■ 書き起こし').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(transcript || '（なし）');
  doc.saveAndClose();
  DriveApp.getFileById(doc.getId()).moveTo(folder);
  Logger.log('保存: ' + title);
}

/** 書き起こしの形が分からないので、よくある形を順に試し、だめなら中身をそのまま書く */
function transcriptText_(content) {
  const t = content.transcript !== undefined ? content.transcript
    : content.meeting_transcript !== undefined ? content.meeting_transcript : null;
  if (t === null || t === undefined) return '';
  if (typeof t === 'string') return t;
  const list = Array.isArray(t) ? t
    : Array.isArray(t.timeline) ? t.timeline
    : Array.isArray(t.segments) ? t.segments
    : Array.isArray(t.items) ? t.items : null;
  if (list) {
    return list.map(s => {
      if (typeof s === 'string') return s;
      const who = s.speaker || s.speaker_name || s.username || s.user_name || '';
      const when = s.ts || s.timestamp || s.start_time || '';
      const text = s.text || s.content || s.sentence || '';
      return [when, who ? who + ':' : '', text].filter(Boolean).join(' ');
    }).join('\n');
  }
  if (t.content && typeof t.content === 'string') return t.content;
  return JSON.stringify(t, null, 1);
}

// ---- Zoom（本人ログイン） ----

function myNotesRedirectUri_() {
  return 'https://script.google.com/macros/d/' + ScriptApp.getScriptId() + '/usercallback';
}

function requestToken_(params) {
  const props = PropertiesService.getScriptProperties();
  const id = mustGet_(props, 'ZOOM_USER_CLIENT_ID');
  const secret = mustGet_(props, 'ZOOM_USER_CLIENT_SECRET');
  const res = UrlFetchApp.fetch('https://zoom.us/oauth/token', {
    method: 'post',
    headers: { Authorization: 'Basic ' + Utilities.base64Encode(id + ':' + secret) },
    payload: params,
    muteHttpExceptions: true,
  });
  const json = JSON.parse(res.getContentText());
  if (res.getResponseCode() !== 200) throw new Error('Zoom の鍵の取得に失敗: ' + res.getResponseCode() + ' ' + (json.reason || json.error || ''));
  return json;
}

function saveToken_(json) {
  PropertiesService.getUserProperties().setProperty(MYNOTES_TOKEN_KEY, JSON.stringify({
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: Date.now() + (json.expires_in - 120) * 1000,
  }));
}

/** 期限が切れていれば、自動で鍵を作り直す（Zoom は作り直すたびに新しい更新用の鍵を返す） */
function myNotesToken_() {
  const raw = PropertiesService.getUserProperties().getProperty(MYNOTES_TOKEN_KEY);
  if (!raw) throw new Error('まだ Zoom と連携していません。showMyNotesLoginUrl を実行して連携してください');
  const t = JSON.parse(raw);
  if (Date.now() < t.expires_at) return t.access_token;
  const json = requestToken_({ grant_type: 'refresh_token', refresh_token: t.refresh_token });
  saveToken_(json);
  return json.access_token;
}

function zoomUserGet_(token, path) {
  const res = UrlFetchApp.fetch('https://api.zoom.us/v2' + path, {
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true,
  });
  let json = null;
  try { json = JSON.parse(res.getContentText()); } catch (e) { json = { message: '（JSONではない応答）' }; }
  return { code: res.getResponseCode(), json: json };
}

/** 値は出さず、項目名と型だけを返す（1段下まで） */
function shapeOf_(obj) {
  return Object.keys(obj).map(k => {
    const v = obj[k];
    if (Array.isArray(v)) return k + '[一覧' + v.length + '件' + (v.length && typeof v[0] === 'object' ? ':' + Object.keys(v[0]).join(',') : '') + ']';
    if (v && typeof v === 'object') return k + '{' + Object.keys(v).join(',') + '}';
    return k + ':' + (v === null ? 'null' : typeof v) + (typeof v === 'string' ? '(' + v.length + '文字)' : '');
  }).join(' / ');
}
