// 黒板の横に立つ2人のキャラクター（三浦＝N、受講生＝L）
// 台本の「演技の指示」（英語）から感情を決め、表情・腕・記号（！・？・汗など）を時間で動かす。
// seek(t) と同じく、見た目は時間 t だけで決まる（同じ t なら毎回同じ絵）。

const CHAR_LOOK = {
  N: { name: '三浦', shirt: '#1F3A5F', shirtDark: '#15294A', pants: '#2E3B4E', hair: '#2A2522', skin: '#F4D0AE', logo: true, x: 8, flip: false },
  L: { name: '受講生', shirt: '#E8833A', shirtDark: '#C96B28', pants: '#4A5566', hair: '#6B4A33', skin: '#F7D6B8', logo: false, x: 1672, flip: true },
};

function emotionOf(direction, spk) {
  const d = (direction || '').toLowerCase();
  const has = (...w) => w.some(x => d.includes(x));
  if (has('surprised', 'impressed')) return 'surprised';
  if (has('worried', 'nervous', 'anxious', 'cautious', 'hesitant')) return 'worried';
  if (has('realizing', 'understanding', 'insightful')) return 'realize';
  if (has('curious', 'thinking', 'thoughtful', 'intriguing')) return 'think';
  if (has('serious', 'firm', 'determined', 'heavy', 'cautioning')) return 'serious';
  if (has('embarrassed', 'reluctant', 'quiet', 'sad', 'humble')) return 'shy';
  if (has('laugh', 'bright', 'relieved', 'happy', 'smile', 'warm', 'encouraging', 'reassuring', 'hopeful', 'welcoming')) return 'happy';
  if (spk === 'N' && has('explaining', 'clear', 'steady', 'example', 'storytelling', 'rhythmic')) return 'explain';
  return 'neutral';
}

const POSES = {
  //            左腕, 右腕（右腕が黒板側）
  neutral:   [8, -8],
  explain:   [10, -92],
  happy:     [38, -38],
  surprised: [150, -150],
  worried:   [-18, 18],
  think:     [8, -155],
  serious:   [10, -62],
  realize:   [10, -140],
  shy:       [-10, 10],
  listen:    [6, -6],
};

