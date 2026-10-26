/**
 * 電子契約（簡易版）— Code.gs と同じ Apps Script プロジェクトに追加するファイル
 *
 * 流れ：甲（作成者）が契約書を作って署名 → 乙に署名用URLをメール → 乙が署名
 *       → 署名済みPDFをGoogleドライブに保管し、双方にメール送付
 *
 * スクリプト プロパティ（プロジェクトの設定）に追加：
 *   CONTRACT_PASSCODE … 契約を作成するときの合言葉（必須。無いと誰でも作成メールを送れてしまうため）
 *   SITE_URL          … 公開URLの先頭（例 https://ユーザー名.github.io/arigatou-yoyaku/）署名リンクの改ざん防止（推奨）
 * 契約書の文面は ContractTemplates.gs に置き、合言葉を入れた人にだけ返します。
 * 追加後は setup() を再実行し、ウェブアプリを「新バージョン」で再デプロイしてください。
 */

const SHEET_CONTRACT = "契約";
const CONTRACT_HEADERS = [
  "契約ID","作成日時","種類","タイトル","本文","本文ハッシュ(SHA-256)",
  "甲 氏名","甲 メール","乙 氏名","乙 メール","署名トークン","状態",
  "甲署名画像ID","乙署名画像ID","乙署名日時","乙端末情報","署名済PDF ID","署名済PDF URL"
];

function contractFolder_() {
  const it = DriveApp.getFoldersByName("電子契約");
  return it.hasNext() ? it.next() : DriveApp.createFolder("電子契約");
}
function sha256_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
    .map(function (b) { return ("0" + (b < 0 ? b + 256 : b).toString(16)).slice(-2); }).join("");
}
function contractFmtDate_(d) { return Utilities.formatDate(d, "Asia/Tokyo", "yyyy/MM/dd HH:mm:ss"); }
function esc_(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function saveSignature_(dataUrl, name) {
  const m = /^data:image\/png;base64,(.+)$/.exec(dataUrl || "");
  if (!m) throw new Error("署名が正しくありません");
  const blob = Utilities.newBlob(Utilities.base64Decode(m[1]), "image/png", name + ".png");
  // ドライブに保存できないとき（権限がまだ無いなど）は、署名の画像そのものをシートに残す
  try { return contractFolder_().createFile(blob).getId(); }
  catch (e) {
    console.warn("署名をドライブに保存できず、シートに保存します", e);
    if (dataUrl.length > 48000) throw new Error("署名の画像が大きすぎます。小さめに書き直してください");
    return dataUrl;
  }
}
function sigDataUrl_(fileId) {
  if (String(fileId).indexOf("data:") === 0) return String(fileId);   // シートに保存した署名
  const b = DriveApp.getFileById(fileId).getBlob();
  return "data:image/png;base64," + Utilities.base64Encode(b.getBytes());
}
function isEmail_(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s || ""); }

function findContract_(id) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CONTRACT);
  if (!sh) throw new Error("setup() を実行してください");
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === id) {
      const o = {};
      CONTRACT_HEADERS.forEach(function (h, j) { o[h] = rows[i][j]; });
      return { sh: sh, row: i + 1, o: o };
    }
  }
  throw new Error("契約が見つかりません");
}
function checkToken_(c, t) {
  if (!t || c.o["署名トークン"] !== t) throw new Error("署名リンクが正しくないか、すでに使用済みです");
}

function checkPasscode_(d) {
  const pass = PropertiesService.getScriptProperties().getProperty("CONTRACT_PASSCODE");
  if (!pass || d.passcode !== pass) { Utilities.sleep(1500); throw new Error("合言葉が違います"); }
}

/* 甲が合言葉を入れたときに、契約書ひな形を返す（ContractTemplates.gs） */
function handleContractTemplates_(d) {
  checkPasscode_(d);
  return { templates: CONTRACT_TEMPLATES };
}

