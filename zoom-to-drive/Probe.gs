/**
 * My Notes がこのアプリ（Server-to-Server OAuth）で読めるかを調べるための、試し用の関数。
 * データは保存しない。結果（URLごとの応答コードと、返ってきた項目名だけ）をログに出す。
 * 使い方：Zoomアプリに my_notes の3つのスコープを足したあと、関数 probeMyNotes を実行する。
 */
function probeMyNotes() {
  const props = PropertiesService.getScriptProperties();
  const token = zoomToken_(props);
  const user = mustGet_(props, 'ZOOM_USER_EMAIL');
  const u = encodeURIComponent(user);

  // 直近30日のクラウド録画から、会議IDを1つ借りる（会議に紐づくノートを探す試し用）
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 24 * 3600 * 1000);
  const meetings = listRecordings_(token, user, from, to);
  const mid = meetings.length ? meetings[0].id : '';
  const muuid = meetings.length ? encodeURIComponent(encodeURIComponent(meetings[0].uuid)) : '';

  const candidates = [
    '/my_notes/notes?page_size=10',
    '/my_notes/notes?user_id=' + u + '&page_size=10',
    '/users/' + u + '/my_notes/notes?page_size=10',
    '/users/me/my_notes/notes?page_size=10',
    mid ? '/my_notes/notes?meeting_id=' + mid : '',
    muuid ? '/my_notes/notes?meeting_id=' + muuid : '',
    '/docs/archives?products=my_notes&page_size=10',
  ].filter(Boolean);

  Logger.log('録画の会議数（直近30日）: ' + meetings.length);
  candidates.forEach(path => {
    const res = UrlFetchApp.fetch('https://api.zoom.us/v2' + path, {
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true,
    });
    const code = res.getResponseCode();
    let shape = '';
    try {
      const json = JSON.parse(res.getContentText());
      shape = code === 200
        ? '項目: ' + describe_(json)
        : 'エラー: ' + (json.code || '') + ' ' + (json.message || '');
    } catch (e) {
      shape = '（JSONではない応答）';
    }
    Logger.log(code + '  ' + path.replace(u, '{ユーザー}').replace(String(mid), '{会議ID}') + '  ' + shape);
  });
}

/** 中身は出さず、項目名と件数だけを返す */
function describe_(json) {
  return Object.keys(json).map(k => {
    const v = json[k];
    if (Array.isArray(v)) {
      const inner = v.length && typeof v[0] === 'object' ? '[' + Object.keys(v[0]).join(',') + ']' : '';
      return k + '(' + v.length + '件)' + inner;
    }
    return k;
  }).join(' / ');
}

/**
 * 会社全体の保管庫（/docs/archives）の正しい聞き方を探す試し。
 * 日付の範囲（from / to）と product の書き方を変えて、順に聞いてみる。データは保存しない。
 */
function probeArchives() {
  const props = PropertiesService.getScriptProperties();
  const token = zoomToken_(props);
  const now = new Date();
  const iso = d => Utilities.formatDate(d, 'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'");
  const day = d => Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd');
  const ago = n => new Date(now.getTime() - n * 24 * 3600 * 1000);

  const candidates = [
    'from=' + iso(ago(7)) + '&to=' + iso(now) + '&page_size=10',
    'from=' + iso(ago(7)) + '&to=' + iso(now) + '&page_size=10&products=my_notes',
    'from=' + iso(ago(7)) + '&to=' + iso(now) + '&page_size=10&product=my_notes',
    'from=' + day(ago(7)) + '&to=' + day(now) + '&page_size=10',
    'from=' + iso(ago(30)) + '&to=' + iso(now) + '&page_size=10',
    'from=' + iso(ago(1)) + '&to=' + iso(now) + '&page_size=10',
  ];

  candidates.forEach(q => {
    const res = UrlFetchApp.fetch('https://api.zoom.us/v2/docs/archives?' + q, {
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true,
    });
    const code = res.getResponseCode();
    let shape = '';
    try {
      const json = JSON.parse(res.getContentText());
      if (code === 200) {
        shape = '項目: ' + describe_(json) + productCounts_(json);
      } else {
        shape = 'エラー: ' + (json.code || '') + ' ' + (json.message || '');
      }
    } catch (e) {
      shape = '（JSONではない応答）';
    }
    Logger.log(code + '  /docs/archives?' + q + '  ' + shape);
  });
}

/** 一覧の中の product の種類ごとの件数だけを返す（中身は出さない） */
function productCounts_(json) {
  const counts = {};
  Object.keys(json).forEach(k => {
    if (!Array.isArray(json[k])) return;
    json[k].forEach(item => {
      if (item && typeof item === 'object' && item.product) counts[item.product] = (counts[item.product] || 0) + 1;
    });
  });
  const keys = Object.keys(counts);
  return keys.length ? ' / 種類ごとの件数: ' + keys.map(p => p + '=' + counts[p]).join(', ') : '';
}