function charSVG(k) {
  const c = CHAR_LOOK[k];
  const arm = (id, sx) => `
    <g id="${k}-${id}"><path d="M${sx} 250 L${sx + (id === 'armR' ? 12 : -12)} 368" stroke="${c.shirt}" stroke-width="30" stroke-linecap="round"/>
      <circle cx="${sx + (id === 'armR' ? 12 : -12)}" cy="376" r="16" fill="${c.skin}"/></g>`;
  return `
  <svg id="${k}-svg" width="240" height="540" viewBox="0 0 240 540" style="position:absolute;left:${c.x}px;top:346px;overflow:visible;${c.flip ? 'transform:scaleX(-1);' : ''}">
    <ellipse cx="120" cy="528" rx="80" ry="10" fill="rgba(0,0,0,.35)"/>
    <g id="${k}-body">
      <rect x="86" y="392" width="30" height="118" rx="12" fill="${c.pants}"/>
      <rect x="124" y="392" width="30" height="118" rx="12" fill="${c.pants}"/>
      <ellipse cx="98" cy="512" rx="24" ry="11" fill="#222"/>
      <ellipse cx="142" cy="512" rx="24" ry="11" fill="#222"/>
      ${arm('armL', 72)}
      ${arm('armR', 168)}
      <path d="M66 246 Q120 222 174 246 L182 404 Q120 414 58 404 Z" fill="${c.shirt}"/>
      <path d="M100 232 L120 262 L140 232" fill="none" stroke="${c.shirtDark}" stroke-width="6" stroke-linejoin="round"/>
      ${c.logo ? '<circle cx="148" cy="290" r="9" fill="#E8833A"/>' : '<path d="M92 300 Q120 312 148 300" stroke="#fff" stroke-width="5" fill="none" opacity=".7"/>'}
      <rect x="108" y="210" width="24" height="26" fill="${c.skin}"/>
      <g id="${k}-head">
        <circle cx="48" cy="150" r="14" fill="${c.skin}"/><circle cx="192" cy="150" r="14" fill="${c.skin}"/>
        <circle cx="120" cy="146" r="74" fill="${c.skin}"/>
        ${k === 'N'
          ? `<path d="M46 142 Q44 64 120 62 Q196 64 194 142 Q186 104 160 96 Q128 116 88 98 Q60 108 46 142 Z" fill="${c.hair}"/>`
          : `<path d="M44 150 Q36 58 120 58 Q204 58 196 150 Q192 110 176 96 L160 118 L150 94 L128 116 L112 92 L92 116 L80 96 Q56 108 44 150 Z" fill="${c.hair}"/>`}
        <circle id="${k}-blushL" cx="80" cy="178" r="12" fill="#F29C8A" opacity="0"/>
        <circle id="${k}-blushR" cx="160" cy="178" r="12" fill="#F29C8A" opacity="0"/>
        <path id="${k}-browL" d="M80 118 L106 118" stroke="#3A2C22" stroke-width="6" stroke-linecap="round"/>
        <path id="${k}-browR" d="M134 118 L160 118" stroke="#3A2C22" stroke-width="6" stroke-linecap="round"/>
        <g id="${k}-eyesOpen">
          <ellipse id="${k}-eyeL" cx="95" cy="146" rx="8" ry="11" fill="#2B211B"/>
          <ellipse id="${k}-eyeR" cx="145" cy="146" rx="8" ry="11" fill="#2B211B"/>
          <circle id="${k}-hlL" cx="98" cy="141" r="3" fill="#fff"/><circle id="${k}-hlR" cx="148" cy="141" r="3" fill="#fff"/>
        </g>
        <g id="${k}-eyesHappy" opacity="0">
          <path d="M85 150 Q95 138 105 150" stroke="#2B211B" stroke-width="5" fill="none" stroke-linecap="round"/>
          <path d="M135 150 Q145 138 155 150" stroke="#2B211B" stroke-width="5" fill="none" stroke-linecap="round"/>
        </g>
        <path id="${k}-mouth" d="M106 188 Q120 196 134 188" stroke="#7A3B2E" stroke-width="5" fill="#9C4A3A" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
      <g id="${k}-fx" transform="translate(196 40)"></g>
    </g>
  </svg>`;
}

function fxSVG(kind) {
  if (kind === 'surprised') return '<text x="0" y="40" font-size="64" font-weight="700" fill="#F4A765" font-family="Zen Maru Gothic">！</text>';
  if (kind === 'think') return '<text x="0" y="40" font-size="60" font-weight="700" fill="#F3F0E6" font-family="Zen Maru Gothic">？</text>';
  if (kind === 'worried') return '<path d="M10 0 Q-6 26 10 34 Q26 26 10 0 Z" fill="#8EC5F0" stroke="#fff" stroke-width="2"/>';
  if (kind === 'realize') return '<circle cx="14" cy="18" r="16" fill="#FFE27A"/><rect x="7" y="34" width="14" height="10" fill="#ccc"/>' +
    '<path d="M14 -10 L14 -2 M-10 18 L-2 18 M30 18 L38 18 M-4 0 L2 6 M32 0 L26 6" stroke="#FFE27A" stroke-width="4" stroke-linecap="round"/>';
  if (kind === 'happy') return '<path d="M0 14 L6 8 L12 14 L6 20 Z M18 -4 L22 -10 L26 -4 L22 2 Z M26 26 L30 22 L34 26 L30 30 Z" fill="#FFE27A"/>';
  if (kind === 'shy') return '<path d="M0 10 Q10 0 20 10 Q30 20 40 10" stroke="#9FB4CC" stroke-width="4" fill="none"/>';
  return '';
}

