/**
 * ありがとうエアコンお掃除専門店 読者限定キャンペーン
 * 予約受付・紹介料集計・PayPal請求書自動送信・面接申込受付
 *
 * 使い方（詳しくは README.md）
 *  1. Googleスプレッドシートを新規作成 → 拡張機能 → Apps Script → このコードを貼り付け
 *  2. setup() を1回実行（シートと見出しを自動作成）
 *  3. プロジェクトの設定 → スクリプト プロパティ に以下を登録
 *       PAYPAL_CLIENT_ID / PAYPAL_SECRET / PAYPAL_ENV (sandbox または live)
 *       NOTIFY_EMAIL（予約通知を受け取る自分のメール）
 *  4. デプロイ → 新しいデプロイ → ウェブアプリ（実行ユーザー：自分、アクセス：全員）
 *     → URL を index.html（および募集ページ arigatou-recruit の index.html）の CONFIG.GAS_URL に貼る
 *  5. トリガー → checkPayPalPayments を「時間主導型・1時間おき」で登録（入金の自動反映）
 */

const SHEET_BOOK = "予約";
const SHEET_REF  = "紹介集計";
const SHEET_RECRUIT = "面接申込";

const BOOK_HEADERS = [
  "受付番号","受付日時","お名前","電話","メール","エリア","郵便番号","住所",
  "通常台数","お掃除機能付き台数","3点セット","合計(税込)","通常価格合計",
  "第1希望日","第2希望日","時間帯","支払方法","駐車場","備考",
  "紹介コード","紹介料(20%)","支払い状況","作業確定日","PayPal請求書ID","PayPal状態","メモ"
];
const RECRUIT_HEADERS = [
  "受付番号","受付日時","お名前","電話","メール","希望エリア","年齢","経験","面接候補日1","面接候補日2","面接候補日3","希望連絡方法","自己PR・質問","面接日確定","結果","メモ"
];

/* ---------- 初期セットアップ ---------- */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheet_(ss, SHEET_BOOK, BOOK_HEADERS);
  ensureSheet_(ss, SHEET_RECRUIT, RECRUIT_HEADERS);

  // 紹介集計シート（数式で自動集計）
  let ref = ss.getSheetByName(SHEET_REF);
  if (!ref) {
    ref = ss.insertSheet(SHEET_REF);
    ref.getRange("A1:F1").setValues([["紹介コード","紹介者名","連絡先(PayPal等)","予約件数","支払済件数","支払うべき紹介料"]]).setFontWeight("bold");
    ref.getRange("A2").setValue("（ここに紹介者コードを追加）");
    ref.getRange("D2").setFormula('=IF(A2="","",COUNTIF(予約!T:T,A2))');
    ref.getRange("E2").setFormula('=IF(A2="","",COUNTIFS(予約!T:T,A2,予約!V:V,"支払済"))');
    ref.getRange("F2").setFormula('=IF(A2="","",SUMIFS(予約!U:U,予約!T:T,A2,予約!V:V,"支払済"))');
    ref.getRange("H1").setValue("※ 紹介料は「支払い状況」が『支払済』になった予約だけ集計されます。行をコピーして紹介者を追加してください。");
    ref.setColumnWidths(1, 6, 160);
  }
  // 支払い状況のプルダウン
  const book = ss.getSheetByName(SHEET_BOOK);
  const rule = SpreadsheetApp.newDataValidation().requireValueInList(["未払い","請求送付済","支払済","当日払い予定","キャンセル"], true).build();
  book.getRange("V2:V1000").setDataValidation(rule);
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
    const res = d.kind === "recruit" ? handleRecruit_(d) : handleBooking_(d);
    return json_({ ok: true, id: res.id });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}
function doGet() { return json_({ ok: true, message: "arigatou booking endpoint" }); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function handleBooking_(d) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ensureSheet_(ss, SHEET_BOOK, BOOK_HEADERS);
  const id = "R" + Utilities.formatDate(new Date(), "Asia/Tokyo", "MMdd") + "-" + String(sh.getLastRow()).padStart(3, "0");
  const referralFee = d.ref ? Math.round(Number(d.normal_total || 0) * 0.2) : 0;
  const payStatus = d.payment === "paypal" ? "未払い" : "当日払い予定";

  sh.appendRow([
    id, Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy/MM/dd HH:mm"),
    d.name, "'" + d.phone, d.email, d.area, d.zip || "", d.address,
    Number(d.units), Number(d.auto_units), d.set3 == 1 ? "あり" : "なし",
    Number(d.total), Number(d.normal_total),
    d.date1, d.date2 || "", d.time, d.payment === "paypal" ? "PayPal" : "当日払い", d.parking, (d.breakdown ? "[内訳] " + d.breakdown + "\n" : "") + (d.note || ""),
    d.ref || "", referralFee, payStatus, "", "", "", ""
  ]);
  const row = sh.getLastRow();

  // PayPal請求書の自動送信
  if (d.payment === "paypal") {
    try {
      const inv = createAndSendPayPalInvoice_(d, id);
      sh.getRange(row, 24).setValue(inv.id);
      sh.getRange(row, 25).setValue(inv.status);
      sh.getRange(row, 22).setValue("請求送付済");
    } catch (err) {
      sh.getRange(row, 26).setValue("PayPal送信エラー: " + err);
    }
  }

  // お客様へ確認メール
  const lines = [
    d.name + " 様", "",
    "ありがとうエアコンお掃除専門店です。読者限定キャンペーンのご予約を受け付けました。", "",
    "受付番号：" + id,
    "エアコン台数：" + d.units + "台（うちお掃除機能付き " + d.auto_units + "台）",
    "内訳：" + (d.breakdown || ("3点セット " + (d.set3 == 1 ? "あり" : "なし"))),
    "合計：" + Number(d.total).toLocaleString("ja-JP") + "円（税込・駐車場代別）",
    "作業希望日：第1希望 " + d.date1 + (d.date2 ? " ／ 第2希望 " + d.date2 : "") + "（" + d.time + "）",
    "お支払い：" + (d.payment === "paypal" ? "PayPal請求書（別メールでお送りします）" : "作業当日"), "",
    "作業日は担当者より改めてご連絡のうえ確定いたします。", "",
    "ありがとうエアコンお掃除専門店　三浦公嗣", "☎ 080-4177-2272"
  ];
  safeMail_(d.email, "【ご予約受付】ありがとうエアコンお掃除専門店（受付番号 " + id + "）", lines.join("\n"));

  // 自分への通知
  const notify = PropertiesService.getScriptProperties().getProperty("NOTIFY_EMAIL");
  if (notify) safeMail_(notify, "【新規予約】" + d.name + "様 " + d.units + "台 " + Number(d.total).toLocaleString() + "円" + (d.ref ? "（紹介:" + d.ref + "）" : ""),
    "スプレッドシートを確認してください。\n" + ss.getUrl() + "\n\n" + JSON.stringify(d, null, 2));
  return { id };
}

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

