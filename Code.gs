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
 *     → URL を index.html / recruit.html の CONFIG.GAS_URL に貼る
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
  ensureSheet_(ss, SHEET_CONTRACT, CONTRACT_HEADERS);
  ensureSheet_(ss, "スタッフ連絡先", ["スケジュール表の名前(部分一致)", "店舗名", "スタッフメール", "代表メール", "事務員メール", "メモ"]);

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
    if (d.kind === "contract_templates") return json_(Object.assign({ ok: true }, handleContractTemplates_(d)));
    if (d.kind === "contract_create") return json_(Object.assign({ ok: true }, handleContractCreate_(d)));
    if (d.kind === "contract_sign")   return json_(Object.assign({ ok: true }, handleContractSign_(d)));
    if (d.kind === "contract_status") return json_(Object.assign({ ok: true }, handleContractStatus_(d)));
    const res = d.kind === "recruit" ? handleRecruit_(d) : handleBooking_(d);
    return json_({ ok: true, id: res.id, match: res.match || null });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === "contract_get") {
    try { return json_(Object.assign({ ok: true }, handleContractGet_(p.id, p.t))); }
    catch (err) { return json_({ ok: false, error: String(err.message || err) }); }
  }
  if (p.action === "avail") {
    let o;
    try { o = Object.assign({ ok: true }, getAvailability_(String(p.pref || ""))); }
    catch (err) { o = { ok: false, supported: false, error: String(err) }; }
    const cb = String(p.callback || "");
    if (/^[A-Za-z_$][\w$]*$/.test(cb)) return ContentService.createTextOutput(cb + "(" + JSON.stringify(o) + ");").setMimeType(ContentService.MimeType.JAVASCRIPT);
    return json_(o);
  }
  return json_({ ok: true, message: "arigatou booking endpoint" });
}
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
    d.date1, (d.date2 || "") + (d.date3 ? " / " + d.date3 : ""), d.time, d.payment === "paypal" ? "PayPal" : d.payment === "paypay" ? "当日払い(PayPay)" : "当日払い", d.parking,
    (d.breakdown ? "[内訳] " + d.breakdown + "\n" : "") + (d.mizu == 1 ? "[水回り相談] " + (d.mizu_note || "あり") + "\n" : "") + (d.note || ""),
    d.ref || "", referralFee, payStatus, "", "", "", ""
  ]);
  const row = sh.getLastRow();
  // オプション台数・住居タイプ・重複チェック（AA〜AG列／Data.gs）
  try { writeExtras_(sh, row, d); } catch (err) { console.warn("extras", err); }

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
    "ありがとうエアコンお掃除専門店です。" + (d.src === "lp" ? "エアコンクリーニングのご予約を受け付けました。" : "読者限定キャンペーンのご予約を受け付けました。"), "",
    "受付番号：" + id,
    "エアコン台数：" + d.units + "台（うちお掃除機能付き " + d.auto_units + "台）",
    "内訳：" + (d.breakdown || ("3点セット " + (d.set3 == 1 ? "あり" : "なし"))),
    "合計：" + Number(d.total).toLocaleString("ja-JP") + "円（税込・駐車場代別）",
    "作業希望日：第1希望 " + d.date1 + (d.date2 ? " ／ 第2希望 " + d.date2 : "") + (d.date3 ? " ／ 第3希望 " + d.date3 : "") + "（" + d.time + "）",
    (d.mizu == 1 ? "水回りなどのご相談：あり（担当より平日10:00〜17:00にお電話します）" : ""),
    "お支払い：" + (d.payment === "paypal" ? "PayPal請求書（別メールでお送りします）" : d.payment === "paypay" ? "作業当日（PayPay）" : "作業当日（現金）"), "",
    "作業日は担当者より改めてご連絡のうえ確定いたします。",
    "※ご希望日での対応が難しい場合は、1〜2日以内に日程再調整のご連絡をいたします。", "",
    "ありがとうエアコンお掃除専門店　担当：湊", "☎ 080-4177-2272"
  ];
  safeMail_(d.email, "【ご予約受付】ありがとうエアコンお掃除専門店（受付番号 " + id + "）", lines.join("\n"));

  // 自分への通知
  const notify = PropertiesService.getScriptProperties().getProperty("NOTIFY_EMAIL");
  const bookTo = [notify, PropertiesService.getScriptProperties().getProperty("BOOKING_NOTIFY_CC")].filter(Boolean).join(",");
  if (bookTo) safeMail_(bookTo, "【新規予約】" + id + " " + d.name + "様 " + d.units + "台 " + Number(d.total).toLocaleString() + "円" + (d.ref ? "（紹介:" + d.ref + "）" : ""),
    bookingNotifyBody_(d, id, ss.getUrl()));

  // 空き確認・自動マッチング（Matching.gs）
  let match = { status: "skipped" };
  try { match = runMatching_(d, id, row); } catch (err) { sh.getRange(row, 26).setValue("マッチングエラー: " + err); match = { status: "error" }; }
  return { id, match };
}

