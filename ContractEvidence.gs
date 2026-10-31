/**
 * 電子契約の証拠力を上げる部品（2026-10-22 追加）
 *  1. 本人確認：乙が署名する前に、乙のメールに6桁の確認コードを送り、入力してもらう（署名依頼メールに同封／contract_otp_send で再送 → contract_sign の otp）
 *  2. 重要事項の個別同意・読み上げ動画の視聴を記録（contract_sign の consents・video）
 *  3. 改ざんしにくい記録：「契約ログ」シートに、出来事ごとに前の行のハッシュをつないだ鎖（ハッシュチェーン）で記録
 *  4. 第三者タイムスタンプ：完成した PDF の SHA-256 を DigiCert のタイムスタンプ局（RFC 3161）に送り、時刻証明（.tsr）を受け取る
 *  5. 合意締結証明書：PDF の最後のページに、記録・本人確認・同意・ハッシュをまとめる
 *  6. 確かめる窓口：contract_verify（PDF のハッシュから契約の記録とログの鎖の正しさを返す。verify.html から使う）
 *  7. 電子交付の承諾（2026-10-22 模擬裁判の判決対策）：特定商取引法の契約書面を電子で受け取ることへの承諾を、
 *     契約内容への同意とは別に、本文を見せる前に取る（contract_edelivery）。承諾は記録の鎖に残し、時刻証明で固定する
 */
const SHEET_CONTRACT_LOG = "契約ログ";
const CONTRACT_LOG_HEADERS = ["日時", "契約ID", "出来事", "内容", "前のハッシュ", "このハッシュ"];
const CONTRACT_EXTRA_HEADERS = ["PDFハッシュ(SHA-256)", "タイムスタンプ(RFC3161)", "タイムスタンプ時刻", "本人確認", "動画視聴", "重要事項の同意", "電子交付の承諾"];
// 本文にこの言葉がある契約書（特定商取引法の契約書面）は、署名の前に電子交付の承諾が要る
const EDELIVERY_NEED = "電磁的方法で交付する";
const TSA_URLS = ["http://timestamp.digicert.com", "https://freetsa.org/tsr"];

function evHex_(bytes) { return bytes.map(function (b) { return ("0" + (b < 0 ? b + 256 : b).toString(16)).slice(-2); }).join(""); }
function evSha256Bytes_(bytes) { return evHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)); }

/* 「契約」シートの後ろに足した列の見出しを入れる（古いシートでも動くように） */
function ensureContractHeaders_(sh) {
  const all = CONTRACT_HEADERS.concat(CONTRACT_EXTRA_HEADERS);
  const cur = sh.getRange(1, 1, 1, all.length).getValues()[0];
  if (cur.some(function (v, i) { return v !== all[i]; })) sh.getRange(1, 1, 1, all.length).setValues([all]).setFontWeight("bold");
}
function setContractExtra_(c, h, v) {
  ensureContractHeaders_(c.sh);
  c.sh.getRange(c.row, CONTRACT_HEADERS.length + CONTRACT_EXTRA_HEADERS.indexOf(h) + 1).setValue(v);
}

function getContractExtra_(c, h) {
  const col = CONTRACT_HEADERS.length + CONTRACT_EXTRA_HEADERS.indexOf(h) + 1;
  return c.sh.getLastColumn() >= col ? String(c.sh.getRange(c.row, col).getValue() || "") : "";
}

/* 3. ハッシュチェーンの記録。どの行を書き換えても、それ以降のハッシュが合わなくなる */
function logEvent_(id, ev, detail) {
  try {
    const sh = ensureSheet_(SpreadsheetApp.getActiveSpreadsheet(), SHEET_CONTRACT_LOG, CONTRACT_LOG_HEADERS);
    const last = sh.getLastRow();
    const prev = last >= 2 ? String(sh.getRange(last, 6).getDisplayValue()) : "GENESIS";
    const at = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy/MM/dd HH:mm:ss.SSS");
    const d = String(detail || "").slice(0, 2000);
    const h = sha256_([prev, at, id, ev, d].join("|"));
    sh.appendRow(["'" + at, id, ev, "'" + d, "'" + prev, "'" + h]);   // 文字として残す（日時やハッシュが数字に変わらないように）
    return h;
  } catch (e) { console.warn("log error", e); return ""; }
}
/* 鎖が正しいか（全行を順に計算し直す） */
function verifyLogChain_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CONTRACT_LOG);
  if (!sh || sh.getLastRow() < 2) return { ok: true, rows: 0 };
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 6).getDisplayValues();
  let prev = "GENESIS";
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r[4] !== prev || sha256_([r[4], r[0], r[1], r[2], r[3]].join("|")) !== r[5]) return { ok: false, rows: rows.length, brokenAt: i + 2 };
    prev = r[5];
  }
  return { ok: true, rows: rows.length };
}
function logRowsFor_(id) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CONTRACT_LOG);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 6).getDisplayValues().filter(function (r) { return r[1] === id; });
}

