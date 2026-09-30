import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const MODEL = "claude-sonnet-5-5";
const CHUNK = 12000;

async function ask(system: string, user: string, max = 8000) {
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: max,
    system,
    messages: [{ role: "user", content: user }],
  });
  return res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
}

/** 全文清書。要約は絶対にしない(フィラー除去・誤変換修正・句読点補完のみ) */
export async function polishTranscript(raw: string) {
  const system =
    "あなたは書記官です。会議の文字起こしを清書します。要約・省略・意訳は禁止。" +
    "『えー』『あのー』等のフィラー除去、明らかな誤変換の修正、句読点と改行の補完のみ行い、" +
    "話者名と発言内容はすべて残してください。清書後の本文だけを出力してください。";
  const lines = raw.split("\n");
  const chunks: string[] = [];
  let cur = "";
  for (const l of lines) {
    if (cur.length + l.length > CHUNK && cur) {
      chunks.push(cur);
      cur = "";
    }
    cur += l + "\n";
  }
  if (cur) chunks.push(cur);
  const out: string[] = [];
  for (const c of chunks) out.push(await ask(system, c, 16000));
  return out.join("\n");
}

export const DEFAULT_INSTRUCTIONS =
  "構成: 1.論点の整理 2.相手の課題・要望 3.決まったこと 4.次のアクション(担当・期限つき) 5.所感と提案。";

/** instructions はテンプレートごとの観点・構成。共通ルール(相手に渡す前提・推測禁止)は常に付く */
export async function analyzeTranscript(clean: string, topic: string, instructions = DEFAULT_INSTRUCTIONS) {
  const system =
    "あなたは会議分析のアナリストです。相手に渡す前提で、丁寧で読みやすい日本語で書いてください。" +
    "本文に無いことは推測で書かないでください。\n" +
    instructions;
  return ask(system, `会議名: ${topic}\n\n${clean}`);
}