function handleRecruit_(d) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ensureSheet_(ss, SHEET_RECRUIT, RECRUIT_HEADERS);
  const id = "S" + Utilities.formatDate(new Date(), "Asia/Tokyo", "MMdd") + "-" + String(sh.getLastRow()).padStart(3, "0");
  sh.appendRow([id, Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy/MM/dd HH:mm"),
    d.name, "'" + d.phone, d.email, d.area, d.age || "", d.experience || "",
    d.cand1 || "", d.cand2 || "", d.cand3 || "", d.contact || "", d.message || "", "", "", ""]);
  safeMail_(d.email, "【面接申込を受け付けました】ありがとうエアコンお掃除専門店",
    d.name + " 様\n\n面接のお申し込みありがとうございます（受付番号 " + id + "）。\nいただいた候補日をもとに日程を調整し、改めてご連絡いたします。\n\n候補日：" + [d.cand1, d.cand2, d.cand3].filter(Boolean).join(" / ") + "\n\nありがとうエアコンお掃除専門店　担当：湊・三浦公嗣\n☎ 080-4177-2272");
  const notify = PropertiesService.getScriptProperties().getProperty("NOTIFY_EMAIL");
  const recipients = [notify, PropertiesService.getScriptProperties().getProperty("RECRUIT_NOTIFY_CC")].filter(Boolean).join(",");
  const cleanMsg = String(d.message || "").replace(/^【性別】[^\n]*\n?/, "");
  const notifyBody = [
    "面接の申し込みが入りました。",
    "",
    "受付番号：" + id,
    "お名前：" + d.name,
    "電話：" + d.phone,
    "メール：" + d.email,
    "希望エリア：" + d.area,
    "年齢：" + (d.age ? d.age + "歳" : "未記入"),
    "性別：" + (d.gender || "未記入"),
    "経験：" + (d.experience || "未記入"),
    "面接候補日：" + [d.cand1, d.cand2, d.cand3].filter(Boolean).join(" ／ "),
    "希望連絡方法：" + (d.contact || ""),
    "自己PR・質問：" + (cleanMsg || "なし"),
    "",
    "▼ 管理シート（面接申込タブ）",
    ss.getUrl()
  ].join("\n");
  if (recipients) safeMail_(recipients, "【面接申込】" + d.name + "様（" + d.area + "・" + (d.age ? d.age + "歳・" : "") + (d.gender || "") + "）", notifyBody);
  return { id };
}

function safeMail_(to, subject, body) {
  // お知らせ先・返信先のアドレスはスクリプトプロパティに置く（BOOKING_NOTIFY_CC・RECRUIT_NOTIFY_CC・REPLY_TO_EMAIL。コードには書かない）
  const replyTo = PropertiesService.getScriptProperties().getProperty("REPLY_TO_EMAIL");
  const opt = { to, subject, body, name: "ありがとうエアコンお掃除専門店" };
  if (replyTo) opt.replyTo = replyTo;
  try { if (to) MailApp.sendEmail(opt); } catch (e) { console.warn("mail error", e); }
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
      note: (d.src === "lp" ? "" : "読者限定キャンペーン ") + "エアコンクリーニング（作業日は別途ご連絡のうえ確定します）。駐車場代は別途実費となります。",
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

/** 請求書をキャンセルする（受付番号または請求書IDを指定して実行） */
function cancelInvoiceByNumber(invoiceNumber) {
  invoiceNumber = invoiceNumber || "R0923-003";
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_BOOK);
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, BOOK_HEADERS.length).getValues();
  const i = rows.findIndex(r => r[0] === invoiceNumber);
  if (i < 0 || !rows[i][23]) throw new Error("請求書IDが見つかりません: " + invoiceNumber);
  const invId = rows[i][23], token = paypalToken_();
  const r = UrlFetchApp.fetch(paypalBase_() + "/v2/invoicing/invoices/" + invId + "/cancel", {
    method: "post", contentType: "application/json", headers: { Authorization: "Bearer " + token },
    payload: JSON.stringify({ subject: "請求書のキャンセル", note: "テスト送信のためキャンセルしました。", send_to_invoicer: true, send_to_recipient: true }),
    muteHttpExceptions: true
  });
  if (r.getResponseCode() >= 300) throw new Error("キャンセル失敗: " + r.getContentText());
  sh.getRange(i + 2, 22).setValue("キャンセル");
  sh.getRange(i + 2, 25).setValue("CANCELLED");
  return "cancelled " + invId;
}