/* 1. 本人確認コード
 *  甲が署名して依頼メールを送るとき、コードも一緒に送る（OTP_AUTO_TTL の間有効）。
 *  画面のボタンで送り直したコードは15分有効。メールが遅れて届くことがあるので、送り直しても前のコードは期限まで使える。
 *  CacheService は6時間までしか持てないので、コードはスクリプトプロパティに有効期限つきで置く。 */
const OTP_AUTO_TTL = 72 * 3600;
const OTP_BUTTON_TTL = 900;
function otpTtlText_(sec) { return sec >= 3600 ? (sec / 3600) + "時間" : (sec / 60) + "分"; }
function otpLoad_(props, id) {
  try { const o = JSON.parse(props.getProperty("otp_" + id) || "null"); if (o && Array.isArray(o.codes)) return o; } catch (e) {}
  return { codes: [], tries: 0 };
}
function issueOtp_(id, ttlSec) {
  const props = PropertiesService.getScriptProperties(), now = Date.now();
  Object.keys(props.getProperties()).forEach(function (k) {   // 期限切れのコードを掃除
    if (k.indexOf("otp_") !== 0) return;
    const o = otpLoad_(props, k.slice(4));
    if (!o.codes.some(function (x) { return x.exp >= now; })) props.deleteProperty(k);
  });
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const o = otpLoad_(props, id);
  o.codes = o.codes.filter(function (x) { return x.exp >= now; }).slice(-4);
  o.codes.push({ h: sha256_(code + "|" + id), exp: now + ttlSec * 1000 });
  o.tries = 0;
  props.setProperty("otp_" + id, JSON.stringify(o));
  return code;
}
function otpMailText_(id, ttlSec) {
  return "確認コード：" + issueOtp_(id, ttlSec) + "\n（署名の画面に入力してください。" + otpTtlText_(ttlSec) + "有効。切れたときは画面の「確認コードをメールで送り直す」で新しいコードが届きます）";
}
function handleContractOtpSend_(d) {
  const c = findContract_(String(d.id || ""));
  checkToken_(c, d.t);
  if (c.o["状態"] !== "署名待ち") throw new Error("この契約はすでに署名済みです");
  const cache = CacheService.getScriptCache();
  const nKey = "otp_sent_" + c.o["契約ID"], n = Number(cache.get(nKey) || 0);
  if (n >= 5) throw new Error("確認コードの送信回数が多すぎます。1時間ほどおいてからお試しください");
  const code = issueOtp_(c.o["契約ID"], OTP_BUTTON_TTL);
  cache.put(nKey, String(n + 1), 3600);
  safeMail_(c.o["乙 メール"], "【電子契約】確認コード " + code,
    c.o["乙 氏名"] + " 様\n\n契約書「" + c.o["タイトル"] + "」に署名するための確認コードです。\n\n確認コード：" + code +
    "\n\n署名の画面にこの6桁を入力してください（15分間有効）。\nお心当たりがない場合は、このメールを破棄してください。\n契約ID：" + c.o["契約ID"]);
  logEvent_(c.o["契約ID"], "確認コードを送信", "送信先：" + c.o["乙 メール"]);
  return { sent: true, to: c.o["乙 メール"].replace(/^(.).*(@.*)$/, "$1***$2") };
}
function checkOtp_(c, otp) {
  const id = c.o["契約ID"], props = PropertiesService.getScriptProperties(), now = Date.now();
  const o = otpLoad_(props, id);
  const live = o.codes.filter(function (x) { return x.exp >= now; });
  if (!live.length) throw new Error("確認コードの期限が切れています。「確認コードをメールで送り直す」を押して、新しいコードを入力してください");
  if (o.tries >= 5) throw new Error("確認コードを5回まちがえました。もう一度コードを送ってください");
  const h = sha256_(String(otp || "").replace(/\s/g, "") + "|" + id);
  if (!live.some(function (x) { return x.h === h; })) {
    o.tries++;
    props.setProperty("otp_" + id, JSON.stringify(o));
    Utilities.sleep(800);
    throw new Error("確認コードがちがいます");
  }
  props.deleteProperty("otp_" + id);
  logEvent_(id, "確認コードで本人確認", "乙のメール（" + c.o["乙 メール"] + "）に届いたコードが一致");
  return "メールの確認コードで確認（" + contractFmtDate_(new Date()) + "）";
}

