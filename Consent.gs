/**
 * 出演同意（人柄動画）の受け口（2026-11-04 追加）
 *  consent.html → doPost(kind: "consent_submit") → 「出演同意」シートに1行記録 → 同意IDを返す
 *  例えるなら、撮影の前に「出演OKの札」を1枚ずつ受け取って帳簿に貼る係です。
 *  集めるのは店名・出演者名・日時・文面の版・8項目のチェックだけ。住所・電話・メールは集めない。
 *  設置：このファイルを Code.gs と同じ Apps Script プロジェクトに追加し、Code.gs の doPost に
 *    if (d.kind === "consent_submit") return json_(Object.assign({ ok: true }, handleConsentSubmit_(d)));
 *  の1行を足して、デプロイ → デプロイを管理 → 新バージョン。
 */
const SHEET_CONSENT = "出演同意";
const CONSENT_ITEMS = ["1.撮影・録画", "2.編集・切り出し・組み合わせ", "3.掲載する場所", "4.仲間の店による紹介", "5.使う期間", "6.映り込みの確認", "7.出演料・使用料", "8.取り下げの連絡先"];
const CONSENT_HEADERS = ["同意ID", "日時", "版", "店コード", "店名", "出演者名"].concat(CONSENT_ITEMS).concat(["取り下げ日", "備考"]);

function consentClean_(s, max) { return String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max || 100); }

function handleConsentSubmit_(d) {
  if (d.website) throw new Error("送信できませんでした");                      // ロボット除け（見えない欄）
  const cache = CacheService.getScriptCache();
  const n = Number(cache.get("consent_count") || 0);
  if (n >= 60) throw new Error("ただいま送信が集中しています。少し待ってからお試しください");
  cache.put("consent_count", String(n + 1), 3600);

  const version = consentClean_(d.version, 40);
  const shopCode = consentClean_(d.shop_code, 10).toUpperCase();
  const shopName = consentClean_(d.shop_name, 80);
  const performer = consentClean_(d.performer, 60);
  if (!version) throw new Error("文面の版がありません（ページを開き直してください）");
  if (!shopName) throw new Error("店名を入れてください");
  if (!performer) throw new Error("出演者のお名前を入れてください");
  if (shopCode && !/^(HQ00|K\d{3})$/.test(shopCode)) throw new Error("店コードの形が違います");
  const items = d.items || {};
  const checks = CONSENT_ITEMS.map(function (_, i) { return items["c" + (i + 1)] === true; });
  if (!checks.every(Boolean)) throw new Error("8つの項目すべてにチェックが必要です");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ensureSheet_(ss, SHEET_CONSENT, CONSENT_HEADERS);
  const now = new Date();
  const at = Utilities.formatDate(now, "Asia/Tokyo", "yyyy-MM-dd HH:mm:ss");
  const id = "C" + Utilities.formatDate(now, "Asia/Tokyo", "yyyyMMdd-HHmmss") + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
  sh.appendRow([id, at, version, shopCode, shopName, performer].concat(checks.map(function () { return "はい"; })).concat(["", ""]));

  const to = PropertiesService.getScriptProperties().getProperty("NOTIFY_EMAIL");
  if (to) {
    try {
      MailApp.sendEmail({ to: to, subject: "【出演同意】" + shopName + "／" + performer + "（" + id + "）",
        body: "出演同意を受け付けました。\n\n同意ID：" + id + "\n日時：" + at + "\n版：" + version + "\n店コード：" + (shopCode || "（未設定）") + "\n店名：" + shopName + "\n出演者：" + performer + "\n\n記録はスプレッドシート「" + SHEET_CONSENT + "」シートにあります。",
        name: "ありがとうエアコンお掃除専門店" });
    } catch (e) { console.warn("consent mail error", e); }
  }
  return { id: id, at: at, version: version };
}