/** 本部向け：新規予約通知メールの本文（読みやすい形式） */
function bookingNotifyBody_(d, id, url) {
  const yen = n => Number(n || 0).toLocaleString("ja-JP") + "円";
  const pay = d.payment === "paypal" ? "PayPal請求書（自動送信済み）" : d.payment === "paypay" ? "作業当日（PayPay）" : "作業当日（現金）";
  const note = String(d.note || "").replace(/^【希望日】[^\n]*\n?/, "");
  const opts = [];
  if (Number(d.auto_units)) opts.push("お掃除機能付き " + d.auto_units + "台");
  if (Number(d.set3_units)) opts.push("3点セット " + d.set3_units + "台");
  if (Number(d.coat_units)) opts.push("防カビ・抗菌コート " + d.coat_units + "台");
  if (Number(d.outdoor_units)) opts.push("室外機 " + d.outdoor_units + "台");
  if (Number(d.drain_units)) opts.push("ドレンホース " + d.drain_units + "台");
  return [
    "新しい予約が入りました。" + (d.src === "lp" ? "（ホームページの予約フォーム）" : "（読者限定キャンペーン）"),
    "",
    "■ 受付番号：" + id,
    "■ お名前：" + d.name + " 様",
    "■ 電話：" + d.phone,
    "■ メール：" + d.email,
    "■ 住所：〒" + (d.zip || "") + " " + (d.address || "") + "（" + (d.area || "") + "）",
    "",
    "■ 作業希望日",
    "　第1希望：" + (d.date1 || "") + (d.src === "lp" ? "" : "（" + (d.time || "") + "）"),
    "　第2希望：" + (d.date2 || "なし"),
    "　第3希望：" + (d.date3 || "なし"),
    "",
    "■ 内容：エアコン " + d.units + "台" + (opts.length ? "／" + opts.join("・") : ""),
    "■ 合計：" + yen(d.total) + "（税込・駐車場代別）",
    "■ お支払い：" + pay,
    "■ 駐車場：" + (d.parking || ""),
    (d.ref ? "■ 紹介コード：" + d.ref : null),
    "■ ご要望・備考：" + (note || "なし"),
    "",
    "▼ 予約管理シート",
    url
  ].filter(l => l !== null).join("\n");
}

/* ================================================================
 *  空き状況（予約フォーム用）— スケジュール表を「読むだけ」。書き込みはしません。
 *  ルール：①②③の枠が空欄＝空き／「-」＝不可／文字あり＝予約済み
 *          「他社案件OK」のスタッフのみ対象。スタッフ名欄の【都県】で対応エリアを判定。
 *  返すのは日付×枠の ○／× だけ（スタッフ名は外に出しません）
 * ================================================================ */
const AVAIL_SHEETS = {
  "関東": "1M0gQ28ecyVs0y6WyTZguKBg1TZ6F0OjW5Jfa67Tbxms",
  "中部": "1Soxdjb7y2fpJPiXF-FOMUNpiqqynRrYG_tcWu90vTIk",
  "関西": "1dDJSAoY9MHUgZEB2SkIlOYO8mZRa08ubqpjeVMQnPpw",
  "九州": "1Pqfigj96tcTRohTYAGqR2LPclGsX79d7EG3nmUy9nHE",
  "東北": "1I7nN-yDLf5eXISh6IqSCkTLjcj_Sk41HEcdUkIjb6ks"
};
const PREF_REGION = {
  "東京": "関東", "神奈川": "関東", "埼玉": "関東", "千葉": "関東",
  "愛知": "中部", "岐阜": "中部",
  "大阪": "関西", "兵庫": "関西", "和歌山": "関西",
  "福岡": "九州", "佐賀": "九州", "熊本": "九州",
  "宮城": "東北"
};