/* 7. 電子交付の承諾（承諾しないときは紙の書面を求める知らせを甲に送る） */
function handleContractEdelivery_(d) {
  const c = findContract_(String(d.id || ""));
  checkToken_(c, d.t);
  if (c.o["状態"] !== "署名待ち") throw new Error("この契約はすでに署名済みです");
  const id = c.o["契約ID"];
  if (d.choice === "paper") {
    logEvent_(id, "乙が紙の書面を希望", "電子交付を承諾せず、紙の契約書面を希望");
    setContractExtra_(c, "電子交付の承諾", "承諾せず（紙の書面を希望 " + contractFmtDate_(new Date()) + "）");
    safeMail_(c.o["甲 メール"], "【電子契約】紙の契約書面の希望（" + id + "）",
      c.o["甲 氏名"] + " 様\n\n" + c.o["乙 氏名"] + " 様が、契約書「" + c.o["タイトル"] + "」を電子ではなく紙の書面で受け取ることを希望しました。\n" +
      "電子での署名はできない状態です。紙の契約書面を郵送などで交付してください（特定商取引法の契約書面）。\n契約ID：" + id);
    return { paper: true };
  }
  if (d.choice !== "accept") throw new Error("受け取り方法を選んでください");
  const at = contractFmtDate_(new Date());
  const text = "承諾（" + at + "）：契約書面を、署名ページでの表示と署名済みPDFの電子メール添付（" + c.o["乙 メール"] + " 宛・PDF形式）で受け取る";
  const h = logEvent_(id, "乙が電子交付を承諾", text + "／端末：" + String(d.userAgent || "").slice(0, 120));
  const ts = h ? getTimestamp_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h)) : { ok: false };
  if (h) logEvent_(id, "電子交付の承諾を時刻証明で固定", "固定した記録のハッシュ：" + h + (ts.ok ? "／" + ts.time + "（" + ts.tsa + "）／証明：" + ts.token : "／タイムスタンプは取得できず"));
  setContractExtra_(c, "電子交付の承諾", text + (ts.ok ? "／時刻証明 " + ts.time : ""));
  return { accepted: true, at: at };
}

/* 4. RFC 3161 タイムスタンプ（DigiCert。だめなら FreeTSA） */
function evDer_(tag, bytes) {
  const n = bytes.length, len = n < 128 ? [n] : n < 256 ? [0x81, n] : [0x82, n >> 8, n & 255];
  return [tag].concat(len, bytes);
}
function tsaRequest_(hashBytes) {
  const algo = evDer_(0x30, evDer_(0x06, [0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01]).concat([0x05, 0x00]));
  const imprint = evDer_(0x30, algo.concat(evDer_(0x04, hashBytes.map(function (b) { return b < 0 ? b + 256 : b; }))));
  const nonce = [1].concat(Utilities.getUuid().replace(/-/g, "").slice(0, 14).match(/../g).map(function (h) { return parseInt(h, 16); }));
  const body = evDer_(0x30, evDer_(0x02, [1]).concat(imprint, evDer_(0x02, nonce), [0x01, 0x01, 0xff]));
  return body.map(function (b) { return b > 127 ? b - 256 : b; });
}
function getTimestamp_(hashBytes) {
  const req = tsaRequest_(hashBytes);
  for (let i = 0; i < TSA_URLS.length; i++) {
    try {
      const r = UrlFetchApp.fetch(TSA_URLS[i], { method: "post", contentType: "application/timestamp-query", payload: req, muteHttpExceptions: true });
      if (r.getResponseCode() !== 200) continue;
      const b = r.getContent();
      // 状態が「許可（0）」か：先頭 SEQUENCE の中の PKIStatusInfo の INTEGER
      const u = b.map(function (x) { return x < 0 ? x + 256 : x; });
      const s = String.fromCharCode.apply(null, u.slice(0, 40));
      if (s.indexOf(String.fromCharCode(0x02, 0x01, 0x00)) < 0) continue;
      const all = String.fromCharCode.apply(null, u);
      const m = /\x18[\x0f-\x17](\d{14}(?:\.\d+)?Z)/.exec(all);
      const t = m ? m[1].replace(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2}).*$/, "$1-$2-$3 $4:$5:$6 UTC") : "";
      return { ok: true, tsa: TSA_URLS[i], token: Utilities.base64Encode(b), time: t, bytes: b };
    } catch (e) { console.warn("tsa error", TSA_URLS[i], e); }
  }
  return { ok: false };
}

