import { db } from "./db";
import { sendMail, esc } from "./mail";

/** 承認済みの分析のうち、email があり未送信の配信を送る(contact指定で絞り込み可) */
export async function flushDeliveries(opts: { analysisId?: string; contactId?: string } = {}) {
  let q = db
    .from("deliveries")
    .select("id, analysis_id, contacts(name, email), analyses(content, view_token, approved_at, meetings(topic))")
    .eq("status", "waiting_email");
  if (opts.analysisId) q = q.eq("analysis_id", opts.analysisId);
  if (opts.contactId) q = q.eq("contact_id", opts.contactId);
  const { data, error } = await q;
  if (error) throw error;

  let sent = 0;
  for (const d of (data ?? []) as any[]) {
    if (!d.contacts?.email || !d.analyses?.approved_at) continue; // 未承認 or 住所待ち
    const topic = d.analyses.meetings?.topic ?? "会議";
    const link = `${process.env.APP_URL}/r/${d.analyses.view_token}`;
    try {
      await sendMail(
        d.contacts.email,
        `【分析結果】${topic}`,
        `<p>${esc(d.contacts.name)} 様</p><p>先日の会議の分析結果をお送りします。</p>` +
          `<pre style="white-space:pre-wrap;font-family:inherit">${esc(d.analyses.content)}</pre>` +
          `<p><a href="${link}">ブラウザで見る</a></p>`,
      );
      await db.from("deliveries").update({ status: "sent", sent_at: new Date().toISOString(), error: null }).eq("id", d.id);
      sent++;
    } catch (e: any) {
      await db.from("deliveries").update({ status: "failed", error: String(e.message) }).eq("id", d.id);
    }
  }
  return sent;
}
