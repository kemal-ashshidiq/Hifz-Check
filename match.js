// Word matching between the expected passage and what speech recognition heard.
// Speech engines drop diacritics and spell hamza/alef/ta marbuta loosely, so both
// sides are reduced to bare letters before comparing.

function norm(w) {
  return w
    .replace(/[ً-ٰٟۖ-ۭـ]/g, '') // harakat, Quranic marks, tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ء/g, '')
    .replace(/[^ء-ي]/g, '');
}

// Muqatta'at (الم، حم، كهيعص...) are recited as letter names, so the recognizer
// writes "الف لام ميم". Joined back into letters they match the written word.
const LETTER = { الف: 'ا', لام: 'ل', ميم: 'م', صاد: 'ص', را: 'ر', كاف: 'ك', ها: 'ه', يا: 'ي',
  عين: 'ع', طا: 'ط', سين: 'س', حا: 'ح', قاف: 'ق', نون: 'ن' };
const SOLO = new Set(['صاد', 'قاف', 'نون']); // ص، ق، ن stand alone; other names are real words alone

function words(text) {
  const out = [];
  // "ألف" also means "thousand", so recognizers (iPhone especially) write the alif of الٓمٓ as 1000
  const ws = text.replace(/(^|\s)(1,?000|١[٬,]?٠٠٠)(?=\s|$)/g, '$1الف').split(/\s+/).map(norm).filter(Boolean);
  for (let i = 0; i < ws.length; i++) {
    let j = i;
    while (j < ws.length && LETTER[ws[j]]) j++;
    if (j - i >= 2 || (j - i === 1 && SOLO.has(ws[i]))) {
      out.push(ws.slice(i, j).map((w) => LETTER[w]).join(''));
      i = j - 1;
    } else out.push(ws[i]);
  }
  return out;
}

function lev(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

// Short words must match exactly; longer ones tolerate recognizer spelling slips.
function close(a, b) {
  if (a === b) return true;
  const len = Math.min(a.length, b.length);
  if (len < 3) return false;
  return lev(a, b) <= (len >= 7 ? 2 : 1);
}

// expected, spoken: normalized word arrays.
// Returns { state, pos }: state[i] is 0 not yet recited, 1 correct, 2 mistake (skipped or replaced);
// pos is where the reciter is now (the next word they should say).
// Unrecognized spoken words are ignored (noise, isti'adha); a mistake shows up when the
// reciter carries on with a later word, which is how a skipped or substituted word is caught.
// Going back to repeat moves pos back; a mistake already made stays counted, like a teacher would.
const BACK = 80; // how far back (in words) a repeat is looked for; keeps long ranges fast on phones

function align(expected, spoken) {
  const state = new Array(expected.length).fill(0);
  const ok = (q) => { if (state[q] === 0) state[q] = 1; };
  // this spoken word and the next two match expected[q..q+2]; three, because a misheard word
  // followed by a common one ("... الله") too often looks like an earlier pair on the page
  const run3 = (i, q) => q + 2 < expected.length && i + 2 < spoken.length &&
    close(spoken[i], expected[q]) && close(spoken[i + 1], expected[q + 1]) && close(spoken[i + 2], expected[q + 2]);
  let p = 0, far = 0; // far: furthest point reached; everything before it was recited once
  for (let i = 0; i < spoken.length && p < expected.length; i++) {
    const s = spoken[i];
    // recognizer merged two words ("يا ايها" -> "يايها") or split one
    if (p + 1 < expected.length && s === expected[p] + expected[p + 1]) {
      ok(p); ok(p + 1); p += 2; far = Math.max(far, p); continue;
    }
    if (i + 1 < spoken.length && close(s + spoken[i + 1], expected[p]) && !close(s, expected[p])) {
      ok(p++); i++; far = Math.max(far, p); continue;
    }
    // no jumping ahead before the first word lands (isti'adha "بالله" would hit "الله"),
    // and short words are too common to jump ahead on
    const reach = p === 0 ? 0 : s.length <= 2 ? 1 : 3;
    let hit = false;
    for (let k = 0; k <= reach && p + k < expected.length; k++) {
      if (close(s, expected[p + k])) {
        for (let m = p; m < p + k; m++) if (state[m] === 0) state[m] = 2;
        ok(p + k);
        p += k + 1;
        hit = true;
        break;
      }
    }
    // reciter went back to repeat (or forward again over words already recited):
    // move to the nearest such spot where this word and the next two match
    if (!hit && p > 0) {
      let best = -1;
      for (let q = Math.max(0, p - BACK); q < Math.max(far, p); q++) {
        if (q !== p && run3(i, q) && (best < 0 || Math.abs(q - p) < Math.abs(best - p))) best = q;
      }
      if (best >= 0) { ok(best); p = best + 1; }
    }
    far = Math.max(far, p);
  }
  return { state, pos: p };
}

if (typeof module !== 'undefined') module.exports = { norm, words, close, align };