/* 5. 合意締結証明書（PDF の最後のページ） */
function certificateHtml_(o, extra) {
  const rows = logRowsFor_(o["契約ID"]).map(function (r) {
    return "<tr><td>" + esc_(r[0]) + "</td><td>" + esc_(r[2]) + "</td><td>" + esc_(r[3]) + "</td><td class=h>" + esc_(r[5].slice(0, 16)) + "…</td></tr>";
  }).join("");
  return '<div style="page-break-before:always"><h2 style="text-align:center;font-size:15pt">合意締結証明書</h2>' +
    '<table class="cert">' +
    '<tr><th>契約ID</th><td>' + esc_(o["契約ID"]) + '</td></tr>' +
    '<tr><th>契約書名</th><td>' + esc_(o["タイトル"]) + '</td></tr>' +
    '<tr><th>甲</th><td>' + esc_(o["甲 氏名"]) + '（' + esc_(o["甲 メール"]) + '）</td></tr>' +
    '<tr><th>乙</th><td>' + esc_(o["乙 氏名"]) + '（' + esc_(o["乙 メール"]) + '）</td></tr>' +
    '<tr><th>本文ハッシュ(SHA-256)</th><td class=h>' + esc_(o["本文ハッシュ(SHA-256)"]) + '</td></tr>' +
    '<tr><th>乙の本人確認</th><td>' + esc_(extra.identity) + '</td></tr>' +
    '<tr><th>読み上げ動画</th><td>' + esc_(extra.video) + '</td></tr>' +
    '<tr><th>重要事項の個別同意</th><td>' + esc_(extra.consents || "（この契約書では重要事項の個別確認はありません）").replace(/\n/g, "<br>") + '</td></tr>' +
    (extra.edelivery ? '<tr><th>電子交付の承諾</th><td>' + esc_(extra.edelivery) + '</td></tr>' : '') +
    '<tr><th>乙の署名日時</th><td>' + esc_(extra.signedAt) + '</td></tr>' +
    '<tr><th>乙の端末</th><td class=h>' + esc_(extra.ua) + '</td></tr>' +
    '</table><h3 style="font-size:11pt;margin-top:16px">記録（ハッシュの鎖でつながった改ざん防止の記録）</h3>' +
    '<table class="log"><tr><th>日時</th><th>出来事</th><th>内容</th><th>記録のハッシュ</th></tr>' + rows + '</table>' +
    '<p style="font-size:8.5pt;color:#444;margin-top:12px">この PDF の SHA-256 は、署名完了のメールに記載し、第三者のタイムスタンプ局（RFC 3161）で時刻を証明しています（証明ファイル .tsr を同じメールに添付）。' +
    'PDF が書き換えられていないかは https://miumiumiu4.github.io/arigatou-yoyaku/verify.html で確かめられます。</p></div>';
}

/* 6. 確かめる窓口 */
function handleContractVerify_(h) {
  h = String(h || "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(h)) throw new Error("ハッシュの形がちがいます");
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CONTRACT);
  if (!sh) throw new Error("記録がありません");
  const n = CONTRACT_HEADERS.length + CONTRACT_EXTRA_HEADERS.length;
  const rows = sh.getRange(1, 1, sh.getLastRow(), n).getValues();
  const iPdf = CONTRACT_HEADERS.length, iTsT = CONTRACT_HEADERS.length + 2;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const o = {}; CONTRACT_HEADERS.forEach(function (k, j) { o[k] = r[j]; });
    const isPdf = String(r[iPdf]).toLowerCase() === h, isBody = String(o["本文ハッシュ(SHA-256)"]).toLowerCase() === h;
    if (isPdf || isBody) {
      const mask = function (n) { n = String(n || ""); return n ? n.slice(0, 1) + "＊".repeat(Math.max(1, n.length - 1)) : ""; };
      return { found: true, match: isPdf ? "署名済みPDF" : "本文", id: o["契約ID"], title: o["タイトル"], status: o["状態"],
               aName: o["甲 氏名"], bName: mask(o["乙 氏名"]), signedAt: o["乙署名日時"], tsTime: r[iTsT] || "", chain: verifyLogChain_() };
    }
  }
  return { found: false, chain: verifyLogChain_() };
}