/* 甲が契約を作成 */
function handleContractCreate_(d) {
  checkPasscode_(d);
  if (!d.title || !d.body || !d.aName || !d.bName) throw new Error("必須項目が未入力です");
  if (!isEmail_(d.aEmail) || !isEmail_(d.bEmail)) throw new Error("メールアドレスを確認してください");
  if (String(d.body).length > 20000) throw new Error("本文が長すぎます");
  const site = PropertiesService.getScriptProperties().getProperty("SITE_URL");
  if (site && String(d.signBase || "").indexOf(site) !== 0) throw new Error("署名ページのURLが許可されていません");

  const id = "C" + Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyyMMdd") + "-" + Utilities.getUuid().slice(0, 6).toUpperCase();
  const token = Utilities.getUuid().replace(/-/g, "");
  const sigId = saveSignature_(d.aSignature, id + "_A");
  const sh = ensureSheet_(SpreadsheetApp.getActiveSpreadsheet(), SHEET_CONTRACT, CONTRACT_HEADERS);
  sh.appendRow([id, contractFmtDate_(new Date()), d.kind2 || "", d.title, d.body, sha256_(d.body),
    d.aName, d.aEmail, d.bName, d.bEmail, token, "署名待ち", sigId, "", "", "", "", ""]);

  logEvent_(id, "契約書を作成し甲が署名", "作成：合言葉で開いた画面から／本文ハッシュ：" + sha256_(d.body) + "／乙：" + d.bName + "（" + d.bEmail + "）");
  const url = d.signBase + "?id=" + id + "&t=" + token;
  safeMail_(d.bEmail, "【電子契約】" + d.title + " への署名のお願い",
    d.bName + " 様\n\n" + d.aName + " 様より、契約書「" + d.title + "」の署名依頼が届いています。\n" +
    "内容をご確認のうえ、下記URLから署名してください。\n\n" + url + "\n\n" +
    otpMailText_(id, OTP_AUTO_TTL) + "\n\n" +
    "※このURLは " + d.bName + " 様専用です。他の方に共有しないでください。\n契約ID：" + id);
  safeMail_(d.aEmail, "【電子契約】署名依頼を送信しました（" + id + "）",
    d.aName + " 様\n\n契約書「" + d.title + "」に署名し、" + d.bName + " 様へ署名依頼を送りました。\n" +
    "乙の署名が完了すると、署名済みPDFがメールで届きます。\n契約ID：" + id);
  return { id: id, signUrl: url };
}

/* 乙が署名ページを開いたとき */
function handleContractGet_(id, t) {
  const c = findContract_(id);
  checkToken_(c, t);
  const o = c.o;
  if (o["状態"] === "署名待ち") {
    const lock = LockService.getScriptLock();
    if (lock.tryLock(10000)) { try { logEvent_(id, "乙が署名ページを開いた", "契約書の本文を表示"); } finally { lock.releaseLock(); } }
  }
  return {
    id: id, title: o["タイトル"], body: o["本文"], aName: o["甲 氏名"], bName: o["乙 氏名"],
    status: o["状態"], createdAt: o["作成日時"], hash: o["本文ハッシュ(SHA-256)"],
    aSignature: sigDataUrl_(o["甲署名画像ID"]),
    signedAt: o["乙署名日時"], pdfUrl: o["状態"] === "署名済み" ? o["署名済PDF URL"] : "",
    edelivery: getContractExtra_(c, "電子交付の承諾").indexOf("承諾（") === 0,
    bEmailMasked: String(o["乙 メール"]).replace(/^(.).*(@.*)$/, "$1***$2")
  };
}