const CHARS = {};
(function mountCharacters() {
  const holder = document.createElement('div');
  holder.innerHTML = charSVG('N') + charSVG('L');
  document.getElementById('stage').appendChild(holder);
  for (const k of ['N', 'L']) {
    const g = id => document.getElementById(`${k}-${id}`);
    CHARS[k] = { body: g('body'), head: g('head'), armL: g('armL'), armR: g('armR'), browL: g('browL'), browR: g('browR'),
      eyeL: g('eyeL'), eyeR: g('eyeR'), hlL: g('hlL'), hlR: g('hlR'), eyesOpen: g('eyesOpen'), eyesHappy: g('eyesHappy'),
      mouth: g('mouth'), blushL: g('blushL'), blushR: g('blushR'), fx: g('fx'), fxKind: null };
  }
})();

// その時刻に誰がどんな気持ちか
function charState(k, t) {
  let cur = null, prev = null;
  for (const l of T.lines) { if (t >= l.start - 0.05) { prev = cur; cur = l; } }
  if (!cur || t > cur.end + 1.5 && cur === T.lines[T.lines.length - 1]) return { emo: 'happy', speaking: false, since: 0, from: 'neutral' };
  const mine = cur.spk === k;
  const speaking = mine && t < cur.end;
  let emo;
  if (mine) emo = emotionOf(cur.direction, k);
  else emo = k === 'N' ? 'happy' : (t - cur.start < 2.0 ? 'listen' : 'listen');
  if (mine && !speaking && t > cur.end + 0.6) emo = emo === 'explain' ? 'neutral' : emo;
  let from = 'neutral';
  if (prev) from = prev.spk === k ? emotionOf(prev.direction, k) : (k === 'N' ? 'happy' : 'listen');
  return { emo, speaking, since: t - cur.start, from, lineStart: cur.start };
}

