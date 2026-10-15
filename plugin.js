// MonosChinos para Kino (apiVersion 6): catálogo de vww.monoschinos2.net, video por Voe y YourUpload.
// Un solo módulo, sin dependencias. Corre en QuickJS: sin URL, atob, TextDecoder ni timers.
// Servidores del sitio: Mega (no reproducible), Voe y YourUpload.

// ---------- 1. Constantes y textos ----------

const BASE = "https://vww.monoschinos2.net";
const UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";
const ID_OK = /^[A-Za-z0-9._~-]{1,128}$/;

const TXT = {
  notFound: { es: "No encontramos esto en el sitio.", en: "We could not find this on the site." },
  siteDown: { es: "El sitio no responde ahora. Intenta más tarde.", en: "The site is not answering now. Try again later." },
  noServers: {
    es: "Este capítulo no tiene servidores reproducibles (Voe, Filemoon, StreamWish, etc.).",
    en: "This episode has no playable servers (Voe, Filemoon, StreamWish, etc.).",
  },
  serverFailed: {
    es: "No se pudo abrir el video en ese servidor. Prueba otro en el menú Servidor.",
    en: "The video could not be opened on that server. Try another one in the Servidor menu.",
  },
  badRef: { es: "Este título ya no es válido. Búscalo otra vez.", en: "This title is no longer valid. Search for it again." },
  episode: { es: "Capítulo ", en: "Episode " },
};

function lang() {
  return String(kino.lang || "es").toLowerCase().indexOf("en") === 0 ? "en" : "es";
}
function t(key) {
  return TXT[key][lang()];
}
function fail(code, detail, key) {
  return kino.error(code, detail, { userMessage: t(key) });
}
function failWith(code, detail, text) {
  const clean = String(text).replace(/[^\p{L}\p{N} .,:;()!?'-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 160);
  return kino.error(code, detail, { userMessage: clean });
}
function reasonOf(e) {
  const m = String((e && e.message) || "");
  if (/borrad|deleted|not found|removed|HTTP 404/i.test(m)) return lang() === "en" ? "video removed" : "video borrado";
  const h = /HTTP (\d{3})/.exec(m);
  if (h) return "HTTP " + h[1];
  if (/tiempo agotado|timeout|took too long/i.test(m)) return lang() === "en" ? "timed out" : "tardó demasiado";
  if (/sin video/i.test(m)) return lang() === "en" ? "no video found" : "sin video";
  if (/red /.test(m)) return lang() === "en" ? "no connection" : "sin conexión";
  return lang() === "en" ? "failed" : "falló";
}

// ---------- 2. Utilidades de texto ----------

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function b64bytes(s) {
  const out = [];
  let buf = 0;
  let bits = 0;
  for (let i = 0; i < s.length; i++) {
    let c = s[i];
    if (c === "-") c = "+";
    else if (c === "_") c = "/";
    const v = B64.indexOf(c);
    if (v < 0) continue;
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buf >> bits) & 255);
      buf &= (1 << bits) - 1;
    }
  }
  return out;
}

function utf8(bytes) {
  let s = "";
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i++];
    if (b < 0x80) {
      s += String.fromCharCode(b);
    } else if (b >= 0xc0 && b < 0xe0) {
      s += String.fromCharCode(((b & 31) << 6) | (bytes[i++] & 63));
    } else if (b >= 0xe0 && b < 0xf0) {
      const b2 = bytes[i++] & 63;
      const b3 = bytes[i++] & 63;
      s += String.fromCharCode(((b & 15) << 12) | (b2 << 6) | b3);
    } else if (b >= 0xf0) {
      const b2 = bytes[i++] & 63;
      const b3 = bytes[i++] & 63;
      const b4 = bytes[i++] & 63;
      const cp = (((b & 7) << 18) | (b2 << 12) | (b3 << 6) | b4) - 0x10000;
      s += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 1023));
    }
  }
  return s;
}

function b64text(s) {
  return utf8(b64bytes(s));
}

function rot13(s) {
  return s.replace(/[A-Za-z]/g, (c) => {
    const base = c <= "Z" ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });
}

