// MonosChinos Kino plugin - https://monoschinos.st - apiVersion 6
// QuickJS-safe. No setTimeout/fetch/URL/atob. Metadata from the site only.

const BASE = "https://monoschinos.st";
const UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";
const ID_OK = /^[A-Za-z0-9._~-]{1,128}$/;

const TXT = {
  notFound: { es: "No encontramos esto en el sitio.", en: "We could not find this on the site." },
  siteDown: { es: "El sitio no responde ahora. Intenta mas tarde.", en: "The site is not answering now. Try again later." },
  noServers: {
    es: "Este capitulo no tiene servidores reproducibles.",
    en: "This episode has no playable servers.",
  },
  serverFailed: {
    es: "No se pudo abrir el video. Prueba otro en el menu Servidor.",
    en: "Could not open the video. Try another one in the Servidor menu.",
  },
  badRef: { es: "Este titulo ya no es valido. Buscalo otra vez.", en: "This title is no longer valid. Search again." },
  noEpisodes: {
    es: "MonosChinos no pudo cargar los capitulos.",
    en: "MonosChinos could not load the episodes.",
  },
  episode: { es: "Capitulo ", en: "Episode " },
};

function lang() {
  try {
    return String(kino.lang || "es").toLowerCase().indexOf("en") === 0 ? "en" : "es";
  } catch (e) {
    return "es";
  }
}
function t(key) {
  const row = TXT[key];
  if (!row) return key;
  return row[lang()] || row.es || key;
}
function fail(code, detail, key) {
  return kino.error(code, String(detail || "").slice(0, 200), { userMessage: t(key) });
}
function reasonOf(e) {
  const m = String((e && e.message) || e || "");
  if (/borrad|deleted|not found|removed|HTTP 404/i.test(m)) return "video borrado";
  const h = /HTTP (\d{3})/.exec(m);
  if (h) return "HTTP " + h[1];
  if (/timeout|tardo|took too long/i.test(m)) return "tardo demasiado";
  if (/sin video/i.test(m)) return "sin video";
  if (/SPA|protegido/i.test(m)) return m.slice(0, 80);
  return "fallo";
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
    .replace(/&#(\d+);/g, function (_m, n) {
      return String.fromCharCode(parseInt(n, 10));
    })
    .replace(/&nbsp;/g, " ");
}
function attrOf(chunk, name) {
  const dq = new RegExp("\\b" + name + "\\s*=\\s*\"([^\"]*)\"", "i").exec(chunk);
  if (dq) return decodeHtml(dq[1]);
  const sq = new RegExp("\\b" + name + "\\s*=\\s*'([^']*)'", "i").exec(chunk);
  return sq ? decodeHtml(sq[1]) : "";
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
function posterToBackdrop(poster) {
  const u = String(poster || "");
  const m = /\/assets\/(?:img\/serie|thumbs)\/imagen\/([^\/?#]+?)-(\d+)\.(?:jpg|jpeg|png|webp)/i.exec(u);
  if (m) {
    const name = m[1].replace(/-T\d+$/i, "");
    return BASE + "/assets/img/serie/portada/" + name + "-portada-" + m[2] + ".jpg";
  }
  const p = /\/assets\/thumbs\/portada\/([^\/?#]+)/i.exec(u);
  if (p) {
    const name = p[1].replace(/\.webp$/i, "").replace(/\.jpg$/i, "");
    return BASE + "/assets/img/serie/portada/" + name + ".jpg";
  }
  return "";
}

async function getPage(url, headers, timeoutMs) {
  const h = { "User-Agent": UA, Accept: "text/html,application/json,*/*" };
  if (headers) {
    for (const k in headers) {
      if (Object.prototype.hasOwnProperty.call(headers, k)) h[k] = headers[k];
    }
  }
  const r = await kino.fetch(url, { headers: h, timeoutMs: timeoutMs || 15000 });
  if (!r || !r.ok) {
    const st = r ? r.status : 0;
    throw fail("unavailable", "HTTP " + st + " " + url, "siteDown");
  }
  return { url: r.url || url, html: String(r.text || "") };
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

function cardsAnime(html) {
  const src = String(html || "");
  const items = [];
  const seen = {};
  const re = /\/anime\/([A-Za-z0-9._~-]+)/g;
  let x;
  while ((x = re.exec(src))) {
    const slug = x[1];
    if (!slug || seen[slug]) continue;
    seen[slug] = true;
    const start = x.index - 80;
    const from = start < 0 ? 0 : start;
    const chunk = src.slice(from, x.index + 1400);
    let poster = attrOf(chunk, "data-src");
    if (!poster || /anime\.png/i.test(poster)) {
      const s = attrOf(chunk, "src");
      if (s && /assets\/thumbs/i.test(s)) poster = s;
      else poster = "";
    }
    poster = cleanImg(poster);
    let title = cleanTitle(attrOf(chunk, "alt"));
    if (!title) {
      const h3 = /<h3[^>]*>([^<]{2,200})/i.exec(chunk);
      if (h3) title = cleanTitle(h3[1]);
    }
    if (!title) title = slug.replace(/-/g, " ");
    const item = mkItem(slug, title, poster, false);
    if (item) items.push(item);
  }
  return items;
}

function cardsEpisodes(html) {
  const src = String(html || "");
  const items = [];
  const seen = {};
  const re = /\/ver\/([A-Za-z0-9._~-]+)-episodio-(\d+)/g;
  let x;
  while ((x = re.exec(src))) {
    const slug = x[1];
    if (!slug || seen[slug]) continue;
    seen[slug] = true;
    const start = x.index - 80;
    const from = start < 0 ? 0 : start;
    const chunk = src.slice(from, x.index + 1400);
    let title = "";
    const h3 = /<h3[^>]*>([^<]{2,200})/i.exec(chunk);
    if (h3) title = cleanTitle(h3[1]);
    if (!title) title = cleanTitle(attrOf(chunk, "alt"));
    if (!title) title = slug.replace(/-/g, " ");
    let poster = cleanImg(attrOf(chunk, "data-src") || attrOf(chunk, "src"));
    if (/capblank|anime\.png/i.test(poster)) poster = "";
    const item = mkItem(slug, title, poster, false);
    if (item) items.push(item);
  }
  return items;
}

function hasNextPage(html, page) {
  const src = String(html || "");
  return new RegExp("[?&]page=" + (page + 1) + "(?![0-9])").test(src);
}

export async function search(query) {
  const q = String((query && query.q) || "").replace(/\s+/g, " ").trim().slice(0, 100);
  if (q.length < 2) return [];
  try {
    const page = await getPage(BASE + "/buscar?q=" + encodeURIComponent(q));
    const items = cardsAnime(page.html);
    if (items.length) return items.slice(0, 40);
  } catch (e) {
    kino.log("search page: " + ((e && e.message) || e));
  }
  try {
    const r = await kino.fetch(BASE + "/buscar_ajax?q=" + encodeURIComponent(q), {
      headers: { "User-Agent": UA, "X-Requested-With": "XMLHttpRequest", Accept: "application/json" },
      timeoutMs: 10000,
    });
    if (!r || !r.ok) return [];
    const text = String(r.text || "").trim();
    if (text.charAt(0) !== "[") {
      kino.log("search ajax: not JSON");
      return [];
    }
    const data = JSON.parse(text);
    const seen = {};
    const items = [];
    for (let i = 0; i < data.length; i++) {
      const row = data[i] || {};
      const um = /\/anime\/([A-Za-z0-9._~-]+)/.exec(String(row.url || ""));
      const slug = um ? um[1] : "";
      if (!slug || seen[slug]) continue;
      seen[slug] = true;
      const item = mkItem(slug, row.nombre || slug, row.thumb ? cleanImg(row.thumb) : "", false);
      if (item) items.push(item);
    }
    return items.slice(0, 40);
  } catch (e) {
    kino.log("search ajax: " + ((e && e.message) || e));
    return [];
  }
}

export async function home() {
  const rows = [];
  let homeHtml = "";
  try {
    const page = await getPage(BASE + "/");
    homeHtml = page.html;
    kino.log("home: html=" + homeHtml.length);
  } catch (e) {
    kino.log("home fetch: " + ((e && e.message) || e));
    return rows;
  }

  try {
    const items = cardsEpisodes(homeHtml);
    kino.log("home ultimos: " + items.length);
    if (items.length) rows.push({ id: "ultimos", title: "Ultimos capitulos", items: items.slice(0, 24) });
  } catch (e) {
    kino.log("home ultimos: " + ((e && e.message) || e));
  }

  try {
    let slice = homeHtml;
    const idx = homeHtml.indexOf("Series recientes");
    if (idx >= 0) slice = homeHtml.slice(idx, idx + 60000);
    const items = cardsAnime(slice);
    kino.log("home recientes: " + items.length);
    if (items.length) rows.push({ id: "recientes", title: "Series recientes", items: items.slice(0, 24) });
  } catch (e) {
    kino.log("home recientes: " + ((e && e.message) || e));
  }

  try {
    const page = await getPage(BASE + "/animes?estado=en+emision");
    const items = cardsAnime(page.html);
    kino.log("home emision: " + items.length);
    if (items.length) rows.push({ id: "emision", title: "En emision", items: items.slice(0, 24) });
  } catch (e) {
    kino.log("home emision: " + ((e && e.message) || e));
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
  const text = String(r.text || "").trim();
  if (!text || (text.charAt(0) !== "{" && text.charAt(0) !== "[")) {
    throw fail("unavailable", "respuesta no JSON", "noEpisodes");
  }
  return JSON.parse(text);
}

function parseSeriesHtml(html, slug) {
  const series = { title: "", poster: "", backdrop: "", overview: "" };
  const src = String(html || "");

  const h1m = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(src);
  if (h1m) series.title = decodeHtml(h1m[1].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
  if (!series.title) {
    const ogt = /property=["']og:title["'][^>]*content=["']([^"']+)["']/i.exec(src);
    if (ogt) {
      series.title = decodeHtml(ogt[1])
        .replace(/\s*Sub Espa.ol.*$/i, "")
        .replace(/\s*Online.*$/i, "")
        .replace(/\s*-\s*MonosChinos.*$/i, "")
        .trim();
    }
  }
  if (!series.title) series.title = slug.replace(/-/g, " ");

  const ogi = /property=["']og:image["'][^>]*content=["']([^"']+)["']/i.exec(src);
  if (ogi) series.poster = cleanImg(ogi[1]);
  if (!series.poster) {
    const ds = /data-src=["']([^"']*\/assets\/thumbs\/imagen\/[^"']+)["']/i.exec(src);
    if (ds) series.poster = cleanImg(ds[1]);
  }

  const bd = posterToBackdrop(series.poster);
  series.backdrop = bd || series.poster || "";

  const sin =
    /Sinopsis[\s\S]{0,200}<p[^>]*>([^<]{20,1200})<\/p>/i.exec(src) ||
    /Sobre la serie[\s\S]{0,200}<p[^>]*>([^<]{20,1200})<\/p>/i.exec(src);
  if (sin) {
    series.overview = decodeHtml(sin[1]).replace(/\s+/g, " ").trim().slice(0, 2000);
  } else {
    const ogd =
      /property=["']og:description["'][^>]*content=["']([^"']+)["']/i.exec(src) ||
      /name=["']description["'][^>]*content=["']([^"']+)["']/i.exec(src);
    if (ogd) {
      let text = decodeHtml(ogd[1]);
      const parts = text.split(/\.\s+/);
      if (parts.length >= 2) text = parts.slice(1).join(". ").trim();
      text = text.replace(/^Ver[\s\S]*?MonosChinos\.?\s*/i, "").replace(/\s+/g, " ").trim();
      if (text.length >= 40) series.overview = text.slice(0, 2000);
    }
  }
  return series;
}

export async function episodes(ref) {
  const T = Date.now();
  function left() {
    return 18500 - (Date.now() - T);
  }
  const m = /^a:([A-Za-z0-9._~-]+)$/.exec(String(ref || ""));
  if (!m) throw fail("not_found", "ref invalido", "badRef");
  const slug = m[1];

  let html = "";
  try {
    const page = await getPage(BASE + "/anime/" + slug, null, 14000);
    html = page.html;
  } catch (e) {
    throw fail("unavailable", "ficha: " + ((e && e.message) || e), "siteDown");
  }

  const series = parseSeriesHtml(html, slug);

  const ajaxM = /data-ajax=["']([^"']+)["']/i.exec(html);
  if (!ajaxM) throw fail("not_found", "sin data-ajax", "noEpisodes");
  const ajaxUrl = abs(ajaxM[1]);
  kino.log("episodes ajax=" + ajaxUrl);

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
  kino.log("episodes total=" + total);

  const caps = [];
  if (paginateUrl && total > 0) {
    const pages = Math.max(1, Math.ceil(total / perpage));
    const maxPages = pages > 10 ? 10 : pages;
    for (let p = 1; p <= maxPages && left() > 2000; p++) {
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
      let epSlug = slug;
      const vm = /\/ver\/([A-Za-z0-9._~-]+)-episodio-(\d+)/.exec(String(c.url || ""));
      if (vm) epSlug = vm[1];
      list.push({
        season: 1,
        number: n,
        ref: "e:" + epSlug + ":" + n,
        title: t("episode") + n,
        still: c.thumb ? cleanImg(c.thumb) : series.poster || "",
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
        ref: "e:" + slug + ":" + n,
        title: t("episode") + n,
        still: series.poster || "",
      });
    }
  }

  if (!list.length) throw fail("not_found", "0 capitulos", "noEpisodes");
  list.sort(function (a, b) {
    return a.number - b.number;
  });

  kino.log("episodes OK " + slug + " -> " + list.length);
  return { series: series, episodes: list };
}

const KIND_LABEL = {
  voe: "Voe",
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
  if (/hexload/i.test(n) || /hexload\./i.test(u)) return "hexload";
  if (/dood|dsvplay/i.test(n) || /dood|dsvplay\./i.test(u)) return "dood";
  if (/filemoon|byse/i.test(n) || /filemoon|byse/i.test(u)) return "filemoon";
  if (/streamwish|\bwish\b/i.test(n) || /streamwish|wish\./i.test(u)) return "streamwish";
  if (/netu|hqq|waaw/i.test(n) || /hqq\.|waaw\.|netu\./i.test(u)) return "netu";
  if (/mega/i.test(n) || /mega\.nz/i.test(u)) return "mega";
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
  const order = { mixdrop: 1, mp4upload: 2, lulu: 3, voe: 4, savefiles: 5, hexload: 6, uqload: 7, dood: 8, netu: 10, generic: 15, filemoon: 18, streamwish: 19 };
  servers.sort(function (a, b) {
    return (order[a.kind] || 15) - (order[b.kind] || 15);
  });
  return servers;
}

function serverLabel(s, all) {
  const base = KIND_LABEL[s.kind] || s.name || "Servidor";
  let count = 0;
  let idx = 0;
  for (let i = 0; i < all.length; i++) {
    if (all[i].kind === s.kind) {
      count++;
      if (all[i] === s) idx = count;
    }
  }
  return count <= 1 ? base : base + " " + idx;
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
    return payload.replace(/\b\w+\b/g, function (w) {
      return Object.prototype.hasOwnProperty.call(trie, w) ? trie[w] : w;
    });
  } catch (e) {
    return "";
  }
}
function unpackAll(html) {
  let out = "";
  const re = /eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*[rd]\s*\)[\s\S]*?\)\s*\)/g;
  let x;
  while ((x = re.exec(String(html || "")))) {
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
  for (let i = 0; i < patterns.length; i++) {
    const m = patterns[i].exec(String(html || ""));
    if (m) return unslash(m[1] || m[0]);
  }
  return "";
}
function streamResult(url, referer, label) {
  return { url: url, headers: { Referer: referer || BASE + "/", "User-Agent": UA }, alts: [], label: label || "" };
}
function goneIn(html) {
  return /File Not Found|deleted|not found|removed|no (longer|existe)|expirad/i.test(String(html || ""));
}

async function packerStream(embed, label) {
  const page = await getPage(embed, { Referer: BASE + "/" });
  const html = page.html;
  if (/just a moment|cf-browser-verification/i.test(html) && html.length < 12000) {
    throw fail("unavailable", label + " bloqueado", "serverFailed");
  }
  if (/filemoon|byse/i.test(label) && /type=["']module["']/.test(html) && !/\.m3u8/i.test(html)) {
    throw fail("unavailable", "Filemoon protegido (SPA); prueba MixDrop o Mp4Upload", "serverFailed");
  }
  let file = findStreamUrl(html);
  if (!file) file = findStreamUrl(unpackAll(html));
  if (!file) throw fail("unavailable", goneIn(html) ? label + " borrado" : label + " sin video", "serverFailed");
  if (file.indexOf("//") === 0) file = "https:" + file;
  return streamResult(file, originOf(page.url) + "/", label);
}

async function voeStream(embed) {
  return packerStream(embed, "Voe");
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
  const token = String(pass.html || "").trim();
  if (!token || token.length > 500) throw fail("unavailable", "Dood sin token", "serverFailed");
  const parts = m[1].split("/");
  const file = token + randomAlpha(10) + "?token=" + (parts[parts.length - 1] || "") + "&expiry=" + Date.now();
  return streamResult(file.indexOf("http") === 0 ? file : originOf(page.url) + file, originOf(page.url) + "/", "Doodstream");
}

async function streamFor(s) {
  switch (s.kind) {
    case "voe":
      return voeStream(s.url);
    case "dood":
      return doodStream(s.url);
    case "mixdrop":
      return packerStream(String(s.url).replace("/f/", "/e/"), "MixDrop");
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
      return packerStream(s.url, KIND_LABEL[s.kind] || s.name);
    case "netu":
      return packerStream(s.url, "Netu");
    default:
      return packerStream(s.url, "Servidor");
  }
}

export async function resolve(ref) {
  const T = Date.now();
  function left() {
    return 18500 - (Date.now() - T);
  }
  const m = /^e:([A-Za-z0-9._~-]+):(\d+)$/.exec(String(ref || ""));
  if (!m) throw fail("not_found", "ref " + ref, "badRef");
  const slug = m[1];
  const num = parseInt(m[2], 10);

  const pageUrl = BASE + "/ver/" + slug + "-episodio-" + num;
  const page = await getPage(pageUrl, null, 14000);
  let servers = listServers(page.html);

  try {
    const pref = kino.config && kino.config.server;
    if (pref) {
      servers.sort(function (a, b) {
        if (a.kind === pref && b.kind !== pref) return -1;
        if (b.kind === pref && a.kind !== pref) return 1;
        return 0;
      });
    }
  } catch (e) {
    /* ignore */
  }

  const names = [];
  for (let i = 0; i < servers.length; i++) names.push(servers[i].name);
  kino.log("resolve " + slug + "-" + num + ": " + (names.join(", ") || "ninguno"));

  if (!servers.length) throw fail("not_found", "sin servidores", "noServers");

  const alts = [];
  const errors = [];
  let primary = null;

  for (let i = 0; i < servers.length; i++) {
    if (left() < 2500) break;
    const s = servers[i];
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
      kino.log("resolve " + s.kind + ": " + ((e && e.message) || e));
    }
  }

  if (!primary) {
    throw fail("unavailable", "ningun servidor (" + errors.slice(0, 4).join("; ") + ")", "serverFailed");
  }

  const outAlts = [];
  for (let i = 0; i < alts.length; i++) {
    outAlts.push({ url: alts[i].url, name: alts[i].name, headers: alts[i].headers });
  }
  return { url: primary.url, headers: primary.headers, alts: outAlts };
}
