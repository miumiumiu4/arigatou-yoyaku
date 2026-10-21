/**
 * 電子契約の「申込み → 甲（三浦さん）の確認・署名 → 乙の署名」の流れ（2026-10-21 追加）
 *
 * 1. 相手が apply.html で入力（種類・氏名・住所・電話・メール・屋号）→ kind "contract_apply"
 *    → ひな形から契約書の文面を作り、「契約」シートに「甲の確認待ち」で1行、「契約申込み」シートに申込み情報を1行
 *    → 甲（CONTRACT_OWNER_EMAIL か NOTIFY_EMAIL）に「確認して署名する」リンクをメール、相手に受付のメール
 * 2. 甲がリンク（contract.html?review=契約ID&k=確認キー）を開く → action "contract_review_get"
 *    → 文面を確認・必要なら直して手書きサイン → kind "contract_review_sign"（合言葉は不要。リンク自体が鍵）
 *    → 乙に署名依頼メール（ここからは今までの電子契約と同じ。乙の署名で PDF が双方に届く）
 * 3. 乙が署名すると handleContractSign_ から applyMarkSigned_ を呼び、「契約申込み」シートも「署名済み」にする
 *
 * スクリプト プロパティ（任意）：CONTRACT_OWNER_EMAIL（申込みの知らせを受け取るメール。無ければ NOTIFY_EMAIL）
 *                               CONTRACT_A_NAME（甲の名前。無ければ「エイムポイント合同会社　代表社員　三浦公嗣」）
 */
const SHEET_APPLY = "契約申込み";
const APPLY_HEADERS = [
  "契約ID","受付日時","種類","氏名","フリガナ","郵便番号・住所","電話","メール","屋号・会社名","備考",
  "状態","甲 署名日時","乙 署名日時","署名済PDF URL","確認キー"
];
const APPLY_KINDS = {
  kamei: { tpl: "kamei", label: "加盟（プレミアムプラン）" },
  gyomu: { tpl: "gyomu", label: "スタッフ（業務委託）" }
};
const APPLY_SITE_DEFAULT = "https://miumiumiu4.github.io/arigatou-yoyaku/";

function applyProp_(k, d) { return PropertiesService.getScriptProperties().getProperty(k) || d; }
function applyOwnerEmail_() {
  // 申込みの知らせ先。CONTRACT_OWNER_EMAIL → NOTIFY_EMAIL の順に読む（Session は使わない：userinfo.email の権限が要るため）
  const to = applyProp_("CONTRACT_OWNER_EMAIL", "") || applyProp_("NOTIFY_EMAIL", "");
  if (!to) throw new Error("知らせ先のメール（スクリプトプロパティ NOTIFY_EMAIL）がありません");
  return to;
}
function applySite_() { const s = applyProp_("SITE_URL", APPLY_SITE_DEFAULT); return s.endsWith("/") ? s : s + "/"; }
function applyClean_(s, max) { return String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max || 200); }

/* ひな形の {{…}} を埋める（contract.html の fill と同じ決まり） */
function applyFill_(body, v, a, b) {
  const yen = function (x) { const n = Number(String(x).replace(/[^\d]/g, "")); return isNaN(n) || !String(x).trim() ? String(x) : n.toLocaleString("ja-JP"); };
  const today = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy年M月d日");
  return body.replace(/\{\{(\w+)(?:\|(\w+))?\}\}/g, function (_, k, f) {
    const x = k === "a" ? a : k === "b" ? b : k === "today" ? today : (v[k] != null ? v[k] : "");
    if (f === "yen") return yen(x);
    if (f === "yenblank") return x ? yen(x) : "　　　　";
    if (f === "blank") return x || "　　";
    return x;
  });
}

