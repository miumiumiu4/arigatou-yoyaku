/**
 * ありがとうエアコンお掃除専門店 業務委託スタッフ募集ページ
 * 面接申込の受付（スプレッドシート記録＋確認メール）
 *
 * ※ 予約サイト（arigatou-yoyaku）の Code.gs を既に使っている場合、このファイルは不要です。
 *    予約サイト側の受付係が「面接申込」シートへの記録も担当しています。
 *    募集専用のスプレッドシートに分けたいときだけ、このコードを使ってください。
 *
 * 使い方（詳しくは README.md）
 *  1. Googleスプレッドシートを新規作成 → 拡張機能 → Apps Script → このコードを貼り付け
 *  2. setup() を1回実行（シートと見出しを自動作成）
 *  3. プロジェクトの設定 → スクリプト プロパティ に NOTIFY_EMAIL（申込通知を受け取る自分のメール）を登録
 *  4. デプロイ → 新しいデプロイ → ウェブアプリ（実行ユーザー：自分、アクセス：全員）
 *     → URL を index.html の CONFIG.GAS_URL に貼る
 */

const SHEET_RECRUIT = "面接申込";
const RECRUIT_HEADERS = [
  "受付番号","受付日時","お名前","電話","メール","希望エリア","年齢","経験","面接候補日1","面接候補日2","面接候補日3","希望連絡方法","自己PR・質問","面接日確定","結果","メモ"
];

/* ---------- 初期セットアップ ---------- */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheet_(ss, SHEET_RECRUIT, RECRUIT_HEADERS);
  SpreadsheetApp.getUi && SpreadsheetApp.getUi().alert("セットアップ完了。次はスクリプトプロパティとデプロイです。");
}

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold").setBackground("#e8f5f0");
    sh.setFrozenRows(1);
  }
  return sh;
}

/* ---------- 受付（ウェブアプリ） ---------- */
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.kind !== "recruit") throw new Error("この受付は面接申込専用です");
    const res = handleRecruit_(d);
    return json_({ ok: true, id: res.id });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}
function doGet() { return json_({ ok: true, message: "arigatou recruit endpoint" }); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function handleRecruit_(d) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ensureSheet_(ss, SHEET_RECRUIT, RECRUIT_HEADERS);
  const id = "S" + Utilities.formatDate(new Date(), "Asia/Tokyo", "MMdd") + "-" + String(sh.getLastRow()).padStart(3, "0");
  sh.appendRow([id, Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy/MM/dd HH:mm"),
    d.name, "'" + d.phone, d.email, d.area, d.age || "", d.experience || "",
    d.cand1 || "", d.cand2 || "", d.cand3 || "", d.contact || "", d.message || "", "", "", ""]);
  safeMail_(d.email, "【面接申込を受け付けました】ありがとうエアコンお掃除専門店",
    d.name + " 様\n\n面接のお申し込みありがとうございます（受付番号 " + id + "）。\nいただいた候補日をもとに日程を調整し、改めてご連絡いたします。\n\n候補日：" + [d.cand1, d.cand2, d.cand3].filter(Boolean).join(" / ") + "\n\nありがとうエアコンお掃除専門店　三浦公嗣\n☎ 080-4177-2272");
  const notify = PropertiesService.getScriptProperties().getProperty("NOTIFY_EMAIL");
  if (notify) safeMail_(notify, "【面接申込】" + d.name + "様（" + d.area + "）", JSON.stringify(d, null, 2) + "\n\n" + ss.getUrl());
  return { id };
}

function safeMail_(to, subject, body) {
  try { if (to) MailApp.sendEmail({ to, subject, body, name: "ありがとうエアコンお掃除専門店" }); } catch (e) { console.warn("mail error", e); }
}