function getAvailability_(pref) {
  const region = PREF_REGION[pref];
  if (!region) return { supported: false };
  const all = getRegionAvailability_(region);
  return { supported: true, region, pref, days: all.prefs[pref] || {}, updated: all.updated };
}

/** 地域のスケジュール表を1回だけ読み、その地域の全都府県ぶんの空きを計算して30分キャッシュ */
function getRegionAvailability_(region) {
  const cache = CacheService.getScriptCache();
  const key = "availR_" + region;
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);

  const prefs = Object.keys(PREF_REGION).filter(p => PREF_REGION[p] === region);
  const result = {}; prefs.forEach(p => result[p] = {});
  const ss = SpreadsheetApp.openById(AVAIL_SHEETS[region]);
  const today = new Date(); today.setHours(0,0,0,0);
  const limit = new Date(today.getTime() + 60 * 86400000);

  ss.getSheets().forEach(sh => {
    const lastRow = sh.getLastRow(), lastCol = Math.min(sh.getLastColumn(), 30);
    if (lastRow < 3 || lastCol < 6) return;
    const vals = sh.getRange(1, 1, lastRow, lastCol).getValues();
    let cols = null, curDate = null;
    for (let r = 0; r < vals.length; r++) {
      const row = vals[r];
      const txt = row.map(v => String(v));
      const iStaff = txt.findIndex(v => v.indexOf("スタッフ名") >= 0);
      const i1 = txt.findIndex(v => /^①\s*9/.test(v.trim()));
      if (iStaff >= 0 && i1 >= 0) {
        cols = { staff: iStaff, other: txt.findIndex(v => v.indexOf("他社") >= 0), s1: i1,
          s2: txt.findIndex(v => /^②\s*12/.test(v.trim())), s3: txt.findIndex(v => /^③\s*15/.test(v.trim())) };
        curDate = null; continue;
      }
      if (!cols) continue;
      if (row[1] instanceof Date) curDate = row[1];
      if (!curDate || curDate < today || curDate > limit) continue;
      const staff = String(row[cols.staff] || "");
      const other = cols.other >= 0 ? String(row[cols.other] || "") : "";
      if (!staff || staff === "-" || other.indexOf("他社案件OK") < 0) continue;
      const k = Utilities.formatDate(curDate, "Asia/Tokyo", "yyyy-MM-dd");
      const open = [cols.s1, cols.s2, cols.s3].map(ci => ci >= 0 && String(row[ci] === null ? "" : row[ci]).trim() === "");
      prefs.forEach(p => {
        if (staff.indexOf(p) < 0) return;
        const d = result[p][k] || (result[p][k] = [false, false, false]);
        open.forEach((o, i) => { if (o) d[i] = true; });
      });
    }
  });
  const out = { prefs: result, updated: new Date().toISOString() };
  try { cache.put(key, JSON.stringify(out), 1800); } catch (err) {}
  return out;
}

/** エディタで実行して動作確認する用 */
function testAvailability() {
  ["東京", "愛知", "大阪", "福岡", "熊本", "佐賀", "宮城"].forEach(p => {
    CacheService.getScriptCache().remove("availR_" + PREF_REGION[p]);
    const a = getAvailability_(p);
    const ks = Object.keys(a.days || {}).sort();
    const open = ks.filter(k => a.days[k].some(Boolean)).length;
    console.log(p + "：" + ks.length + "日分を確認、空きあり " + open + "日　例 " + ks.slice(0, 5).map(k => k + "=" + a.days[k].map(b => b ? "○" : "×").join("")).join(" "));
  });
}

/* お知らせ先のテスト（エディタで1回だけ実行。予約・面接のシートには何も書かない） */
function testNotifyEmails() {
  const p = PropertiesService.getScriptProperties();
  const notify = p.getProperty("NOTIFY_EMAIL");
  const book = [notify, p.getProperty("BOOKING_NOTIFY_CC")].filter(Boolean).join(",");
  const recruit = [notify, p.getProperty("RECRUIT_NOTIFY_CC")].filter(Boolean).join(",");
  safeMail_(book, "【テスト】新規予約のお知らせ先の確認", "予約のお知らせが、このアドレスに届くかの確認です。返信は不要です。");
  safeMail_(recruit, "【テスト】面接申込のお知らせ先の確認", "面接申込のお知らせが、このアドレスに届くかの確認です。返信は不要です。");
  Logger.log("送りました（予約 " + book.split(",").length + " 件・面接 " + recruit.split(",").length + " 件）");
}