/* 1. 申込み（だれでも送れるので、迷惑な送信をふせぐ） */
function handleContractApply_(d) {
  if (d.website) throw new Error("送信できませんでした");                      // ロボット除け（見えない欄）
  const cache = CacheService.getScriptCache();
  const n = Number(cache.get("apply_count") || 0);
  if (n >= 20) throw new Error("ただいま申込みが集中しています。時間をおいてお試しください");
  const kind = APPLY_KINDS[d.type];
  if (!kind) throw new Error("契約の種類を選んでください");
  const name = applyClean_(d.name, 60), kana = applyClean_(d.kana, 60), addr = applyClean_(d.address, 200);
  const tel = applyClean_(d.tel, 30), email = applyClean_(d.email, 120), shop = applyClean_(d.shop, 80), note = applyClean_(d.note, 500);
  if (!name || !addr || !tel) throw new Error("お名前・住所・電話番号を入力してください");
  if (!isEmail_(email)) throw new Error("メールアドレスを確認してください");
  const perMail = "apply_mail_" + Utilities.base64EncodeWebSafe(email.toLowerCase()).slice(0, 200);
  if (cache.get(perMail)) throw new Error("このメールアドレスからは先ほど受け付けました。担当からのご連絡をお待ちください");

  const tpl = CONTRACT_TEMPLATES[kind.tpl];
  const v = {}; (tpl.fields || []).forEach(function (f) { v[f.k] = f.d || ""; });
  const aName = applyProp_("CONTRACT_A_NAME", "エイムポイント合同会社　代表社員　三浦公嗣");
  let body = applyFill_(tpl.body, v, aName, name);
  body += "\n\n（乙）" + addr + "　" + name + (shop ? "（" + shop + "）" : "") + "　電話：" + tel;

  const id = "C" + Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyyMMdd") + "-" + Utilities.getUuid().slice(0, 6).toUpperCase();
  const key = Utilities.getUuid().replace(/-/g, "");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const owner = applyOwnerEmail_();
  ensureSheet_(ss, SHEET_CONTRACT, CONTRACT_HEADERS).appendRow([id, contractFmtDate_(new Date()), "申込み:" + d.type, tpl.name, body, sha256_(body),
    aName, owner, name, email, "", "甲の確認待ち", "", "", "", "", "", ""]);
  ensureSheet_(ss, SHEET_APPLY, APPLY_HEADERS).appendRow([id, contractFmtDate_(new Date()), kind.label, name, kana, addr, "'" + tel, email, shop, note,
    "甲の確認待ち", "", "", "", key]);
  cache.put("apply_count", String(n + 1), 3600);
  cache.put(perMail, "1", 600);

  const reviewUrl = applySite_() + "contract.html?review=" + id + "&k=" + key;
  safeMail_(owner, "【新しい契約の申込み】" + kind.label + "　" + name + " 様",
    "新しい契約の申込みがありました。\n\n種類：" + kind.label + "\nお名前：" + name + (kana ? "（" + kana + "）" : "") +
    "\n住所：" + addr + "\n電話：" + tel + "\nメール：" + email + (shop ? "\n屋号・会社名：" + shop : "") + (note ? "\n備考：" + note : "") +
    "\n契約ID：" + id + "\n\n下のリンクで契約書を確認し、必要なら直して署名してください。署名すると、" + name + " 様に署名のお願いのメールが届きます。\n\n" +
    reviewUrl + "\n\n※このリンクは甲（あなた）専用です。他の人に送らないでください。");
  safeMail_(email, "【ありがとうエアコンお掃除専門店】契約のお申込みを受け付けました",
    name + " 様\n\nお申込みありがとうございます。\n内容を確認のうえ、契約書をメールでお送りします。\n届いたメールのリンクから、契約書の読み上げ動画を見て、署名をお願いします。\n\n受付番号：" + id +
    "\n\nエイムポイント合同会社（ありがとうエアコンお掃除専門店）");
  return { id: id };
}

