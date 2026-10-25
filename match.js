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
  const ws = text.split(/\s+/).map(norm).filter(Boolean);
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
// Returns { state, pos }: state[i] is 0 not yet recited, 1 correct, 2 mistake (skipped or replaced).
// Unrecognized spoken words are ignored (noise, isti'adha); a mistake shows up when the
// reciter carries on with a later word, which is how a skipped or substituted word is caught.
function align(expected, spoken) {
  const state = new Array(expected.length).fill(0);
  let p = 0;
  for (let i = 0; i < spoken.length && p < expected.length; i++) {
    const s = spoken[i];
    // recognizer merged two words ("يا ايها" -> "يايها") or split one
    if (p + 1 < expected.length && s === expected[p] + expected[p + 1]) {
      state[p] = state[p + 1] = 1; p += 2; continue;
    }
    if (i + 1 < spoken.length && close(s + spoken[i + 1], expected[p]) && !close(s, expected[p])) {
      state[p++] = 1; i++; continue;
    }
    // no jumping ahead before the first word lands (isti'adha "بالله" would hit "الله"),
    // and short words are too common to jump ahead on
    const reach = p === 0 ? 0 : s.length <= 2 ? 1 : 3;
    for (let k = 0; k <= reach && p + k < expected.length; k++) {
      if (close(s, expected[p + k])) {
        for (let m = p; m < p + k; m++) state[m] = 2;
        state[p + k] = 1;
        p += k + 1;
        break;
      }
    }
  }
  return { state, pos: p };
}

if (typeof module !== 'undefined') module.exports = { norm, words, close, align };
