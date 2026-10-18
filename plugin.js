// MonosChinos Kino plugin 3.5.0 - https://monoschinos.st
// Modelo TioAnime: filas con copia guardada, TMDB (caratulas, fondos, capitulos), servidores multiples.

const BASE = "https://monoschinos.st";
const UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";
const ID_OK = /^[A-Za-z0-9._~-]{1,128}$/;

const TXT = {
  notFound: { es: "No encontramos esto en el sitio.", en: "We could not find this on the site." },
  siteDown: { es: "El sitio no responde ahora. Intenta mas tarde.", en: "The site is not answering now. Try again later." },
  noServers: { es: "Este capitulo no tiene servidores reproducibles.", en: "This episode has no playable servers." },
  serverFailed: { es: "No se pudo abrir el video. Prueba otro en el menu Servidor.", en: "Could not open the video. Try another one in the Servidor menu." },
  badRef: { es: "Este titulo ya no es valido. Buscalo otra vez.", en: "This title is no longer valid. Search again." },
  noEpisodes: { es: "MonosChinos no pudo cargar los capitulos.", en: "MonosChinos could not load the episodes." },
  episode: { es: "Capitulo ", en: "Episode " },
};

function lang() {
  return String(kino.lang || "es").toLowerCase().indexOf("en") === 0 ? "en" : "es";
}
function t(key) {
  return TXT[key][lang()];
}
function fail(code, detail, key) {
  return kino.error(code, String(detail || "").slice(0, 200), { userMessage: t(key) });
}
function reasonOf(e) {
  const m = String((e && e.message) || "");
  if (/borrad|deleted|not found|removed|HTTP 404/i.test(m)) return "video borrado";
  const h = /HTTP (\d{3})/.exec(m);
  if (h) return "HTTP " + h[1];
  if (/timeout|tardo|took too long/i.test(m)) return "tardo demasiado";
  if (/sin video/i.test(m)) return "sin video";
  const c = /captura (\w+)/i.exec(m);
  if (c) return "navegador oculto: " + c[1];
  if (/SPA|protegido|bloqueado/i.test(m)) return m.slice(0, 80);
  if (/network|Unable to resolve/i.test(m)) return "sin conexion";
  return "fallo";
}

function bodyText(r) {
  if (!r) return "";
  try {
    if (typeof r.text === "function") return String(r.text() || "");
  } catch (e) {}
  if (typeof r.text === "string") return r.text;
  return "";
}

