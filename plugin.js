// MonosChinos Kino plugin 3.3.0 - https://monoschinos.st
// Modelo TioAnime: r.text() metodo, kino.html.select, hosts de redirects.

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
function posterToBackdrop(poster) {
  // El sitio no publica un banner aparte fiable: usar el mismo poster como fondo
  return String(poster || "");
}

// Cloudflare de monoschinos.st bloquea el User-Agent OkHttp de Kino (403).
// AniList CDN si acepta OkHttp: usamos solo caratulas/fondos; titulos y caps del sitio.
async function anilistPoster(title) {
  const q = String(title || "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (q.length < 2) return null;
  const key = "al:" + q.toLowerCase();
  try {
    const hit = kino.storage.get(key);
    if (hit === "") return null;
    if (hit && hit.poster) return hit;
  } catch (e) {}
  try {
    const body = JSON.stringify({
      query: "query($s:String){Page(page:1,perPage:3){media(search:$s,type:ANIME){title{romaji english native}coverImage{large extraLarge}bannerImage}}}",
      variables: { s: q },
    });
    const r = await kino.fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: {
        "User-Agent": UA,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body,
      timeoutMs: 6000,
    });
    if (!r || !r.ok) {
      try { kino.storage.set(key, "", { ttlMs: 6 * 3600000 }); } catch (e) {}
      return null;
    }
    const text = bodyText(r);
    const data = JSON.parse(text);
    const list = (((data || {}).data || {}).Page || {}).media || [];
    if (!list.length) {
      try { kino.storage.set(key, "", { ttlMs: 6 * 3600000 }); } catch (e) {}
      return null;
    }
    // Elegir el primer resultado con cover
    let best = null;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      const poster = (c.coverImage && (c.coverImage.extraLarge || c.coverImage.large)) || "";
      if (!poster) continue;
      best = { poster: poster, backdrop: c.bannerImage || poster };
      break;
    }
    if (!best) {
      try { kino.storage.set(key, "", { ttlMs: 6 * 3600000 }); } catch (e) {}
      return null;
    }
    try { kino.storage.set(key, best, { ttlMs: 14 * 86400000 }); } catch (e) {}
    return best;
  } catch (e) {
    kino.log("anilist: " + ((e && e.message) || e));
    return null;
  }
}