function applyFind_(id) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_APPLY);
  if (!sh) throw new Error("申込みが見つかりません");
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === id) { const o = {}; APPLY_HEADERS.forEach(function (h, j) { o[h] = rows[i][j]; }); return { sh: sh, row: i + 1, o: o }; }
  }
  throw new Error("申込みが見つかりません");
}
function applySet_(a, h, v) { a.sh.getRange(a.row, APPLY_HEADERS.indexOf(h) + 1).setValue(v); }
function applyCheckKey_(a, k) {
  if (!k || a.o["確認キー"] !== k) { Utilities.sleep(1000); throw new Error("確認リンクが正しくないか、すでに使用済みです"); }
}

/* 2-1. 甲が確認リンクを開いたとき */
function handleContractReviewGet_(id, k) {
  const a = applyFind_(String(id || ""));
  applyCheckKey_(a, k);
  const c = findContract_(a.o["契約ID"]);
  return {
    id: a.o["契約ID"], status: c.o["状態"], title: c.o["タイトル"], body: c.o["本文"], aName: c.o["甲 氏名"],
    applicant: { type: a.o["種類"], name: a.o["氏名"], kana: a.o["フリガナ"], address: a.o["郵便番号・住所"], tel: String(a.o["電話"]),
                 email: a.o["メール"], shop: a.o["屋号・会社名"], note: a.o["備考"], at: a.o["受付日時"] }
  };
}

/* 2-2. 甲が確認して署名 → 乙に署名依頼 */
function handleContractReviewSign_(d) {
  const a = applyFind_(String(d.id || ""));
  applyCheckKey_(a, d.k);
  const c = findContract_(a.o["契約ID"]);
  if (c.o["状態"] !== "甲の確認待ち") throw new Error("この契約はすでに送付済みです");
  const body = String(d.body || "");
  if (!body.trim() || body.length > 20000) throw new Error("本文を確認してください");
  let title = c.o["タイトル"];
  if (body !== c.o["本文"] && title.indexOf("個別条件") < 0) title += "（個別条件）";   // 文面を直したら、全員用の読み上げ動画は出さない
  const sigId = saveSignature_(d.aSignature, a.o["契約ID"] + "_A");
  const token = Utilities.getUuid().replace(/-/g, "");
  const set = function (h, v) { c.sh.getRange(c.row, CONTRACT_HEADERS.indexOf(h) + 1).setValue(v); };
  set("タイトル", title); set("本文", body); set("本文ハッシュ(SHA-256)", sha256_(body));
  set("甲署名画像ID", sigId); set("署名トークン", token); set("状態", "署名待ち");
  const now = contractFmtDate_(new Date());
  applySet_(a, "状態", "乙の署名待ち"); applySet_(a, "甲 署名日時", now); applySet_(a, "確認キー", "");

  const url = applySite_() + "contract.html?id=" + a.o["契約ID"] + "&t=" + token;
  const bName = c.o["乙 氏名"], aName = c.o["甲 氏名"];
  safeMail_(c.o["乙 メール"], "【電子契約】" + title + " への署名のお願い",
    bName + " 様\n\n" + aName + " 様より、契約書「" + title + "」の署名依頼が届いています。\n" +
    "内容をご確認のうえ、下記URLから署名してください。\n\n" + url + "\n\n" +
    "※このURLは " + bName + " 様専用です。他の方に共有しないでください。\n契約ID：" + a.o["契約ID"]);
  safeMail_(c.o["甲 メール"], "【電子契約】署名依頼を送信しました（" + a.o["契約ID"] + "）",
    "契約書「" + title + "」に署名し、" + bName + " 様へ署名依頼を送りました。\n乙の署名が完了すると、署名済みPDFがメールで届きます。\n契約ID：" + a.o["契約ID"]);
  return { id: a.o["契約ID"], signUrl: url, title: title };
}

/* 3. 乙が署名したら、申込みの行も「署名済み」に（handleContractSign_ から呼ぶ） */
function applyMarkSigned_(id, signedAt, pdfUrl) {
  try {
    const a = applyFind_(id);
    applySet_(a, "状態", "署名済み"); applySet_(a, "乙 署名日時", signedAt); applySet_(a, "署名済PDF URL", pdfUrl);
  } catch (e) { /* 申込みから作った契約でなければ何もしない */ }
}