/* ---------- PayPal 請求書 ---------- */
function paypalBase_() {
  const env = PropertiesService.getScriptProperties().getProperty("PAYPAL_ENV") || "sandbox";
  return env === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}
function paypalToken_() {
  const p = PropertiesService.getScriptProperties();
  const id = p.getProperty("PAYPAL_CLIENT_ID"), sec = p.getProperty("PAYPAL_SECRET");
  if (!id || !sec) throw new Error("PayPalのAPIキーが未設定です（スクリプトプロパティ PAYPAL_CLIENT_ID / PAYPAL_SECRET）");
  const r = UrlFetchApp.fetch(paypalBase_() + "/v1/oauth2/token", {
    method: "post", payload: "grant_type=client_credentials",
    headers: { Authorization: "Basic " + Utilities.base64Encode(id + ":" + sec) }, muteHttpExceptions: true
  });
  const j = JSON.parse(r.getContentText());
  if (!j.access_token) throw new Error("PayPal認証失敗: " + r.getContentText());
  return j.access_token;
}

function createAndSendPayPalInvoice_(d, id) {
  const token = paypalToken_();
  let items = [];
  if (Array.isArray(d.items) && d.items.length) {
    items = d.items.map(it => ({ name: String(it.name), quantity: String(it.qty), unit_amount: { currency_code: "JPY", value: String(Math.round(Number(it.unit))) } }));
  } else {
    const units = Number(d.units), auto = Number(d.auto_units);
    if (units > 0) items.push({ name: "エアコンクリーニング（読者限定 1台目）", quantity: "1", unit_amount: { currency_code: "JPY", value: "6000" } });
    if (units > 1) items.push({ name: "エアコンクリーニング（2台目以降）", quantity: String(units - 1), unit_amount: { currency_code: "JPY", value: "5000" } });
    if (auto > 0) items.push({ name: "お掃除機能付き加算", quantity: String(auto), unit_amount: { currency_code: "JPY", value: "5000" } });
  }

  const body = {
    detail: {
      currency_code: "JPY", invoice_number: id,
      note: "読者限定キャンペーン エアコンクリーニング（作業日は別途ご連絡のうえ確定します）。駐車場代は別途実費となります。",
      term: "ご予約確定後のお支払いをお願いします。", memo: "受付番号 " + id
    },
    invoicer: { business_name: "ありがとうエアコンお掃除専門店" },
    primary_recipients: [{ billing_info: { name: { full_name: d.name }, email_address: d.email } }],
    items,
    configuration: { tax_calculated_after_discount: true, tax_inclusive: true }
  };
  const c = UrlFetchApp.fetch(paypalBase_() + "/v2/invoicing/invoices", {
    method: "post", contentType: "application/json", headers: { Authorization: "Bearer " + token },
    payload: JSON.stringify(body), muteHttpExceptions: true
  });
  if (c.getResponseCode() >= 300) throw new Error("請求書作成失敗: " + c.getContentText());
  const invId = JSON.parse(c.getContentText()).href.split("/").pop();

  const s = UrlFetchApp.fetch(paypalBase_() + "/v2/invoicing/invoices/" + invId + "/send", {
    method: "post", contentType: "application/json", headers: { Authorization: "Bearer " + token },
    payload: JSON.stringify({ send_to_invoicer: true, send_to_recipient: true }), muteHttpExceptions: true
  });
  if (s.getResponseCode() >= 300) throw new Error("請求書送信失敗: " + s.getContentText());
  return { id: invId, status: "SENT" };
}

/** 1時間おきトリガーで実行：PayPalの入金状況を「支払済」に自動反映 */
function checkPayPalPayments() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_BOOK);
  if (!sh || sh.getLastRow() < 2) return;
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, BOOK_HEADERS.length).getValues();
  let token = null;
  rows.forEach((r, i) => {
    const invId = r[23], status = r[21];
    if (!invId || status === "支払済" || status === "キャンセル") return;
    token = token || paypalToken_();
    const g = UrlFetchApp.fetch(paypalBase_() + "/v2/invoicing/invoices/" + invId, { headers: { Authorization: "Bearer " + token }, muteHttpExceptions: true });
    if (g.getResponseCode() !== 200) return;
    const st = JSON.parse(g.getContentText()).status;
    sh.getRange(i + 2, 25).setValue(st);
    if (st === "PAID" || st === "MARKED_AS_PAID") sh.getRange(i + 2, 22).setValue("支払済");
  });
}