function unslash(s) {
  return String(s).replace(/\\\//g, "/").replace(/\\u0026/g, "&");
}

function cleanQuery(q) {
  return String(q || "")
    .replace(/[^\p{L}\p{N}\s'.:-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function abs(u, from) {
  if (!u) return "";
  u = String(u).trim();
  if (u.indexOf("//") === 0) return "https:" + u;
  if (/^https?:\/\//i.test(u)) return u;
  if (u[0] === "/") {
    const m = /^(https?:\/\/[^/]+)/i.exec(from || BASE);
    return (m ? m[1] : BASE) + u;
  }
  return BASE + "/" + u;
}

function originOf(u) {
  const m = /^(https?:\/\/[^/?#]+)/i.exec(String(u));
  return m ? m[1] : "";
}

// ---------- 3. HTTP ----------

async function getPage(url, headers, timeoutMs) {
  const opts = {
    headers: Object.assign(
      { "User-Agent": UA, "Accept-Language": "es-ES,es;q=0.9", Accept: "text/html,application/xhtml+xml,*/*" },
      headers || {}
    ),
    timeoutMs: timeoutMs || 12000,
  };
  let r = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      r = await kino.fetch(url, opts);
    } catch (e) {
      if (attempt === 1 || (e && e.code === "timeout"))
        throw fail("unavailable", (e && e.code === "timeout" ? "tiempo agotado " : "red ") + (e && e.message), "siteDown");
      await kino.sleep(600);
      continue;
    }
    if ((r.status === 429 || r.status >= 500) && attempt === 0) {
      await kino.sleep(900);
      continue;
    }
    break;
  }
  if (r.status === 404) throw fail("not_found", "HTTP 404 " + url, "notFound");
  if (!r.ok) throw fail("unavailable", "HTTP " + r.status + " " + url, "siteDown");
  return { html: r.text(), url: r.url || url };
}

// ---------- 4. Lectura de MonosChinos ----------

function mkItem(slug, title, poster, movie) {
  if (!slug || !ID_OK.test(slug) || !title) return null;
  const item = {
    id: slug,
    ref: movie ? "e:" + slug + ":1" : "a:" + slug,
    title: String(title).slice(0, 200),
    kind: movie ? "movie" : "series",
  };
  if (poster) item.poster = poster;
  return item;
}

// Extrae slug y número de episodio de /ver/slug-episodio-N
function parseVerHref(href) {
  const m = /\/ver\/([^/?#]+)-episodio-(\d+)/i.exec(href || "");
  if (!m) return null;
  return { slug: m[1], n: parseInt(m[2], 10) };
}

// Tarjetas del listado o de la home. /anime/slug = serie; /ver/slug-episodio-N = capítulo (solo para En emisión).
function cardsFrom(html, opts) {
  opts = opts || {};
  let boxes = kino.html.select(html, "article").map((a) => a.html);
  if (!boxes.length) boxes = kino.html.select(html, "li.col").map((a) => a.html);
  if (!boxes.length) boxes = kino.html.select(html, "li").map((a) => a.html);
  const items = [];
  const seen = {};
  for (const box of boxes) {
    const link = kino.html.select(box, "a[href]")[0];
    if (!link) continue;
    const href = link.attrs.href || "";
    let slug = "";
    let isEpisode = false;
    let movie = false;
    let m = /\/anime\/([^/?#]+)/.exec(href);
    if (m) {
      slug = m[1];
    } else {
      const ver = parseVerHref(href);
      if (!ver) continue;
      isEpisode = true;
      slug = ver.slug;
    }
    if (opts.onlyEpisodes && !isEpisode) continue;
    if (opts.onlyAnime && isEpisode) continue;
    if (seen[slug]) continue;
    const h3 = kino.html.select(box, "h3")[0] || kino.html.select(box, "p")[0] || kino.html.select(box, ".title_cap")[0];
    const img = kino.html.select(box, "img")[0];
    let title =
      (link.attrs.title || "").replace(/^Ver\s+/i, "").replace(/\s+capitulo\s+\d+$/i, "").replace(/\s+episodio\s+\d+$/i, "").trim() ||
      (h3 && h3.text) ||
      (img && img.attrs.alt) ||
      link.text ||
      "";
    title = title.replace(/\s+/g, " ").trim();
    if (isEpisode) title = title.replace(/\s+\d+$/, "").replace(/\s+capitulo\s+\d+$/i, "").trim();
    // En MonosChinos las portadas de capítulos suelen ser la carátula real (cdn/img/portada/).
    const src = img ? img.attrs.src || img.attrs["data-src"] || "" : "";
    const typeText = box;
    movie =
      !isEpisode &&
      (opts.movies ||
        /Pel[ií]cula|Movie|tipo[^>]*>\s*Pel/i.test(typeText) ||
        /cdn\/img\/anime\//.test(src) === false && /pelicula/i.test(slug));
    if (/pelicula|movie/i.test(slug) && !isEpisode) movie = true;
    const item = mkItem(slug, title, src ? abs(src) : "", movie);
    if (!item) continue;
    seen[slug] = true;
    items.push(item);
  }
  return items;
}

function hasNextPage(html, page) {
  return new RegExp("[?&;]pagina=" + (page + 1) + "(?![0-9])").test(html) || new RegExp("[?&;]p=" + (page + 1) + "(?![0-9])").test(html);
}

function dirUrl(kind, page, query) {
  const parts = [];
  if (query) parts.push("buscar=" + encodeURIComponent(query));
  if (kind === "en-emision") parts.push("estado=en+emision");
  if (kind === "type:pelicula") parts.push("tipo=pelicula");
  if (page > 1) parts.push("pagina=" + page);
  return BASE + "/animes" + (parts.length ? "?" + parts.join("&") : "");
}

async function mapLimit(list, limit, fn) {
  const out = new Array(list.length);
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const k = next++;
      try {
        out[k] = await fn(list[k], k);
      } catch (e) {
        out[k] = undefined;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker));
  return out;
}

function cacheGet(key) {
  try {
    return kino.storage.get(key);
  } catch (e) {
    return null;
  }
}
function cacheSet(key, value, ttlMs) {
  try {
    kino.storage.set(key, value, { ttlMs });
  } catch (e) {
    /* sin caché */
  }
}

const LATE = { late: true };

async function nap(ms) {
  let left = ms;
  while (left > 0) {
    const d = Math.min(left, 5000);
    await kino.sleep(d);
    left -= d;
  }
}

async function within(promise, ms) {
  promise.catch(() => {});
  return Promise.race([promise, nap(ms).then(() => LATE)]);
}

// ---------- 5. TMDB (fondos y resúmenes) ----------

const TMDB_BACK = "https://image.tmdb.org/t/p/w780";
const TMDB_IMG = "https://image.tmdb.org/t/p/w300";

function splitTitle(title) {
  let season = 1;
  let base = String(title);
  let marked = false;
  let m = /\b(\d+)(?:st|nd|rd|th)\s+season\b/i.exec(base) || /\bseason\s+(\d+)\b/i.exec(base);
  if (m) {
    season = parseInt(m[1], 10);
    base = base.replace(m[0], " ");
    marked = true;
  } else {
    m = /\s(II|III|IV|V|VI)$/.exec(base);
    if (m) {
      season = { II: 2, III: 3, IV: 4, V: 5, VI: 6 }[m[1]];
      base = base.replace(/\s(II|III|IV|V|VI)$/, "");
      marked = true;
    }
  }
  base = base.replace(/\(\d{4}\)/g, " ").replace(/\s+/g, " ").trim();
  return { base, season, marked };
}

function pickShow(results, year, season, marked) {
  const list = (results || []).filter((r) => r && r.id && r.original_language === "ja");
  const anim = list.filter((r) => (r.genre_ids || []).indexOf(16) >= 0);
  for (const r of anim.length ? anim : list) {
    const y = parseInt(String(r.first_air_date || "").slice(0, 4), 10);
    if (!year || !y) return r;
    const diff = year - y;
    if (marked && season > 1 ? diff >= 0 : diff >= -1 && diff <= 4) return r;
  }
  return null;
}

async function movieInfo(title) {
  if (typeof kino.tmdb !== "function") return null;
  const plain = title.replace(/\bmovie\s*\d*\s*:?\s*/i, " ").replace(/\s+/g, " ").trim();
  const tries = plain && plain !== title ? [title, plain] : [title];
  for (const q of tries) {
    const r = await kino.tmdb("/search/movie", { query: q, language: "es-MX", include_adult: false });
    const list = ((r && r.results) || []).filter((x) => x && x.id && x.original_language === "ja" && (x.genre_ids || []).indexOf(16) >= 0);
    const hit = list[0];
    if (hit) {
      return {
        overview: String(hit.overview || "").slice(0, 700),
        backdrop: hit.backdrop_path ? TMDB_BACK + hit.backdrop_path : "",
        year: String(hit.release_date || "").slice(0, 4),
      };
    }
  }
  return null;
}

async function seriesInfo(title, year) {
  if (typeof kino.tmdb !== "function") return null;
  const sp = splitTitle(title);
  if (sp.base.length < 2) return null;
  const r = await kino.tmdb("/search/tv", { query: sp.base, language: "es-MX", include_adult: false });
  const hit = pickShow((r && r.results) || [], year || 0, sp.season, sp.marked);
  if (!hit) return null;
  return {
    overview: String(hit.overview || "").slice(0, 700),
    backdrop: hit.backdrop_path ? TMDB_BACK + hit.backdrop_path : "",
    year: "",
  };
}

async function infoFor(item) {
  const key = (item.kind === "movie" ? "mov2:" : "ser2:") + item.id;
  const hit = cacheGet(key);
  if (hit) return hit === "0" ? null : JSON.parse(hit);
  const info = item.kind === "movie" ? await movieInfo(item.title) : await seriesInfo(item.title, item.year);
  cacheSet(key, info ? JSON.stringify(info) : "0", info ? 7 * 86400000 : 86400000);
  return info;
}

function applyInfo(item, info) {
  if (!info) return;
  if (info.overview) item.overview = info.overview;
  if (info.backdrop) item.backdrop = info.backdrop;
  if (/^\d{4}$/.test(info.year || "")) item.year = info.year;
}

async function enrichItems(items, cap) {
  let fresh = 0;
  const todo = [];
  for (const it of items) {
    const hit = cacheGet((it.kind === "movie" ? "mov2:" : "ser2:") + it.id);
    if (hit) applyInfo(it, hit === "0" ? null : JSON.parse(hit));
    else if (it.kind === "movie" && fresh < cap) {
      fresh++;
      todo.push(it);
    }
  }
  await mapLimit(todo, 3, async (it) => {
    try {
      applyInfo(it, await infoFor(it));
    } catch (e) {
      kino.log("sin datos de TMDB: " + (e && e.message));
    }
  });
}

function norm(s) {
  let x = String(s || "").toLowerCase();
  if (x.normalize) x = x.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return x.replace(/[^a-z0-9]+/g, " ").trim();
}
function wordsOf(s) {
  return norm(s).split(" ").filter((w) => w.length >= 3);
}
function looseMatch(r, base) {
  const q = wordsOf(base);
  if (!q.length) return false;
  const names = wordsOf((r.name || r.title || "") + " " + (r.original_name || r.original_title || ""));
  return q.filter((w) => names.indexOf(w) >= 0).length / q.length >= 0.6;
}

async function tmdbBackdrop(title) {
  if (typeof kino.tmdb !== "function") return null;
  const sp = splitTitle(title);
  let q = sp.base.length >= 2 ? sp.base : title;
  let marked = sp.marked && sp.season > 1;
  const tn = !sp.marked ? /^(.*\D)\s(\d{1,2})$/.exec(String(title).trim()) : null;
  if (tn && tn[1].trim().length >= 2) {
    q = tn[1].trim();
    marked = parseInt(tn[2], 10) > 1;
  }
  const r = await kino.tmdb("/search/tv", { query: q, language: "es-MX", include_adult: false });
  const list = ((r && r.results) || []).filter(
    (x) => x && x.id && x.original_language === "ja" && (x.genre_ids || []).indexOf(16) >= 0 && x.backdrop_path
  );
  const year = new Date().getFullYear();
  const hit =
    list.filter((x) => looseMatch(x, q))[0] ||
    list.filter((x) => parseInt(String(x.first_air_date || "").slice(0, 4), 10) >= year - 3)[0] ||
    (marked ? list[0] : null);
  if (!hit) return null;
  return { b: TMDB_BACK + hit.backdrop_path, o: String(hit.overview || "").slice(0, 700) };
}

async function backdropFor(item) {
  const key = "bd2:" + item.id;
  const hit = cacheGet(key);
  if (hit) return hit === "0" ? null : JSON.parse(hit);
  const info = await tmdbBackdrop(item.title);
  cacheSet(key, info ? JSON.stringify(info) : "0", (info ? 7 : 1) * 86400000);
  return info;
}

function applyBackdrop(it, info) {
  if (!info) return false;
  if (info.b) it.backdrop = info.b;
  if (info.o && !it.overview) it.overview = info.o;
  return !!info.b;
}

async function fillBackdrops(rows, maxNew, budgetMs) {
  const changed = {};
  const apply = () => {
    for (const row of rows) {
      for (const it of row.items) {
        if (it.backdrop || it.kind === "movie") continue;
        const hit = cacheGet("bd2:" + it.id);
        if (hit && hit !== "0" && applyBackdrop(it, JSON.parse(hit))) changed[row.id] = true;
      }
    }
  };
  apply();
  const todo = [];
  const seen = {};
  for (const row of rows) {
    for (const it of row.items) {
      if (it.backdrop || it.kind === "movie" || seen[it.id] || todo.length >= maxNew) continue;
      if (cacheGet("bd2:" + it.id)) continue;
      seen[it.id] = true;
      todo.push({ it, rowId: row.id });
    }
  }
  if (!todo.length || budgetMs <= 0) return changed;
  const T = Date.now();
  await mapLimit(todo, 4, async ({ it, rowId }) => {
    if (Date.now() - T > budgetMs) return;
    try {
      const info = await backdropFor(it);
      if (applyBackdrop(it, info)) changed[rowId] = true;
    } catch (e) {
      /* siguiente */
    }
  });
  return changed;
}

// ---------- 5b. search, home, browse ----------

export async function search(query) {
  const q = cleanQuery(query && query.q);
  if (q.length < 2) return [];
  const page = await getPage(dirUrl("", 1, q));
  const items = cardsFrom(page.html, { onlyAnime: true }).slice(0, 50);
  if (!items.length) {
    // Fallback: a veces la búsqueda mezcla capítulos
    const all = cardsFrom(page.html).slice(0, 50);
    await within(enrichItems(all, 6), 4000);
    return all;
  }
  await within(enrichItems(items, 6), 4000);
  return items;
}

const HOME_BUDGET_MS = 17000;
let T0 = 0;
function timeLeft() {
  return HOME_BUDGET_MS - (Date.now() - T0);
}

const ROW_FRESH_MS = 10 * 60000;

function savedRow(id) {
  const raw = cacheGet("row2:" + id);
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw);
    if (saved && saved.row && saved.row.items) {
      for (const it of saved.row.items) {
        if (it.backdrop && !/^https:\/\/image\.tmdb\.org\//.test(it.backdrop)) delete it.backdrop;
      }
    }
    return saved;
  } catch (e) {
    return null;
  }
}

function saveRow(row, t) {
  try {
    const raw = JSON.stringify({ t: t || Date.now(), row });
    if (raw.length < 40000) cacheSet("row2:" + row.id, raw, 12 * 3600000);
  } catch (e) {
    /* sin copia */
  }
}

async function loadRow(id, title, fetchFn) {
  const saved = savedRow(id);
  const age = saved ? Date.now() - saved.t : Infinity;
  if (age < ROW_FRESH_MS && saved.row && saved.row.items && saved.row.items.length) {
    return { row: saved.row, loaded: false, copyTime: saved.t };
  }
  const wait =
    age < 3600000 ? 2500 : age < 6 * 3600000 ? 6000 : age < 12 * 3600000 ? 12000 : Math.min(17000, timeLeft());
  try {
    const got = await within(fetchFn(), wait);
    if (got !== LATE && got && got.items && got.items.length) {
      return { row: got, loaded: true, copyTime: Date.now() };
    }
  } catch (e) {
    kino.log("fila " + id + ": " + (e && e.message));
  }
  if (saved && saved.row && saved.row.items && saved.row.items.length) {
    return { row: saved.row, loaded: false, copyTime: saved.t };
  }
  return null;
}

export async function home() {
  T0 = Date.now();
  const shown = [];
  const loaded = {};
  const copyTime = {};

  // En emisión: últimos capítulos de la home (uno por serie)
  const airingP = loadRow("en-emision", lang() === "en" ? "Airing" : "En emisión", async () => {
    const page = await getPage(BASE + "/", null, 9000);
    const items = cardsFrom(page.html, { onlyEpisodes: true }).slice(0, 24);
    return {
      id: "en-emision",
      title: lang() === "en" ? "Airing" : "En emisión",
      items,
    };
  });

  // Animes del catálogo
  const animesP = loadRow("animes", lang() === "en" ? "Anime" : "Animes", async () => {
    const page = await getPage(dirUrl("", 1), null, 9000);
    const items = cardsFrom(page.html, { onlyAnime: true }).slice(0, 40);
    return {
      id: "animes",
      title: lang() === "en" ? "Anime" : "Animes",
      items,
      next: items.length >= 20 ? "1" : undefined,
      browse: "dir:all",
    };
  });

  // En emisión del filtro del catálogo (alternativa / refuerzo)
  const emisionP = loadRow("emision-cat", lang() === "en" ? "Currently airing" : "En emisión (catálogo)", async () => {
    const page = await getPage(dirUrl("en-emision", 1), null, 9000);
    const items = cardsFrom(page.html, { onlyAnime: true }).slice(0, 40);
    return {
      id: "emision-cat",
      title: lang() === "en" ? "Currently airing" : "En emisión",
      items,
      next: items.length >= 20 ? "1" : undefined,
      browse: "en-emision",
    };
  });

  const results = await Promise.all([airingP, animesP, emisionP]);
  for (const r of results) {
    if (!r || !r.row || !r.row.items || !r.row.items.length) continue;
    // Evitar dos filas "En emisión" casi iguales: preferir la de la home si tiene items
    if (r.row.id === "emision-cat" && results[0] && results[0].row && results[0].row.items.length) continue;
    shown.push(r.row);
    loaded[r.row.id] = r.loaded;
    copyTime[r.row.id] = r.copyTime;
  }

  // Fondos para tarjetas horizontales en TV
  try {
    const bdRows = shown.filter((r) => r.id === "en-emision" || r.id === "animes" || r.id === "emision-cat");
    if (bdRows.length) {
      const changed = await fillBackdrops(bdRows, 18, Math.min(3500, timeLeft() - 2500));
      for (const row of bdRows) {
        if (changed[row.id] && !loaded[row.id] && copyTime[row.id]) saveRow(row, copyTime[row.id]);
      }
    }
  } catch (e) {
    kino.log("fondos: " + (e && e.message));
  }

  for (const row of shown) if (loaded[row.id]) saveRow(row);
  return shown;
}

export async function browse(ref, cursor) {
  const kind = String(ref);
  if (!/^(dir:all|en-emision|type:pelicula)$/.test(kind)) throw fail("not_found", "browse " + kind, "notFound");
  const n = parseInt(cursor, 10);
  const pageNo = n > 0 ? n : 1;
  const dirKind = kind === "dir:all" ? "" : kind === "en-emision" ? "en-emision" : "type:pelicula";
  const page = await getPage(dirUrl(dirKind, pageNo));
  const items = cardsFrom(page.html, {
    onlyAnime: true,
    movies: kind === "type:pelicula",
  });
  await within(enrichItems(items, 10), 4000);
  const out = { items };
  if (items.length && hasNextPage(page.html, pageNo)) out.next = String(pageNo + 1);
  else if (items.length >= 20) out.next = String(pageNo + 1);
  return out;
}

// ---------- 6. episodes ----------

async function tmdbSeason(id, season, language) {
  const d = await kino.tmdb("/tv/" + id + "/season/" + season, { language });
  return (d && d.episodes) || [];
}

async function tmdbEpisodes(title, year, maxNum) {
  const sp = splitTitle(title);
  if (sp.base.length < 2) return {};
  const found = await kino.tmdb("/search/tv", { query: sp.base, language: "es-MX", include_adult: false });
  const show = pickShow(found && found.results, year, sp.season, sp.marked);
  if (!show) return {};
  let eps = await tmdbSeason(show.id, sp.season, "es-MX");
  const byNum = {};
  if (!sp.marked && maxNum > eps.length) {
    const detail = await kino.tmdb("/tv/" + show.id, { language: "es-MX" });
    const seasons = ((detail && detail.seasons) || []).filter((x) => x.season_number > 0).slice(0, 10);
    let offset = 0;
    for (const se of seasons) {
      const list = se.season_number === sp.season ? eps : await tmdbSeason(show.id, se.season_number, "es-MX");
      for (const e of list) byNum[offset + e.episode_number] = e;
      offset += list.length;
    }
  } else {
    for (const e of eps) byNum[e.episode_number] = e;
    const empty = eps.filter((e) => !e.overview).length;
    if (eps.length && empty > eps.length / 2) {
      try {
        const en = await tmdbSeason(show.id, sp.season, "en-US");
        for (const e of en) if (byNum[e.episode_number] && !byNum[e.episode_number].overview) byNum[e.episode_number].overview = e.overview;
      } catch (err) {
        /* sin respaldo */
      }
    }
  }
  const out = {};
  for (const k of Object.keys(byNum)) {
    const e = byNum[k];
    out[k] = {
      name: String(e.name || "").slice(0, 200),
      overview: String(e.overview || "").slice(0, 2000),
      still: e.still_path ? TMDB_IMG + e.still_path : "",
      air: /^\d{4}-\d{2}-\d{2}$/.test(e.air_date || "") ? e.air_date : "",
      rt: e.runtime > 0 && e.runtime <= 1000 ? e.runtime : 0,
    };
  }
  return out;
}

async function episodeExtras(slug, title, year, maxNum) {
  if (typeof kino.tmdb !== "function") return {};
  const key = "tmdb2:" + slug;
  try {
    const hit = kino.storage.get(key);
    if (hit) return JSON.parse(hit);
  } catch (e) {
    /* sin caché */
  }
  let extras = {};
  try {
    extras = await tmdbEpisodes(title, year, maxNum);
  } catch (e) {
    kino.log("tmdb: " + (e && e.message));
    return {};
  }
  try {
    const raw = JSON.stringify(extras);
    if (Object.keys(extras).length && raw.length < 60000) kino.storage.set(key, raw, { ttlMs: 6 * 3600000 });
  } catch (e) {
    /* no cabe */
  }
  return extras;
}

function parseAnimePage(html, slug) {
  const nums = {};
  const re = new RegExp("/ver/" + slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "-episodio-(\\d+)", "gi");
  let x;
  while ((x = re.exec(html))) nums[parseInt(x[1], 10)] = true;
  const numbers = Object.keys(nums)
    .map(Number)
    .sort((a, b) => a - b)
    .slice(0, 2000);

  const info = {};
  const h1 = kino.html.select(html, "h1")[0];
  if (h1 && h1.text.trim()) info.title = h1.text.replace(/\s+/g, " ").trim().slice(0, 200);
  // Sinopsis: meta description o párrafos
  const ogd = kino.html.select(html, "meta[property=og:description]")[0] || kino.html.select(html, "meta[name=description]")[0];
  if (ogd && ogd.attrs.content) {
    let text = ogd.attrs.content
      .replace(/ver online[^.]*\.\s*/i, "")
      .replace(/Mira[^.]*Sub Español[^.]*\.\s*/i, "")
      .replace(/MonosChinos2?\s*/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length > 40) info.overview = text.slice(0, 2000);
  }
  const genres = kino.html.select(html, "a[href*='genero=']").map((g) => g.text.trim()).filter(Boolean);
  if (genres.length) info.genres = genres.slice(0, 5).map((g) => g.slice(0, 30));
  const yearEl = kino.html.select(html, "span.year")[0] || kino.html.select(html, ".anio")[0];
  if (yearEl && /\d{4}/.test(yearEl.text)) info.year = /\d{4}/.exec(yearEl.text)[0];
  if (!info.year) {
    const ym = /\b(19|20)\d{2}\b/.exec(html.slice(0, 8000));
    if (ym) info.year = ym[0];
  }
  const og = kino.html.select(html, "meta[property=og:image]")[0];
  if (og && og.attrs.content) info.poster = abs(og.attrs.content);
  if (!info.poster) {
    const img = kino.html.select(html, "img.lazy")[0] || kino.html.select(html, "img")[0];
    if (img && (img.attrs.src || img.attrs["data-src"])) info.poster = abs(img.attrs.src || img.attrs["data-src"]);
  }
  return { numbers, info };
}

function savedGet(key) {
  const raw = cacheGet(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

export async function episodes(ref) {
  const T = Date.now();
  const left = () => 18500 - (Date.now() - T);
  const m = /^a:([A-Za-z0-9._~-]+)$/.exec(String(ref));
  if (!m) throw fail("not_found", "ref " + ref, "badRef");
  const slug = m[1];

  const key = "ep1:" + slug;
  const saved = savedGet(key);
  let data = saved && saved.data && Date.now() - saved.t < 10 * 60000 ? saved.data : null;
  if (!data) {
    try {
      const page = await getPage(BASE + "/anime/" + slug, null, 14000);
      data = parseAnimePage(page.html, slug);
      if (data.numbers.length) cacheSet(key, JSON.stringify({ t: Date.now(), data }), 12 * 3600000);
    } catch (e) {
      if (!saved || !saved.data) throw e;
      kino.log("episodes: se usa la copia guardada (" + (e && e.message) + ")");
      data = saved.data;
    }
  }
  const numbers = data.numbers;
  const info = Object.assign({}, data.info);
  const slugTitle = slug.replace(/-/g, " ");
  let extras = {};
  if (left() > 3000) {
    const got = await within(
      episodeExtras(slug, info.title || slugTitle, parseInt(info.year, 10) || 0, numbers.length ? numbers[numbers.length - 1] : 0),
      Math.min(6000, left() - 1500)
    );
    if (got !== LATE) extras = got || {};
  }
  const shift = numbers.length && numbers[0] === 0 ? 1 : 0;
  const list = numbers.map((n) => {
    const ep = {
      season: 1,
      number: n + shift,
      ref: "e:" + slug + ":" + n,
      title: t("episode") + n,
    };
    const x = extras[n];
    if (x) {
      if (x.name && !/^(episode|episodio|cap[ií]tulo)\s*\d+$/i.test(x.name)) ep.title = x.name;
      if (x.overview) ep.overview = x.overview;
      if (x.still) ep.still = x.still;
      if (x.air) ep.airDate = x.air;
      if (x.rt) ep.runtimeMinutes = x.rt;
    }
    return ep;
  });
  try {
    const extra =
      left() > 2500
        ? await within(infoFor({ id: slug, kind: "series", title: info.title || slugTitle, year: parseInt(info.year, 10) || 0 }), Math.min(3000, left() - 1000))
        : null;
    if (extra && extra !== LATE) {
      if (extra.backdrop) info.backdrop = extra.backdrop;
      if (extra.overview && (info.overview || "").length < 80) info.overview = extra.overview;
    }
  } catch (e) {
    kino.log("ficha sin TMDB: " + (e && e.message));
  }
  return { series: info, episodes: list };
}

// ---------- 7. Servidores (todos los embeds del sitio salvo Mega) ----------
// En MonosChinos2 los embeds vienen en button.play-video[data-player] (URL en base64).
// Servidores vistos: filemoon/byse, doodstream, lulustream, vidhide, streamwish, voe,
// uqload, mp4upload, mixdrop, yourupload, mega (cifrado → se ignora).

const KIND_LABEL = {
  voe: "Voe",
  yourupload: "YourUpload",
  filemoon: "Filemoon",
  streamwish: "StreamWish",
  dood: "Doodstream",
  mixdrop: "MixDrop",
  mp4upload: "Mp4Upload",
  lulu: "LuluStream",
  vidhide: "Vidhide",
  uqload: "Uqload",
  generic: "Servidor",
};

function detectKind(name, url) {
  const n = String(name || "").toLowerCase();
  const u = String(url || "").toLowerCase();
  if (/mega/i.test(n) || /mega\.nz/i.test(u)) return "mega";
  if (/voe/i.test(n) || /voe\.(sx|to|is|nu|st)/i.test(u)) return "voe";
  if (/yourupload/i.test(n) || /yourupload\.com/i.test(u)) return "yourupload";
  if (/filemoon|byse|moon/i.test(n) || /filemoon\.|bysesukior\.|moonf2[a-z]*\./i.test(u)) return "filemoon";
  if (/streamwish|wish/i.test(n) || /streamwish\.|swhoi\.|strwish\.|ahvsh\.|playerwish\./i.test(u)) return "streamwish";
  if (/dood/i.test(n) || /dood(?:stream|s)?\.|dooodster\.|d0o0d\.|ds2play\.|dsvplay\./i.test(u)) return "dood";
  if (/mixdrop|mxdrop/i.test(n) || /mixdrop\.|mdy[a-z0-9]*\.|mxdrop\./i.test(u)) return "mixdrop";
  if (/mp4upload/i.test(n) || /mp4upload\.com/i.test(u)) return "mp4upload";
  if (/lulu/i.test(n) || /lulu(?:stream|vdo|vid)\./i.test(u)) return "lulu";
  if (/vidhide|filelions|vidhidepro/i.test(n) || /vidhide|filelions\.|vidhidepro\./i.test(u)) return "vidhide";
  if (/uqload/i.test(n) || /uqload\./i.test(u)) return "uqload";
  return "generic";
}

function listServers(html) {
  const out = [];
  out.skipped = [];
  const seen = {};
  const buttons = kino.html.select(html, "button.play-video, button[data-player], .nav-link[data-player], li button");
  for (const btn of buttons) {
    const enc = btn.attrs["data-player"] || "";
    const name = (btn.text || "").trim().toLowerCase();
    if (!enc) continue;
    let url = "";
    try {
      url = b64text(enc);
    } catch (e) {
      continue;
    }
    url = unslash(url);
    if (!/^https?:\/\//i.test(url)) continue;
    const kind = detectKind(name, url);
    if (kind === "mega") {
      out.skipped.push(name || "Mega");
      continue;
    }
    const key = kind + "|" + url;
    if (seen[key]) continue;
    seen[key] = true;
    out.push({ kind, url, name: name || kind });
  }
  if (!out.length) {
    const iframes = kino.html.select(html, "iframe[src]");
    for (const ifr of iframes) {
      const url = unslash(ifr.attrs.src || "");
      if (!/^https?:\/\//i.test(url)) continue;
      const kind = detectKind("", url);
      if (kind === "mega") {
        out.skipped.push("Mega");
        continue;
      }
      if (kind === "generic") continue;
      out.push({ kind, url, name: kind });
    }
  }
  return out;
}

function serverLabel(s, all) {
  const base = KIND_LABEL[s.kind] || s.name || "Servidor";
  const same = all.filter((x) => x.kind === s.kind);
  return same.length > 1 ? base + " " + (same.indexOf(s) + 1) : base;
}

// --- Dean Edwards packer (eval(function(p,a,c,k,e,d)...)) usado por Filemoon, StreamWish, MixDrop, etc. ---

function jsUnpack(source) {
  const m = /}\s*\(\s*'((?:\\'|[^'])*)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:\\'|[^'])*)'\s*\.split\s*\(\s*'\|'\s*\)/.exec(source);
  if (!m) return null;
  let payload = m[1].replace(/\\'/g, "'").replace(/\\\\/g, "\\");
  const radix = parseInt(m[2], 10);
  const count = parseInt(m[3], 10);
  const words = m[4].split("|");
  if (!words.length || !count) return null;
  function toBase(n) {
    const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    if (n < radix) return chars.charAt(n);
    return toBase(Math.floor(n / radix)) + chars.charAt(n % radix);
  }
  for (let i = count - 1; i >= 0; i--) {
    if (!words[i]) continue;
    const token = toBase(i);
    payload = payload.replace(new RegExp("\\b" + token + "\\b", "g"), words[i]);
  }
  return payload;
}

function unpackAll(html) {
  let text = String(html);
  const re = /eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*[d|r]/g;
  let guard = 0;
  while (guard++ < 6 && re.test(text)) {
    const start = text.search(/eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,/);
    if (start < 0) break;
    const chunk = text.slice(start, start + 120000);
    const unpacked = jsUnpack(chunk);
    if (!unpacked) break;
    text = text.slice(0, start) + unpacked + text.slice(start + chunk.length);
  }
  return text;
}

function findStreamUrl(html) {
  const flat = unslash(html);
  const patterns = [
    /(?:file|src|source|sources?)\s*[:=]\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i,
    /(?:file|src|source)\s*[:=]\s*["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i,
    /wurl\s*=\s*["']([^"']+)["']/i,
    /["'](https?:\/\/[^"'\s\\<>]+\.m3u8[^"'\s\\<>]*)["']/i,
    /["'](https?:\/\/[^"'\s\\<>]+\.mp4[^"'\s\\<>]*)["']/i,
    /(https?:\/\/[^"'\s\\<>]+\.m3u8[^"'\s\\<>]*)/i,
    /(https?:\/\/[^"'\s\\<>]+\.mp4[^"'\s\\<>]*)/i,
  ];
  for (const re of patterns) {
    const m = re.exec(flat);
    if (m && m[1] && /^https?:\/\//i.test(m[1])) return m[1].replace(/&amp;/g, "&");
  }
  return "";
}

function streamResult(url, referer, label) {
  const headers = { Referer: referer || originOf(url) + "/", "User-Agent": UA };
  return { url, headers, alts: [], label: label || "" };
}

function goneIn(html) {
  return /not\s*found|has been deleted|was deleted|removed|no longer available|copyright|file was deleted/i.test(String(html).slice(0, 25000));
}

// --- Voe ---

function decodeVoe(enc) {
  let s = rot13(enc);
  s = s.replace(/@\$|\^\^|~@|%\?|\*~|!!|#&/g, "");
  s = b64text(s);
  let shifted = "";
  for (let i = 0; i < s.length; i++) shifted += String.fromCharCode(s.charCodeAt(i) - 3);
  shifted = shifted.split("").reverse().join("");
  return JSON.parse(b64text(shifted));
}

function pickUrls(obj) {
  const get = (k) => (typeof obj[k] === "string" ? obj[k] : "");
  const hls = get("source") || get("hls") || get("file");
  const mp4 = get("direct_access_url") || get("mp4");
  return { hls: /\.m3u8/i.test(hls) ? hls : "", mp4: mp4 || (hls && !/\.m3u8/i.test(hls) ? hls : "") };
}

function voeExtract(html) {
  const re = /<script[^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      let raw = JSON.parse(m[1].trim());
      if (Array.isArray(raw)) raw = raw[0];
      if (typeof raw !== "string") continue;
      const found = pickUrls(decodeVoe(raw));
      if (found.hls || found.mp4) return found;
    } catch (e) {
      /* siguiente */
    }
  }
  const val = (key) => {
    const x = new RegExp("[\"']" + key + "[\"']\\s*:\\s*[\"']([^\"']+)[\"']").exec(html);
    if (!x) return "";
    const v = unslash(x[1]);
    return /^https?:\/\//i.test(v) ? v : b64text(v);
  };
  const old = { hls: val("hls"), mp4: val("mp4") };
  if (/^https?:\/\//i.test(old.hls) || /^https?:\/\//i.test(old.mp4)) {
    return { hls: /^https?:\/\//i.test(old.hls) ? old.hls : "", mp4: /^https?:\/\//i.test(old.mp4) ? old.mp4 : "" };
  }
  const u = findStreamUrl(html);
  if (/\.m3u8/i.test(u)) return { hls: u, mp4: "" };
  if (u) return { hls: "", mp4: u };
  return { hls: "", mp4: "" };
}

async function voeStream(embed) {
  let url = embed;
  let html = "";
  for (let hop = 0; hop < 3; hop++) {
    const page = await getPage(url, { Referer: BASE + "/" });
    html = page.html;
    url = page.url;
    const jm = /window\.location\.href\s*=\s*["']([^"']+)["']/.exec(html);
    if (jm && /^https?:\/\//i.test(jm[1]) && jm[1] !== url) {
      url = jm[1];
      continue;
    }
    break;
  }
  const found = voeExtract(html);
  const main = found.hls || found.mp4;
  if (!main) throw fail("unavailable", (goneIn(html) ? "Voe video borrado en " : "Voe sin video en ") + url, "serverFailed");
  const headers = { Referer: originOf(url) + "/", "User-Agent": UA };
  const res = { url: main, headers, alts: [] };
  if (found.hls && found.mp4) res.alts.push({ url: found.mp4, headers, label: "Voe MP4" });
  return res;
}

// --- YourUpload ---

async function yourUploadStream(embed) {
  const page = await getPage(embed, { Referer: "https://www.yourupload.com/" });
  const html = page.html;
  let file = "";
  let m = /file\s*:\s*["']([^"']+)["']/.exec(html);
  if (m) file = m[1];
  if (!file) {
    m =
      /property=["']og:video(?::url)?["'][^>]*content=["']([^"']+)["']/i.exec(html) ||
      /content=["']([^"']+)["'][^>]*property=["']og:video(?::url)?["']/i.exec(html);
    if (m) file = m[1];
  }
  if (!file) {
    m = /<source[^>]+src=["']([^"']+)["']/i.exec(html);
    if (m) file = m[1];
  }
  file = unslash(file).replace(/&amp;/g, "&");
  if (!file) throw fail("unavailable", goneIn(html) ? "YourUpload video borrado" : "YourUpload sin video", "serverFailed");
  file = abs(file, page.url).replace(/^http:\/\//i, "https://");
  return streamResult(file, "https://www.yourupload.com/");
}

// --- Doodstream ---

function randomAlpha(n) {
  const a = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < n; i++) s += a.charAt(Math.floor(Math.random() * a.length));
  return s;
}

async function doodStream(embed) {
  let url = String(embed).replace(/\/d\//, "/e/");
  const page = await getPage(url, { Referer: BASE + "/" });
  const host = originOf(page.url) || originOf(url);
  const md5 = /\/pass_md5\/[^'"]+/.exec(page.html);
  if (!md5) throw fail("unavailable", goneIn(page.html) ? "Doodstream video borrado" : "Doodstream sin pass_md5", "serverFailed");
  const passUrl = host + md5[0];
  const pass = await getPage(passUrl, { Referer: page.url });
  const token = md5[0].split("/").pop();
  const file = String(pass.html).trim() + randomAlpha(10) + "?token=" + token;
  if (!/^https?:\/\//i.test(file)) throw fail("unavailable", "Doodstream sin video", "serverFailed");
  return streamResult(file, host + "/");
}

// --- MixDrop (packer + wurl) ---

async function mixdropStream(embed) {
  const url = String(embed).replace(/\/f\//, "/e/");
  const page = await getPage(url, { Referer: BASE + "/" });
  const unpacked = unpackAll(page.html);
  let file = "";
  const w = /wurl\s*=\s*["']([^"']+)["']/.exec(unpacked);
  if (w) file = w[1];
  if (!file) file = findStreamUrl(unpacked);
  if (!file) throw fail("unavailable", goneIn(page.html) ? "MixDrop video borrado" : "MixDrop sin video", "serverFailed");
  if (file.indexOf("//") === 0) file = "https:" + file;
  return streamResult(file, page.url);
}

// --- Filemoon / StreamWish / Lulu / Vidhide (packer JWPlayer sources) ---

async function packerStream(embed, label) {
  let url = embed;
  let html = "";
  for (let hop = 0; hop < 2; hop++) {
    const page = await getPage(url, { Referer: BASE + "/" });
    html = page.html;
    url = page.url;
    // Algunos Filemoon meten el player en un iframe interno
    const ifr = /<iframe[^>]+src=["']([^"']+)["']/i.exec(html);
    if (ifr && /filemoon|moon|streamwish|lulu|vidhide|filelions/i.test(ifr[1]) && ifr[1] !== url) {
      url = abs(ifr[1], page.url);
      continue;
    }
    break;
  }
  const unpacked = unpackAll(html);
  let file = findStreamUrl(unpacked);
  if (!file) file = findStreamUrl(html);
  if (!file) throw fail("unavailable", goneIn(html) ? label + " video borrado" : label + " sin video", "serverFailed");
  if (file.indexOf("//") === 0) file = "https:" + file;
  return streamResult(file, originOf(url) + "/");
}

// --- Mp4Upload ---

async function mp4uploadStream(embed) {
  const page = await getPage(embed, { Referer: BASE + "/" });
  const unpacked = unpackAll(page.html);
  let file = findStreamUrl(unpacked);
  if (!file) {
    const m = /player\.src\(\s*["']([^"']+)["']\s*\)/.exec(unpacked) || /src\s*:\s*["']([^"']+\.mp4[^"']*)["']/.exec(unpacked);
    if (m) file = m[1];
  }
  if (!file) file = findStreamUrl(page.html);
  if (!file) throw fail("unavailable", goneIn(page.html) ? "Mp4Upload video borrado" : "Mp4Upload sin video", "serverFailed");
  return streamResult(file, originOf(page.url) + "/");
}

// --- Uqload ---

async function uqloadStream(embed) {
  const page = await getPage(embed, { Referer: BASE + "/" });
  const unpacked = unpackAll(page.html);
  let file = findStreamUrl(unpacked) || findStreamUrl(page.html);
  if (!file) {
    const m = /sources\s*:\s*\[\s*\{\s*src\s*:\s*["']([^"']+)["']/.exec(unpacked || page.html);
    if (m) file = m[1];
  }
  if (!file) throw fail("unavailable", goneIn(page.html) ? "Uqload video borrado" : "Uqload sin video", "serverFailed");
  return streamResult(file, originOf(page.url) + "/");
}

// --- Genérico: cualquier embed con m3u8/mp4 a la vista o empaquetado ---

async function genericStream(embed) {
  const page = await getPage(embed, { Referer: BASE + "/" });
  const unpacked = unpackAll(page.html);
  let file = findStreamUrl(unpacked) || findStreamUrl(page.html);
  if (!file) throw fail("unavailable", goneIn(page.html) ? "video borrado" : "sin video en el embed", "serverFailed");
  if (file.indexOf("//") === 0) file = "https:" + file;
  return streamResult(file, originOf(page.url) + "/");
}

async function streamFor(s) {
  switch (s.kind) {
    case "voe":
      return voeStream(s.url);
    case "yourupload":
      return yourUploadStream(s.url);
    case "dood":
      return doodStream(s.url);
    case "mixdrop":
      return mixdropStream(s.url);
    case "filemoon":
      return packerStream(s.url, "Filemoon");
    case "streamwish":
      return packerStream(s.url, "StreamWish");
    case "lulu":
      return packerStream(s.url, "LuluStream");
    case "vidhide":
      return packerStream(s.url, "Vidhide");
    case "mp4upload":
      return mp4uploadStream(s.url);
    case "uqload":
      return uqloadStream(s.url);
    default:
      return genericStream(s.url);
  }
}

// ---------- 8. resolve ----------

function parseRef(ref) {
  let m = /^s:(\d+):e:([A-Za-z0-9._~-]+):(\d+)$/.exec(ref);
  if (m) return { idx: parseInt(m[1], 10), slug: m[2], n: parseInt(m[3], 10) };
  m = /^e:([A-Za-z0-9._~-]+):(\d+)$/.exec(ref);
  if (m) return { idx: -1, slug: m[1], n: parseInt(m[2], 10) };
  return null;
}

export async function resolve(ref) {
  const p = parseRef(String(ref));
  if (!p) throw fail("not_found", "ref " + ref, "badRef");

  const page = await getPage(BASE + "/ver/" + p.slug + "-episodio-" + p.n);
  const all = listServers(page.html);
  kino.log(
    "resolve: " +
      p.slug +
      "-" +
      p.n +
      " servidores compatibles: " +
      (all.map((s) => s.name).join(", ") || "ninguno") +
      " | otros: " +
      ((all.skipped || []).join(", ") || "ninguno")
  );
  if (!all.length) {
    const others = (all.skipped || []).filter((n, i, a) => n && a.indexOf(n) === i).slice(0, 4);
    const text =
      (lang() === "en" ? "This episode has no playable servers." : "Este capítulo no tiene servidores reproducibles.") +
      (others.length ? (lang() === "en" ? " Available: " : " Disponibles: ") + others.join(", ") + "." : "");
    throw failWith("not_found", "sin servidores reproducibles (otros: " + others.join(", ") + ")", text);
  }

  let order;
  if (p.idx >= 0) {
    order = all[p.idx] ? [all[p.idx]] : [];
  } else {
    const pref = String(kino.config.get("server") || "voe");
    // Preferido primero; luego un orden estable por fiabilidad relativa.
    const rank = (k) => {
      if (k === pref) return 0;
      const orderMap = { voe: 1, streamwish: 2, filemoon: 3, mixdrop: 4, dood: 5, lulu: 6, vidhide: 7, mp4upload: 8, uqload: 9, yourupload: 10, generic: 20 };
      return orderMap[k] != null ? orderMap[k] : 15;
    };
    order = all.slice().sort((a, b) => rank(a.kind) - rank(b.kind));
  }

  let main = null;
  let used = null;
  const rest = [];
  const failures = [];
  for (const s of order) {
    if (main) {
      rest.push(s);
      continue;
    }
    try {
      main = await streamFor(s);
      used = s;
    } catch (e) {
      kino.log("resolve: " + s.kind + " falló: " + (e && e.message));
      failures.push({ label: serverLabel(s, all), reason: reasonOf(e), detail: (e && e.message) || "" });
    }
  }
  if (!main) {
    const others = (all.skipped || []).filter((n, i, a) => n && a.indexOf(n) === i).slice(0, 3);
    const text =
      (lang() === "en" ? "The video could not be opened. " : "No se pudo abrir el video. ") +
      failures.map((f) => f.label + ": " + f.reason + ".").join(" ") +
      (others.length ? (lang() === "en" ? " Only on the site: " : " En el sitio solo hay: ") + others.join(", ") + "." : "");
    throw failWith("unavailable", "ningún servidor abrió (" + failures.map((f) => f.label + ": " + f.detail).join(" | ") + ")", text);
  }

  const stream = {
    url: main.url,
    headers: main.headers,
    label: serverLabel(used, all),
    expiresInSeconds: 1800,
  };
  if (p.idx < 0) {
    const alts = main.alts.slice();
    for (const s of rest) {
      alts.push({ label: serverLabel(s, all), ref: "s:" + all.indexOf(s) + ":e:" + p.slug + ":" + p.n });
    }
    if (alts.length) stream.alternatives = alts.slice(0, 8);
  }
  return stream;
}