/* 乙が署名（2026-10-22：確認コードでの本人確認・重要事項の同意・動画の記録・合意締結証明書・第三者タイムスタンプを追加） */
function handleContractSign_(d) {
  const c = findContract_(d.id);
  checkToken_(c, d.t);
  const o = c.o;
  if (o["状態"] !== "署名待ち") throw new Error("この契約はすでに署名済みです");
  if (!d.agree) throw new Error("内容への同意にチェックしてください");
  // 特定商取引法の契約書面は、電子で受け取る承諾（契約内容への同意とは別）が先に要る（ContractEvidence.gs の 7）
  const edelivery = String(o["本文"]).indexOf(EDELIVERY_NEED) >= 0 ? getContractExtra_(c, "電子交付の承諾") : "";
  if (String(o["本文"]).indexOf(EDELIVERY_NEED) >= 0 && edelivery.indexOf("承諾（") !== 0) throw new Error("先に「書面の受け取り方法」で電子での受け取りを承諾してください");
  const identity = checkOtp_(c, d.otp);                         // 確認コードが合わなければここで止まる
  // 乙の画面に表示していた本文の指紋と、記録の本文の指紋が同じか（「署名のとき別の文が出ていた」を防ぐ）
  if (d.shownHash) {
    const stored = sha256_(String(o["本文"]));
    if (String(d.shownHash).toLowerCase() !== stored) throw new Error("表示している契約書が最新ではありません。ページを開き直してください");
    const same = stored === String(o["本文ハッシュ(SHA-256)"]).toLowerCase();
    logEvent_(d.id, "乙の画面の本文が記録と一致", "乙の端末で計算した本文のSHA-256：" + d.shownHash + (same ? "（作成時の本文ハッシュとも一致）" : "（作成時の本文ハッシュと不一致・要確認）"));
  }
  const consents = (Array.isArray(d.consents) ? d.consents : []).map(function (x) { return "☑ " + String(x).slice(0, 200); }).join("\n");
  const v = d.video || {};
  const video = v.required ? (v.watched ? "最後まで視聴（終わった時刻 " + String(v.endedAt || "").slice(0, 40) + "、動画ID " + String(v.id || "").slice(0, 20) + "）" : "未視聴") : "この契約書には読み上げ動画なし";
  if (v.required) logEvent_(d.id, "読み上げ動画を最後まで視聴", video);
  if (consents) logEvent_(d.id, "重要事項に個別に同意", consents.replace(/\n/g, "／"));
  const bSigId = saveSignature_(d.bSignature, d.id + "_B");
  const now = new Date();
  const signedAt = contractFmtDate_(now);
  const ua = String(d.userAgent || "").slice(0, 300);
  logEvent_(d.id, "乙が署名", "手書きサイン＋「内容に同意します」にチェック／端末：" + ua.slice(0, 120));

  const set = function (h, v) { c.sh.getRange(c.row, CONTRACT_HEADERS.indexOf(h) + 1).setValue(v); };
  set("乙署名画像ID", bSigId);
  set("乙署名日時", signedAt);
  set("乙端末情報", ua);
  set("署名トークン", "");            // 署名後はリンクを無効化
  set("状態", "署名済み");

  // 合意締結証明書つきの PDF（PDF にできなければ HTML のまま）
  const extra = { identity: identity, video: video, consents: consents, signedAt: signedAt, ua: ua, edelivery: edelivery };
  const html = contractPdfHtml_(o, sigDataUrl_(o["甲署名画像ID"]), sigDataUrl_(bSigId), signedAt, certificateHtml_(o, extra));
  const base = o["契約ID"] + "_" + o["タイトル"] + "_署名済";
  let doc;
  try { doc = Utilities.newBlob(html, "text/html", "x.html").getAs("application/pdf").setName(base + ".pdf"); }
  catch (e) { console.warn("PDF にできず HTML で保存", e); doc = Utilities.newBlob(html, "text/html", base + ".html"); }
  const docHash = evSha256Bytes_(doc.getBytes());
  const ts = getTimestamp_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, doc.getBytes()));
  const tsr = ts.ok ? Utilities.newBlob(ts.bytes, "application/timestamp-reply", base + ".tsr") : null;
  logEvent_(d.id, "署名済みの書面を作成", "書面のSHA-256：" + docHash + (ts.ok ? "／第三者タイムスタンプ：" + ts.time + "（" + ts.tsa + "）" : "／タイムスタンプは取得できず"));

  let pdfId = "", pdfUrl = "（ドライブに保存できず。書面は甲乙へのメールに添付）";
  try { const file = contractFolder_().createFile(doc); pdfId = file.getId(); pdfUrl = file.getUrl(); if (tsr) contractFolder_().createFile(tsr); }
  catch (e) { console.warn("書面をドライブに保存できず、メール添付だけにします", e); }
  set("署名済PDF ID", pdfId);
  set("署名済PDF URL", pdfUrl);
  setContractExtra_(c, "PDFハッシュ(SHA-256)", docHash);
  setContractExtra_(c, "タイムスタンプ(RFC3161)", ts.ok ? ts.token : "（取得できず）");
  setContractExtra_(c, "タイムスタンプ時刻", ts.ok ? ts.time + "（" + ts.tsa + "）" : "");
  setContractExtra_(c, "本人確認", identity);
  setContractExtra_(c, "動画視聴", video);
  setContractExtra_(c, "重要事項の同意", consents);
  applyMarkSigned_(o["契約ID"], signedAt, pdfUrl);   // 申込みから作った契約なら「契約申込み」シートも更新（ContractApply.gs）

  const body = "契約書「" + o["タイトル"] + "」の署名が完了しました。\n契約ID：" + o["契約ID"] +
    "\n署名日時：" + signedAt + "\n本文ハッシュ(SHA-256)：" + o["本文ハッシュ(SHA-256)"] +
    "\n署名済み書面のハッシュ(SHA-256)：" + docHash +
    (ts.ok ? "\n第三者タイムスタンプ（RFC 3161・" + ts.tsa + "）：" + ts.time + "（証明ファイル .tsr を添付）" : "") +
    "\n\n署名済みの書面を添付しています（最後のページが合意締結証明書です）。大切に保管してください。" +
    "\n書面が書き換えられていないかは、次のページに書面を入れると確かめられます。\nhttps://miumiumiu4.github.io/arigatou-yoyaku/verify.html";
  const atts = tsr ? [doc, tsr] : [doc];
  [o["甲 メール"], o["乙 メール"]].forEach(function (to) {
    try { MailApp.sendEmail({ to: to, subject: "【電子契約】署名完了：" + o["タイトル"], body: body, attachments: atts, name: "電子契約" }); }
    catch (e) { console.warn("mail error", e); }
  });
  const sent = logEvent_(d.id, "署名完了のメールを送信", "甲：" + o["甲 メール"] + "／乙：" + o["乙 メール"] + "（書面" + (tsr ? "とタイムスタンプ" : "") + "を添付）");
  // 署名までの記録の鎖の先頭を、第三者タイムスタンプで固定する（あとから記録を作り直していないことの裏付け）
  if (sent) {
    const ats = getTimestamp_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, sent));
    logEvent_(d.id, "記録の鎖を時刻証明で固定", "固定した記録のハッシュ：" + sent + (ats.ok ? "／" + ats.time + "（" + ats.tsa + "）／証明：" + ats.token : "／タイムスタンプは取得できず"));
  }
  return { id: o["契約ID"], signedAt: signedAt, docHash: docHash, tsTime: ts.ok ? ts.time : "" };
}

