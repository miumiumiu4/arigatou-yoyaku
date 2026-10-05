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

/** 手順3：会議の一覧とノートの取り方を確かめ、ノート1件の「形」だけをログに出す（中身は出さない） */
function probeMyNotesUser() {
  const token = myNotesToken_();
  const got = listPastMeetings_(30);
  Logger.log('会議の一覧（直近30日）: ' + got.meetings.length + '件 / 取得元: ' + got.source + (got.note ? ' / ' + got.note : ''));
  let first = null;
  for (const m of got.meetings.slice(0, 15)) {
    const r = notesForMeeting_(token, m, true);
    if (r.notes.length && !first) first = r.notes[0];
    if (first) break;
  }
  if (!first) { Logger.log('直近の会議15件からはノートが見つかりませんでした'); return; }
  const c = zoomUserGet_(token, '/my_notes/notes/' + encodeURIComponent(first.note_id) + '/content?include=transcript');
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

/** 本体：まだ保存していないノートをドライブに保存する
 *  My Notes の一覧は「会議ごと」にしか取れない（meeting_id が必須）ため、
 *  会社の鍵で過去の会議の一覧を取り、会議ごとにノートを探す。
 *  初回は過去365日分、それ以降は直近14日分を見る。 */
function runMyNotes() {
  const props = PropertiesService.getScriptProperties();
  const folder = DriveApp.getFolderById(mustGet_(props, 'FOLDER_ID'));
  const token = myNotesToken_();
  const started = Date.now();
  const backfilled = props.getProperty('MYNOTES_BACKFILL_DONE') === '1';
  const got = listPastMeetings_(backfilled ? 14 : 365);
  Logger.log('会議 ' + got.meetings.length + '件を確認（取得元: ' + got.source + '）');

  for (const m of got.meetings) {
    if (Date.now() - started > 5 * 60 * 1000) {
      Logger.log('時間切れが近いので、残りは次の回に保存します');
      return;
    }
    const notes = notesForMeeting_(token, m, false).notes;
    for (const n of notes) {
      const doneKey = 'note_' + n.note_id;
      // 一度保存したノートでも、あとで書き足された（更新日時が変わった）ら保存し直す
      if (props.getProperty(doneKey) === String(n.modified_time)) continue;
      const c = zoomUserGet_(token, '/my_notes/notes/' + encodeURIComponent(n.note_id) + '/content?include=transcript');
      if (c.code !== 200) {
        Logger.log('中身の取得に失敗（飛ばします）: ' + n.note_name + ' ' + c.code);
        continue;
      }
      saveNote_(props, folder, n, c.json);
      props.setProperty(doneKey, String(n.modified_time));
    }
  }
  if (!backfilled) {
    props.setProperty('MYNOTES_BACKFILL_DONE', '1');
    Logger.log('過去分の保存が終わりました。次からは直近14日分だけを見ます');
  }
}

// ---- 会議の一覧（会社の鍵で取る） ----

/** 過去 days 日の会議を返す。使える方法を順に試す：①利用状況レポート ②過去の会議一覧 ③クラウド録画 */
function listPastMeetings_(days) {
  const props = PropertiesService.getScriptProperties();
  const s2s = zoomToken_(props);
  const user = encodeURIComponent(mustGet_(props, 'ZOOM_USER_EMAIL'));
  const now = new Date();
  const notes = [];

  // ① レポート（1回に30日までなので区切って聞く）
  const report = [];
  let reportOk = true;
  for (let end = now; end > new Date(now.getTime() - days * 864e5) && reportOk; end = new Date(end.getTime() - 30 * 864e5)) {
    const from = new Date(Math.max(end.getTime() - 30 * 864e5, now.getTime() - days * 864e5));
    let next = '';
    do {
      const r = zoomUserGet_(s2s, '/report/users/' + user + '/meetings?type=past&page_size=300'
        + '&from=' + Utilities.formatDate(from, TZ, 'yyyy-MM-dd') + '&to=' + Utilities.formatDate(end, TZ, 'yyyy-MM-dd')
        + (next ? '&next_page_token=' + encodeURIComponent(next) : ''));
      if (r.code !== 200) { reportOk = false; notes.push('レポート ' + r.code + ' ' + (r.json && r.json.message)); break; }
      (r.json.meetings || []).forEach(m => report.push(m));
      next = r.json.next_page_token || '';
    } while (next);
  }
  if (reportOk) return { meetings: uniqueMeetings_(report), source: 'レポート', note: '' };

  // ② 過去の会議一覧
  const prev = [];
  let next = '';
  let prevOk = true;
  do {
    const r = zoomUserGet_(s2s, '/users/' + user + '/meetings?type=previous_meetings&page_size=300'
      + (next ? '&next_page_token=' + encodeURIComponent(next) : ''));
    if (r.code !== 200) { prevOk = false; notes.push('過去の会議 ' + r.code + ' ' + (r.json && r.json.message)); break; }
    (r.json.meetings || []).forEach(m => prev.push(m));
    next = r.json.next_page_token || '';
  } while (next);
  if (prevOk) {
    const since = now.getTime() - days * 864e5;
    return { meetings: uniqueMeetings_(prev.filter(m => !m.start_time || new Date(m.start_time).getTime() >= since)), source: '過去の会議一覧', note: notes.join(' / ') };
  }

  // ③ クラウド録画（録画した会議だけ）
  const recs = listRecordings_(s2s, mustGet_(props, 'ZOOM_USER_EMAIL'), new Date(now.getTime() - Math.min(days, 30) * 864e5), now);
  return { meetings: uniqueMeetings_(recs), source: 'クラウド録画のみ', note: notes.join(' / ') };
}

function uniqueMeetings_(list) {
  const seen = {};
  return list.filter(m => {
    const k = m.uuid || String(m.id);
    if (seen[k]) return false;
    seen[k] = true;
    return true;
  }).sort((a, b) => new Date(b.start_time || 0) - new Date(a.start_time || 0));
}

/** 会議1件のノートを取る。meeting_id は「UUID」か「会議ID」のどちらで通るか分からないので、両方試して通った方を覚える */
function notesForMeeting_(token, m, verbose) {
  const props = PropertiesService.getScriptProperties();
  const uuidForm = m.uuid ? (/^\/|\/\//.test(m.uuid) ? encodeURIComponent(encodeURIComponent(m.uuid)) : encodeURIComponent(m.uuid)) : '';
  const forms = { uuid: uuidForm, id: m.id ? String(m.id) : '' };
  const preferred = props.getProperty('MYNOTES_ID_FORM');
  const order = preferred ? [preferred, preferred === 'uuid' ? 'id' : 'uuid'] : ['uuid', 'id'];
  for (const f of order) {
    if (!forms[f]) continue;
    const r = zoomUserGet_(token, '/my_notes/notes?meeting_id=' + forms[f]);
    if (verbose) {
      Logger.log('会議 ' + Utilities.formatDate(new Date(m.start_time || 0), TZ, 'MM/dd HH:mm') + ' / ' + f + ' で: ' + r.code + ' '
        + (r.code === 200 ? describe_(r.json) : (r.json && r.json.message)));
    }
    if (r.code === 200) {
      if (preferred !== f) props.setProperty('MYNOTES_ID_FORM', f);
      return { notes: r.json.notes || [] };
    }
  }
  return { notes: [] };
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
  body.appendParagraph('Zoomのノート: ' + (n.note_link || content.note_url || ''));
  body.appendParagraph('ノートID: ' + n.note_id + ' / 更新: ' + n.modified_time);
  body.appendHorizontalRule();
  if (content.generated_note_content) {
    body.appendParagraph('■ 自動の要約').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph(String(content.generated_note_content));
  }
  body.appendParagraph('■ 自分のメモ').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(memo || '（なし）');
  body.appendParagraph('■ 書き起こし').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(transcript || '（なし）');
  doc.saveAndClose();
  DriveApp.getFileById(doc.getId()).moveTo(folder);
  Logger.log('保存: ' + title);
}

/** 書き起こしを「時刻 話者: 本文」の行にする。
 *  My Notes は transcript{items, speakers} の形（items が発言、speakers が話者の名簿）。
 *  項目名が細かく違っても拾えるよう、よくある名前を順に試し、だめならその行をそのまま書く。 */
function transcriptText_(content) {
  const t = content.transcript !== undefined ? content.transcript
    : content.meeting_transcript !== undefined ? content.meeting_transcript : null;
  if (t === null || t === undefined) return '';
  if (typeof t === 'string') return t;

  // 話者の名簿（id → 名前）
  const names = {};
  (Array.isArray(t.speakers) ? t.speakers : []).forEach(sp => {
    if (!sp || typeof sp !== 'object') return;
    const id = sp.speaker_id !== undefined ? sp.speaker_id : sp.id;
    const name = sp.name || sp.speaker_name || sp.display_name || sp.user_name || '';
    if (id !== undefined) names[String(id)] = name;
  });

  const list = Array.isArray(t) ? t
    : Array.isArray(t.items) ? t.items
    : Array.isArray(t.timeline) ? t.timeline
    : Array.isArray(t.segments) ? t.segments : null;
  if (!list) return t.content && typeof t.content === 'string' ? t.content : JSON.stringify(t, null, 1);

  return list.map(s => {
    if (typeof s === 'string') return s;
    const sid = s.speaker_id !== undefined ? s.speaker_id : s.speaker;
    const who = (sid !== undefined && names[String(sid)]) || s.speaker_name || s.username || s.user_name
      || (typeof s.speaker === 'string' ? s.speaker : '') || (sid !== undefined ? '話者' + sid : '');
    const when = s.start_time || s.ts || s.timestamp || s.start || '';
    const text = s.text || s.content || s.sentence || s.transcript || '';
    if (!text) return JSON.stringify(s);
    return [when, who ? who + ':' : '', text].filter(Boolean).join(' ');
  }).join('\n');
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