async function enrichPosters(items, budgetMs) {
  const T = Date.now();
  const out = items.slice();
  const limit = Math.min(out.length, 18);
  let i = 0;
  async function worker() {
    while (i < limit && Date.now() - T < budgetMs) {
      const idx = i++;
      const it = out[idx];
      if (!it || !it.title) continue;
      // Si ya hay poster del sitio, igual lo sustituimos: Kino no puede cargarlo (CF+OkHttp)
      const al = await anilistPoster(it.title);
      if (al && al.poster) {
        out[idx] = Object.assign({}, it, { poster: al.poster });
      }
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  return out;
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

function mkItem(slug, title, poster, movie) {
  if (!slug || !ID_OK.test(slug)) return null;
  // Quitar sufijo -sub-espanol del id visible si hace ruido, pero mantener slug real en ref
  const item = {
    id: slug,
    kind: movie ? "movie" : "series",
    title: String(title || slug.replace(/-sub-espanol$/i, "").replace(/-/g, " ")).slice(0, 200),
    ref: "a:" + slug,
  };
  if (poster) item.poster = poster;
  return item;
}

// Tarjetas <article>: regex fiable sobre data-src (src es placeholder anime.png)
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
    const h3 = /<h3[^>]*>([^<]{2,220})/i.exec(box);
    if (h3) title = decodeHtml(h3[1]).replace(/\s+/g, " ").trim();
    if (!title) {
      const al = /alt=["']([^"']+)["']/i.exec(box);
      if (al) title = decodeHtml(al[1]).trim();
    }
    if (!title) title = slug.replace(/-sub-espanol$/i, "").replace(/-/g, " ");

    // data-src tiene la caratula real; src suele ser /img/anime.png
    let src = "";
    const ds = /data-src=["']([^"']+)["']/i.exec(box);
    if (ds) src = ds[1];
    if (!src || /anime\.png/i.test(src)) {
      const ss = /src=["']([^"']*assets[^"']+)["']/i.exec(box);
      if (ss) src = ss[1];
    }
    const poster = cleanImg(src);
    const movie = !!opts.movies;
    const item = mkItem(slug, title, poster, movie);
    if (item) items.push(item);
  }
  return items;
}

function hasNextPage(html, page) {
  return new RegExp("[?&]page=" + (page + 1) + "(?![0-9])").test(String(html || ""));
}

export async function search(query) {
  const q = String((query && query.q) || "").replace(/\s+/g, " ").trim().slice(0, 100);
  if (q.length < 2) return [];
  try {
    const page = await getPage(BASE + "/buscar?q=" + encodeURIComponent(q));
    let items = cardsFrom(page.html).slice(0, 30);
    items = await enrichPosters(items, 10000);
    return items;
  } catch (e) {
    kino.log("search: " + ((e && e.message) || e));
  }
  return [];
}

export async function home() {
  const rows = [];
  const T = Date.now();

  // 1) En emision = "Series recientes" de la portada
  try {
    const page = await getPage(BASE + "/");
    let slice = page.html;
    const a = page.html.indexOf("Series recientes");
    const b = page.html.indexOf("Generos populares");
    if (a >= 0) slice = page.html.slice(a, b > a ? b : a + 60000);
    let items = cardsFrom(slice);
    items = await enrichPosters(items.slice(0, 24), 9000);
    kino.log("home emision: " + items.length + (items[0] && items[0].poster ? " p=" + items[0].poster.slice(0, 50) : " SIN POSTER"));
    if (items.length) rows.push({ id: "emision", title: "En emision", items: items });
  } catch (e) {
    kino.log("home emision: " + ((e && e.message) || e));
  }

  // 2) Animes
  try {
    if (Date.now() - T < 16000) {
      const page = await getPage(BASE + "/animes");
      let items = cardsFrom(page.html);
      items = await enrichPosters(items.slice(0, 24), 7000);
      kino.log("home animes: " + items.length + (items[0] && items[0].poster ? " p=" + items[0].poster.slice(0, 50) : " SIN POSTER"));
      if (items.length) rows.push({ id: "animes", title: "Animes", items: items });
    }
  } catch (e) {
    kino.log("home animes: " + ((e && e.message) || e));
  }

  // 3) Peliculas
  try {
    if (Date.now() - T < 17500) {
      const page = await getPage(BASE + "/animes?categoria=pelicula");
      let items = cardsFrom(page.html, { movies: true });
      items = await enrichPosters(items.slice(0, 24), 5000);
      kino.log("home peliculas: " + items.length + (items[0] && items[0].poster ? " p=" + items[0].poster.slice(0, 50) : " SIN POSTER"));
      if (items.length) rows.push({ id: "peliculas", title: "Peliculas", items: items });
    }
  } catch (e) {
    kino.log("home peliculas: " + ((e && e.message) || e));
  }

  return rows;
}

export async function browse(ref, cursor) {
  const pageNum = Math.max(1, parseInt(cursor || "1", 10) || 1);
  let url = BASE + "/animes";
  let movies = false;
  if (ref === "emision") {
    // Sin filtro server-side real: primera pagina = recientes de /animes
    url = BASE + "/animes";
  } else if (ref === "peliculas") {
    url = BASE + "/animes?categoria=pelicula";
    movies = true;
  } else if (ref === "animes") {
    url = BASE + "/animes";
  }
  if (pageNum > 1) url += (url.indexOf("?") >= 0 ? "&" : "?") + "page=" + pageNum;
  const page = await getPage(url);
  let items = cardsFrom(page.html, { movies: movies });
  items = await enrichPosters(items.slice(0, 30), 12000);
  const next = hasNextPage(page.html, pageNum) || items.length >= 20 ? String(pageNum + 1) : null;
  return { items: items, next: next };
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

function parseSeriesHtml(html, slug) {
  const series = { title: "", poster: "", backdrop: "", overview: "" };
  try {
    const h1 = kino.html.select(html, "h1")[0];
    if (h1 && h1.text) series.title = String(h1.text).replace(/\s+/g, " ").trim();
  } catch (e) {}
  if (!series.title) {
    const h1m = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
    if (h1m) series.title = decodeHtml(h1m[1].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
  }
  if (!series.title) series.title = slug.replace(/-sub-espanol$/i, "").replace(/-/g, " ");

  let og = "";
  try {
    const meta = kino.html.select(html, "meta[property=og:image]")[0];
    if (meta && meta.attrs && meta.attrs.content) og = meta.attrs.content;
  } catch (e) {}
  if (!og) {
    const ogi = /property=["']og:image["'][^>]*content=["']([^"']+)["']/i.exec(html)
      || /content=["']([^"']+)["'][^>]*property=["']og:image["']/i.exec(html);
    if (ogi) og = ogi[1];
  }
  series.poster = cleanImg(og) || cleanImg(og);
  if (!series.poster) {
    const ds = /data-src=["']([^"']*\/assets\/(?:img|thumbs)\/[^"']+)["']/i.exec(html);
    if (ds) series.poster = cleanImg(ds[1]);
  }
  series.backdrop = posterToBackdrop(series.poster) || series.poster || "";

  const sin = /Sinopsis[\s\S]{0,300}<p[^>]*>([^<]{20,1500})<\/p>/i.exec(html);
  if (sin) series.overview = decodeHtml(sin[1]).replace(/\s+/g, " ").trim().slice(0, 2000);
  else {
    const ogd = /property=["']og:description["'][^>]*content=["']([^"']+)["']/i.exec(html);
    if (ogd) {
      let text = decodeHtml(ogd[1]).replace(/^Ver[\s\S]*?MonosChinos\.?\s*/i, "").replace(/\s+/g, " ").trim();
      if (text.length >= 40) series.overview = text.slice(0, 2000);
    }
  }
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
    const alt = /sub-espanol$/i.test(slug) ? slug.replace(/-sub-espanol$/i, "") : slug + "-sub-espanol";
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

  const caps = [];
  if (paginateUrl && total > 0) {
    const pages = Math.min(10, Math.max(1, Math.ceil(total / perpage)));
    for (let p = 1; p <= pages && left() > 2000; p++) {
      try {
        const join = paginateUrl.indexOf("?") >= 0 ? "&" : "?";
        const data = await fetchJson(paginateUrl + join + "p=" + p);
        const chunk = (data && data.caps) || [];
        for (let i = 0; i < chunk.length; i++) caps.push(chunk[i]);
      } catch (e) {
        kino.log("caps p" + p + ": " + ((e && e.message) || e));
      }
    }
  }

  const list = [];
  const seen = {};
  if (caps.length) {
    for (let i = 0; i < caps.length; i++) {
      const c = caps[i];
      const n = parseInt(c.episodio, 10);
      if (!n || seen[n]) continue;
      seen[n] = true;
      let epSlug = slug.replace(/-sub-espanol$/i, "");
      const vm = /\/ver\/([A-Za-z0-9._~-]+)-episodio-(\d+)/.exec(String(c.url || ""));
      if (vm) epSlug = vm[1];
      list.push({
        season: 1,
        number: n,
        ref: "e:" + epSlug + ":" + n,
        title: t("episode") + n,
        still: c.thumb ? cleanImg(c.thumb) : (series.poster || ""),
      });
    }
  } else {
    for (let i = 0; i < epsMeta.length; i++) {
      const n = parseInt(epsMeta[i].num, 10);
      if (!n || seen[n]) continue;
      seen[n] = true;
      list.push({
        season: 1,
        number: n,
        ref: "e:" + slug.replace(/-sub-espanol$/i, "") + ":" + n,
        title: t("episode") + n,
        still: series.poster || "",
      });
    }
  }

  if (!list.length) throw fail("not_found", "0 capitulos", "noEpisodes");
  list.sort(function (a, b) { return a.number - b.number; });
  // Caratula/fondo desde AniList (el CDN del sitio da 403 al cargador de Kino)
  try {
    const al = await anilistPoster(series.title);
    if (al) {
      if (al.poster) series.poster = al.poster;
      if (al.backdrop) series.backdrop = al.backdrop;
    }
  } catch (e) {}
  // stills de caps: el sitio tambien bloquea OkHttp; dejamos URL por si acaso
  kino.log("episodes OK " + slug + " -> " + list.length + " poster=" + (series.poster || "").slice(0, 60));
  return { series: series, episodes: list };
}

const KIND_LABEL = {
  voe: "Voe", filemoon: "Filemoon", streamwish: "StreamWish", dood: "Doodstream",
  mixdrop: "MixDrop", mp4upload: "Mp4Upload", lulu: "LuluStream", vidhide: "Vidhide",
  uqload: "Uqload", savefiles: "SaveFiles", hexload: "Hexload", netu: "Netu", generic: "Servidor",
};

function detectKind(name, url) {
  const n = String(name || "");
  const u = String(url || "");
  if (/mixdrop|mxdrop/i.test(n) || /mixdrop\.|mxdrop\./i.test(u)) return "mixdrop";
  if (/mp4upload/i.test(n) || /mp4upload\./i.test(u)) return "mp4upload";
  if (/lulu/i.test(n) || /lulu(vdo|stream)/i.test(u)) return "lulu";
  if (/voe/i.test(n) || /voe\./i.test(u)) return "voe";
  if (/uqload/i.test(n) || /uqload\./i.test(u)) return "uqload";
  if (/vidhide|streamhide/i.test(n + u)) return "vidhide";
  if (/savefiles?|streamhls/i.test(n + u)) return "savefiles";
  if (/hexload/i.test(n + u)) return "hexload";
  if (/dood|dsvplay/i.test(n + u)) return "dood";
  if (/filemoon|byse/i.test(n + u)) return "filemoon";
  if (/streamwish|\bwish\b/i.test(n + u)) return "streamwish";
  if (/netu|hqq|waaw/i.test(n + u)) return "netu";
  if (/mega/i.test(n + u)) return "mega";
  return "generic";
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
    if (kind === "mega") continue;
    const key = kind + "|" + url;
    if (seen[key]) continue;
    seen[key] = true;
    servers.push({ name: name, url: url, kind: kind });
  }
  const order = { mixdrop: 1, mp4upload: 2, lulu: 3, voe: 4, savefiles: 5, dood: 8, filemoon: 18, streamwish: 19, generic: 15 };
  servers.sort(function (a, b) { return (order[a.kind] || 15) - (order[b.kind] || 15); });
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

function jsUnpack(source) {
  try {
    const m =
      /}\s*\(\s*'((?:\\'|[^'])*)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:\\'|[^'])*)'\s*\.split\s*\(\s*'\|'\s*\)/.exec(source) ||
      /\}\('((?:\\'|[^'])*)',(\d+),(\d+),'((?:\\'|[^'])*)'\.split\('\|'\)/.exec(source);
    if (!m) return "";
    const payload = m[1].replace(/\\'/g, "'").replace(/\\\\/g, "\\");
    const radix = parseInt(m[2], 10);
    const count = parseInt(m[3], 10);
    const words = m[4].split("|");
    const trie = {};
    for (let i = 0; i < count; i++) trie[i.toString(radix)] = words[i] || i.toString(radix);
    return payload.replace(/\b\w+\b/g, function (w) {
      return Object.prototype.hasOwnProperty.call(trie, w) ? trie[w] : w;
    });
  } catch (e) {
    return "";
  }
}
function unpackAll(html) {
  const src = String(html || "");
  const u = jsUnpack(src);
  if (u) return u;
  return "";
}

function findStreamUrl(html) {
  const src = String(html || "");
  let m = /MDCore\.wurl\s*=\s*["']([^"']+)["']/i.exec(src);
  if (m && /\.(mp4|m3u8)/i.test(m[1])) return unslash(m[1]);
  m = /\bwurl\s*=\s*["']([^"']+)["']/i.exec(src);
  if (m && /\.(mp4|m3u8)/i.test(m[1])) return unslash(m[1]);
  const patterns = [
    /https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/i,
    /https?:\/\/[^"'\s<>]+\.mp4[^"'\s<>]*/i,
    /\/\/[a-z0-9.-]+(?::\d+)?\/[^"'\s<>]+\.m3u8[^"'\s<>]*/i,
    /\/\/[a-z0-9.-]+(?::\d+)?\/[^"'\s<>]+\.mp4[^"'\s<>]*/i,
    /["']((?:https?:)?\/\/[^"']+\.m3u8[^"']*)["']/i,
    /["']((?:https?:)?\/\/[^"']+\.mp4[^"']*)["']/i,
    /file\s*:\s*["']((?:https?:)?\/\/[^"']+)["']/i,
    /src\s*:\s*["']((?:https?:)?\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/i,
  ];
  for (let i = 0; i < patterns.length; i++) {
    const mm = patterns[i].exec(src);
    if (mm) return unslash(mm[1] || mm[0]);
  }
  // mp4upload style: a3.mp4upload.com:183/d/.../video.mp4
  m = /https?:\/\/[a-z0-9.-]+(?::\d+)?\/d\/[^"'\s<>]+\/video\.mp4/i.exec(src);
  if (m) return m[0];
  return "";
}

function streamResult(url, referer, label) {
  return {
    url: url,
    headers: { Referer: referer || BASE + "/", "User-Agent": UA },
    alts: [],
    label: label || "",
  };
}
function goneIn(html) {
  return /File Not Found|deleted|not found|removed|no (longer|existe)|expirad|File was deleted/i.test(String(html || ""));
}

async function packerStream(embed, label) {
  const page = await getPage(embed, { Referer: BASE + "/" }, 14000);
  const html = page.html;
  kino.log(label + " len=" + html.length + " host=" + originOf(page.url));
  if (html.length < 500 && /just a moment|cf-browser|challenge/i.test(html)) {
    throw fail("unavailable", label + " bloqueado CF", "serverFailed");
  }
  if (/filemoon|byse/i.test(label) && /type=["']module["']/.test(html) && !/\.m3u8/i.test(html) && !/MDCore/i.test(html)) {
    throw fail("unavailable", "Filemoon protegido (SPA)", "serverFailed");
  }
  const unpacked = unpackAll(html);
  let file = findStreamUrl(unpacked) || findStreamUrl(html);
  if (!file) throw fail("unavailable", goneIn(html) ? label + " borrado" : label + " sin video", "serverFailed");
  file = String(file).replace(/\\/g, "");
  if (file.indexOf("//") === 0) file = "https:" + file;
  if (!/^https?:\/\//i.test(file)) throw fail("unavailable", label + " URL invalida", "serverFailed");
  kino.log(label + " OK " + file.slice(0, 60));
  return streamResult(file, originOf(page.url) + "/", label);
}

function randomAlpha(n) {
  const abc = "abcdefghijklmnopqrstuvwxyz";
  let s = "";
  for (let i = 0; i < n; i++) s += abc.charAt(Math.floor(Math.random() * 26));
  return s;
}
async function doodStream(embed) {
  const page = await getPage(embed, { Referer: BASE + "/" });
  const m = /\/pass_md5\/([^"'\s]+)/.exec(page.html);
  if (!m) throw fail("unavailable", goneIn(page.html) ? "Dood borrado" : "Dood sin video", "serverFailed");
  const pass = await getPage(originOf(page.url) + "/pass_md5/" + m[1], { Referer: page.url });
  const tok = String(pass.html || "").trim();
  if (!tok || tok.length > 500) throw fail("unavailable", "Dood sin token", "serverFailed");
  const parts = m[1].split("/");
  const file = tok + randomAlpha(10) + "?token=" + (parts[parts.length - 1] || "") + "&expiry=" + Date.now();
  const full = file.indexOf("http") === 0 ? file : originOf(page.url) + file;
  return streamResult(full, originOf(page.url) + "/", "Doodstream");
}

async function streamFor(s) {
  switch (s.kind) {
    case "dood": return doodStream(s.url);
    case "mixdrop": return packerStream(String(s.url).replace("/f/", "/e/"), "MixDrop");
    case "mp4upload": return packerStream(s.url, "Mp4Upload");
    case "voe": return packerStream(s.url, "Voe");
    case "lulu":
    case "vidhide":
    case "savefiles":
    case "hexload":
    case "filemoon":
    case "streamwish":
    case "uqload":
    case "netu":
      return packerStream(s.url, KIND_LABEL[s.kind] || s.name);
    default:
      return packerStream(s.url, "Servidor");
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
  const T = Date.now();
  function left() { return 18500 - (Date.now() - T); }
  const p = parseResolveRef(ref);
  if (!p) throw fail("not_found", "ref " + ref, "badRef");

  const page = await getPage(BASE + "/ver/" + p.slug + "-episodio-" + p.num, null, 14000);
  let servers = listServers(page.html);

  try {
    const pref = (kino.config && (kino.config.server || (kino.config.get && kino.config.get("server")))) || "";
    if (pref) {
      servers = servers.slice().sort(function (a, b) {
        if (a.kind === pref && b.kind !== pref) return -1;
        if (b.kind === pref && a.kind !== pref) return 1;
        return 0;
      });
    }
  } catch (e) {}

  kino.log(
    "resolve " + p.slug + "-" + p.num +
      (p.idx >= 0 ? " server#" + p.idx : "") +
      ": " + servers.map(function (s) { return s.name; }).join(", ")
  );
  if (!servers.length) throw fail("not_found", "sin servidores", "noServers");

  // Un server concreto (alternativa del menu / reintento automatico)
  if (p.idx >= 0) {
    const s = servers[p.idx];
    if (!s) throw fail("not_found", "servidor " + p.idx + " no existe", "noServers");
    const stream = await streamFor(s);
    return {
      url: stream.url,
      headers: stream.headers || { Referer: originOf(s.url) + "/", "User-Agent": UA },
      label: serverLabel(s, servers),
      expiresInSeconds: 1800,
    };
  }

  // Primera resolucion: abrir el preferido; el resto quedan como alternativas diferidas.
  // Si el principal falla, Kino prueba las alternatives automaticamente.
  let main = null;
  let used = null;
  const failures = [];
  const rest = [];

  for (let i = 0; i < servers.length; i++) {
    const s = servers[i];
    if (main) {
      rest.push({ s: s, idx: i });
      continue;
    }
    if (left() < 3000) {
      rest.push({ s: s, idx: i });
      continue;
    }
    try {
      main = await streamFor(s);
      used = { s: s, idx: i };
    } catch (e) {
      failures.push(serverLabel(s, servers) + ": " + reasonOf(e));
      kino.log("resolve " + s.kind + ": " + ((e && e.message) || e));
      // Si falla, el siguiente del bucle se intentara en caliente
    }
  }

  if (!main) {
    throw fail(
      "unavailable",
      "ningun servidor (" + failures.slice(0, 4).join("; ") + ")",
      "serverFailed"
    );
  }

  const stream = {
    url: main.url,
    headers: main.headers || { Referer: originOf(used.s.url) + "/", "User-Agent": UA },
    label: serverLabel(used.s, servers),
    expiresInSeconds: 1800,
  };

  // Alternativas diferidas: Kino las resuelve solo si el principal falla o el usuario cambia de servidor
  const alternatives = [];
  for (let i = 0; i < rest.length && alternatives.length < 8; i++) {
    const r = rest[i];
    alternatives.push({
      label: serverLabel(r.s, servers),
      ref: "s:" + r.idx + ":e:" + p.slug + ":" + p.num,
    });
  }
  // Si el preferido fallo y abrimos el 2º, aun asi listar los que no se probaron
  // Tambien anadir los que fallaron? No: solo los no intentados, para no repetir errores.
  if (alternatives.length) stream.alternatives = alternatives;

  kino.log(
    "resolve OK " + stream.label +
      " + " + alternatives.length + " alternativas"
  );
  return stream;
}
