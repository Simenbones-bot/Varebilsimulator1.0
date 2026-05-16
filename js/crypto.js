// SHA-256 av (brukernavn.toLowerCase() + passord).
// Bruker Web Crypto nar tilgjengelig (https/localhost), ellers en ren
// JS-fallback slik at appen ogsa virker apnet direkte som fil.

function toUtf8(str) {
  return unescape(encodeURIComponent(str));
}

function sha256Fallback(asciiBytes) {
  function rr(value, amount) {
    return (value >>> amount) | (value << (32 - amount));
  }
  const maxWord = Math.pow(2, 32);
  let result = "";
  const words = [];
  const asciiBitLength = asciiBytes.length * 8;

  let hash = sha256Fallback.h;
  let k = sha256Fallback.k;
  if (!hash) {
    hash = sha256Fallback.h = [];
    k = sha256Fallback.k = [];
    let primeCounter = 0;
    const isComposite = {};
    for (let candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (let i = 0; i < 313; i += candidate) isComposite[i] = candidate;
        hash[primeCounter] = (Math.pow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter++] = (Math.pow(candidate, 1 / 3) * maxWord) | 0;
      }
    }
  }

  let ascii = asciiBytes + "\x80";
  while ((ascii.length % 64) - 56) ascii += "\x00";
  for (let i = 0; i < ascii.length; i++) {
    const j = ascii.charCodeAt(i);
    words[i >> 2] |= j << (((3 - i) % 4) * 8);
  }
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength;

  let workHash = hash.slice(0);
  for (let j = 0; j < words.length; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = workHash;
    workHash = workHash.slice(0, 8);

    for (let i = 0; i < 64; i++) {
      const w15 = w[i - 15];
      const w2 = w[i - 2];
      const a = workHash[0];
      const e = workHash[4];
      const temp1 =
        workHash[7] +
        (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) +
        ((e & workHash[5]) ^ (~e & workHash[6])) +
        k[i] +
        (w[i] =
          i < 16
            ? w[i]
            : (w[i - 16] +
                (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) +
                w[i - 7] +
                (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) |
              0);
      const temp2 =
        (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) +
        ((a & workHash[1]) ^ (a & workHash[2]) ^ (workHash[1] & workHash[2]));
      workHash = [(temp1 + temp2) | 0].concat(workHash);
      workHash[4] = (workHash[4] + temp1) | 0;
    }
    for (let i = 0; i < 8; i++) {
      workHash[i] = (workHash[i] + oldHash[i]) | 0;
    }
  }

  for (let i = 0; i < 8; i++) {
    for (let j = 3; j + 1; j--) {
      const b = (workHash[i] >> (j * 8)) & 255;
      result += (b < 16 ? "0" : "") + b.toString(16);
    }
  }
  return result;
}

export async function hashCredentials(username, password) {
  const message = String(username).toLowerCase() + String(password);
  if (globalThis.crypto && crypto.subtle) {
    try {
      const data = new TextEncoder().encode(message);
      const buf = await crypto.subtle.digest("SHA-256", data);
      return [...new Uint8Array(buf)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    } catch (_) {
      /* faller tilbake under */
    }
  }
  return sha256Fallback(toUtf8(message));
}
