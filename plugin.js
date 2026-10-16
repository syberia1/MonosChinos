// MonosChinos para Kino — apiVersion 6 — https://monoschinos.st
// Metadatos 100% del sitio (sin TMDB). QuickJS: sin URL/atob/TextDecoder/timers.

const BASE = "https://monoschinos.st";
const UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";
const ID_OK = /^[A-Za-z0-9._~-]{1,128}$/;

const TXT = {
  notFound: { es: "No encontramos esto en el sitio.", en: "We could not find this on the site." },
  siteDown: { es: "El sitio no responde ahora. Intenta más tarde.", en: "The site is not answering now. Try again later." },
  noServers: {
    es: "Este capítulo no tiene servidores reproducibles.",
    en: "This episode has no playable servers.",
  },
  serverFailed: {
    es: "No se pudo abrir el video en ese servidor. Prueba otro en el menú Servidor.",
    en: "The video could not be opened on that server. Try another one in the Servidor menu.",
  },
  badRef: { es: "Este título ya no es válido. Búscalo otra vez.", en: "This title is no longer valid. Search for it again." },
  noEpisodes: {
    es: "MonosChinos no pudo cargar los capítulos.",
    en: "MonosChinos could not load the episodes.",
  },
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
function reasonOf(e) {
  const m = String((e && e.message) || "");
  if (/borrad|deleted|not found|removed|HTTP 404/i.test(m)) return lang() === "en" ? "video removed" : "video borrado";
  const h = /HTTP (\d{3})/.exec(m);
  if (h) return "HTTP " + h[1];
  if (/timeout|tardó|took too long/i.test(m)) return lang() === "en" ? "timed out" : "tardó demasiado";
  if (/sin video/i.test(m)) return lang() === "en" ? "no video found" : "sin video";
  if (/SPA|protegido/i.test(m)) return m.slice(0, 80);
  return lang() === "en" ? "failed" : "falló";
}

// ---------- Utilidades ----------

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
    else if (c < 240) {
      s += String.fromCharCode(((c & 15) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63));
    } else {
      const cp = ((c & 7) << 18) | ((bytes[i++] & 63) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63);
      const v = cp - 0x10000;
      s += String.fromCharCode(0xd800 + (v >> 10), 0xdc00 + (v & 1023));
    }
  }
  return s;
}
function b64text(s) {
  try {
    return utf8(b64bytes(s));
  } catch (e) {
    return "";
  }
}
function unslash(s) {
  return String(s).replace(/\\(.)/g, "$1");
}
function cleanQuery(q) {
  return String(q || "").replace(/\s+/g, " ").trim().slice(0, 100);
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
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&nbsp;/g, " ");
}
function attrOf(chunk, name) {
  let m = new RegExp("\\b" + name + "\\s*=\\s*\"([^\"]*)\"", "i").exec(chunk);
  if (m) return decodeHtml(m[1]);
  m = new RegExp("\\b" + name + "\\s*=\\s*'([^']*)'", "i").exec(chunk);
  return m ? decodeHtml(m[1]) : "";
}
function cleanTitle(raw) {
  return decodeHtml(String(raw || ""))
    .replace(/\s+capitulo\s+\d+$/i, "")
    .replace(/\s+episodio\s+\d+$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}
function cleanImg(u) {
  u = abs(u);
  if (!u) return "";
  return u.replace(/\?v=\d+/g, "").replace(/\?t=[^&]+/g, "");
}

// Póster vertical (imagen) → fondo horizontal (portada) del CDN del sitio.
// imagen:  .../assets/img/serie/imagen/NAME[-T1]-ID.jpg
// thumbs:  .../assets/thumbs/imagen/NAME-ID.jpg.webp
// portada: .../assets/img/serie/portada/NAME-portada-ID.jpg
function posterToBackdrop(poster) {
  const u = String(poster || "");
  // Ya es portada
  let m = /\/assets\/(?:img\/serie|thumbs)\/portada\/([^/?#]+)/i.exec(u);
  if (m) {
    const name = m[1].replace(/\.webp$/i, "").replace(/\.jpg$/i, "");
    return BASE + "/assets/img/serie/portada/" + name + (name.endsWith(".jpg") ? "" : ".jpg");
  }
  // Desde imagen (poster vertical)
  m = /\/assets\/(?:img\/serie|thumbs)\/imagen\/([^/?#]+?)(?:-T\d+)?-(\d+)\.(?:jpg|jpeg|png|webp)/i.exec(u);
  if (m) {
    return BASE + "/assets/img/serie/portada/" + m[1] + "-portada-" + m[2] + ".jpg";
  }
  // Desde thumbs/portada del capítulo
  m = /\/assets\/thumbs\/portada\/([^/?#]+?)(?:\.jpg)?(?:\.webp)?/i.exec(u);
  if (m) {
    let name = m[1].replace(/\.webp$/i, "").replace(/\.jpg$/i, "");
    if (!/-portada-\d+$/i.test(name)) {
      // por si viene sin -portada-id
      return BASE + "/assets/img/serie/portada/" + name + ".jpg";
    }
    return BASE + "/assets/img/serie/portada/" + name + ".jpg";
  }
  return "";
}

async function getPage(url, headers, timeoutMs) {
  const h = Object.assign({ "User-Agent": UA, Accept: "text/html,application/json,*/*" }, headers || {});
  const r = await kino.fetch(url, { headers: h, timeoutMs: timeoutMs || 15000 });
  if (!r.ok) throw fail("unavailable", "HTTP " + r.status + " " + url, "siteDown");
  return { url: r.url || url, html: r.text || "" };
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
    kino.storage.set(key, value, ttlMs ? { ttlMs: ttlMs } : undefined);
  } catch (e) {
    /* lleno */
  }
}

// ---------- Tarjetas del catálogo ----------

function slugFromAnimeUrl(href) {
  const m = /\/anime\/([^/?#"']+)/.exec(String(href || ""));
  return m ? m[1] : "";
}
function slugFromVerUrl(href) {
  const m = /\/ver\/([^/?#"']+)-episodio-(\d+)/.exec(String(href || ""));
  return m ? { slug: m[1], num: parseInt(m[2], 10) } : null;
}

function mkItem(slug, title, poster, movie) {
  if (!slug || !ID_OK.test(slug)) return null;
  return {
    id: slug,
    kind: movie ? "movie" : "series",
    title: String(title || slug.replace(/-/g, " ")).slice(0, 200),
    poster: poster || "",
    ref: "a:" + slug,
  };
}

/** Fichas /anime/slug — un resultado por slug. */
function cardsAnime(html) {
  const items = [];
  const seen = {};
  const re = /href=(["'])([^"']*\/anime\/([^"'/?#]+))\1/gi;
  let x;
  while ((x = re.exec(html))) {
    const slug = x[3];
    if (!slug || seen[slug]) continue;
    seen[slug] = true;
    const chunk = html.slice(Math.max(0, x.index - 40), Math.min(html.length, x.index + 1600));
    let poster = attrOf(chunk, "data-src");
    if (!poster || /\/img\/anime\.png/i.test(poster)) {
      const src = attrOf(chunk, "src");
      if (src && /\/(assets\/thumbs|cdn\/img)/i.test(src)) poster = src;
      else poster = "";
    }
    poster = cleanImg(poster);
    let title =
      cleanTitle(attrOf(chunk, "alt")) ||
      cleanTitle((/<h3[^>]*>([^<]+)/i.exec(chunk) || [])[1] || "") ||
      slug.replace(/-/g, " ");
    const item = mkItem(slug, title, poster, /pelicula|movie/i.test(slug));
    if (item) items.push(item);
  }
  return items;
}

/** Últimos capítulos → una ficha por anime (slug). */
function cardsEpisodes(html) {
  const items = [];
  const seen = {};
  const re = /href=(["'])([^"']*\/ver\/([^"'/?#]+)-episodio-(\d+))\1/gi;
  let x;
  while ((x = re.exec(html))) {
    const slug = x[3];
    if (!slug || seen[slug]) continue;
    seen[slug] = true;
    const chunk = html.slice(Math.max(0, x.index - 40), Math.min(html.length, x.index + 1600));
    let title =
      cleanTitle((/<h3[^>]*>([^<]+)/i.exec(chunk) || [])[1] || "") ||
      cleanTitle(attrOf(chunk, "alt")) ||
      slug.replace(/-/g, " ");
    // Miniatura del capítulo del home; si es portada horizontal sirve como poster temporal
    let poster = cleanImg(attrOf(chunk, "data-src") || attrOf(chunk, "src"));
    if (/capblank|anime\.png/i.test(poster)) poster = "";
    const item = mkItem(slug, title, poster, false);
    if (item) items.push(item);
  }
  return items;
}

function hasNextPage(html, page) {
  return (
    new RegExp("[?&]page=" + (page + 1) + "(?![0-9])").test(html) ||
    new RegExp("[?&]pagina=" + (page + 1) + "(?![0-9])").test(html)
  );
}

// ---------- search / home / browse ----------

export async function search(query) {
  const q = cleanQuery(query && query.q);
  if (q.length < 2) return [];
  const page = await getPage(BASE + "/buscar?q=" + encodeURIComponent(q));
  let items = cardsAnime(page.html).slice(0, 40);
  if (items.length) return items;
  // Autocompletado AJAX
  try {
    const r = await kino.fetch(BASE + "/buscar_ajax?q=" + encodeURIComponent(q), {
      headers: { "User-Agent": UA, "X-Requested-With": "XMLHttpRequest", Accept: "application/json" },
      timeoutMs: 10000,
    });
    if (r.ok) {
      const data = JSON.parse(r.text || "[]");
      const seen = {};
      items = [];
      for (const row of data) {
        const slug = slugFromAnimeUrl(row.url || "");
        if (!slug || seen[slug]) continue;
        seen[slug] = true;
        const item = mkItem(slug, row.nombre || slug, row.thumb ? cleanImg(row.thumb) : "", /pelicula/i.test(row.categoria || ""));
        if (item) items.push(item);
      }
    }
  } catch (e) {
    kino.log("search ajax: " + (e && e.message));
  }
  return items.slice(0, 40);
}

function savedRow(id) {
  const raw = cacheGet("row:" + id);
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw);
    if (saved && saved.t && Date.now() - saved.t < 8 * 60000) return saved.row;
  } catch (e) {
    /* ignore */
  }
  return null;
}
function saveRow(row) {
  try {
    cacheSet("row:" + row.id, JSON.stringify({ t: Date.now(), row: row }), 12 * 3600000);
  } catch (e) {
    /* ignore */
  }
}
async function loadRow(id, title, fetchFn) {
  const cached = savedRow(id);
  if (cached) return cached;
  const items = await fetchFn();
  const row = { id: id, title: title, items: items };
  saveRow(row);
  return row;
}

export async function home() {
  const rows = [];
  try {
    const row = await loadRow("ultimos", "Últimos capítulos", async () => {
      const page = await getPage(BASE + "/");
      return cardsEpisodes(page.html).slice(0, 24);
    });
    if (row.items && row.items.length) rows.push(row);
  } catch (e) {
    kino.log("home ultimos: " + (e && e.message));
  }
  try {
    const row = await loadRow("recientes", "Series recientes", async () => {
      const page = await getPage(BASE + "/");
      const idx = page.html.indexOf("Series recientes");
      const html = idx >= 0 ? page.html.slice(idx, idx + 50000) : page.html;
      return cardsAnime(html).slice(0, 24);
    });
    if (row.items && row.items.length) rows.push(row);
  } catch (e) {
    kino.log("home recientes: " + (e && e.message));
  }
  try {
    const row = await loadRow("emision", "En emisión", async () => {
      const page = await getPage(BASE + "/animes?estado=en+emision");
      return cardsAnime(page.html).slice(0, 24);
    });
    if (row.items && row.items.length) rows.push(row);
  } catch (e) {
    kino.log("home emision: " + (e && e.message));
  }
  return rows;
}

export async function browse(ref, cursor) {
  const pageNum = Math.max(1, parseInt(cursor || "1", 10) || 1);
  let url = BASE + "/animes";
  if (ref === "emision") url = BASE + "/animes?estado=en+emision";
  else if (ref === "peliculas") url = BASE + "/animes?tipo=pelicula";
  if (pageNum > 1) url += (url.indexOf("?") >= 0 ? "&" : "?") + "page=" + pageNum;
  const page = await getPage(url);
  const items = cardsAnime(page.html);
  const next = hasNextPage(page.html, pageNum) || items.length >= 20 ? String(pageNum + 1) : null;
  return { items: items, next: next };
}

// ---------- Episodios (solo datos del sitio) ----------
// data-ajax → {eps, perpage, paginate_url}
// paginate_url?p=N → {caps:[{episodio,url,thumb}]}

async function fetchCaplistMeta(ajaxUrl) {
  const r = await kino.fetch(ajaxUrl, {
    headers: {
      "User-Agent": UA,
      Accept: "application/json, */*",
      "X-Requested-With": "XMLHttpRequest",
      Referer: BASE + "/",
    },
    timeoutMs: 12000,
  });
  if (!r.ok) throw fail("unavailable", "HTTP " + r.status + " caplist", "siteDown");
  try {
    return JSON.parse(r.text || "{}");
  } catch (e) {
    throw fail("unavailable", "caplist JSON inválido", "noEpisodes");
  }
}

async function fetchCapsPage(paginateUrl, pageNum) {
  const join = paginateUrl.indexOf("?") >= 0 ? "&" : "?";
  const r = await kino.fetch(paginateUrl + join + "p=" + pageNum, {
    headers: {
      "User-Agent": UA,
      Accept: "application/json, */*",
      "X-Requested-With": "XMLHttpRequest",
      Referer: BASE + "/",
    },
    timeoutMs: 12000,
  });
  if (!r.ok) return [];
  try {
    return (JSON.parse(r.text || "{}").caps) || [];
  } catch (e) {
    return [];
  }
}

/** Extrae título, sinopsis, póster y géneros de la ficha HTML. */
function parseSeriesHtml(html, slug) {
  const series = { title: "", poster: "", backdrop: "", overview: "", genres: [] };

  // Título
  const h1m = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (h1m) series.title = decodeHtml(h1m[1].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
  if (!series.title) {
    const ogt = /property=["']og:title["'][^>]*content=["']([^"']+)["']/i.exec(html);
    if (ogt) {
      series.title = decodeHtml(ogt[1])
        .replace(/\s*Sub Español.*$/i, "")
        .replace(/\s*Online.*$/i, "")
        .replace(/\s*-\s*MonosChinos.*$/i, "")
        .trim();
    }
  }
  if (!series.title) series.title = slug.replace(/-/g, " ");

  // Póster vertical: og:image o thumbs/imagen
  const ogi = /property=["']og:image["'][^>]*content=["']([^"']+)["']/i.exec(html);
  if (ogi) series.poster = cleanImg(ogi[1]);
  if (!series.poster) {
    const ds = /data-src=["']([^"']*\/assets\/thumbs\/imagen\/[^"']+)["']/i.exec(html);
    if (ds) series.poster = cleanImg(ds[1]);
  }
  // Fondo: si la ficha ya trae /portada/ en algún img, usarla
  const portada = /(?:src|data-src)=["']([^"']*\/assets\/(?:img\/serie|thumbs)\/portada\/[^"']+)["']/i.exec(html);
  if (portada) series.backdrop = cleanImg(portada[1]).replace(/\.webp$/i, "").replace("/thumbs/portada/", "/img/serie/portada/");
  // Fondo horizontal del carrusel/hero si aún no se encontró
  if (!series.backdrop && series.poster) {
    const bd = posterToBackdrop(series.poster);
    series.backdrop = bd || series.poster;
  }
  if (!series.backdrop && series.poster) series.backdrop = series.poster;

  // Sinopsis: párrafo bajo "Sinopsis" / "Sobre la serie"
  const sin =
    /Sinopsis[\s\S]{0,200}<p[^>]*>([^<]{20,1200})<\/p>/i.exec(html) ||
    /Sobre la serie[\s\S]{0,200}<p[^>]*>([^<]{20,1200})<\/p>/i.exec(html);
  if (sin) {
    series.overview = decodeHtml(sin[1]).replace(/\s+/g, " ").trim().slice(0, 2000);
  } else {
    // Fallback: meta description sin el relleno SEO inicial
    const ogd =
      /property=["']og:description["'][^>]*content=["']([^"']+)["']/i.exec(html) ||
      /name=["']description["'][^>]*content=["']([^"']+)["']/i.exec(html);
    if (ogd) {
      let text = decodeHtml(ogd[1]);
      // "Ver TITLE online sub español gratis en MonosChinos. SINOPSIS REAL"
      const cut = text.split(/\.\s+/);
      if (cut.length >= 2) {
        // quitar la primera frase SEO
        text = cut.slice(1).join(". ").trim();
      }
      text = text
        .replace(/^Ver[\s\S]*?MonosChinos\.?\s*/i, "")
        .replace(/\s+/g, " ")
        .trim();
      if (text.length >= 40) series.overview = text.slice(0, 2000);
    }
  }

  // Géneros (chips o enlaces)
  const gset = [];
  const reG = /href=["'][^"']*(?:genero|genre|tag)[^"']*["'][^>]*>([^<]+)/gi;
  let g;
  while ((g = reG.exec(html))) {
    const name = decodeHtml(g[1]).replace(/\s+/g, " ").trim();
    if (name && name.length < 40 && gset.indexOf(name) < 0) gset.push(name);
  }
  // chips en el hero: spans pequeños de género
  if (!gset.length) {
    const reChip = /rounded-full[^>]*>(Acción|Aventura|Comedia|Drama|Fantas[ií]a|Horror|Romance|Ciencia Ficci[oó]n|Sobrenatural|Escolares|Militar|Mecha|Deportes|Misterio|Psicol[oó]gico|Thriller|Gore|Ecchi|Harem|Magia|Hist[oó]rico|M[uú]sica|Seinen|Shounen|Shoujo|Josei)[^<]*</gi;
    let c;
    while ((c = reChip.exec(html))) {
      const name = c[1];
      if (gset.indexOf(name) < 0) gset.push(name);
    }
  }
  if (gset.length) series.genres = gset.slice(0, 5);

  // Año desde "Temporada" / "Emisión"
  const y =
    /Emisi[oó]n<\/dt>\s*<dd[^>]*>[^<]*?(20\d{2})/i.exec(html) ||
    /Temporada<\/dt>\s*<dd[^>]*>[^<]*?(20\d{2})/i.exec(html);
  if (y) series.year = y[1];

  return series;
}

export async function episodes(ref) {
  const T = Date.now();
  const left = () => 18500 - (Date.now() - T);
  const m = /^a:([A-Za-z0-9._~-]+)$/.exec(String(ref || ""));
  if (!m) throw fail("not_found", "ref inválido: " + ref, "badRef");
  const slug = m[1];

  // 1) Ficha HTML
  let html = "";
  try {
    const page = await getPage(BASE + "/anime/" + slug, null, 14000);
    html = page.html || "";
  } catch (e) {
    throw fail("unavailable", "no se pudo abrir /anime/" + slug, "siteDown");
  }

  const series = parseSeriesHtml(html, slug);

  // 2) Lista de capítulos vía data-ajax
  const ajaxM =
    /class=["'][^"']*caplist[^"']*["'][^>]*data-ajax=["']([^"']+)["']/i.exec(html) ||
    /data-ajax=["']([^"']+)["'][^>]*class=["'][^"']*caplist/i.exec(html) ||
    /data-ajax=["']([^"']*ajax\/ajax_pagination\/\d+)["']/i.exec(html);

  if (!ajaxM) {
    throw fail("not_found", "sin data-ajax en " + slug, "noEpisodes");
  }

  const ajaxUrl = abs(ajaxM[1]);
  kino.log("episodes: " + slug + " ajax=" + ajaxUrl);

  let meta;
  try {
    meta = await fetchCaplistMeta(ajaxUrl);
  } catch (e) {
    throw fail("unavailable", "caplist: " + ((e && e.message) || e), "noEpisodes");
  }

  const epsMeta = (meta && meta.eps) || [];
  const perpage = parseInt((meta && meta.perpage) || 50, 10) || 50;
  const paginateUrl = (meta && meta.paginate_url) || "";
  const total = epsMeta.length;
  kino.log("episodes: total=" + total + " perpage=" + perpage);

  let caps = [];
  if (paginateUrl && total > 0) {
    const pages = Math.max(1, Math.ceil(total / perpage));
    const maxPages = Math.min(pages, 10);
    for (let p = 1; p <= maxPages && left() > 2000; p++) {
      try {
        const chunk = await fetchCapsPage(paginateUrl, p);
        for (const c of chunk) caps.push(c);
      } catch (e) {
        kino.log("caps p" + p + ": " + ((e && e.message) || e));
      }
    }
  }

  const list = [];
  const seen = {};

  if (caps.length) {
    for (const c of caps) {
      const n = parseInt(c.episodio, 10);
      if (!n || seen[n]) continue;
      seen[n] = true;
      let epSlug = slug;
      const ver = slugFromVerUrl(c.url || "");
      if (ver && ver.slug) epSlug = ver.slug;
      const still = c.thumb ? cleanImg(c.thumb) : "";
      list.push({
        season: 1,
        number: n,
        ref: "e:" + epSlug + ":" + n,
        title: t("episode") + n,
        still: still,
      });
    }
  } else if (epsMeta.length) {
    for (const e of epsMeta) {
      const n = parseInt(e.num, 10);
      if (!n || seen[n]) continue;
      seen[n] = true;
      list.push({
        season: 1,
        number: n,
        ref: "e:" + slug + ":" + n,
        title: t("episode") + n,
      });
    }
  }

  if (!list.length) {
    throw fail("not_found", "0 capítulos para " + slug, "noEpisodes");
  }
  list.sort((a, b) => a.number - b.number);

  // Si algún capítulo no tiene still, usar el póster de la serie
  if (series.poster) {
    for (const ep of list) {
      if (!ep.still) ep.still = series.poster;
    }
  }

  kino.log("episodes OK: " + slug + " → " + list.length + " caps | poster=" + (series.poster ? "sí" : "no"));
  return { series: series, episodes: list };
}

// ---------- Servidores ----------

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
  savefiles: "SaveFiles",
  hexload: "Hexload",
  netu: "Netu",
  generic: "Servidor",
};

function detectKind(name, url) {
  const n = String(name || "");
  const u = String(url || "");
  if (/mixdrop|mxdrop/i.test(n) || /mixdrop\./i.test(u)) return "mixdrop";
  if (/mp4upload/i.test(n) || /mp4upload\./i.test(u)) return "mp4upload";
  if (/lulu/i.test(n) || /lulu(vdo|stream|vid)?\./i.test(u)) return "lulu";
  if (/voe/i.test(n) || /voe\./i.test(u)) return "voe";
  if (/uqload/i.test(n) || /uqload\./i.test(u)) return "uqload";
  if (/vidhide|streamhide/i.test(n) || /vidhide|streamhide/i.test(u)) return "vidhide";
  if (/savefiles?|streamhls/i.test(n) || /savefiles?\.|streamhls\./i.test(u)) return "savefiles";
  if (/dood|dsvplay/i.test(n) || /dood|dsvplay\./i.test(u)) return "dood";
  if (/filemoon|byse/i.test(n) || /filemoon|byse/i.test(u)) return "filemoon";
  if (/streamwish|wish/i.test(n) || /streamwish|wish\./i.test(u)) return "streamwish";
  if (/netu|hqq|waaw/i.test(n) || /hqq\.|waaw\.|netu\./i.test(u)) return "netu";
  if (/hexload/i.test(n) || /hexload\./i.test(u)) return "hexload";
  if (/yourupload/i.test(n) || /yourupload\./i.test(u)) return "yourupload";
  if (/mega/i.test(n) || /mega\.nz/i.test(u)) return "mega";
  return "generic";
}

function listServers(html) {
  const servers = [];
  const seen = {};
  const re = /data-player=["']([^"']+)["'][^>]*>([^<]*)</gi;
  let x;
  while ((x = re.exec(html))) {
    const url = b64text(x[1]).trim();
    if (!url || !/^https?:\/\//i.test(url)) continue;
    const name = String(x[2] || "").replace(/\s+/g, " ").trim() || "servidor";
    const kind = detectKind(name, url);
    if (kind === "mega") continue;
    const key = kind + "|" + url;
    if (seen[key]) continue;
    seen[key] = true;
    servers.push({ name: name, url: url, kind: kind });
  }
  const orderMap = {
    mixdrop: 1,
    mp4upload: 2,
    lulu: 3,
    voe: 4,
    uqload: 5,
    vidhide: 6,
    savefiles: 7,
    hexload: 7,
    dood: 8,
    netu: 10,
    generic: 15,
    filemoon: 18,
    streamwish: 19,
  };
  servers.sort((a, b) => (orderMap[a.kind] || 15) - (orderMap[b.kind] || 15));
  return servers;
}

function serverLabel(s, all) {
  const base = KIND_LABEL[s.kind] || s.name || "Servidor";
  const same = all.filter((x) => x.kind === s.kind);
  if (same.length <= 1) return base;
  return base + " " + (same.indexOf(s) + 1);
}

function jsUnpack(source) {
  try {
    const m = /}\s*\(\s*'((?:\\'|[^'])*)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:\\'|[^'])*)'\s*\.split\s*\(\s*'\|'\s*\)/.exec(source);
    if (!m) return "";
    const payload = m[1].replace(/\\'/g, "'").replace(/\\\\/g, "\\");
    const radix = parseInt(m[2], 10);
    let count = parseInt(m[3], 10);
    const words = m[4].split("|");
    const trie = {};
    while (count--) trie[count.toString(radix)] = words[count] || count.toString(radix);
    return payload.replace(/\b\w+\b/g, (w) => (trie.hasOwnProperty(w) ? trie[w] : w));
  } catch (e) {
    return "";
  }
}
function unpackAll(html) {
  let out = "";
  const re = /eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*[rd]\s*\)[\s\S]*?\)\s*\)/g;
  let x;
  while ((x = re.exec(html))) {
    const u = jsUnpack(x[0]);
    if (u) out += "\n" + u;
  }
  return out;
}
function findStreamUrl(html) {
  const patterns = [
    /https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/i,
    /https?:\/\/[^"'\s<>]+\.mp4[^"'\s<>]*/i,
    /["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i,
    /["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i,
    /file\s*:\s*["'](https?:\/\/[^"']+)["']/i,
    /src\s*:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i,
  ];
  for (const re of patterns) {
    const m = re.exec(html);
    if (m) return unslash(m[1] || m[0]);
  }
  return "";
}
function streamResult(url, referer, label) {
  return { url: url, headers: { Referer: referer || BASE + "/", "User-Agent": UA }, alts: [], label: label || "" };
}
function goneIn(html) {
  return /File Not Found|deleted|not found|removed|no (longer|existe)|expirad/i.test(html || "");
}

function voeExtract(html) {
  return findStreamUrl(html) || findStreamUrl(unpackAll(html));
}
async function voeStream(embed) {
  const page = await getPage(embed, { Referer: BASE + "/" });
  const file = voeExtract(page.html);
  if (!file) throw fail("unavailable", goneIn(page.html) ? "Voe borrado" : "Voe sin video", "serverFailed");
  return streamResult(file, originOf(page.url) + "/", "Voe");
}

async function packerStream(embed, label) {
  const page = await getPage(embed, { Referer: BASE + "/" });
  const html = page.html;
  if (/just a moment|cf-browser-verification/i.test(html) && html.length < 12000) {
    throw fail("unavailable", label + " bloqueado (Cloudflare)", "serverFailed");
  }
  if (/filemoon|byse/i.test(label) && /type=["']module["']/.test(html) && !/\.m3u8/i.test(html)) {
    throw fail("unavailable", "Filemoon usa un reproductor protegido (SPA); prueba MixDrop, Mp4Upload o LuluStream", "serverFailed");
  }
  let file = findStreamUrl(html);
  if (!file) file = findStreamUrl(unpackAll(html));
  if (!file) throw fail("unavailable", goneIn(html) ? label + " borrado" : label + " sin video", "serverFailed");
  if (file.indexOf("//") === 0) file = "https:" + file;
  return streamResult(file, originOf(page.url) + "/", label);
}

function randomAlpha(n) {
  const abc = "abcdefghijklmnopqrstuvwxyz";
  let s = "";
  for (let i = 0; i < n; i++) s += abc.charAt(Math.floor(Math.random() * abc.length));
  return s;
}
async function doodStream(embed) {
  const page = await getPage(embed, { Referer: BASE + "/" });
  const m = /\/pass_md5\/([^"'\s]+)/.exec(page.html);
  if (!m) throw fail("unavailable", goneIn(page.html) ? "Dood borrado" : "Dood sin video", "serverFailed");
  const pass = await getPage(originOf(page.url) + "/pass_md5/" + m[1], { Referer: page.url });
  const token = String(pass.html || "").trim();
  if (!token || token.length > 500) throw fail("unavailable", "Dood sin token", "serverFailed");
  const file = token + randomAlpha(10) + "?token=" + (m[1].split("/").pop() || "") + "&expiry=" + Date.now();
  return streamResult(file.indexOf("http") === 0 ? file : originOf(page.url) + file, originOf(page.url) + "/", "Doodstream");
}

async function mixdropStream(embed) {
  return packerStream(String(embed).replace("/f/", "/e/"), "MixDrop");
}
async function netuStream(embed) {
  const page = await getPage(embed, { Referer: BASE + "/", Origin: originOf(embed) });
  const html = page.html;
  let file = findStreamUrl(html) || findStreamUrl(unpackAll(html));
  if (!file) {
    const m = /src\s*:\s*['"](https?:\/\/[^'"]+\.m3u8[^'"]*)['"]/i.exec(html);
    if (m) file = m[1];
  }
  if (!file) throw fail("unavailable", "Netu sin video", "serverFailed");
  if (file.indexOf("//") === 0) file = "https:" + file;
  return {
    url: file,
    headers: { Referer: originOf(page.url) + "/", Origin: originOf(page.url), "User-Agent": UA, Accept: "*/*" },
    alts: [],
    label: "Netu",
  };
}

async function streamFor(s) {
  switch (s.kind) {
    case "voe":
      return voeStream(s.url);
    case "dood":
      return doodStream(s.url);
    case "mixdrop":
      return mixdropStream(s.url);
    case "netu":
      return netuStream(s.url);
    case "mp4upload":
      return packerStream(s.url, "Mp4Upload");
    case "uqload":
      return packerStream(s.url, "Uqload");
    case "lulu":
    case "vidhide":
    case "savefiles":
    case "hexload":
    case "filemoon":
    case "streamwish":
    case "yourupload":
      return packerStream(s.url, KIND_LABEL[s.kind] || s.name);
    default:
      return packerStream(s.url, "Servidor");
  }
}

function parseRef(ref) {
  let m = /^e:([A-Za-z0-9._~-]+):(\d+)$/.exec(String(ref || ""));
  if (m) return { type: "ep", slug: m[1], num: parseInt(m[2], 10) };
  m = /^a:([A-Za-z0-9._~-]+)$/.exec(String(ref || ""));
  if (m) return { type: "anime", slug: m[1] };
  return null;
}

export async function resolve(ref) {
  const T = Date.now();
  const left = () => 18500 - (Date.now() - T);
  const p = parseRef(ref);
  if (!p || p.type !== "ep") throw fail("not_found", "ref " + ref, "badRef");

  const pageUrl = BASE + "/ver/" + p.slug + "-episodio-" + p.num;
  const page = await getPage(pageUrl, null, 14000);
  let servers = listServers(page.html);

  try {
    const pref = kino.config && kino.config.server;
    if (pref) {
      servers.sort((a, b) => {
        if (a.kind === pref && b.kind !== pref) return -1;
        if (b.kind === pref && a.kind !== pref) return 1;
        return 0;
      });
    }
  } catch (e) {
    /* ignore */
  }

  kino.log("resolve: " + p.slug + "-" + p.num + " servidores: " + (servers.map((s) => s.name).join(", ") || "ninguno"));

  if (!servers.length) throw fail("not_found", "sin servidores reproducibles", "noServers");

  const alts = [];
  const errors = [];
  let primary = null;

  for (const s of servers) {
    if (left() < 2500) break;
    try {
      const stream = await streamFor(s);
      if (!stream || !stream.url) continue;
      const entry = {
        url: stream.url,
        name: serverLabel(s, servers),
        headers: stream.headers || { Referer: originOf(s.url) + "/", "User-Agent": UA },
      };
      if (!primary) primary = entry;
      else alts.push(entry);
    } catch (e) {
      errors.push((KIND_LABEL[s.kind] || s.name) + ": " + reasonOf(e));
      kino.log("resolve: " + s.kind + " falló: " + ((e && e.message) || e));
    }
  }

  if (!primary) {
    throw fail("unavailable", "ningún servidor abrió (" + errors.slice(0, 4).join("; ") + ")", "serverFailed");
  }

  return {
    url: primary.url,
    headers: primary.headers,
    alts: alts.map((a) => ({ url: a.url, name: a.name, headers: a.headers })),
  };
}
