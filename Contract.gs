/**
 * 電子契約（簡易版）— Code.gs と同じ Apps Script プロジェクトに追加するファイル
 *
 * 流れ：甲（作成者）が契約書を作って署名 → 乙に署名用URLをメール → 乙が署名
 *       → 署名済みPDFをGoogleドライブに保管し、双方にメール送付
 *
 * スクリプト プロパティ（プロジェクトの設定）に追加：
 *   CONTRACT_PASSCODE … 契約を作成するときの合言葉（必須。無いと誰でも作成メールを送れてしまうため）
 *   SITE_URL          … 公開URLの先頭（例 https://ユーザー名.github.io/arigatou-yoyaku/）署名リンクの改ざん防止（推奨）
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
function fmtDate_(d) { return Utilities.formatDate(d, "Asia/Tokyo", "yyyy/MM/dd HH:mm:ss"); }
function esc_(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function saveSignature_(dataUrl, name) {
  const m = /^data:image\/png;base64,(.+)$/.exec(dataUrl || "");
  if (!m) throw new Error("署名が正しくありません");
  const blob = Utilities.newBlob(Utilities.base64Decode(m[1]), "image/png", name + ".png");
  return contractFolder_().createFile(blob).getId();
}
function sigDataUrl_(fileId) {
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

/* 甲が契約を作成 */
function handleContractCreate_(d) {
  const pass = PropertiesService.getScriptProperties().getProperty("CONTRACT_PASSCODE");
  if (!pass || d.passcode !== pass) throw new Error("作成用パスコードが違います");
  if (!d.title || !d.body || !d.aName || !d.bName) throw new Error("必須項目が未入力です");
  if (!isEmail_(d.aEmail) || !isEmail_(d.bEmail)) throw new Error("メールアドレスを確認してください");
  if (String(d.body).length > 20000) throw new Error("本文が長すぎます");
  const site = PropertiesService.getScriptProperties().getProperty("SITE_URL");
  if (site && String(d.signBase || "").indexOf(site) !== 0) throw new Error("署名ページのURLが許可されていません");

  const id = "C" + Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyyMMdd") + "-" + Utilities.getUuid().slice(0, 6).toUpperCase();
  const token = Utilities.getUuid().replace(/-/g, "");
  const sigId = saveSignature_(d.aSignature, id + "_A");
  const sh = ensureSheet_(SpreadsheetApp.getActiveSpreadsheet(), SHEET_CONTRACT, CONTRACT_HEADERS);
  sh.appendRow([id, fmtDate_(new Date()), d.kind2 || "", d.title, d.body, sha256_(d.body),
    d.aName, d.aEmail, d.bName, d.bEmail, token, "署名待ち", sigId, "", "", "", "", ""]);

  const url = d.signBase + "?id=" + id + "&t=" + token;
  safeMail_(d.bEmail, "【電子契約】" + d.title + " への署名のお願い",
    d.bName + " 様\n\n" + d.aName + " 様より、契約書「" + d.title + "」の署名依頼が届いています。\n" +
    "内容をご確認のうえ、下記URLから署名してください。\n\n" + url + "\n\n" +
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
  return {
    id: id, title: o["タイトル"], body: o["本文"], aName: o["甲 氏名"], bName: o["乙 氏名"],
    status: o["状態"], createdAt: o["作成日時"], hash: o["本文ハッシュ(SHA-256)"],
    aSignature: sigDataUrl_(o["甲署名画像ID"]),
    signedAt: o["乙署名日時"], pdfUrl: o["状態"] === "署名済み" ? o["署名済PDF URL"] : ""
  };
}

/* 乙が署名 */
function handleContractSign_(d) {
  const c = findContract_(d.id);
  checkToken_(c, d.t);
  const o = c.o;
  if (o["状態"] !== "署名待ち") throw new Error("この契約はすでに署名済みです");
  if (!d.agree) throw new Error("内容への同意にチェックしてください");
  const bSigId = saveSignature_(d.bSignature, d.id + "_B");
  const now = new Date();
  const signedAt = fmtDate_(now);
  const html = contractPdfHtml_(o, sigDataUrl_(o["甲署名画像ID"]), sigDataUrl_(bSigId), signedAt);
  const pdf = Utilities.newBlob(html, "text/html", "x.html").getAs("application/pdf").setName(o["契約ID"] + "_" + o["タイトル"] + "_署名済.pdf");
  const file = contractFolder_().createFile(pdf);

  const set = function (h, v) { c.sh.getRange(c.row, CONTRACT_HEADERS.indexOf(h) + 1).setValue(v); };
  set("乙署名画像ID", bSigId);
  set("乙署名日時", signedAt);
  set("乙端末情報", String(d.userAgent || "").slice(0, 300));
  set("署名済PDF ID", file.getId());
  set("署名済PDF URL", file.getUrl());
  set("署名トークン", "");            // 署名後はリンクを無効化
  set("状態", "署名済み");

  const body = "契約書「" + o["タイトル"] + "」の署名が完了しました。\n契約ID：" + o["契約ID"] +
    "\n署名日時：" + signedAt + "\n本文ハッシュ(SHA-256)：" + o["本文ハッシュ(SHA-256)"] + "\n\n署名済みPDFを添付しています。大切に保管してください。";
  [o["甲 メール"], o["乙 メール"]].forEach(function (to) {
    try { MailApp.sendEmail({ to: to, subject: "【電子契約】署名完了：" + o["タイトル"], body: body, attachments: [pdf], name: "電子契約" }); }
    catch (e) { console.warn("mail error", e); }
  });
  return { id: o["契約ID"], signedAt: signedAt };
}

function contractPdfHtml_(o, aSig, bSig, signedAt) {
  return '<html><head><meta charset="utf-8"><style>' +
    'body{font-family:sans-serif;font-size:11pt;line-height:1.8;color:#111}h1{text-align:center;font-size:17pt}' +
    '.body{white-space:pre-wrap}.sig{margin-top:24px}.sig td{vertical-align:bottom;padding:6px 14px 6px 0}' +
    '.sig img{height:70px;border-bottom:1px solid #333}.log{margin-top:28px;border-top:1px solid #999;padding-top:8px;font-size:8.5pt;color:#444;word-break:break-all}' +
    '</style></head><body><h1>' + esc_(o["タイトル"]) + '</h1><div class="body">' + esc_(o["本文"]) + '</div>' +
    '<table class="sig"><tr><td>甲：' + esc_(o["甲 氏名"]) + '<br><img src="' + aSig + '"></td>' +
    '<td>乙：' + esc_(o["乙 氏名"]) + '<br><img src="' + bSig + '"></td></tr></table>' +
    '<div class="log">【署名記録】契約ID：' + esc_(o["契約ID"]) + '／作成：' + esc_(o["作成日時"]) + '／乙署名：' + esc_(signedAt) +
    '<br>甲メール：' + esc_(o["甲 メール"]) + '／乙メール：' + esc_(o["乙 メール"]) +
    '<br>本文ハッシュ(SHA-256)：' + esc_(o["本文ハッシュ(SHA-256)"]) + '</div></body></html>';
}