function setCharacters(t) {
  for (const k of ['N', 'L']) {
    const c = CHARS[k], s = charState(k, t);
    const blend = easeOut(clamp(s.since / 0.35));
    const pa = POSES[s.from] || POSES.neutral, pb = POSES[s.emo] || POSES.neutral;
    let aL = pa[0] + (pb[0] - pa[0]) * blend, aR = pa[1] + (pb[1] - pa[1]) * blend;
    if (s.speaking && s.emo === 'explain') aR += Math.sin(t * 3.1) * 7;
    if (s.speaking && s.emo === 'happy') { aL += Math.sin(t * 2.4) * 5; aR -= Math.sin(t * 2.4) * 5; }
    c.armL.setAttribute('transform', `rotate(${aL.toFixed(1)} 72 250)`);
    c.armR.setAttribute('transform', `rotate(${aR.toFixed(1)} 168 250)`);

    // 体：話すと小さく弾む、驚くと跳ねる、聞くときはうなずく
    let dy = 0, tilt = 0;
    if (s.speaking) dy = -Math.abs(Math.sin(t * 5.2)) * 4;
    if (s.emo === 'surprised') dy -= 26 * Math.sin(Math.PI * clamp(s.since / 0.45));
    if (s.emo === 'happy' && s.speaking) dy -= 6 * Math.max(0, Math.sin(Math.PI * clamp(s.since / 0.5)));
    c.body.setAttribute('transform', `translate(0 ${dy.toFixed(1)})`);
    if (s.emo === 'think') tilt = -9 * blend;
    else if (s.emo === 'worried' || s.emo === 'shy') tilt = 5 * blend;
    else if (s.emo === 'listen') tilt = 3 * Math.max(0, Math.sin(t * 2.3 + (k === 'L' ? 1 : 0)));
    else if (s.speaking) tilt = Math.sin(t * 2.7) * 3;
    const nod = s.emo === 'listen' ? 4 * Math.max(0, Math.sin(t * 2.3)) : 0;
    c.head.setAttribute('transform', `translate(0 ${nod.toFixed(1)}) rotate(${tilt.toFixed(1)} 120 210)`);

    // 眉
    const brow = { neutral: [0, 0, 0], explain: [0, -2, 0], happy: [0, -4, 0], surprised: [0, -14, 0], worried: [-12, -4, 1],
      think: [8, -6, 0], serious: [12, 2, 0], realize: [0, -10, 0], shy: [-10, -2, 1], listen: [0, -2, 0] }[s.emo];
    c.browL.setAttribute('transform', `translate(0 ${brow[1]}) rotate(${-brow[0]} 93 118)`);
    c.browR.setAttribute('transform', `translate(0 ${brow[1]}) rotate(${brow[0]} 147 118)`);

    // 目（まばたき・笑い目・見開き）
    const blink = ((t + (k === 'N' ? 0 : 1.7)) % 3.9) < 0.12;
    const happyEyes = s.emo === 'happy' && !s.speaking || (s.emo === 'happy' && Math.sin(t * 0.9) > 0.3);
    c.eyesHappy.setAttribute('opacity', happyEyes ? '1' : '0');
    c.eyesOpen.setAttribute('opacity', happyEyes ? '0' : '1');
    let ry = { surprised: 14, serious: 8, think: 10, worried: 10, shy: 9 }[s.emo] || 11;
    let rx = s.emo === 'surprised' ? 10 : 8;
    if (blink) ry = 1.2;
    const look = s.emo === 'think' ? [4, -4] : s.emo === 'shy' ? [0, 4] : [0, 0];
    for (const [e, h, cx] of [[c.eyeL, c.hlL, 95], [c.eyeR, c.hlR, 145]]) {
      e.setAttribute('rx', rx); e.setAttribute('ry', ry);
      e.setAttribute('cx', cx + look[0]); e.setAttribute('cy', 146 + look[1]);
      h.setAttribute('opacity', blink ? '0' : '1');
      h.setAttribute('cx', cx + 3 + look[0]); h.setAttribute('cy', 141 + look[1]);
    }
    c.blushL.setAttribute('opacity', s.emo === 'happy' || s.emo === 'shy' ? '0.55' : '0');
    c.blushR.setAttribute('opacity', s.emo === 'happy' || s.emo === 'shy' ? '0.55' : '0');

    // 口：話している間は開いたり閉じたり
    let d;
    if (s.speaking) {
      const o = 0.25 + 0.75 * Math.abs(Math.sin(t * 12.7)) * (0.6 + 0.4 * Math.abs(Math.sin(t * 4.1)));
      const up = s.emo === 'happy' ? -4 : s.emo === 'worried' ? 3 : 0;
      d = `M104 ${186 + up} Q120 ${188 + 22 * o} 136 ${186 + up} Q120 ${184 + 2 * o} 104 ${186 + up} Z`;
    } else {
      d = { happy: 'M102 184 Q120 206 138 184 Q120 192 102 184 Z', surprised: 'M111 190 A9 11 0 1 0 129 190 A9 11 0 1 0 111 190 Z',
        worried: 'M106 194 Q113 186 120 192 Q127 198 134 190', serious: 'M107 192 L133 192', think: 'M110 192 Q122 188 132 194',
        realize: 'M106 186 Q120 200 134 186 Z', shy: 'M110 192 Q120 196 130 192', listen: 'M106 188 Q120 198 134 188' }[s.emo] || 'M106 188 Q120 196 134 188';
    }
    c.mouth.setAttribute('d', d);

    // 記号（！・？・汗・電球・キラキラ）は、そのセリフの始めに出て、しばらくして消える
    const fxKind = s.emo === 'explain' || s.emo === 'listen' || s.emo === 'neutral' || s.emo === 'serious' ? null : s.emo;
    const showFx = fxKind && (s.speaking || s.since < 2.2) && s.since < 2.6;
    if (c.fxKind !== (showFx ? fxKind : null)) { c.fx.innerHTML = showFx ? fxSVG(fxKind) : ''; c.fxKind = showFx ? fxKind : null; }
    if (showFx) {
      const p = clamp(s.since / 0.3), out = clamp((s.since - 2.1) / 0.5);
      const sc = (0.3 + 0.7 * easeBack(p)) * (1 - 0.3 * out);
      const fl = CHAR_LOOK[k].flip ? -1 : 1;   // 左右反転したキャラの記号は、もう一度反転して読めるようにする
      c.fx.setAttribute('transform', `translate(${fl < 0 ? 236 : 196} ${40 - 6 * Math.sin(t * 4)}) scale(${(fl * sc).toFixed(3)} ${sc.toFixed(3)})`);
      c.fx.setAttribute('opacity', String(1 - out));
    }
  }
}
