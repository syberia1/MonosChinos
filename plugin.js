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
  if (u.indexOf("./") === 0) u = u.slice(2);
  return BASE + "/" + u;
}

function originOf(u) {
  const m = /^(https?:\/\/[^/?#]+)/i.exec(String(u));
  return m ? m[1] : "";
}

// Sin JS, src es un placeholder (anime.png / episode.png); la carátula real va en data-src.
function imgUrl(img) {
  if (!img || !img.attrs) return "";
  const a = img.attrs;
  const ds = a["data-src"] || a["data-lazy-src"] || a["data-original"] || "";
  const src = a.src || "";
  const pick = ds || src;
  if (!pick) return "";
  if (/\/cdn\/img\/(anime|episode|coverfb)\.png/i.test(pick)) {
    if (ds && !/\/cdn\/img\/(anime|episode|coverfb)\.png/i.test(ds)) return abs(ds);
    return "";
  }
  return abs(pick);
}

function posterFromSlug(slug, asAnime) {
  if (!slug) return "";
  return BASE + "/cdn/img/" + (asAnime ? "anime" : "portada") + "/" + slug + ".webp";
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

function cleanTitle(raw, isEpisode) {
  let title = String(raw || "")
    .replace(/^Ver\s+/i, "")
    .replace(/^Anime\s+/i, "")
    .replace(/\s+Online\s+Gratis\.?$/i, "")
    .replace(/\s+capitulo\s+\d+$/i, "")
    .replace(/\s+episodio\s+\d+$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (isEpisode) title = title.replace(/\s+\d+$/, "").trim();
  return title;
}

// Lee atributo HTML respetando comillas (JoJo's no debe cortar el valor).
function attrOf(chunk, name) {
  let m = new RegExp("\\b" + name + "\\s*=\\s*\"([^\"]*)\"", "i").exec(chunk);
  if (m) return m[1];
  m = new RegExp("\\b" + name + "\\s*=\\s*'([^']*)'", "i").exec(chunk);
  return m ? m[1] : "";
}

function cardChunkAround(html, index, hrefLen) {
  const from = Math.max(0, index - 120);
  const to = Math.min(html.length, index + hrefLen + 1200);
  return html.slice(from, to);
}

// Tarjetas del listado o de la home. Deduplica siempre por slug.
function cardsFrom(html, opts) {
  opts = opts || {};
  const items = [];
  const seen = {};
  const push = (slug, title, poster, isEpisode, movie) => {
    if (!slug || seen[slug]) return;
    if (opts.onlyEpisodes && !isEpisode) return;
    if (opts.onlyAnime && isEpisode) return;
    if (opts.onlyEpisodes || opts.preferAnimePoster) {
      poster = posterFromSlug(slug, true);
    } else if (!poster) {
      poster = posterFromSlug(slug, !isEpisode);
    }
    if (poster) poster = String(poster).replace(/\?t=[^&]+/, "");
    const item = mkItem(slug, title, poster, movie && !isEpisode);
    if (!item) return;
    seen[slug] = true;
    items.push(item);
  };

  // --- Anime: un resultado por slug ---
  if (opts.onlyAnime || (!opts.onlyEpisodes && !opts.preferAnimePoster)) {
    const reAnime = /href=(["'])([^"']*\/anime\/([^"'/?#]+))\1/gi;
    let x;
    while ((x = reAnime.exec(html))) {
      const slug = x[3];
      if (seen[slug]) continue;
      const chunk = cardChunkAround(html, x.index, x[0].length);
      let poster = attrOf(chunk, "data-src") || "";
      if (!poster || /\/cdn\/img\/(anime|episode|coverfb)\.png/i.test(poster)) {
        const src = attrOf(chunk, "src");
        if (src && /\/cdn\/img\/anime\//i.test(src)) poster = src;
        else poster = "";
      }
      if (poster) poster = abs(poster);
      let title =
        cleanTitle(attrOf(chunk, "title"), false) ||
        cleanTitle(attrOf(chunk, "alt"), false) ||
        "";
      if (!title) {
        const h3 = /<h3[^>]*class="[^"]*title_cap[^"]*"[^>]*>([^<]+)/i.exec(chunk) || /<h3[^>]*>([^<]+)/i.exec(chunk);
        if (h3) title = cleanTitle(h3[1], false);
      }
      // Si el título quedó truncado por un apóstrofe mal parseado, usar el slug
      if (!title || /^jojo'?s?$/i.test(title.trim())) {
        title = slug
          .replace(/-/g, " ")
          .replace(/\bjojos\b/gi, "JoJo's")
          .replace(/\bjojo\b/gi, "JoJo");
        title = title.replace(/\b\w/g, (c) => c.toUpperCase());
      }
      const movie = !!(opts.movies || /pelicula|movie/i.test(slug) || /Pel[ií]cula/i.test(chunk));
      push(slug, title, poster, false, movie);
    }
  }

  // --- Capítulos (En emisión) ---
  if (opts.onlyEpisodes || opts.preferAnimePoster || (!opts.onlyAnime && !items.length)) {
    const reVer = /href=(["'])([^"']*\/ver\/([^"'/?#]+)-episodio-(\d+))\1/gi;
    let x;
    while ((x = reVer.exec(html))) {
      const slug = x[3];
      if (seen[slug]) continue;
      const chunk = cardChunkAround(html, x.index, x[0].length);
      let title =
        cleanTitle(attrOf(chunk, "title"), true) ||
        cleanTitle(attrOf(chunk, "alt"), true) ||
        slug.replace(/-/g, " ");
      push(slug, title, posterFromSlug(slug, true), true, false);
    }
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

function titleScore(r, query) {
  // Puntuación de similitud: evita que "Steel Ball Run: JoJo…" se confunda con "JoJo no Kimyou na Bouken" (Phantom Blood).
  const q = norm(query);
  const names = [r.name, r.original_name, r.title, r.original_title].filter(Boolean).map(norm);
  let best = 0;
  for (const n of names) {
    if (!n) continue;
    if (n === q) return 100;
    if (n.indexOf(q) >= 0 || q.indexOf(n) >= 0) best = Math.max(best, 80);
    const qw = wordsOf(q);
    const nw = wordsOf(n);
    if (!qw.length) continue;
    const hit = qw.filter((w) => nw.indexOf(w) >= 0).length;
    const ratio = hit / qw.length;
    // Exigir que las palabras distintivas del query (no genéricas) estén en el nombre
    best = Math.max(best, Math.round(ratio * 70));
  }
  return best;
}

function pickShow(results, year, season, marked, query) {
  const list = (results || []).filter((r) => r && r.id && r.original_language === "ja");
  const anim = list.filter((r) => (r.genre_ids || []).indexOf(16) >= 0);
  const pool = anim.length ? anim : list;
  // Ordenar por similitud de título; umbral mínimo para no coger otra parte de JoJo
  const scored = pool
    .map((r) => {
      const y = parseInt(String(r.first_air_date || "").slice(0, 4), 10) || 0;
      let score = titleScore(r, query || "");
      if (year && y) {
        const diff = Math.abs(year - y);
        if (diff === 0) score += 10;
        else if (diff <= 2) score += 5;
        else if (diff > 8) score -= 20;
      }
      return { r, score };
    })
    // Umbral alto: evita cruzar partes de JoJo (Stone Ocean vs Steel Ball Run vs Phantom Blood)
    .filter((x) => x.score >= 60)
    .sort((a, b) => b.score - a.score);
  return scored.length ? scored[0].r : null;
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
  // 1) TMDB
  if (typeof kino.tmdb === "function") {
    const sp = splitTitle(title);
    if (sp.base.length >= 2) {
      const queries = [sp.base];
      const beforeColon = sp.base.split(":")[0].trim();
      if (beforeColon.length >= 4 && beforeColon !== sp.base) queries.push(beforeColon);
      let hit = null;
      for (const q of queries) {
        const r = await kino.tmdb("/search/tv", { query: q.replace(/[.,;:]+$/g, "").trim(), language: "es-MX", include_adult: false });
        hit = pickShow((r && r.results) || [], year || 0, sp.season, sp.marked, q);
        if (hit) break;
      }
      if (hit) {
        return {
          overview: String(hit.overview || "").slice(0, 700),
          backdrop: hit.backdrop_path ? TMDB_BACK + hit.backdrop_path : "",
          poster: hit.poster_path ? TMDB_IMG + hit.poster_path : "",
          year: String(hit.first_air_date || "").slice(0, 4),
          tmdbId: hit.id,
          source: "tmdb",
        };
      }
    }
  }
  // 2) kino.meta (AniList incluido)
  try {
    const meta = await metaByTitle(title, year);
    if (meta && (meta.overview || meta.poster || meta.backdrop)) {
      return {
        overview: meta.overview || "",
        poster: meta.poster || "",
        backdrop: meta.backdrop || meta.poster || "",
        year: meta.year || "",
        malId: meta.malId,
        source: "meta",
      };
    }
  } catch (e) {
    /* siguiente */
  }
  // 3) MyAnimeList (Jikan)
  try {
    const a = await malSearchAnime(title, year);
    if (a) {
      const full = a.synopsis ? a : (await malAnimeFull(a.mal_id)) || a;
      const info = malToInfo(full);
      if (info) return info;
    }
  } catch (e) {
    kino.log("mal series: " + (e && e.message));
  }
  return null;
}

async function infoFor(item) {
  const key = (item.kind === "movie" ? "mov4:" : "ser4:") + item.id;
  const hit = cacheGet(key);
  if (hit) return hit === "0" ? null : JSON.parse(hit);
  const info = item.kind === "movie" ? await movieInfo(item.title) : await seriesInfo(item.title, item.year);
  cacheSet(key, info ? JSON.stringify(info) : "0", info ? 7 * 86400000 : 86400000);
  return info;
}

function applyInfo(item, info) {
  if (!info) return;
  // Nunca pisar sinopsis del sitio si ya es razonable
  if (info.overview && !(item.overview && String(item.overview).length > 80)) item.overview = info.overview;
  if (info.backdrop && !item.backdrop) item.backdrop = info.backdrop;
  // NUNCA sustituir la portada del sitio por TMDB (mezclaba Stone Ocean ↔ Steel Ball Run).
  // Solo rellenar si el ítem no trae poster.
  if (info.poster && !item.poster) item.poster = info.poster;
  if (/^\d{4}$/.test(info.year || "") && !item.year) item.year = info.year;
}

async function enrichItems(items, cap) {
  // Enrich ligero: solo backdrops/overview para películas o ítems sin poster.
  // No tocar portadas que ya vienen del catálogo del sitio.
  let fresh = 0;
  const todo = [];
  for (const it of items) {
    const key = (it.kind === "movie" ? "mov4:" : "ser4:") + it.id;
    const hit = cacheGet(key);
    if (hit) {
      applyInfo(it, hit === "0" ? null : JSON.parse(hit));
      continue;
    }
    if (fresh >= cap) continue;
    // Priorizar los que no tienen poster o son películas
    if (!it.poster || it.kind === "movie") {
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
  // Solo fichas /anime/…, un resultado por slug (sin TMDB que pise portadas)
  const items = cardsFrom(page.html, { onlyAnime: true }).slice(0, 40);
  // Enrich mínimo: solo ítems sin poster (p. ej. CDN roto)
  const needPoster = items.filter((it) => !it.poster).slice(0, 4);
  if (needPoster.length) await within(enrichItems(needPoster, 4), 3500);
  return items;
}

const HOME_BUDGET_MS = 17000;
let T0 = 0;
function timeLeft() {
  return HOME_BUDGET_MS - (Date.now() - T0);
}

const ROW_FRESH_MS = 10 * 60000;

function savedRow(id) {
  const raw = cacheGet("row3:" + id);
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
    if (raw.length < 40000) cacheSet("row3:" + row.id, raw, 12 * 3600000);
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

  // En emisión: últimos capítulos de la home (uno por serie), con portada del anime
  const airingP = loadRow("en-emision", lang() === "en" ? "Airing" : "En emisión", async () => {
    const page = await getPage(BASE + "/", null, 9000);
    const items = cardsFrom(page.html, { onlyEpisodes: true, preferAnimePoster: true }).slice(0, 24);
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

  // Películas
  const moviesP = loadRow("peliculas", lang() === "en" ? "Movies" : "Películas", async () => {
    const page = await getPage(dirUrl("type:pelicula", 1), null, 9000);
    const items = cardsFrom(page.html, { onlyAnime: true, movies: true }).slice(0, 40);
    return {
      id: "peliculas",
      title: lang() === "en" ? "Movies" : "Películas",
      items,
      next: items.length >= 15 ? "1" : undefined,
      browse: "type:pelicula",
    };
  });

  const results = await Promise.all([airingP, animesP, moviesP]);
  for (const r of results) {
    if (!r || !r.row || !r.row.items || !r.row.items.length) continue;
    shown.push(r.row);
    loaded[r.row.id] = r.loaded;
    copyTime[r.row.id] = r.copyTime;
  }

  // Fondos para tarjetas horizontales en TV
  try {
    const bdRows = shown.filter((r) => r.id === "en-emision" || r.id === "animes" || r.id === "peliculas");
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
  // Solo exigir palabras "fuertes" cuando el título parece una franquicia con partes (JoJo, etc.)
  const franchise = /\b(jojo|naruto|one\s*piece|bleach|fate|pokemon|digimon|precure|gundam|ultraman)\b/i.test(title);
  const stop = { jojo: 1, jojos: 1, kimyou: 1, bouken: 1, no: 1, na: 1, the: 1, animation: 1, anime: 1, part: 1, season: 1 };
  const distinctive = wordsOf(sp.base).filter((w) => w.length >= 4 && !stop[w]);
  const queries = [];
  const beforeColon = sp.base.split(":")[0].trim();
  if (beforeColon.length >= 4 && beforeColon !== sp.base) queries.push(beforeColon);
  queries.push(sp.base);
  // Quitar puntuación final del query
  for (let i = 0; i < queries.length; i++) queries[i] = queries[i].replace(/[.,;:]+$/g, "").trim();

  let show = null;
  let bestScore = 0;
  for (const q of queries) {
    if (q.length < 2) continue;
    const found = await kino.tmdb("/search/tv", { query: q, language: "es-MX", include_adult: false });
    const hit = pickShow(found && found.results, year, sp.season, sp.marked, q);
    if (!hit) continue;
    const sc = titleScore(hit, q);
    if (franchise && distinctive.length) {
      const names = norm((hit.name || "") + " " + (hit.original_name || ""));
      const ok = distinctive.filter((w) => names.indexOf(w) >= 0).length;
      // En franquicias, exigir al menos una palabra distintiva (steel, ocean, diamond…)
      if (ok < 1) continue;
    }
    if (sc > bestScore) {
      bestScore = sc;
      show = hit;
    }
  }
  if (!show || bestScore < 60) return {};
  if (year > 1900) {
    const y = parseInt(String(show.first_air_date || "").slice(0, 4), 10) || 0;
    // Solo descartar si el desfase es enorme (otra serie homónima antigua)
    if (y && Math.abs(y - year) > 8) return {};
  }
  let eps = await tmdbSeason(show.id, sp.season, "es-MX");
  // Si Season 2 no trae episodios, probar season_number detectado
  if ((!eps || !eps.length) && sp.season > 1) {
    try {
      const detail = await kino.tmdb("/tv/" + show.id, { language: "es-MX" });
      const seasons = ((detail && detail.seasons) || []).filter((x) => x.season_number > 0);
      const want = seasons.find((s) => s.season_number === sp.season) || seasons[seasons.length - 1];
      if (want) eps = await tmdbSeason(show.id, want.season_number, "es-MX");
    } catch (e) {
      /* ignore */
    }
  }
  const byNum = {};
  for (const e of eps || []) byNum[e.episode_number] = e;
  const empty = (eps || []).filter((e) => !e.overview).length;
  if (eps && eps.length && empty > eps.length / 2) {
    try {
      const en = await tmdbSeason(show.id, sp.season, "en-US");
      for (const e of en) if (byNum[e.episode_number] && !byNum[e.episode_number].overview) byNum[e.episode_number].overview = e.overview;
    } catch (err) {
      /* sin respaldo */
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

// ---------- MyAnimeList (Jikan) + kino.meta (AniList) como respaldo de TMDB ----------

const JIKAN = "https://api.jikan.moe/v4";

function malTitleScore(anime, query) {
  if (!anime) return 0;
  const names = [anime.title, anime.title_english, anime.title_japanese]
    .concat((anime.titles || []).map((t) => t && t.title))
    .filter(Boolean);
  let best = 0;
  const q = norm(query);
  for (const n of names) {
    const nn = norm(n);
    if (!nn) continue;
    if (nn === q) return 100;
    if (nn.indexOf(q) >= 0 || q.indexOf(nn) >= 0) best = Math.max(best, 85);
    const qw = wordsOf(q);
    const nw = wordsOf(nn);
    if (qw.length) best = Math.max(best, Math.round((qw.filter((w) => nw.indexOf(w) >= 0).length / qw.length) * 75));
  }
  return best;
}

async function jikanGet(path, params) {
  let url = JIKAN + path;
  if (params) {
    const parts = [];
    for (const k of Object.keys(params)) {
      if (params[k] == null || params[k] === "") continue;
      parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(String(params[k])));
    }
    if (parts.length) url += "?" + parts.join("&");
  }
  const r = await kino.fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    timeoutMs: 10000,
  });
  if (!r.ok) return null;
  try {
    return JSON.parse(r.text());
  } catch (e) {
    return null;
  }
}

async function malSearchAnime(title, year) {
  const sp = splitTitle(title);
  const q = (sp.base || title).replace(/[.,;:]+$/g, "").trim();
  if (q.length < 2) return null;
  const data = await jikanGet("/anime", { q: q, limit: 8, order_by: "popularity", sfw: "true" });
  const list = (data && data.data) || [];
  let best = null;
  let bestScore = 0;
  for (const a of list) {
    let sc = malTitleScore(a, q);
    if (year > 1900 && a.year) {
      const diff = Math.abs(a.year - year);
      if (diff === 0) sc += 12;
      else if (diff <= 1) sc += 6;
      else if (diff > 6) sc -= 25;
    }
    // Evitar cruzar franquicias JoJo: si el query tiene palabras fuertes, deben estar
    if (/\b(steel|ocean|diamond|stardust|phantom|golden|stone)\b/i.test(q)) {
      const names = norm([a.title, a.title_english].filter(Boolean).join(" "));
      const need = wordsOf(q).filter((w) => w.length >= 4 && !/^(jojo|kimyou|bouken|no|na)$/.test(w));
      if (need.length && !need.some((w) => names.indexOf(w) >= 0)) continue;
    }
    if (sc > bestScore) {
      bestScore = sc;
      best = a;
    }
  }
  if (!best || bestScore < 55) return null;
  return best;
}

async function malAnimeFull(id) {
  const data = await jikanGet("/anime/" + id + "/full");
  return data && data.data ? data.data : null;
}

async function malEpisodes(id, maxNum) {
  const out = {};
  let page = 1;
  while (page <= 8) {
    const data = await jikanGet("/anime/" + id + "/episodes", { page: page });
    const list = (data && data.data) || [];
    if (!list.length) break;
    for (const e of list) {
      const n = e.mal_id || e.episode;
      if (!n) continue;
      if (maxNum && n > maxNum + 5) continue;
      out[n] = {
        name: String(e.title || e.title_japanese || "").slice(0, 200),
        overview: String(e.synopsis || e.title_romanji || "").slice(0, 2000),
        still: "",
        air: e.aired && /^\d{4}-\d{2}-\d{2}/.test(e.aired) ? e.aired.slice(0, 10) : "",
        rt: 0,
      };
    }
    if (!(data && data.pagination && data.pagination.has_next_page)) break;
    page++;
    if (Object.keys(out).length >= (maxNum || 2000)) break;
  }
  return out;
}

function malToInfo(a) {
  if (!a) return null;
  const poster = (a.images && a.images.jpg && (a.images.jpg.large_image_url || a.images.jpg.image_url)) || "";
  const synopsis = String(a.synopsis || "")
    .replace(/\[Written by MAL Rewrite\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return {
    overview: synopsis.slice(0, 2000),
    poster: poster,
    backdrop: poster,
    year: a.year ? String(a.year) : String((a.aired && a.aired.from) || "").slice(0, 4),
    malId: a.mal_id,
    source: "mal",
  };
}

// kino.meta: TMDB + AniList de Kino (sin clave), útil cuando byTitle está disponible
async function metaByTitle(title, year) {
  if (typeof kino.meta !== "function") return null;
  const sp = splitTitle(title);
  const q = (sp.base || title).replace(/[.,;:]+$/g, "").trim();
  if (q.length < 2) return null;
  try {
    let m = null;
    if (kino.meta.byTitle === true) {
      const req = { type: "series", title: q };
      if (year > 1900) req.year = year;
      m = await kino.meta(req);
    }
    if (!m) return null;
    const extras = {};
    if (m.episodes && m.episodes.length) {
      for (const e of m.episodes) {
        const n = e.number;
        if (!n) continue;
        // Si el título marca Season 2, respetar season; si no, aplanar
        const key = sp.marked && e.season && e.season !== sp.season ? null : n;
        if (key == null) continue;
        if (sp.marked && e.season && e.season !== sp.season) continue;
        extras[n] = {
          name: String(e.title || "").slice(0, 200),
          overview: String(e.overview || "").slice(0, 2000),
          still: e.still || "",
          air: e.airDate || "",
          rt: 0,
        };
      }
    }
    return {
      overview: String(m.overview || "").slice(0, 2000),
      poster: m.poster || "",
      backdrop: m.backdrop || "",
      year: m.year ? String(m.year).slice(0, 4) : "",
      malId: m.ids && m.ids.mal,
      episodes: extras,
      source: "meta",
    };
  } catch (e) {
    kino.log("kino.meta: " + (e && e.message));
    return null;
  }
}

async function episodeExtras(slug, title, year, maxNum) {
  const key = "meta7:" + slug;
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
  }
  if (!Object.keys(extras).length) {
    try {
      const meta = await metaByTitle(title, year);
      if (meta && meta.episodes && Object.keys(meta.episodes).length) extras = meta.episodes;
    } catch (e) {
      kino.log("meta eps: " + (e && e.message));
    }
  }
  if (!Object.keys(extras).length) {
    try {
      const hit = await malSearchAnime(title, year);
      if (hit && hit.mal_id) {
        const eps = await malEpisodes(hit.mal_id, maxNum);
        if (Object.keys(eps).length) extras = eps;
      }
    } catch (e) {
      kino.log("mal: " + (e && e.message));
    }
  }
  try {
    const raw = JSON.stringify(extras);
    if (Object.keys(extras).length && raw.length < 60000) kino.storage.set(key, raw, { ttlMs: 6 * 3600000 });
  } catch (e) {
    /* no cabe */
  }
  return extras;
}


// ---------- Ficha del anime y lista de capítulos (MonosChinos) ----------

function parseAnimePage(html, slug) {
  const info = {};
  const h1 = kino.html.select(html, "h1")[0];
  if (h1 && h1.text.trim()) info.title = h1.text.replace(/\s+/g, " ").trim().slice(0, 200);
  if (!info.title) info.title = slug.replace(/-/g, " ");

  // Portada
  const og = kino.html.select(html, "meta[property=og:image]")[0];
  if (og && og.attrs.content) info.poster = abs(og.attrs.content);
  if (!info.poster) {
    const m = /data-src=["']([^"']*cdn\/img\/anime\/[^"']+)["']/i.exec(html);
    if (m) info.poster = abs(m[1]);
  }
  if (!info.poster) info.poster = posterFromSlug(slug, true);
  if (info.poster) info.poster = String(info.poster).replace(/\?t=[^&]+/, "");

  // Sinopsis (meta description suele ser SEO; limpiar)
  const ogd = kino.html.select(html, "meta[property=og:description]")[0] || kino.html.select(html, "meta[name=description]")[0];
  if (ogd && ogd.attrs.content) {
    let raw = ogd.attrs.content;
    let text = raw
      .replace(/^ver online[\s\S]*?MonosChinos2\s*/i, "")
      .replace(/ver online[^,]*,?/gi, "")
      .replace(/Mira[^,]*(?:Sub Español)?[^,]*,?/gi, "")
      .replace(/online gratis,?/gi, "")
      .replace(/en Sub Español[^,]*,?/gi, "")
      .replace(/y descarga en[^,]*,?/gi, "")
      .replace(/Monos\s*Chinos2?,?/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    const seo = /online gratis|ver online|monoschinos|sub español|descarga en/i.test(text);
    if (text.length >= 20 && !seo) info.overview = text.slice(0, 2000);
  }

  // Géneros
  const genres = [];
  const reG = /href=["'][^"']*genero[^"']*["'][^>]*>([^<]+)/gi;
  let g;
  while ((g = reG.exec(html))) {
    const name = g[1].replace(/\s+/g, " ").trim();
    if (name && name.length < 40 && genres.indexOf(name) < 0) genres.push(name);
  }
  if (genres.length) info.genres = genres.slice(0, 5);

  // Año
  const y = /\b(20[0-2]\d)\b/.exec(html);
  // No confiar en años del footer (2000); buscar cerca de "Año" o en aired
  const y2 = /Año[^0-9]{0,20}(20\d{2})/i.exec(html) || /year[^0-9]{0,10}(20\d{2})/i.exec(html);
  if (y2) info.year = y2[1];

  // Capítulos visibles en la ficha
  const nums = {};
  const re = new RegExp("/ver/(?:[^\"']*?/)?" + slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "-episodio-(\\d+)", "gi");
  let x;
  while ((x = re.exec(html))) {
    const n = parseInt(x[1], 10);
    if (n >= 0 && n < 99999) nums[n] = true;
  }
  // data-i / data-e para AJAX
  const di = /data-i=["'](\d+)["']/.exec(html);
  const de = /data-e=["'](\d+)["']/.exec(html);
  const epId = di ? di[1] : "";
  const epTotal = de ? parseInt(de[1], 10) : 0;
  if (epTotal > 0 && Object.keys(nums).length < epTotal) {
    // rellenar 1..epTotal si aún no hay lista
  }
  const numbers = Object.keys(nums)
    .map(Number)
    .sort((a, b) => a - b)
    .slice(0, 2000);
  return { numbers, info, epId, epTotal };
}

async function fetchEpisodeNumbers(slug, epId, epTotal) {
  if (!epId) return [];
  try {
    const body = "acc=episodes&i=" + encodeURIComponent(epId) + "&e=" + encodeURIComponent(String(epTotal || 1));
    const r = await kino.fetch(BASE + "/ajax_pagination", {
      method: "POST",
      headers: {
        "User-Agent": UA,
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest",
        Referer: BASE + "/anime/" + slug,
        Origin: BASE,
      },
      body: body,
      timeoutMs: 12000,
    });
    if (!r.ok) return [];
    const html = r.text || "";
    const nums = {};
    const re = /episodio-(\d+)/gi;
    let x;
    while ((x = re.exec(html))) {
      const n = parseInt(x[1], 10);
      if (n >= 0 && n < 99999) nums[n] = true;
    }
    // Si el AJAX no trae números pero conocemos el total, generar 1..N
    if (!Object.keys(nums).length && epTotal > 0) {
      for (let i = 1; i <= Math.min(epTotal, 2000); i++) nums[i] = true;
    }
    return Object.keys(nums)
      .map(Number)
      .sort((a, b) => a - b)
      .slice(0, 2000);
  } catch (e) {
    kino.log("fetchEpisodeNumbers: " + (e && e.message));
    return [];
  }
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

  const key = "ep6:" + slug; // ep3: lista completa vía AJAX (antes ep1 solo veía 1 capítulo)
  const saved = savedGet(key);
  let data = saved && saved.data && Date.now() - saved.t < 10 * 60000 ? saved.data : null;
  if (!data) {
    try {
      const page = await getPage(BASE + "/anime/" + slug, null, 14000);
      data = parseAnimePage(page.html, slug);
      // La ficha solo trae 0–2 enlaces; la lista completa va por AJAX (data-i / data-e).
      if (data.epId && (data.numbers.length < 2 || (data.epTotal && data.numbers.length < data.epTotal))) {
        const fromAjax = await fetchEpisodeNumbers(slug, data.epId, data.epTotal);
        if (fromAjax.length) data.numbers = fromAjax;
      }
      if (!data.numbers.length && data.epTotal > 0) {
        data.numbers = [];
        for (let i = 1; i <= Math.min(data.epTotal, 2000); i++) data.numbers.push(i);
      }
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
  const titleSeason = splitTitle(info.title || slugTitle);
  const list = numbers.map((n) => {
    const ep = {
      season: titleSeason.marked ? titleSeason.season : 1,
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
      if (extra.overview && ((info.overview || "").length < 100 || /online gratis|monoschinos|ver online/i.test(info.overview || ""))) info.overview = extra.overview;
      if (extra.poster && !info.poster) info.poster = extra.poster;
    }
    // Respaldo MAL/meta si aún falta sinopsis o fondo
    if ((!info.overview || (info.overview || "").length < 80 || /online gratis|monoschinos/i.test(info.overview || "")) || !info.backdrop) {
      try {
        let fill = null;
        if (typeof kino.meta === "function") fill = await metaByTitle(info.title || slugTitle, parseInt(info.year, 10) || 0);
        if (!fill || !fill.overview) {
          const a = await malSearchAnime(info.title || slugTitle, parseInt(info.year, 10) || 0);
          if (a) fill = malToInfo((await malAnimeFull(a.mal_id)) || a);
        }
        if (fill) {
          if (fill.overview && ((info.overview || "").length < 100 || /online gratis|monoschinos/i.test(info.overview || ""))) info.overview = fill.overview;
          if (fill.backdrop && !info.backdrop) info.backdrop = fill.backdrop;
          if (fill.poster && !info.poster) info.poster = fill.poster;
        }
      } catch (e2) {
        kino.log("mal fill: " + (e2 && e2.message));
      }
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
  netu: "Netu",
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
  if (/netu|hqq|waaw|netu\./i.test(n) || /hqq\.|waaw\.|netu\.|younetu\./i.test(u)) return "netu";
  return "generic";
}

function listServers(html) {
  const out = [];
  out.skipped = [];
  const seen = {};
  const add = (enc, name) => {
    if (!enc) return;
    let url = "";
    try {
      url = b64text(enc);
    } catch (e) {
      return;
    }
    url = unslash(url);
    if (!/^https?:\/\//i.test(url)) return;
    const kind = detectKind(name, url);
    if (kind === "mega") {
      out.skipped.push(name || "Mega");
      return;
    }
    const key = kind + "|" + url;
    if (seen[key]) return;
    seen[key] = true;
    out.push({ kind, url, name: name || kind });
  };

  const buttons = kino.html.select(html, "button.play-video, button[data-player], .nav-link[data-player], li button");
  for (const btn of buttons) {
    add(btn.attrs["data-player"] || "", (btn.text || "").trim().toLowerCase());
  }
  // Regex: el HTML del AJAX trae data-player en base64
  const re = /data-player=["']([^"']+)["'][^>]*>([^<]*)</gi;
  let m;
  while ((m = re.exec(html))) {
    add(m[1], String(m[2] || "").trim().toLowerCase());
  }
  // Alternativa: texto del botón antes del atributo
  const re2 = />([a-z0-9 ._-]{2,30})<\/button>/gi;
  // ya cubierto arriba

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

// Los botones de servidor no vienen en el HTML inicial: se piden por POST a /ajax_pagination
// con acc=opt e i=<data-encrypt del ul.opt>.
async function fetchServerHtml(pageHtml, pageUrl) {
  let encrypt = "";
  const m =
    /data-encrypt=["']([^"']+)["']/.exec(pageHtml) ||
    /class="[^"]*opt[^"]*"[^>]*data-encrypt=["']([^"']+)["']/.exec(pageHtml);
  if (m) encrypt = m[1];
  if (!encrypt) {
    const sel = kino.html.select(pageHtml, "[data-encrypt], ul.opt, .opt")[0];
    if (sel && sel.attrs && sel.attrs["data-encrypt"]) encrypt = sel.attrs["data-encrypt"];
  }
  if (!encrypt) return pageHtml;
  try {
    const r = await kino.fetch(BASE + "/ajax_pagination", {
      method: "POST",
      headers: {
        "User-Agent": UA,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Accept: "*/*",
        "X-Requested-With": "XMLHttpRequest",
        Referer: pageUrl || BASE + "/",
        Origin: BASE,
      },
      body: "acc=opt&i=" + encodeURIComponent(encrypt),
      timeoutMs: 12000,
    });
    if (r.ok && r.text()) return r.text() + "\n" + pageHtml;
  } catch (e) {
    kino.log("ajax_pagination: " + (e && e.message));
  }
  return pageHtml;
}

function serverLabel(s, all) {
  const base = KIND_LABEL[s.kind] || s.name || "Servidor";
  const same = all.filter((x) => x.kind === s.kind);
  return same.length > 1 ? base + " " + (same.indexOf(s) + 1) : base;
}

// --- Dean Edwards packer (eval(function(p,a,c,k,e,d)...)) usado por Filemoon, StreamWish, MixDrop, etc. ---

function jsUnpack(source) {
  // Dean Edwards / JWPlayer packer: eval(function(p,a,c,k,e,d){...}('payload',radix,count,'words'.split('|'),0,{}))
  const m = /}\s*\(\s*'((?:\\'|[^'])*)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:\\'|[^'])*)'\s*\.split\s*\(\s*'\|'\s*\)/.exec(source);
  if (!m) return null;
  let payload = m[1].replace(/\\'/g, "'").replace(/\\\\/g, "\\");
  const radix = parseInt(m[2], 10) || 36;
  const count = parseInt(m[3], 10);
  const words = m[4].split("|");
  if (!words.length || !count) return null;
  const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  function toBase(n) {
    if (n < radix) return chars.charAt(n);
    return toBase(Math.floor(n / radix)) + chars.charAt(n % radix);
  }
  for (let i = count - 1; i >= 0; i--) {
    if (i >= words.length || !words[i]) continue;
    const token = toBase(i);
    payload = payload.replace(new RegExp("\\b" + token + "\\b", "g"), words[i]);
  }
  return payload;
}

function unpackAll(html) {
  let text = String(html);
  let guard = 0;
  while (guard++ < 8) {
    const start = text.search(/eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,/);
    if (start < 0) break;
    // Coger un trozo generoso: el packer puede ser largo
    const chunk = text.slice(start, start + 200000);
    const unpacked = jsUnpack(chunk);
    if (!unpacked) {
      // Saltar este eval y seguir buscando otros
      text = text.slice(0, start) + " " + text.slice(start + 4);
      continue;
    }
    // Sustituir solo hasta el cierre aproximado del eval
    const endRel = chunk.search(/\)\s*\)\s*;?/);
    const end = endRel > 0 ? start + endRel + 2 : start + Math.min(chunk.length, 5000);
    text = text.slice(0, start) + "\n" + unpacked + "\n" + text.slice(end);
  }
  return text;
}

function findStreamUrl(html) {
  const flat = unslash(String(html));
  const patterns = [
    /wurl\s*=\s*["']([^"']+)["']/i,
    /(?:file|src|source)\s*[:=]\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i,
    /(?:file|src|source)\s*[:=]\s*["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i,
    /["'](https?:\/\/[^"'\s\\<>]+\.m3u8[^"'\s\\<>]*)["']/i,
    /["'](https?:\/\/[^"'\s\\<>]+\.mp4[^"'\s\\<>]*)["']/i,
    /(https?:\/\/[^"'\s\\<>]+\.m3u8[^"'\s\\<>]*)/i,
    /(https?:\/\/[^"'\s\\<>]+\.mp4[^"'\s\\<>]*)/i,
    // JWPlayer tras unpack: sources:[{file:"..."}] o src:"http..."
    /sources?\s*[:=]\s*\[\s*\{\s*(?:file|src)\s*:\s*["']([^"']+)["']/i,
    /["'](https?:\/\/[^"'\s\\<>]+\/hls2\/[^"'\s\\<>]+)["']/i,
    /["'](https?:\/\/[^"'\s\\<>]+\/v2\/[^"'\s\\<>]+\.mp4[^"'\s\\<>]*)["']/i,
  ];
  for (const re of patterns) {
    const m = re.exec(flat);
    const u = m && (m[1] || m[0]);
    if (!u) continue;
    let url = String(u).replace(/&amp;/g, "&").trim();
    if (url.indexOf("//") === 0) url = "https:" + url;
    if (/^https?:\/\//i.test(url) && !/\.(js|css|png|jpg|jpeg|gif|svg|woff)/i.test(url.split("?")[0])) return url;
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

const VOE_MIRRORS = [
  "voe.sx",
  "jilliandescribecompany.com",
  "donaldlineelse.com",
  "voe-unblock.com",
  "voeunblock.com",
];

async function voeStream(embed) {
  // Construir candidatos: URL original + mismos path en mirrors (Voe rota dominios y usa DDoS-Guard)
  const pathM = /\/e\/([A-Za-z0-9]+)/.exec(embed);
  const id = pathM ? pathM[1] : "";
  const candidates = [embed];
  if (id) {
    for (const host of VOE_MIRRORS) {
      const u = "https://" + host + "/e/" + id;
      if (candidates.indexOf(u) < 0) candidates.push(u);
    }
  }
  let lastErr = "Voe sin video";
  for (const start of candidates.slice(0, 4)) {
    let url = start;
    let html = "";
    try {
      for (let hop = 0; hop < 3; hop++) {
        const page = await getPage(url, { Referer: BASE + "/" });
        html = page.html;
        url = page.url;
        if (/ddos-guard|checking your browser|just a moment/i.test(html) && html.length < 5000) {
          lastErr = "Voe bloqueado (DDoS-Guard)";
          break;
        }
        const jm =
          /window\.location\.(?:href|replace)\s*=\s*["']([^"']+)["']/.exec(html) ||
          /window\.location\.replace\(\s*["']([^"']+)["']\s*\)/.exec(html);
        if (jm && /^https?:\/\//i.test(jm[1]) && jm[1] !== url) {
          url = jm[1];
          continue;
        }
        break;
      }
      const found = voeExtract(html);
      const main = found.hls || found.mp4;
      if (!main) {
        lastErr = goneIn(html) ? "Voe video borrado" : "Voe sin video en " + url;
        continue;
      }
      const headers = { Referer: originOf(url) + "/", "User-Agent": UA };
      const res = { url: main, headers, alts: [] };
      if (found.hls && found.mp4) res.alts.push({ url: found.mp4, headers, label: "Voe MP4" });
      return res;
    } catch (e) {
      lastErr = (e && e.message) || lastErr;
    }
  }
  throw fail("unavailable", lastErr, "serverFailed");
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
  for (let hop = 0; hop < 3; hop++) {
    const page = await getPage(url, { Referer: BASE + "/", Origin: originOf(url) || BASE });
    html = page.html;
    url = page.url;
    // SPA de Filemoon/Byse: no hay packer, solo un shell React → no se puede extraer sin navegador
    if (/Byse Frontend|id="root"|assets\/index-[A-Za-z0-9_-]+\.js/i.test(html) && !/eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k/i.test(html)) {
      throw fail("unavailable", label + " usa un reproductor protegido (SPA); prueba MixDrop, Mp4Upload o LuluStream", "serverFailed");
    }
    // Cloudflare / DDoS-Guard / challenge
    if (/just a moment|cf-browser-verification|ddos-guard|checking your browser|error code:\s*1005/i.test(html) && html.length < 20000) {
      throw fail("unavailable", label + " bloqueado por protección anti-bot", "serverFailed");
    }
    const ifr = /<iframe[^>]+src=["']([^"']+)["']/i.exec(html);
    if (ifr && /filemoon|moon|streamwish|lulu|vidhide|filelions|byse/i.test(ifr[1]) && ifr[1] !== url) {
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

// --- Netu / HQQ ---
async function netuStream(embed) {
  const page = await getPage(embed, { Referer: BASE + "/", Origin: originOf(embed) || "https://hqq.ac" });
  const html = page.html;
  if (/just a moment|cf-browser-verification|ddos-guard/i.test(html) && html.length < 15000) {
    throw fail("unavailable", "Netu bloqueado por protección anti-bot", "serverFailed");
  }
  let file = findStreamUrl(html);
  if (!file) {
    const unpacked = unpackAll(html);
    file = findStreamUrl(unpacked);
  }
  if (!file) {
    const m =
      /src\s*:\s*['"](https?:\/\/[^'"]+\.m3u8[^'"]*)['"]/i.exec(html) ||
      /file\s*:\s*['"](https?:\/\/[^'"]+\.m3u8[^'"]*)['"]/i.exec(html) ||
      /(https?:\/\/[^"'\\s<>]+\/secip\/[^"'\\s<>]+\.m3u8[^"'\\s<>]*)/i.exec(html);
    if (m) file = m[1] || m[0];
  }
  if (!file) throw fail("unavailable", goneIn(html) ? "Netu video borrado" : "Netu sin video", "serverFailed");
  if (file.indexOf("//") === 0) file = "https:" + file;
  // CDN de Netu exige Referer del embed; sin él el manifest responde 403 / falla fallida
  const headers = {
    Referer: originOf(page.url) + "/",
    Origin: originOf(page.url),
    "User-Agent": UA,
    Accept: "*/*",
  };
  return { url: file, headers: headers, alts: [], label: "Netu" };
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
    case "netu":
      return netuStream(s.url);
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
  // Los servidores se inyectan por AJAX (data-encrypt → POST /ajax_pagination).
  const serversHtml = await fetchServerHtml(page.html, page.url);
  const all = listServers(serversHtml);
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
    // Servidor concreto del menú: lo intentamos primero y, si falla, el resto como respaldo.
    const picked = all[p.idx];
    order = picked ? [picked].concat(all.filter((s, i) => i !== p.idx)) : all.slice();
  } else {
    const pref = String(kino.config.get("server") || "mixdrop");
    // Orden por fiabilidad real (fetch sin navegador): MixDrop/Mp4Upload/Uqload/Lulu suelen abrir;
    // Filemoon (SPA) y StreamWish (Cloudflare) fallan a menudo desde el plugin.
    const rank = (k) => {
      if (k === pref) return 0;
      const orderMap = {
        mixdrop: 1,
        mp4upload: 2,
        uqload: 3,
        lulu: 4,
        vidhide: 5,
        voe: 6,
        yourupload: 7,
        dood: 8,
        netu: 10,
        filemoon: 18,
        streamwish: 19,
        generic: 20,
      };
      return orderMap[k] != null ? orderMap[k] : 15;
    };
    order = all.slice().sort((a, b) => rank(a.kind) - rank(b.kind));
  }

  let main = null;
  let used = null;
  const rest = [];
  const failures = [];
  // Probar varios hosts: los protegidos fallan rápido; los buenos abren.
  const maxTries = Math.min(order.length, 8);
  for (let i = 0; i < order.length; i++) {
    const s = order[i];
    if (main) {
      rest.push(s);
      continue;
    }
    if (i >= maxTries) {
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