function b64bytes(s) {
  s = String(s || "").replace(/-/g, "+").replace(/_/g, "/").replace(/[^A-Za-z0-9+/=]/g, "");
  while (s.length % 4) s += "=";
  const tbl = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const out = [];
  for (let i = 0; i < s.length; i += 4) {
    const a = tbl.indexOf(s.charAt(i));
    const b = tbl.indexOf(s.charAt(i + 1));
    const c = tbl.indexOf(s.charAt(i + 2));
    const d = tbl.indexOf(s.charAt(i + 3));
    out.push((a << 2) | (b >> 4));
    if (c >= 0) out.push(((b & 15) << 4) | (c >> 2));
    if (d >= 0) out.push(((c & 3) << 6) | d);
  }
  return out;
}
function utf8(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; ) {
    const c = bytes[i++];
    if (c < 128) s += String.fromCharCode(c);
    else if (c < 224) s += String.fromCharCode(((c & 31) << 6) | (bytes[i++] & 63));
    else if (c < 240) s += String.fromCharCode(((c & 15) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63));
    else {
      const cp = ((c & 7) << 18) | ((bytes[i++] & 63) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63);
      const v = cp - 0x10000;
      s += String.fromCharCode(0xd800 + (v >> 10), 0xdc00 + (v & 1023));
    }
  }
  return s;
}
function b64text(s) {
  try { return utf8(b64bytes(s)); } catch (e) { return ""; }
}
function unslash(s) {
  return String(s).replace(/\\(.)/g, "$1");
}
function abs(u) {
  u = String(u || "").trim();
  if (!u) return "";
  if (u.indexOf("//") === 0) return "https:" + u;
  if (/^https?:\/\//i.test(u)) return u;
  if (u.charAt(0) === "/") return BASE + u;
  return BASE + "/" + u.replace(/^\.\//, "");
}
function originOf(u) {
  const m = /^(https?:\/\/[^/?#]+)/i.exec(String(u || ""));
  return m ? m[1] : BASE;
}
function decodeHtml(s) {
  return String(s || "")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'").replace(/&#x27;/gi, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, function (_m, n) { return String.fromCharCode(parseInt(n, 10)); })
    .replace(/&nbsp;/g, " ");
}

// Normaliza imagenes del sitio a JPEG del CDN (thumbs/*.jpg.webp -> img/serie/*/*.jpg)
function cleanImg(u) {
  u = abs(u);
  if (!u || /anime\.png|capblank|placeholder/i.test(u)) return "";
  u = u.replace(/[?#].*$/, "");
  // /assets/thumbs/imagen/NAME.jpg.webp  OR  NAME.webp  OR  NAME.jpg
  let m = /\/assets\/thumbs\/imagen\/([^/]+)$/i.exec(u);
  if (m) {
    let name = m[1].replace(/\.(webp|jpg|jpeg|png)$/i, "");
    name = name.replace(/\.(webp|jpg|jpeg|png)$/i, "");
    return BASE + "/assets/img/serie/imagen/" + name + ".jpg";
  }
  m = /\/assets\/thumbs\/portada\/([^/]+)$/i.exec(u);
  if (m) {
    let name = m[1].replace(/\.(webp|jpg|jpeg|png)$/i, "");
    name = name.replace(/\.(webp|jpg|jpeg|png)$/i, "");
    return BASE + "/assets/img/serie/portada/" + name + ".jpg";
  }
  // Ya es /assets/img/serie/... : quitar .webp si viniera
  u = u.replace(/\.jpg\.webp$/i, ".jpg").replace(/\.webp$/i, ".jpg");
  return u;
}

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
      if (attempt === 1 || (e && e.code === "timeout")) {
        throw fail("unavailable", (e && e.code === "timeout" ? "tiempo agotado " : "red ") + ((e && e.message) || e), "siteDown");
      }
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
  return { html: bodyText(r), url: r.url || url };
}


// ---------- Caché, tiempos y concurrencia ----------

function cacheGet(key) {
  try {
    return kino.storage.get(key);
  } catch (e) {
    return null;
  }
}
function cacheSet(key, value, ttlMs) {
  try {
    kino.storage.set(key, value, { ttlMs: ttlMs });
  } catch (e) {}
}

// Kino corta cualquier llamada a los 20 s y entonces la lista queda vacia: todo lo opcional (TMDB, filas
// lentas) espera a lo sumo unos segundos y, si no llega, sale en la proxima carga desde la cache.
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
  promise.catch(function () {});
  return Promise.race([promise, nap(ms).then(function () { return LATE; })]);
}

async function mapLimit(list, limit, fn) {
  const out = new Array(list.length);
  let next = 0;
  const worker = async function () {
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

// ---------- TMDB: caratulas, fondos, resumenes e imagenes de capitulos ----------
// El CDN del sitio da 403 al cargador de imagenes de Kino y la carga de AniList/Kitsu era lenta, asi que las
// caratulas, los fondos y las imagenes de los capitulos salen de TMDB (kino.tmdb: Kino pone la llave).
// La imagen propia del sitio queda solo como respaldo cuando TMDB no tiene una coincidencia segura.

const TMDB_POSTER = "https://image.tmdb.org/t/p/w342";
const TMDB_BACK = "https://image.tmdb.org/t/p/w780";
const TMDB_STILL = "https://image.tmdb.org/t/p/w300";

function norm(s) {
  let x = String(s || "").toLowerCase();
  if (x.normalize) x = x.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return x.replace(/[^a-z0-9]+/g, " ").trim();
}
function wordsOf(s) {
  return norm(s).split(" ").filter(function (w) { return w.length >= 3; });
}
function looseScore(r, base) {
  const q = wordsOf(base);
  if (!q.length) return 0;
  const names = wordsOf((r.name || r.title || "") + " " + (r.original_name || r.original_title || ""));
  return q.filter(function (w) { return names.indexOf(w) >= 0; }).length / q.length;
}
function looseMatch(r, base) {
  return looseScore(r, base) >= 0.6;
}

// "... Temporada 2", "... S3", "... 2nd Season", "... II" o un numero final = temporada del sitio.
function splitTitle(title) {
  let season = 1;
  let base = String(title || "");
  let marked = false;
  let m =
    /\b(\d+)(?:st|nd|rd|th)\s+season\b/i.exec(base) ||
    /\bseason\s+(\d+)\b/i.exec(base) ||
    /\btemporada\s+(\d+)\b/i.exec(base) ||
    /\bS(\d{1,2})\s*$/.exec(base);
  if (m) {
    season = parseInt(m[1], 10);
    base = base.replace(m[0], " ");
    marked = true;
  } else {
    m = /\s(II|III|IV|V|VI)\s*$/.exec(base);
    if (m) {
      season = { II: 2, III: 3, IV: 4, V: 5, VI: 6 }[m[1]];
      base = base.replace(/\s(II|III|IV|V|VI)\s*$/, "");
      marked = true;
    } else {
      m = /^(.*\D)\s(\d{1,2})$/.exec(base.trim());
      if (m && m[1].trim().length >= 2) {
        season = parseInt(m[2], 10);
        base = m[1];
        marked = true;
      }
    }
  }
  base = base.replace(/\(\d{4}\)/g, " ").replace(/\s+/g, " ").replace(/[:\-]\s*$/, "").trim();
  return { base: base, season: season, marked: marked };
}

// Serie de TMDB que corresponde al titulo del sitio. Solo series japonesas (de animacion si las hay).
// Con año conocido manda el año (sin marcar: hasta 4 años antes; temporada marcada: solo anterior o igual);
// sin año se exige que el nombre comparta la mayoria de las palabras del titulo.
function pickShow(results, year, season, marked, base) {
  const list = (results || []).filter(function (r) { return r && r.id && r.original_language === "ja"; });
  const anim = list.filter(function (r) { return (r.genre_ids || []).indexOf(16) >= 0; });
  const pool = anim.length ? anim : list;
  for (let i = 0; i < pool.length; i++) {
    const r = pool[i];
    const y = parseInt(String(r.first_air_date || "").slice(0, 4), 10);
    if (!year || !y) {
      if (!base || looseMatch(r, base)) return r;
      continue;
    }
    const diff = year - y;
    if (marked && season > 1 ? diff >= 0 : diff >= -1 && diff <= 4) return r;
  }
  return null;
}

function infoOf(hit, isMovie) {
  const date = String((isMovie ? hit.release_date : hit.first_air_date) || "");
  return {
    p: hit.poster_path ? TMDB_POSTER + hit.poster_path : "",
    b: hit.backdrop_path ? TMDB_BACK + hit.backdrop_path : "",
    o: String(hit.overview || "").slice(0, 700),
    y: /^\d{4}/.test(date) ? date.slice(0, 4) : "",
  };
}

async function seriesInfo(title, year) {
  if (typeof kino.tmdb !== "function") return null;
  const sp = splitTitle(title);
  const q = sp.base.length >= 2 ? sp.base : title;
  const r = await kino.tmdb("/search/tv", { query: q, language: "es-MX", include_adult: false });
  let hit = pickShow((r && r.results) || [], year, sp.season, sp.marked, q);
  // Un "S6" o "Temporada 2" puede ser una serie propia en TMDB: se prueba tambien con el titulo completo.
  if (!hit && sp.marked) {
    const r2 = await kino.tmdb("/search/tv", { query: String(title).trim(), language: "es-MX", include_adult: false });
    hit = pickShow((r2 && r2.results) || [], year, 1, false, String(title).trim());
  }
  return hit ? infoOf(hit, false) : null;
}

async function movieInfo(title, year) {
  if (typeof kino.tmdb !== "function") return null;
  const plain = String(title).replace(/\bmovie\s*\d*\s*:?\s*/i, " ").replace(/\s+/g, " ").trim();
  const tries = plain && plain !== title ? [title, plain] : [title];
  for (let i = 0; i < tries.length; i++) {
    const r = await kino.tmdb("/search/movie", { query: tries[i], language: "es-MX", include_adult: false });
    const list = ((r && r.results) || []).filter(function (x) {
      return x && x.id && x.original_language === "ja" && (x.genre_ids || []).indexOf(16) >= 0;
    });
    for (let j = 0; j < list.length; j++) {
      const y = parseInt(String(list[j].release_date || "").slice(0, 4), 10);
      if (year && y && Math.abs(year - y) > 1) continue;
      return infoOf(list[j], true);
    }
  }
  return null;
}

// Con cache (14 dias; 1 dia si no hubo coincidencia). Lanza ante un fallo de TMDB para no guardar un "no hay" falso.
async function tmdbInfoFor(item) {
  const key = "tm2:" + item.id;
  const hit = cacheGet(key);
  if (hit) return hit === "0" ? null : JSON.parse(hit);
  const year = parseInt(item.year, 10) || 0;
  const info = item.kind === "movie" ? await movieInfo(item.title, year) : await seriesInfo(item.title, year);
  cacheSet(key, info ? JSON.stringify(info) : "0", (info ? 14 : 1) * 86400000);
  return info;
}

// TMDB es la fuente principal: sus imagenes siempre mandan y reemplazan a las de AniList si llegan despues.
function applyInfo(item, info) {
  if (!info) return false;
  let changed = false;
  if (info.p) {
    item.poster = info.p;
    item._tmp = true;
    changed = true;
  }
  if (info.b) {
    item.backdrop = info.b;
    item._tmb = true;
    changed = true;
  }
  if (info.o && !item.overview) item.overview = info.o;
  if (info.y && !item.year) item.year = info.y;
  return changed;
}

// ---------- AniList: fuente secundaria de caratulas, fondos (banner) y resumenes ----------
// Una sola peticion trae varios titulos (rapido): cubre lo que TMDB aun no entrego o no tiene. En cuanto hay
// datos de TMDB, esos mandan.

const ANILIST = "https://graphql.anilist.co";

function stripHtml(s) {
  return decodeHtml(String(s || "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function anilistInfo(m, y) {
  return {
    p: (m.coverImage && (m.coverImage.large || m.coverImage.extraLarge)) || "",
    b: m.bannerImage || "",
    o: stripHtml(m.description).slice(0, 700),
    y: y ? String(y) : "",
  };
}

function anilistPick(list, title, year) {
  const sp = splitTitle(title);
  const q = sp.base.length >= 2 ? sp.base : title;
  const cands = [];
  for (let i = 0; i < (list || []).length; i++) {
    const m = list[i];
    if (!m || !m.coverImage || !(m.coverImage.extraLarge || m.coverImage.large)) continue;
    const t = m.title || {};
    const score = looseScore({ name: [t.romaji, t.english, t.native].filter(Boolean).join(" ") }, q);
    const y = m.seasonYear || (m.startDate && m.startDate.year) || 0;
    cands.push({ m: m, y: y, score: score });
  }
  // 1) Coincidencia segura: temporada marcada -> parecido del nombre; con año -> año (±1); sin año -> parecido.
  for (let i = 0; i < cands.length; i++) {
    const c = cands[i];
    let ok;
    if (sp.marked && sp.season > 1) ok = c.score >= 0.6;
    else if (year && c.y) ok = Math.abs(year - c.y) <= 1 || c.score >= 0.8;
    else ok = c.score >= 0.6;
    if (ok) return anilistInfo(c.m, c.y);
  }
  // 2) Sin año del sitio, AniList ya ordena por relevancia: se acepta el primero si el nombre se parece algo.
  if (!year && cands.length && cands[0].score >= 0.34) return anilistInfo(cands[0].m, cands[0].y);
  return null;
}

function applyAl(item, info) {
  if (!info) return false;
  let changed = false;
  if (info.p && !item._tmp) {
    item.poster = info.p;
    item._alp = true;
    changed = true;
  }
  if (info.b && !item._tmb) {
    item.backdrop = info.b;
    item._alb = true;
    changed = true;
  }
  if (info.o && !item.overview) item.overview = info.o;
  if (info.y && !item.year) item.year = info.y;
  return changed;
}

// Busca varios titulos en una sola peticion; guarda cada resultado (14 dias; 1 dia si no hubo) y lo aplica.
// Lanza ante un fallo de red o de AniList para no guardar un "no hay" falso.
async function anilistBatch(items) {
  if (!items.length) return false;
  const fields = "title{romaji english native}coverImage{large extraLarge}bannerImage seasonYear startDate{year}description(asHtml:false)";
  const parts = items.map(function (it, i) {
    const sp = splitTitle(it.title);
    const q = (sp.base.length >= 2 ? sp.base : it.title).slice(0, 90);
    return "a" + i + ":Page(page:1,perPage:3){media(search:" + JSON.stringify(q) + ",type:ANIME){" + fields + "}}";
  });
  const r = await kino.fetch(ANILIST, {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query: "query{" + parts.join(" ") + "}" }),
    timeoutMs: 9000,
  });
  if (!r || !r.ok) throw new Error("AniList HTTP " + (r ? r.status : 0));
  const data = (JSON.parse(bodyText(r)) || {}).data || {};
  let touched = false;
  items.forEach(function (it, i) {
    const list = ((data["a" + i] || {}).media) || [];
    const info = anilistPick(list, it.title, parseInt(it.year, 10) || 0);
    cacheSet("al2:" + it.id, info ? JSON.stringify(info) : "0", (info ? 14 : 1) * 86400000);
    if (applyAl(it, info)) touched = true;
  });
  return touched;
}

// Pone caratula, fondo y resumen a los titulos de la lista (TMDB principal, AniList secundario):
//  - Lo guardado se aplica siempre y al instante: primero TMDB y, solo donde TMDB no tiene datos, AniList.
//  - Lo que falte se busca en paralelo y dentro del tiempo `budgetMs`: TMDB (hasta `cap` busquedas por llamada,
//    porque limita a unas 20 cada 10 s por plugin, en el orden recibido) y AniList (rapido: 8 titulos por peticion,
//    4 peticiones a la vez) solo para los que TMDB todavia no resolvio, de modo que nadie se queda sin imagen
//    mientras TMDB se completa. Los datos de TMDB reemplazan a los de AniList cuando llegan.
// El orden recibido importa: quien llama intercala las filas para que lo primero que se ve se busque primero.
// Devuelve true si cambio algo.
async function enrichItems(items, cap, budgetMs) {
  let touched = false;
  const tmTodo = [];
  const alTodo = [];
  const queued = {};
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const tm = cacheGet("tm2:" + it.id);
    const al = cacheGet("al2:" + it.id);
    if (tm && tm !== "0" && applyInfo(it, JSON.parse(tm))) touched = true;
    if (al && al !== "0" && applyAl(it, JSON.parse(al))) touched = true;
    if (!tm && cap > 0 && !queued["t" + it.id] && tmTodo.length < cap) {
      queued["t" + it.id] = true;
      tmTodo.push(it);
    }
    if (!al && !(tm && tm !== "0") && !queued["a" + it.id] && alTodo.length < 96) {
      queued["a" + it.id] = true;
      alTodo.push(it);
    }
  }
  if ((tmTodo.length || alTodo.length) && budgetMs > 600) {
    const chunks = [];
    for (let i = 0; i < alTodo.length; i += 8) chunks.push(alTodo.slice(i, i + 8));
    const jobs = [
      mapLimit(chunks, 4, async function (chunk) {
        try {
          if (await anilistBatch(chunk)) touched = true;
        } catch (e) {
          kino.log("anilist: " + ((e && e.message) || e));
        }
      }),
    ];
    if (typeof kino.tmdb === "function") {
      jobs.push(
        mapLimit(tmTodo, 4, async function (it) {
          try {
            if (applyInfo(it, await tmdbInfoFor(it))) touched = true;
          } catch (e) {
            kino.log("tmdb: " + ((e && e.message) || e));
          }
        })
      );
    }
    await within(Promise.all(jobs), budgetMs);
  }
  return touched;
}

// ---------- Capitulos con TMDB ----------

async function tmdbSeason(id, season, language) {
  const d = await kino.tmdb("/tv/" + id + "/season/" + season, { language: language });
  return (d && d.episodes) || [];
}

// Un intento: serie por titulo, temporada dada -> { numero: {name, overview, still, air, rt} }
async function tmdbTry(base, year, season, marked, maxNum) {
  if (base.length < 2) return {};
  const found = await kino.tmdb("/search/tv", { query: base, language: "es-MX", include_adult: false });
  const show = pickShow(found && found.results, year, season, marked, base);
  if (!show) return {};
  const eps = await tmdbSeason(show.id, season, "es-MX");
  const byNum = {};
  if (!marked && maxNum > eps.length) {
    // Numeracion absoluta (capitulo 527 de una serie sin temporadas en el sitio).
    const detail = await kino.tmdb("/tv/" + show.id, { language: "es-MX" });
    const seasons = ((detail && detail.seasons) || []).filter(function (x) { return x.season_number > 0; }).slice(0, 12);
    let offset = 0;
    for (let i = 0; i < seasons.length; i++) {
      const se = seasons[i];
      const list = se.season_number === season ? eps : await tmdbSeason(show.id, se.season_number, "es-MX");
      for (let j = 0; j < list.length; j++) byNum[offset + list[j].episode_number] = list[j];
      offset += list.length;
    }
  } else {
    for (let i = 0; i < eps.length; i++) byNum[eps[i].episode_number] = eps[i];
    const empty = eps.filter(function (e) { return !e.overview; }).length;
    if (eps.length && empty > eps.length / 2) {
      try {
        const en = await tmdbSeason(show.id, season, "en-US");
        for (let i = 0; i < en.length; i++) {
          const e = en[i];
          if (byNum[e.episode_number] && !byNum[e.episode_number].overview) byNum[e.episode_number].overview = e.overview;
        }
      } catch (err) {}
    }
  }
  const out = {};
  Object.keys(byNum).forEach(function (k) {
    const e = byNum[k];
    out[k] = {
      name: String(e.name || "").slice(0, 200),
      overview: String(e.overview || "").slice(0, 2000),
      still: e.still_path ? TMDB_STILL + e.still_path : "",
      air: /^\d{4}-\d{2}-\d{2}$/.test(e.air_date || "") ? e.air_date : "",
      rt: e.runtime > 0 && e.runtime <= 1000 ? e.runtime : 0,
    };
  });
  return out;
}

async function tmdbEpisodes(title, year, maxNum) {
  const sp = splitTitle(title);
  const tries = [{ base: sp.base, season: sp.season, marked: sp.marked }];
  // Si el sufijo ("S6", "Temporada 2") era parte del nombre y no una temporada, se busca el titulo completo.
  if (sp.marked) tries.push({ base: String(title).trim(), season: 1, marked: false });
  for (let i = 0; i < tries.length; i++) {
    try {
      const out = await tmdbTry(tries[i].base, year, tries[i].season, tries[i].marked, maxNum);
      if (Object.keys(out).length) return out;
    } catch (e) {
      if (e && e.code === "rate_limited") throw e;
    }
  }
  return {};
}

async function episodeExtras(slug, title, year, maxNum) {
  if (typeof kino.tmdb !== "function") return {};
  const key = "tmdb3:" + slug;
  const hit = cacheGet(key);
  if (hit) {
    try {
      return JSON.parse(hit);
    } catch (e) {}
  }
  let extras = {};
  try {
    extras = await tmdbEpisodes(title, year, maxNum);
  } catch (e) {
    kino.log("tmdb capitulos: " + ((e && e.message) || e));
    return {};
  }
  const raw = JSON.stringify(extras);
  if (Object.keys(extras).length && raw.length < 60000) cacheSet(key, raw, 6 * 3600000);
  return extras;
}

// ---------- Tarjetas del sitio ----------

const TYPE_RE = />\s*(Anime|Ova|OVA|Pel[ií]cula(?: 1080p)?|Especial|Corto|Ona|ONA|Donghua|Sin Censura|PREESTRENO|Audio Japon[eé]s)\s*</i;

function baseSlug(slug) {
  return String(slug).replace(/-sub-espanol$/i, "");
}

function mkItem(slug, title, poster, movie, year) {
  if (!slug || !ID_OK.test(slug)) return null;
  const clean = String(title || baseSlug(slug).replace(/-/g, " ")).slice(0, 200);
  const item = {
    id: slug,
    kind: movie ? "movie" : "series",
    title: clean,
    // Una pelicula se reproduce de una vez: su ref va directo a resolve (capitulo 1 del sitio).
    ref: movie ? "e:" + baseSlug(slug) + ":1" : "a:" + slug,
  };
  if (poster) item.poster = poster;
  if (year) item.year = String(year);
  return item;
}

// Tarjetas <article> de /animes, /emision, busquedas y "Series recientes". Detecta tipo (Pelicula) y año.
// opts.movies: la pagina es un listado de peliculas verificado.
function cardsFrom(html, opts) {
  opts = opts || {};
  const items = [];
  const seen = {};
  const re = /<article[\s\S]*?<\/article>/gi;
  let m;
  while ((m = re.exec(String(html || "")))) {
    const box = m[0];
    const hm = /href=["']([^"']*\/anime\/([^"'/?#]+))["']/i.exec(box);
    if (!hm) continue;
    const slug = hm[2];
    if (!slug || seen[slug]) continue;
    seen[slug] = true;

    let title = "";
    const al = /alt=(?:"([^"]+)"|'([^']+)')/i.exec(box);
    if (al) title = decodeHtml(al[1] || al[2]).replace(/\s+/g, " ").trim();
    if (!title || /\.\.\.$/.test(title)) {
      const h3 = /<h3[^>]*>([^<]{2,220})/i.exec(box);
      if (h3) {
        const t = decodeHtml(h3[1]).replace(/\s+/g, " ").trim();
        if (t && !/\.\.\.$/.test(t)) title = t;
        else if (!title) title = t.replace(/\.\.\.$/, "").trim();
      }
    }
    // Solo un titulo leido de la tarjeta (alt o h3, sin "...") se recuerda como titulo real del anime.
    const realTitle = !!title && title.length >= 2 && !/\.\.\.$/.test(title);
    if (!title || title.length < 2) {
      title = baseSlug(slug).replace(/-/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    }
    title = title.replace(/\s*\.\.\.\s*$/, "").trim();
    if (realTitle) cacheSet("tt:" + slug, title, 30 * 86400000);

    let src = "";
    const ds = /data-src=["']([^"']+)["']/i.exec(box);
    if (ds) src = ds[1];
    if (!src || /anime\.png/i.test(src)) {
      const ss = /src=["']([^"']*assets[^"']+)["']/i.exec(box);
      if (ss) src = ss[1];
    }
    let poster = cleanImg(src);
    if (poster) cacheSet("pm:" + slug, poster, 14 * 86400000);
    else poster = cacheGet("pm:" + slug) || "";

    const tm = TYPE_RE.exec(box);
    const ym = />\s*((?:19|20)\d{2})\s*</.exec(box);
    const movie = !!opts.movies || !!(tm && /^pel/i.test(tm[1]));
    const item = mkItem(slug, title, poster, movie, ym ? ym[1] : "");
    if (item) {
      if (tm) item.type = tm[1].toLowerCase();
      if (ym) cacheSet("yr1:" + slug, ym[1], 30 * 86400000);
      items.push(item);
    }
  }
  return items;
}

// Quita campos internos antes de devolver a Kino.
function publicItems(items) {
  return items.map(function (it) {
    const c = Object.assign({}, it);
    delete c.type;
    delete c._alp;
    delete c._alb;
    delete c._tmp;
    delete c._tmb;
    return c;
  });
}

// Titulo de un capitulo de la portada: se elige, entre los alt/title/encabezados cercanos al enlace, el que mas se
// parece al slug (asi no se confunde con el boton "Ver ahora" ni con la tarjeta vecina). Si ninguno se parece,
// se arma desde el slug.
function humanizeSlug(slug) {
  const small = { no: 1, wa: 1, to: 1, ga: 1, de: 1, ni: 1, wo: 1, o: 1, mo: 1, na: 1, ka: 1, the: 1, of: 1 };
  return String(slug)
    .split("-")
    .filter(Boolean)
    .map(function (w, i) {
      return i > 0 && small[w] ? w : w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

function bestTitle(win, slug) {
  const sw = norm(String(slug).replace(/-/g, " ")).split(" ").filter(Boolean);
  const raws = [];
  let m;
  const reA = /(?:alt|title)=(?:"([^"]{3,160})"|'([^']{3,160})')/gi;
  while ((m = reA.exec(win))) raws.push(m[1] || m[2]);
  const reH = /<h[1-6][^>]*>\s*([^<]{3,160})</gi;
  while ((m = reH.exec(win))) raws.push(m[1]);
  const reT = /<a\b[^>]*>\s*([^<]{3,160})</gi;
  while ((m = reT.exec(win))) raws.push(m[1]);
  let best = "";
  let bestScore = 0;
  for (let i = 0; i < raws.length; i++) {
    let c = decodeHtml(raws[i]).replace(/\s+/g, " ").trim();
    c = c.replace(/^Ver\s+(?:Anime\s+)?/i, "").split(/\s+cap[ií]tulo\s+\d+/i)[0].replace(/\s+online\b.*$/i, "").trim();
    if (!c || c.length < 2) continue;
    if (/^(ver|ahora|ver ahora|episodio|cap[ií]tulo|banner|poster|imagen|logo|sub espa[nñ]ol|anime)$/i.test(c)) continue;
    const words = norm(c).split(" ");
    const hit = sw.filter(function (w) { return words.indexOf(w) >= 0; }).length;
    const score = sw.length ? hit / sw.length : 0;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return bestScore >= 0.5 ? best : humanizeSlug(slug);
}

// "Ultimos capitulos" de la portada -> animes (sin repetir), con el orden del sitio.
function latestCards(html) {
  const src = String(html || "");
  const a = src.search(/ltimos\s+cap[ií]tulos/i);
  const b = src.search(/Series\s+recientes/i);
  const slice = a >= 0 ? src.slice(a, b > a ? b : a + 80000) : src;
  const items = [];
  const seen = {};
  const re = /\/ver\/([A-Za-z0-9._~-]+?)-episodio-(\d+)/g;
  let m;
  while ((m = re.exec(slice))) {
    const epSlug = m[1];
    if (!epSlug || seen[epSlug]) continue;
    seen[epSlug] = true;
    const animeSlug = epSlug + "-sub-espanol";
    // Titulo real recordado de otra lista (/emision, /animes, busquedas); si no hay, el mejor del HTML o el del slug.
    const title = cacheGet("tt:" + animeSlug) || bestTitle(slice.slice(Math.max(0, m.index - 800), m.index + 1000), epSlug);
    const poster = cacheGet("pm:" + animeSlug) || "";
    const year = cacheGet("yr1:" + animeSlug) || "";
    const item = mkItem(animeSlug, title, poster, false, year);
    if (item) items.push(item);
  }
  return items;
}

function hasNextPage(html, page) {
  return new RegExp("[?&;]p=" + (page + 1) + "(?![0-9])").test(String(html || ""));
}

// ---------- Peliculas: el filtro de tipo del catalogo ----------
// La URL del filtro de "Pelicula" no es fija (el catalogo se filtra con botones), asi que se descubre en la
// pagina /animes y se comprueba que de verdad devuelva peliculas (tipo "Pelicula" en las tarjetas).

function moviesFilterCandidates(html) {
  const src = unslash(String(html || ""));
  const out = [];
  const add = function (param, value) {
    const u = BASE + "/animes?" + param + "=" + value;
    if (out.indexOf(u) < 0) out.push(u);
  };
  let m = /[?&;]([A-Za-z_]{2,14})=(pel[ií]cula(?:%20\d+p)?)/i.exec(src);
  if (m) add(m[1], m[2].toLowerCase());
  m = /name=["']([A-Za-z_]{2,14})["'][^>]*value=["'](pel[ií]cula)["']/i.exec(src) || /value=["'](pel[ií]cula)["'][^>]*name=["']([A-Za-z_]{2,14})["']/i.exec(src);
  if (m) /^pel/i.test(m[1]) ? add(m[2], m[1].toLowerCase()) : add(m[1], m[2].toLowerCase());
  m = /<select[^>]*name=["']([A-Za-z_]{2,14})["'][\s\S]{0,4000}?<option[^>]*value=["'](pel[ií]cula)["']/i.exec(src);
  if (m) add(m[1], m[2].toLowerCase());
  m = /data-([a-z]{2,14})=["'](pel[ií]cula)["']/i.exec(src);
  if (m) add(m[1], m[2].toLowerCase());
  ["tipo", "categoria", "type", "tipos"].forEach(function (p) { add(p, "pelicula"); });
  return out;
}

function looksLikeMovies(items) {
  if (items.length < 3) return false;
  const movies = items.filter(function (it) { return it.type && /^pel/i.test(it.type); }).length;
  return movies / items.length >= 0.6;
}

// URL del listado de peliculas (guardada 30 dias) o "" si no se encontro.
async function moviesUrl() {
  const saved = cacheGet("mv1:url");
  if (saved) return saved === "0" ? "" : saved;
  let cands = [];
  try {
    const page = await getPage(BASE + "/animes", null, 9000);
    cands = moviesFilterCandidates(page.html);
  } catch (e) {
    cands = moviesFilterCandidates("");
  }
  for (let i = 0; i < cands.length && i < 6; i++) {
    try {
      const page = await getPage(cands[i], null, 9000);
      const items = cardsFrom(page.html);
      kino.log("peliculas? " + cands[i] + " -> " + items.length + " tarjetas, " + (looksLikeMovies(items) ? "SI" : "no"));
      if (looksLikeMovies(items)) {
        cacheSet("mv1:url", cands[i], 30 * 86400000);
        return cands[i];
      }
    } catch (e) {
      kino.log("peliculas " + cands[i] + ": " + ((e && e.message) || e));
    }
  }
  cacheSet("mv1:url", "0", 6 * 3600000);
  return "";
}

// Respaldo si no hay filtro: busquedas con "movie" / "pelicula", quedandose con las de tipo Pelicula.
async function moviesFromSearch() {
  const out = [];
  const seen = {};
  const qs = ["movie", "pelicula", "the movie"];
  const pages = await mapLimit(qs, 3, async function (q) {
    return getPage(BASE + "/buscar?q=" + encodeURIComponent(q), null, 9000);
  });
  for (let i = 0; i < pages.length; i++) {
    if (!pages[i]) continue;
    const items = cardsFrom(pages[i].html);
    for (let j = 0; j < items.length; j++) {
      const it = items[j];
      if (it.type && /^pel/i.test(it.type) && !seen[it.id]) {
        seen[it.id] = true;
        out.push(it);
      }
    }
  }
  return out;
}

async function loadMovies(pageNum) {
  const url = await moviesUrl();
  if (url) {
    const full = pageNum > 1 ? url + "&p=" + pageNum : url;
    const page = await getPage(full);
    const items = cardsFrom(page.html, { movies: true });
    return { items: items, next: items.length && hasNextPage(page.html, pageNum) ? String(pageNum + 1) : null };
  }
  if (pageNum > 1) return { items: [], next: null };
  return { items: await moviesFromSearch(), next: null };
}

// ---------- Busqueda, inicio y ver mas ----------

export async function search(query) {
  const q = String((query && query.q) || "").replace(/\s+/g, " ").trim().slice(0, 100);
  if (q.length < 2) return [];
  try {
    const page = await getPage(BASE + "/buscar?q=" + encodeURIComponent(q));
    const items = cardsFrom(page.html).slice(0, 30);
    await enrichItems(items, 10, 4000);
    return publicItems(items);
  } catch (e) {
    kino.log("search: " + ((e && e.message) || e));
  }
  return [];
}

// Presupuesto del inicio (Kino corta a los 20 s) y copias guardadas de cada fila:
//   copia de menos de 10 min  -> se usa tal cual, sin pedir nada al sitio (instantaneo);
//   copia de hasta 1 h        -> se intenta refrescar 2,5 s; si el sitio no alcanza, sale la copia;
//   copia de hasta 6 h        -> 6 s; mas vieja -> 12 s;
//   sin copia (primera vez)   -> se espera lo necesario, dentro del presupuesto.
const HOME_BUDGET_MS = 17000;
const ROW_FRESH_MS = 10 * 60000;
let T0 = 0;
function timeLeft() {
  return HOME_BUDGET_MS - (Date.now() - T0);
}

function refreshWindow(ageMs) {
  if (ageMs < 3600000) return 2500;
  if (ageMs < 6 * 3600000) return 6000;
  return 12000;
}

function savedRow(id) {
  const raw = cacheGet("row3:" + id);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function saveRow(row, t) {
  try {
    // Sin resumenes: solo lo que dibujan las tarjetas (cabe de sobra en el limite de la cache).
    const slim = {
      id: row.id,
      title: row.title,
      ref: row.ref,
      genre: row.genre,
      items: row.items.map(function (it) {
        const c = { id: it.id, ref: it.ref, title: it.title, kind: it.kind };
        if (it.poster) c.poster = it.poster;
        if (it.backdrop) c.backdrop = it.backdrop;
        if (it.year) c.year = it.year;
        return c;
      }),
    };
    const raw = JSON.stringify({ t: t || Date.now(), row: slim });
    if (raw.length < 60000) cacheSet("row3:" + row.id, raw, 12 * 3600000);
  } catch (e) {}
}

// Fila "En emision": los animes de "Ultimos capitulos" de la portada. Los capitulos no traen el titulo real ni la
// caratula (solo una captura del episodio), asi que ademas se leen las primeras paginas de /emision (el listado de
// estrenos de la temporada, con titulo y año reales) y de ahi se recuerdan los titulos de cada anime.
async function loadEmision() {
  const pages = await Promise.all([
    getPage(BASE + "/"),
    getPage(BASE + "/emision", null, 9000).catch(function () { return null; }),
    getPage(BASE + "/emision?p=2", null, 9000).catch(function () { return null; }),
  ]);
  if (pages[1]) cardsFrom(pages[1].html);
  if (pages[2]) cardsFrom(pages[2].html);
  return latestCards(pages[0].html).slice(0, 30);
}

function hasImage(it) {
  return !!(it._tmp || it._alp);
}

export async function home() {
  T0 = Date.now();
  const en = lang() === "en";
  const defs = [
    { id: "emision", title: en ? "Airing now" : "En emisión", ref: "emision", genre: "anime", load: loadEmision },
    {
      id: "animes",
      title: en ? "Anime" : "Animes",
      ref: "animes",
      genre: "anime",
      load: async function () {
        const page = await getPage(BASE + "/animes");
        return cardsFrom(page.html).slice(0, 30);
      },
    },
    {
      id: "peliculas",
      title: en ? "Movies" : "Películas",
      ref: "peliculas",
      genre: "peliculas",
      load: async function () {
        const r = await loadMovies(1);
        return r.items.slice(0, 30);
      },
    },
  ];

  // 1) Filas: copia guardada si es reciente; si no, se pide al sitio dentro de una ventana (ver refreshWindow).
  const loaded = {};
  const copyTime = {};
  const rows = await Promise.all(
    defs.map(async function (d) {
      const mk = function (items) {
        const row = { id: d.id, title: d.title, items: items };
        if (d.ref) row.ref = d.ref;
        if (d.genre) row.genre = d.genre;
        return row;
      };
      const old = savedRow(d.id);
      const has = !!(old && old.row && old.row.items && old.row.items.length);
      const age = has ? Date.now() - old.t : Infinity;
      if (has) copyTime[d.id] = old.t;
      if (has && age < ROW_FRESH_MS) return mk(old.row.items);
      try {
        const win = has ? refreshWindow(age) : Math.max(4000, timeLeft() - 6000);
        const items = await within(d.load(), win);
        if (items === LATE) throw new Error("el sitio no alcanzo en " + win + " ms");
        if (!items.length) throw new Error("sin elementos");
        loaded[d.id] = true;
        return mk(items);
      } catch (e) {
        kino.log("home: fila " + d.id + (has ? " (se muestra la copia guardada)" : "") + ": " + ((e && e.message) || e));
        return has ? mk(old.row.items) : null;
      }
    })
  );
  const shown = rows.filter(Boolean);

  // 2) Imagenes: se intercalan las filas (1.º de cada una, 2.º de cada una...) y se esperan ANTES de responder, porque
  //    Kino conserva la primera respuesta del inicio. Con carga nueva se espera hasta 10 s; con copias, solo 1,5 s.
  const all = [];
  const longest = shown.reduce(function (n, row) { return Math.max(n, row.items.length); }, 0);
  for (let i = 0; i < longest; i++) {
    shown.forEach(function (row) {
      if (row.items[i]) all.push(row.items[i]);
    });
  }
  let changed = false;
  if (all.length) {
    try {
      const anyLoaded = Object.keys(loaded).length > 0;
      const budget = Math.max(0, Math.min(anyLoaded ? 10000 : 1500, timeLeft() - 2500));
      changed = await enrichItems(all, 14, budget); // 14 titulos x hasta 2 busquedas queda bajo el limite de TMDB (~20 cada 10 s)
    } catch (e) {
      kino.log("imagenes inicio: " + ((e && e.message) || e));
    }
  }

  // 3) Copias: una fila con titulos todavia sin imagen se guarda "recien vencida" (45 s) para que la proxima apertura
  //    siga completandola en vez de darla por buena durante 10 minutos.
  shown.forEach(function (row) {
    const incomplete = row.items.some(function (it) { return !hasImage(it); });
    if (loaded[row.id]) saveRow(row, incomplete ? Date.now() - ROW_FRESH_MS + 45000 : undefined);
    else if (changed && copyTime[row.id]) saveRow(row, incomplete ? Date.now() - ROW_FRESH_MS + 45000 : copyTime[row.id]);
  });
  return shown.map(function (row) {
    return Object.assign({}, row, { items: publicItems(row.items) });
  });
}

export async function browse(ref, cursor) {
  const pageNum = Math.max(1, parseInt(cursor || "1", 10) || 1);
  if (ref === "peliculas") {
    const r = await loadMovies(pageNum);
    await enrichItems(r.items, 16, 6000);
    return { items: publicItems(r.items), next: r.next };
  }
  let url = ref === "emision" ? BASE + "/emision" : BASE + "/animes";
  if (pageNum > 1) url += "?p=" + pageNum;
  const page = await getPage(url);
  const items = cardsFrom(page.html);
  await enrichItems(items, 16, 6000);
  const next = items.length && (hasNextPage(page.html, pageNum) || items.length >= 24) ? String(pageNum + 1) : null;
  return { items: publicItems(items), next: next };
}

async function fetchJson(url) {
  const r = await kino.fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "application/json, */*",
      "X-Requested-With": "XMLHttpRequest",
      Referer: BASE + "/",
    },
    timeoutMs: 12000,
  });
  if (!r || !r.ok) throw fail("unavailable", "HTTP " + (r ? r.status : 0), "siteDown");
  const text = bodyText(r).trim();
  if (!text || (text.charAt(0) !== "{" && text.charAt(0) !== "[")) {
    throw fail("unavailable", "respuesta no JSON", "noEpisodes");
  }
  return JSON.parse(text);
}

// Ficha del sitio: titulo, sinopsis, año y caratula propia (respaldo; la principal sale de TMDB).
function parseSeriesHtml(html, slug) {
  const series = { title: "", poster: "", backdrop: "", overview: "", year: "" };
  try {
    const h1 = kino.html.select(html, "h1")[0];
    if (h1 && h1.text) series.title = String(h1.text).replace(/\s+/g, " ").trim();
  } catch (e) {}
  if (!series.title) {
    const h1m = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
    if (h1m) series.title = decodeHtml(h1m[1].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
  }
  if (!series.title) series.title = baseSlug(slug).replace(/-/g, " ");

  let og = "";
  try {
    const meta = kino.html.select(html, "meta[property=og:image]")[0];
    if (meta && meta.attrs && meta.attrs.content) og = meta.attrs.content;
  } catch (e) {}
  if (!og) {
    const ogi = /property=["']og:image["'][^>]*content=["']([^"']+)["']/i.exec(html) || /content=["']([^"']+)["'][^>]*property=["']og:image["']/i.exec(html);
    if (ogi) og = ogi[1];
  }
  series.poster = cleanImg(og);
  if (!series.poster) {
    const ds = /data-src=["']([^"']*\/assets\/(?:img|thumbs)\/[^"']+)["']/i.exec(html);
    if (ds) series.poster = cleanImg(ds[1]);
  }
  if (!series.poster) series.poster = cacheGet("pm:" + slug) || "";

  const sin = /Sinopsis[\s\S]{0,300}<p[^>]*>([^<]{20,1500})<\/p>/i.exec(html);
  if (sin) series.overview = decodeHtml(sin[1]).replace(/\s+/g, " ").trim().slice(0, 2000);
  else {
    const ogd = /property=["']og:description["'][^>]*content=["']([^"']+)["']/i.exec(html);
    if (ogd) {
      const text = decodeHtml(ogd[1]).replace(/^Ver[\s\S]*?MonosChinos\.?\s*/i, "").replace(/\s+/g, " ").trim();
      if (text.length >= 40) series.overview = text.slice(0, 2000);
    }
  }
  const ym = /(?:A[nñ]o|Estreno|Fecha|Emitido)[^0-9<]{0,60}((?:19|20)\d{2})/i.exec(html) || /\((20\d{2}|19\d{2})\)/.exec(series.title);
  if (ym) series.year = ym[1];
  return series;
}

export async function episodes(ref) {
  const T = Date.now();
  function left() { return 18500 - (Date.now() - T); }
  const m = /^a:([A-Za-z0-9._~-]+)$/.exec(String(ref || ""));
  if (!m) throw fail("not_found", "ref invalido", "badRef");
  const slug = m[1];

  let html = "";
  try {
    const page = await getPage(BASE + "/anime/" + slug, null, 14000);
    html = page.html;
  } catch (e) {
    // Probar con/sin -sub-espanol
    const alt = /sub-espanol$/i.test(slug) ? baseSlug(slug) : slug + "-sub-espanol";
    try {
      const page = await getPage(BASE + "/anime/" + alt, null, 12000);
      html = page.html;
    } catch (e2) {
      throw fail("unavailable", "ficha: " + ((e && e.message) || e), "siteDown");
    }
  }

  const series = parseSeriesHtml(html, slug);

  const ajaxM = /data-ajax=["']([^"']+)["']/i.exec(html);
  if (!ajaxM) throw fail("not_found", "sin data-ajax", "noEpisodes");
  const ajaxUrl = abs(ajaxM[1]);

  let meta;
  try {
    meta = await fetchJson(ajaxUrl);
  } catch (e) {
    throw fail("unavailable", "caplist: " + ((e && e.message) || e), "noEpisodes");
  }

  const epsMeta = (meta && meta.eps) || [];
  const perpage = parseInt((meta && meta.perpage) || 50, 10) || 50;
  const paginateUrl = (meta && meta.paginate_url) || "";
  const total = epsMeta.length;

  // Paginas de capitulos en paralelo (hasta 3 a la vez).
  const caps = [];
  if (paginateUrl && total > 0) {
    const pages = Math.min(10, Math.max(1, Math.ceil(total / perpage)));
    const nums = [];
    for (let p = 1; p <= pages; p++) nums.push(p);
    const chunks = await mapLimit(nums, 3, async function (p) {
      if (left() < 5000) return [];
      try {
        const join = paginateUrl.indexOf("?") >= 0 ? "&" : "?";
        const data = await fetchJson(paginateUrl + join + "p=" + p);
        return (data && data.caps) || [];
      } catch (e) {
        kino.log("caps p" + p + ": " + ((e && e.message) || e));
        return [];
      }
    });
    chunks.forEach(function (chunk) { (chunk || []).forEach(function (c) { caps.push(c); }); });
  }

  const list = [];
  const seen = {};
  if (caps.length) {
    for (let i = 0; i < caps.length; i++) {
      const c = caps[i];
      const n = parseInt(c.episodio, 10);
      if (!n || seen[n]) continue;
      seen[n] = true;
      let epSlug = baseSlug(slug);
      const vm = /\/ver\/([A-Za-z0-9._~-]+)-episodio-(\d+)/.exec(String(c.url || ""));
      if (vm) epSlug = vm[1];
      list.push({ season: 1, number: n, ref: "e:" + epSlug + ":" + n, title: t("episode") + n });
    }
  } else {
    for (let i = 0; i < epsMeta.length; i++) {
      const n = parseInt(epsMeta[i].num, 10);
      if (!n || seen[n]) continue;
      seen[n] = true;
      list.push({ season: 1, number: n, ref: "e:" + baseSlug(slug) + ":" + n, title: t("episode") + n });
    }
  }

  if (!list.length) throw fail("not_found", "0 capitulos", "noEpisodes");
  list.sort(function (a, b) { return a.number - b.number; });

  // TMDB: titulo, imagen, resumen, fecha y duracion de cada capitulo. Sin imagen del sitio ni de la caratula de relleno:
  // si TMDB no tiene el capitulo, queda sin imagen (Kino pone la suya).
  const year = parseInt(series.year, 10) || parseInt(cacheGet("yr1:" + slug) || "0", 10) || 0;
  let extras = {};
  if (left() > 3000) {
    try {
      const got = await within(episodeExtras(baseSlug(slug), series.title, year, list[list.length - 1].number), Math.min(6000, left() - 1500));
      if (got !== LATE) extras = got || {};
    } catch (e) {
      kino.log("tmdb capitulos: " + ((e && e.message) || e));
    }
  }
  let withStill = 0;
  list.forEach(function (ep) {
    const x = extras[ep.number];
    if (!x) return;
    if (x.name && !/^(episode|episodio|cap[ií]tulo)\s*\d+$/i.test(x.name)) ep.title = x.name;
    if (x.overview) ep.overview = x.overview;
    if (x.still) {
      ep.still = x.still;
      withStill++;
    }
    if (x.air) ep.airDate = x.air;
    if (x.rt) ep.runtimeMinutes = x.rt;
  });

  // Serie: caratula, fondo y resumen de TMDB (con respaldo en lo que trae el sitio).
  try {
    const info =
      left() > 2500
        ? await within(tmdbInfoFor({ id: slug, kind: "series", title: series.title, year: year }), Math.min(3000, left() - 1000))
        : null;
    if (info && info !== LATE) {
      if (info.p) series.poster = info.p;
      if (info.b) series.backdrop = info.b;
      if (info.o && (series.overview || "").length < 80) series.overview = info.o;
      if (info.y && !series.year) series.year = info.y;
    } else if (left() > 2500) {
      // Sin datos de TMDB: AniList (caratula, banner y resumen).
      const probe = { id: slug, title: series.title, year: year ? String(year) : "" };
      try {
        await within(anilistBatch([probe]), Math.min(3500, left() - 1000));
      } catch (e) {
        kino.log("anilist ficha: " + ((e && e.message) || e));
      }
      const al = cacheGet("al2:" + slug);
      if (al && al !== "0") {
        const ai = JSON.parse(al);
        if (ai.p) series.poster = ai.p;
        if (ai.b) series.backdrop = ai.b;
        if (ai.o && (series.overview || "").length < 80) series.overview = ai.o;
        if (ai.y && !series.year) series.year = ai.y;
      }
    }
  } catch (e) {
    kino.log("tmdb ficha: " + ((e && e.message) || e));
  }
  ["poster", "backdrop", "overview", "year"].forEach(function (k) {
    if (!series[k]) delete series[k];
  });
  kino.log("episodes OK " + slug + " -> " + list.length + " (" + withStill + " con imagen de TMDB)");
  return { series: series, episodes: list };
}

// ---------- Servidores de reproduccion ----------
// Cada servidor se abre por una de dos vias:
//  1) kino.fetch + lectura del HTML (MixDrop, Mp4Upload, LuluStream, Uqload, ObeyWish, Ok.ru, Doodstream...)
//  2) kino.browser.capture (navegador oculto) para los que cargan el video con JavaScript (Voe, Filemoon/Byse)
//     y como respaldo cuando la via 1 falla.

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const KIND_LABEL = {
  voe: "Voe", filemoon: "Filemoon", streamwish: "StreamWish", obeywish: "ObeyWish", dood: "Doodstream",
  mixdrop: "MixDrop", mp4upload: "Mp4Upload", lulu: "LuluStream", vidhide: "Vidhide",
  uqload: "Uqload", okru: "Ok.ru", savefiles: "SaveFiles", hexload: "Hexload", generic: "Servidor",
};

// Orden de prueba: primero los que se abren rapido con kino.fetch, al final los que usan navegador oculto.
const KIND_ORDER = {
  mixdrop: 1, mp4upload: 2, lulu: 3, uqload: 4, okru: 5, obeywish: 6, savefiles: 7,
  dood: 8, voe: 9, filemoon: 10, generic: 15, vidhide: 16, hexload: 17, streamwish: 18,
};

function detectKind(name, url) {
  const n = String(name || "");
  const u = String(url || "");
  const nu = n + " " + u;
  if (/mixdrop|mxdrop|mxcontent/i.test(nu)) return "mixdrop";
  if (/mp4upload/i.test(nu)) return "mp4upload";
  if (/lulu/i.test(nu)) return "lulu";
  if (/uqload/i.test(nu)) return "uqload";
  if (/(^|[^a-z])ok[\s._-]?ru\b|odnoklassniki|okcdn/i.test(nu)) return "okru";
  if (/obeywish/i.test(nu)) return "obeywish";
  if (/\bvoe\b|voe\.|voe-unblock|voeunblock/i.test(nu)) return "voe";
  if (/dood|dsvplay|d-s\.io|ds2play|ds2video|playmogo|myvidplay|vide0\.net|d0+d\.com|dooo+d/i.test(nu)) return "dood";
  if (/filemoon|byse|moonplayer|f16px/i.test(nu)) return "filemoon";
  if (/vidhide|streamhide/i.test(nu)) return "vidhide";
  if (/savefiles?|streamhls/i.test(nu)) return "savefiles";
  if (/hexload/i.test(nu)) return "hexload";
  if (/streamwish|\bwish\b|embedwish|hlswish|awish/i.test(nu)) return "streamwish";
  if (/mega\.nz|\bmega\b/i.test(nu)) return "mega";
  if (/netu|hqq|waaw/i.test(nu)) return "netu";
  return "generic";
}

// ---- Salud de cada servidor dentro de Kino ----
// Si un servidor falla 4 veces seguidas sin ningun exito, pasa al final de la lista durante 6 horas
// (sigue disponible en el menu Servidor). Un solo exito lo devuelve a su lugar.
const HEALTH_TTL = 6 * 3600 * 1000;
function failStreak(kind) {
  const v = parseInt(cacheGet("hs:" + kind) || "0", 10);
  return isNaN(v) ? 0 : v;
}
function noteResult(kind, ok, e) {
  try {
    if (ok) {
      if (failStreak(kind) > 0) cacheSet("hs:" + kind, "0", HEALTH_TTL);
      return;
    }
    const m = String((e && e.message) || "");
    if (/borrad|deleted|HTTP 404/i.test(m)) return; // el video de ese capitulo no existe: no es culpa del servidor
    cacheSet("hs:" + kind, String(failStreak(kind) + 1), HEALTH_TTL);
  } catch (err) {}
}

function listServers(html) {
  const servers = [];
  const seen = {};
  const re = /data-player=["']([^"']+)["'][^>]*>([^<]*)</gi;
  let x;
  while ((x = re.exec(String(html || "")))) {
    const url = b64text(x[1]).trim();
    if (!url || !/^https?:\/\//i.test(url)) continue;
    const name = String(x[2] || "").replace(/\s+/g, " ").trim() || "servidor";
    const kind = detectKind(name, url);
    if (kind === "mega" || kind === "netu") continue; // Mega va cifrado y Netu pide captcha: no se pueden abrir desde Kino
    const key = kind + "|" + url;
    if (seen[key]) continue;
    seen[key] = true;
    servers.push({ name: name, url: url, kind: kind });
  }
  // Orden fijo (los indices de las alternativas diferidas dependen de el); la salud y la preferencia solo
  // cambian el orden de prueba en resolve().
  servers.sort(function (a, b) { return (KIND_ORDER[a.kind] || 15) - (KIND_ORDER[b.kind] || 15); });
  return servers;
}

function serverLabel(s, all) {
  const base = KIND_LABEL[s.kind] || s.name || "Servidor";
  let count = 0, idx = 0;
  for (let i = 0; i < all.length; i++) {
    if (all[i].kind === s.kind) { count++; if (all[i] === s) idx = count; }
  }
  return count <= 1 ? base : base + " " + idx;
}

// ---- Desempaquetador p.a.c.k.e.r ----
// Dean Edwards usa base 62 (0-9, a-z, A-Z); Number.toString solo llega a 36, asi que la conversion es propia.
function packEnc(c, a) {
  return (c < a ? "" : packEnc(Math.floor(c / a), a)) + ((c = c % a) > 35 ? String.fromCharCode(c + 29) : c.toString(36));
}
function unpackOne(payload, radix, count, wordsRaw) {
  const words = wordsRaw.split("|");
  const trie = {};
  for (let i = 0; i < count; i++) {
    const key = packEnc(i, radix);
    trie[key] = words[i] || key;
  }
  return payload.replace(/\b\w+\b/g, function (w) {
    return Object.prototype.hasOwnProperty.call(trie, w) ? trie[w] : w;
  });
}
function jsUnpack(source) {
  const src = String(source || "");
  const res = [
    /\}\s*\(\s*'((?:\\'|[^'])*)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:\\'|[^'])*)'\s*\.split\s*\(\s*'\|'\s*\)/g,
    /\}\s*\(\s*"((?:\\"|[^"])*)"\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*"((?:\\"|[^"])*)"\s*\.split\s*\(\s*"\|"\s*\)/g,
  ];
  let out = "";
  for (let r = 0; r < res.length; r++) {
    const q = r === 0 ? "'" : '"';
    let m;
    while ((m = res[r].exec(src))) {
      try {
        const payload = m[1].split("\\" + q).join(q).replace(/\\\\/g, "\\");
        const words = m[4].split("\\" + q).join(q);
        out += "\n" + unpackOne(payload, parseInt(m[2], 10), parseInt(m[3], 10), words);
      } catch (e) {}
    }
  }
  return out;
}
function unpackAll(html) {
  const first = jsUnpack(html);
  if (!first) return "";
  const second = jsUnpack(first); // empaquetado dentro de empaquetado
  return first + (second ? "\n" + second : "");
}

function findStreamUrl(html, base) {
  const src = String(html || "")
    .replace(/\\\//g, "/")
    .replace(/\\u0026/gi, "&")
    .replace(/&amp;/g, "&");
  const root = base || BASE;
  function fix(u) {
    u = unslash(String(u || "")).replace(/\\/g, "").trim();
    if (u.indexOf("//") === 0) return "https:" + u;
    if (u.charAt(0) === "/") return originOf(root) + u;
    return u;
  }
  let m = /MDCore\.wurl\s*=\s*["']([^"']+)["']/i.exec(src);
  if (m && /\.(mp4|m3u8)/i.test(m[1])) return fix(m[1]);
  m = /\bwurl\s*=\s*["']([^"']+)["']/i.exec(src);
  if (m && /\.(mp4|m3u8)/i.test(m[1])) return fix(m[1]);
  // StreamWish / ObeyWish / Lulu: var links={"hls4":"...","hls3":"...","hls2":"..."}
  const hre = /["']hls[234]["']\s*:\s*["']([^"']+)["']/gi;
  let h;
  const hls = [];
  while ((h = hre.exec(src))) hls.push(fix(h[1]));
  for (let i = 0; i < hls.length; i++) if (/^https?:\/\//i.test(hls[i]) && /\.m3u8|\/hls\//i.test(hls[i])) return hls[i];
  if (hls.length && /^https?:\/\//i.test(hls[0])) return hls[0];
  const patterns = [
    /(?:file|src|source|video_url)["']?\s*[:=]\s*["']((?:https?:)?\/\/[^"'\s<>]+\.(?:m3u8|mp4)[^"'\s<>]*)["']/i,
    /(?:file|src|source)["']?\s*[:=]\s*["'](\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i,
    /https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/i,
    /https?:\/\/[^"'\s<>]+\.mp4[^"'\s<>]*/i,
    /["']((?:https?:)?\/\/[^"']+\.m3u8[^"']*)["']/i,
    /["']((?:https?:)?\/\/[^"']+\.mp4[^"']*)["']/i,
  ];
  for (let i = 0; i < patterns.length; i++) {
    const re = new RegExp(patterns[i].source, "gi");
    let mm;
    while ((mm = re.exec(src))) {
      const cand = fix(mm[1] || mm[0]);
      if (/doubleclick|googlesyndication|adserver|\/ads?\//i.test(cand)) continue;
      return cand;
    }
  }
  // mp4upload: https://a4.mp4upload.com:183/d/<token>/video.mp4
  m = /https?:\/\/[a-z0-9.-]+(?::\d+)?\/d\/[^"'\s<>]+\/video\.mp4/i.exec(src);
  if (m) return m[0];
  return "";
}

function streamResult(url, referer, label, extra, q) {
  const headers = Object.assign({ Referer: referer || BASE + "/", "User-Agent": UA }, extra || {});
  return { url: url, headers: headers, alts: [], label: label || "", q: q || 0 };
}

// ---- Calidad ----
// La altura del video sale, en este orden, de: la lista de calidades del servidor (Ok.ru), pistas en la URL o en el
// reproductor ("1080p"), y RESOLUTION= del manifiesto HLS (solo si Kino deja leerlo: kino.fetchAnyHost).
function heightFromText(s) {
  s = String(s || "");
  let best = 0, m;
  const re = /RESOLUTION=\d+x(\d+)/gi;
  while ((m = re.exec(s))) best = Math.max(best, parseInt(m[1], 10));
  if (best) return best;
  m = /(?:^|[^\d])(2160|1440|1080|720|576|480|360|240)\s*p(?![a-z])/i.exec(s);
  return m ? parseInt(m[1], 10) : 0;
}
function heightFromUrl(u) {
  const m = /[_\/.=-](2160|1440|1080|720|480|360|240)(?:p)?(?=[_\/.&?=-]|$)/.exec(String(u || ""));
  return m ? parseInt(m[1], 10) : heightFromText(u);
}
function playerHint(html) {
  const m = /(?:label|quality|res)["']?\s*[:=]\s*["']?(2160|1440|1080|720|480|360|240)p?["']?/i.exec(String(html || ""));
  return m ? parseInt(m[1], 10) : 0;
}
async function probeHls(url, headers) {
  if (kino.fetchAnyHost !== true || !/\.m3u8/i.test(String(url))) return 0;
  try {
    const r = await kino.fetch(url, { headers: headers || {}, timeoutMs: 4000 });
    return r && r.ok ? heightFromText(bodyText(r)) : 0;
  } catch (e) {
    return 0;
  }
}
function estQ(kind) {
  const v = parseInt(cacheGet("q:" + kind) || "0", 10);
  return isNaN(v) ? 0 : v;
}
function withQ(label, q) {
  return q ? label + " · " + q + "p" : label;
}
function goneIn(html) {
  return /File Not Found|deleted|not found|removed|no (longer|existe)|expirad|File was deleted|Video not found/i.test(String(html || ""));
}

// ---- Tiempo disponible y navegador oculto ----
let RESOLVE_T0 = 0;
let CAP_OFF = false; // se apaga si Kino dice que el navegador oculto no esta permitido o no existe en este equipo
function canCapture() {
  return !CAP_OFF && typeof kino.browser === "object" && kino.browser !== null && typeof kino.browser.capture === "function";
}
function left() {
  // Con navegador oculto aprobado, resolve tiene 75 s; sin el, unos 20 s.
  return (canCapture() ? 68000 : 18500) - (Date.now() - RESOLVE_T0);
}

async function captureStream(embed, label) {
  if (!canCapture()) throw fail("unavailable", label + " sin navegador oculto", "serverFailed");
  const ms = Math.max(6000, Math.min(20000, left() - 2000));
  let page;
  try {
    page = await kino.browser.capture(embed, { timeoutMs: ms, headers: { Referer: BASE + "/" } });
  } catch (e) {
    const code = String((e && e.code) || "");
    if (code === "not_allowed" || code === "browser_unavailable") CAP_OFF = true;
    throw fail("unavailable", label + " captura " + (code || (e && e.message) || "fallo"), "serverFailed");
  }
  const list = ((page && page.media) || []).filter(function (x) { return x && x.url; });
  const good = list.filter(function (x) { return !/doubleclick|googlesyndication|adserver|\/ads?\//i.test(x.url); });
  const pick = good[0] || list[0];
  if (!pick) throw fail("unavailable", label + " captura sin video", "serverFailed");
  kino.log(label + " captura OK " + String(pick.url).slice(0, 70));
  const origin = originOf((page && page.finalUrl) || embed);
  return {
    url: pick.url,
    headers: pick.headers && Object.keys(pick.headers).length ? pick.headers : { Referer: origin + "/", "User-Agent": UA },
    alts: [],
    label: label,
    q: heightFromUrl(pick.url),
  };
}

// ---- Via 1: kino.fetch + HTML ----
async function packerStream(embed, label) {
  const page = await getPage(embed, { Referer: BASE + "/" }, 10000);
  const html = page.html;
  const origin = originOf(page.url);
  kino.log(label + " len=" + html.length + " host=" + origin);
  if (html.length < 500 && /just a moment|cf-browser|challenge/i.test(html)) {
    throw fail("unavailable", label + " bloqueado CF", "serverFailed");
  }
  const unpacked = unpackAll(html);
  let file = findStreamUrl(unpacked, page.url) || findStreamUrl(html, page.url);
  if (!file) throw fail("unavailable", goneIn(html) ? label + " borrado" : label + " sin video", "serverFailed");
  if (file.indexOf("//") === 0) file = "https:" + file;
  if (!/^https?:\/\//i.test(file)) throw fail("unavailable", label + " URL invalida", "serverFailed");
  kino.log(label + " OK " + file.slice(0, 60));
  return streamResult(file, origin + "/", label, null, heightFromUrl(file) || playerHint(unpacked) || playerHint(html));
}

function randomAlpha(n) {
  const abc = "abcdefghijklmnopqrstuvwxyz";
  let s = "";
  for (let i = 0; i < n; i++) s += abc.charAt(Math.floor(Math.random() * 26));
  return s;
}
async function doodStream(embed) {
  const url = String(embed).replace(/\/(?:d|download)\//, "/e/");
  const page = await getPage(url, { Referer: BASE + "/" }, 10000);
  const origin = originOf(page.url);
  const m = /\/pass_md5\/([^"'\s]+)/.exec(page.html);
  if (!m) throw fail("unavailable", goneIn(page.html) ? "Dood borrado" : "Dood sin video", "serverFailed");
  const pass = await getPage(origin + "/pass_md5/" + m[1], { Referer: page.url }, 10000);
  const tok = String(pass.html || "").trim();
  if (!tok || tok.length > 500 || /<html|<!doctype/i.test(tok)) throw fail("unavailable", "Dood sin token", "serverFailed");
  const parts = m[1].split("/");
  const tm = /makePlay[\s\S]{0,300}?token=([A-Za-z0-9]+)/.exec(page.html);
  const token = (tm && tm[1]) || parts[parts.length - 1] || "";
  const file = tok + randomAlpha(10) + "?token=" + token + "&expiry=" + Date.now();
  const full = file.indexOf("http") === 0 ? file : origin + file;
  return streamResult(full, origin + "/", "Doodstream");
}

// Ok.ru: la pagina /videoembed/<id> trae un data-options (JSON escapado) con el manifiesto HLS o la lista de calidades.
async function okruStream(embed) {
  const id = (/ok\.ru\/(?:videoembed|video)\/(\d+)/i.exec(embed) || /odnoklassniki\.ru\/(?:videoembed|video)\/(\d+)/i.exec(embed) || [])[1];
  if (!id) throw fail("unavailable", "Ok.ru sin id", "serverFailed");
  const page = await getPage("https://ok.ru/videoembed/" + id, { Referer: BASE + "/", "User-Agent": DESKTOP_UA }, 10000);
  const m = /data-options=(?:"([^"]+)"|'([^']+)')/.exec(page.html);
  if (!m) throw fail("unavailable", goneIn(page.html) ? "Ok.ru borrado" : "Ok.ru sin video", "serverFailed");
  let meta = null;
  try {
    const opts = JSON.parse(decodeHtml(m[1] || m[2]));
    const raw = opts && opts.flashvars && opts.flashvars.metadata;
    meta = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (e) {
    meta = null;
  }
  if (!meta) throw fail("unavailable", "Ok.ru sin metadata", "serverFailed");
  const hls = meta.hlsManifestUrl || meta.ondemandHls || meta.hlsMasterPlaylistUrl;
  if (hls && /^https?:\/\//i.test(hls)) return streamResult(hls, "https://ok.ru/", "Ok.ru");
  const rank = { mobile: 1, lowest: 2, low: 3, sd: 4, hd: 5, full: 6, quad: 7, ultra: 8 };
  const height = { mobile: 144, lowest: 240, low: 360, sd: 480, hd: 720, full: 1080, quad: 1440, ultra: 2160 };
  const vids = (meta.videos || []).filter(function (v) { return v && /^https?:\/\//i.test(v.url || ""); });
  vids.sort(function (a, b) { return (rank[b.name] || 0) - (rank[a.name] || 0); });
  if (!vids.length) throw fail("unavailable", goneIn(page.html) || meta.error ? "Ok.ru borrado" : "Ok.ru sin video", "serverFailed");
  return streamResult(vids[0].url, "https://ok.ru/", "Ok.ru", null, height[vids[0].name] || 0);
}

// Convierte enlaces de "pagina de descarga" o de ficha en el enlace de reproductor incrustado.
function embedUrl(s) {
  let u = String(s.url || "");
  switch (s.kind) {
    case "mixdrop":
      return u.replace(/\/(?:f|file)\//, "/e/");
    case "mp4upload": {
      const m = /^(https?:\/\/(?:www\d?\.)?mp4upload\.com)\/(?!embed-)([a-z0-9]{8,16})\/?$/i.exec(u);
      return m ? m[1] + "/embed-" + m[2] + ".html" : u;
    }
    case "uqload": {
      const m = /^(https?:\/\/[^/]+)\/(?!embed-)([a-z0-9]{8,16})(?:\.html)?$/i.exec(u);
      return m ? m[1] + "/embed-" + m[2] + ".html" : u;
    }
    case "lulu":
    case "obeywish":
    case "streamwish":
    case "vidhide":
    case "filemoon":
      return u.replace(/^(https?:\/\/[^/]+)\/(?:f|d|v|download)\//, "$1/e/");
    default:
      return u;
  }
}

async function fetchPath(s, url) {
  switch (s.kind) {
    case "dood": return doodStream(url);
    case "okru": return okruStream(url);
    default: return packerStream(url, KIND_LABEL[s.kind] || s.name || "Servidor");
  }
}

async function rawStream(s, noCap) {
  const url = embedUrl(s);
  const label = KIND_LABEL[s.kind] || s.name || "Servidor";
  // Voe y Filemoon/Byse arman el video con JavaScript (y Voe cambia de dominio): navegador oculto primero.
  if (!noCap && (s.kind === "voe" || s.kind === "filemoon") && canCapture()) {
    try {
      return await captureStream(url, label);
    } catch (e) {
      kino.log("capture " + s.kind + ": " + ((e && e.message) || e));
      if (left() < 9000) throw e;
      return fetchPath(s, url); // ultimo intento por la via normal
    }
  }
  let first = null;
  try {
    return await fetchPath(s, url);
  } catch (e) {
    first = e;
  }
  // Respaldo: si la via normal fallo y queda tiempo, intentar con el navegador oculto (si no es un video borrado).
  if (!noCap && canCapture() && left() > 14000 && !/borrad/i.test(String((first && first.message) || ""))) {
    try {
      return await captureStream(url, label);
    } catch (e2) {
      kino.log("capture respaldo " + s.kind + ": " + ((e2 && e2.message) || e2));
    }
  }
  throw first;
}

async function streamFor(s, noCap) {
  try {
    const st = await rawStream(s, noCap);
    if (!st.q) st.q = await probeHls(st.url, st.headers);
    if (st.q) cacheSet("q:" + s.kind, String(st.q), 24 * 3600 * 1000);
    noteResult(s.kind, true);
    return st;
  } catch (e) {
    noteResult(s.kind, false, e);
    throw e;
  }
}

// ref de episodio: e:slug:num
// ref de servidor concreto (alternativa diferida): s:idx:e:slug:num
function parseResolveRef(ref) {
  let m = /^s:(\d+):e:([A-Za-z0-9._~-]+):(\d+)$/.exec(String(ref || ""));
  if (m) return { idx: parseInt(m[1], 10), slug: m[2], num: parseInt(m[3], 10) };
  m = /^e:([A-Za-z0-9._~-]+):(\d+)$/.exec(String(ref || ""));
  if (m) return { idx: -1, slug: m[1], num: parseInt(m[2], 10) };
  return null;
}

export async function resolve(ref) {
  RESOLVE_T0 = Date.now();
  CAP_OFF = false;
  const p = parseResolveRef(ref);
  if (!p) throw fail("not_found", "ref " + ref, "badRef");

  const page = await getPage(BASE + "/ver/" + p.slug + "-episodio-" + p.num, null, 14000);
  const servers = listServers(page.html);

  kino.log(
    "resolve " + p.slug + "-" + p.num +
      (p.idx >= 0 ? " server#" + p.idx : "") +
      ": " + servers.map(function (s) { return s.name + "(" + s.kind + ")"; }).join(", ")
  );
  if (!servers.length) throw fail("not_found", "sin servidores", "noServers");

  // Un server concreto (alternativa del menu / reintento automatico)
  if (p.idx >= 0) {
    const s = servers[p.idx];
    if (!s) throw fail("not_found", "servidor " + p.idx + " no existe", "noServers");
    const stream = await streamFor(s, false);
    return {
      url: stream.url,
      headers: stream.headers || { Referer: originOf(s.url) + "/", "User-Agent": UA },
      label: withQ(serverLabel(s, servers), stream.q),
      expiresInSeconds: 1800,
    };
  }

  let pref = "";
  try {
    pref = String((kino.config && (kino.config.server || (kino.config.get && kino.config.get("server")))) || "");
  } catch (e) {}

  const viaCapture = function (s) { return (s.kind === "voe" || s.kind === "filemoon") && canCapture(); };
  const idxs = servers.map(function (_s, i) { return i; });
  const results = []; // { i, st }
  const failed = {};
  const failures = [];

  // Fase A: los servidores que abren con kino.fetch se prueban en paralelo, para conocer su calidad.
  const fast = idxs.filter(function (i) { return !viaCapture(servers[i]); });
  const phaseA = mapLimit(fast, 4, async function (i) {
    try {
      results.push({ i: i, st: await streamFor(servers[i], true) });
    } catch (e) {
      failed[i] = true;
      failures.push(serverLabel(servers[i], servers) + ": " + reasonOf(e));
      kino.log("resolve " + servers[i].kind + ": " + ((e && e.message) || e));
    }
  });
  await within(phaseA, Math.max(3000, Math.min(14000, left() - 4000)));

  // Fase B: si ninguno abrio, navegador oculto (Voe, Filemoon y respaldo de los que fallaron), uno por uno.
  if (!results.length) {
    const order = idxs.slice().sort(function (a, b) {
      return (viaCapture(servers[a]) ? 0 : 1) - (viaCapture(servers[b]) ? 0 : 1) || a - b;
    });
    for (let n = 0; n < order.length && !results.length; n++) {
      const i = order[n];
      if (left() < 4000 || !canCapture()) break;
      const s = servers[i];
      if (!viaCapture(s) && !failed[i]) continue;
      try {
        results.push({ i: i, st: await streamFor(s, false) });
      } catch (e) {
        failed[i] = true;
        failures.push(serverLabel(s, servers) + ": " + reasonOf(e));
        kino.log("resolve captura " + s.kind + ": " + ((e && e.message) || e));
      }
    }
  }

  if (!results.length) {
    throw fail("unavailable", "ningun servidor (" + failures.slice(0, 5).join("; ") + ")", "serverFailed");
  }

  // Orden: mas calidad primero (la medida; si no, la ultima vista de ese servidor); a igual calidad, el preferido
  // y luego el orden fijo de la lista.
  function qOf(r) { return r.st.q || estQ(servers[r.i].kind); }
  results.sort(function (a, b) {
    return qOf(b) - qOf(a) ||
      (servers[b.i].kind === pref ? 1 : 0) - (servers[a.i].kind === pref ? 1 : 0) ||
      a.i - b.i;
  });

  const best = results[0];
  const stream = {
    url: best.st.url,
    headers: best.st.headers || { Referer: originOf(servers[best.i].url) + "/", "User-Agent": UA },
    label: withQ(serverLabel(servers[best.i], servers), best.st.q),
    expiresInSeconds: 1800,
  };

  // Alternativas: los demas que abrieron y los de navegador oculto sin probar (con la calidad que tuvieron la ultima vez).
  const done = {};
  results.forEach(function (r) { done[r.i] = r; });
  const pool = [];
  results.slice(1).forEach(function (r) { pool.push({ i: r.i, q: r.st.q || estQ(servers[r.i].kind), known: !!r.st.q }); });
  idxs.forEach(function (i) {
    if (done[i] || failed[i]) return;
    pool.push({ i: i, q: estQ(servers[i].kind), known: false });
  });
  pool.sort(function (a, b) {
    return b.q - a.q ||
      (servers[b.i].kind === pref ? 1 : 0) - (servers[a.i].kind === pref ? 1 : 0) ||
      a.i - b.i;
  });
  const alternatives = pool.slice(0, 8).map(function (x) {
    return { label: withQ(serverLabel(servers[x.i], servers), x.q), ref: "s:" + x.i + ":e:" + p.slug + ":" + p.num };
  });
  if (alternatives.length) stream.alternatives = alternatives;

  kino.log("resolve OK " + stream.label + " + " + alternatives.length + " alternativas");
  return stream;
}