/* 本文の「━」だけの行で挟んだところを赤枠・赤字にする（特定商取引法の契約書面のクーリングオフの記載）。本文そのもの（ハッシュ）は変えない */
function redBoxHtml_(body) {
  return String(body).split(/^━{10,}$\n?/m).map(function (p, i) { return i % 2 ? '<div class="redbox">' + esc_(p.replace(/\n$/, "")) + '</div>' : esc_(p); }).join("");
}

function contractPdfHtml_(o, aSig, bSig, signedAt, certHtml) {
  return '<html><head><meta charset="utf-8"><style>' +
    'body{font-family:sans-serif;font-size:11pt;line-height:1.8;color:#111}h1{text-align:center;font-size:17pt}' +
    '.body{white-space:pre-wrap}.sig{margin-top:24px}.sig td{vertical-align:bottom;padding:6px 14px 6px 0}' +
    '.cert,.log{border-collapse:collapse;width:100%;font-size:8.5pt}.cert th,.cert td,.log th,.log td{border:1px solid #999;padding:4px 6px;text-align:left;vertical-align:top}.cert th{width:28%;background:#f3f3f3}.h{word-break:break-all;font-family:monospace}' +
    '.redbox{border:2px solid #d00;color:#d00;padding:8px 10px;margin:8px 0;white-space:pre-wrap}' +
    '.sig img{height:70px;border-bottom:1px solid #333}.log{margin-top:28px;border-top:1px solid #999;padding-top:8px;font-size:8.5pt;color:#444;word-break:break-all}' +
    '</style></head><body><h1>' + esc_(o["タイトル"]) + '</h1><div class="body">' + redBoxHtml_(o["本文"]) + '</div>' +
    '<table class="sig"><tr><td>甲：' + esc_(o["甲 氏名"]) + '<br><img src="' + aSig + '"></td>' +
    '<td>乙：' + esc_(o["乙 氏名"]) + '<br><img src="' + bSig + '"></td></tr></table>' +
    '<div class="log">【署名記録】契約ID：' + esc_(o["契約ID"]) + '／作成：' + esc_(o["作成日時"]) + '／乙署名：' + esc_(signedAt) +
    '<br>甲メール：' + esc_(o["甲 メール"]) + '／乙メール：' + esc_(o["乙 メール"]) +
    '<br>本文ハッシュ(SHA-256)：' + esc_(o["本文ハッシュ(SHA-256)"]) + '</div>' + (certHtml || '') + '</body></html>';
}

/* 紹介ノートなどから：署名済みか確かめる（合言葉が要る。本文・署名・メールは返さない） */
function handleContractStatus_(d) {
  const pass = PropertiesService.getScriptProperties().getProperty("CONTRACT_PASSCODE");
  if (!pass || d.passcode !== pass) throw new Error("作成用パスコードが違います");
  const c = findContract_(String(d.id || ""));
  return { id: c.o["契約ID"], status: c.o["状態"], signedAt: c.o["乙署名日時"] || "", hash: c.o["本文ハッシュ(SHA-256)"] };
}
