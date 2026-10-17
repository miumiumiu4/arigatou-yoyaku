// ===== 3日間 集客戦略準備の宿題（type=prep）=====
// ever-prep（GitHub Pages）から POST される。doPost の先頭の分岐に
//   if (p.type === 'prep') return handlePrep_(p);
// を足す（p は e.parameter）。
var PREP_KEY = 'ever-prep-v1';
var PREP_SHEET = '3日間宿題';
var PREP_KEYS = {
  '1': ['sales_now','jobs_now','target_sales','target_when','unit_price','people_needed','missing','hw1_note'],
  '2': ['channels','reviews_count','inquiries_month','ask_review','spend_time','spend_money','quit_channel','gap'],
  '3': ['budget_ok','budget_line','loan','box','box_detail','kangaemasu','reasons','decide_one','wish']
};

function prepHeader_() {
  var h = ['更新日時', 'メール', '名前'];
  ['1','2','3'].forEach(function (d) {
    h.push('d' + d + '_at');
    PREP_KEYS[d].forEach(function (k) { h.push('d' + d + '_' + k); });
    h.push('d' + d + '_json');
  });
  return h;
}

function handlePrep_(p) {
  var out = function (o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); };
  if (p.key !== PREP_KEY) return out({ ok: false });
  var day = String(p.day || '');
  if (!PREP_KEYS[day]) return out({ ok: false });
  var mail = String(p.mail || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail) || mail.length > 254) return out({ ok: false });

  // 答えは決まったキーだけ・長さを切って受け取る
  var answers = {};
  try { answers = JSON.parse(String(p.answers || '{}')); } catch (e) { answers = {}; }
  var clean = {};
  PREP_KEYS[day].forEach(function (k) {
    var v = answers[k];
    if (Array.isArray(v)) clean[k] = v.slice(0, 12).map(function (x) { return String(x).slice(0, 300); });
    else clean[k] = String(v == null ? (p[k] || '') : v).slice(0, 2000);
  });

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var ss = SpreadsheetApp.getActive();
    var sh = ss.getSheetByName(PREP_SHEET);
    var head = prepHeader_();
    if (!sh) {
      sh = ss.insertSheet(PREP_SHEET);
      sh.getRange(1, 1, 1, head.length).setValues([head]);
      sh.setFrozenRows(1);
    }
    var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
    var last = sh.getLastRow();
    var row = -1;
    if (last >= 2) {
      var mails = sh.getRange(2, 2, last - 1, 1).getValues();
      for (var i = mails.length - 1; i >= 0; i--) {
        if (String(mails[i][0]).toLowerCase() === mail) { row = i + 2; break; }
      }
    }
    var vals = row > 0 ? sh.getRange(row, 1, 1, head.length).getValues()[0] : head.map(function () { return ''; });
    vals[0] = now;
    vals[1] = mail;
    var name = String(p.name || '').slice(0, 100);
    if (name && name.indexOf('%') < 0) vals[2] = name;
    vals[head.indexOf('d' + day + '_at')] = now;
    PREP_KEYS[day].forEach(function (k) {
      var v = clean[k];
      vals[head.indexOf('d' + day + '_' + k)] = Array.isArray(v) ? v.join('、') : v;
    });
    vals[head.indexOf('d' + day + '_json')] = JSON.stringify(clean);
    // 数式として読まれないように
    vals = vals.map(function (v) { return (typeof v === 'string' && /^[=+\-@]/.test(v)) ? "'" + v : v; });
    if (row > 0) sh.getRange(row, 1, 1, head.length).setValues([vals]);
    else sh.appendRow(vals);
  } finally {
    lock.releaseLock();
  }
  // events にも1行（既存の記録関数があればそれを使う：type=prep_d1 など）
  return out({ ok: true });
}

// ===== 集計用の書き出し（Mac の定期作業が読む）=====
// doGet の先頭に
//   if (e.parameter.t === 'prepexport') return prepExport_(e.parameter);
// を足す。合言葉はスクリプトプロパティ PREP_EXPORT_KEY に入れる（コードやGitHubには書かない）。
function prepExport_(p) {
  var out = function (o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); };
  var key = PropertiesService.getScriptProperties().getProperty('PREP_EXPORT_KEY');
  if (!key || p.k !== key) return out({ ok: false });
  var ss = SpreadsheetApp.getActive();
  var read = function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh || sh.getLastRow() < 1) return [];
    return sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getDisplayValues();
  };
  return out({ ok: true, prep: read(PREP_SHEET), survey: read('会議アンケート') });
}
