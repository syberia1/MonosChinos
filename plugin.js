/// <reference path="./kino.d.ts" />

const BASE_URL = "https://monoschinos.st";
const USER_AGENT =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36";

const memCache = new Map();

function isEn() {
  return typeof kino.lang === "string" && kino.lang.startsWith("en");
}

function getHeaders(extra = {}) {
  return {
    "User-Agent": USER_AGENT,
    "Accept-Language": isEn() ? "en-US,en;q=0.9,es;q=0.8" : "es-CO,es;q=0.9,en;q=0.8",
    Referer: BASE_URL + "/",
    ...extra,
  };
}

async function fetchHtml(url, extraHeaders = {}) {
  await null;
  const r = await kino.fetch(url, {
    headers: getHeaders(extraHeaders),
    timeoutMs: 15000,
  });
  if (!r.ok) {
    if (r.status === 404) {
      throw kino.error("not_found", "HTTP 404", {
        userMessage: isEn()
          ? "This content was not found on the source."
          : "No encontramos este título en la fuente.",
      });
    }
    if (r.status === 429) {
      throw kino.error("rate_limited", "HTTP 429");
    }
    throw kino.error("unavailable", "HTTP " + r.status);
  }
  return r.text();
}

function toSafeId(raw) {
  const cleaned = String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9._~-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return cleaned || "item-unknown";
}

function absUrl(href) {
  if (!href) return undefined;
  const h = String(href).trim();
  if (h.startsWith("http://") || h.startsWith("https://")) return h;
  if (h.startsWith("//")) return "https:" + h;
  return BASE_URL + (h.startsWith("/") ? "" : "/") + h;
}

function decodeHtmlEntities(str) {
  if (!str) return "";
  return String(str)
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)));
}

function cleanTitle(raw) {
  return decodeHtmlEntities(raw)
    .replace(/\s+Sub\s+Espa[ñn]ol.*$/i, "")
    .replace(/\s+Online\s*-?\s*MonosChinos.*$/i, "")
    .replace(/^(En emisi[óo]n|Finalizado|Estreno)\s*(\d{4})?\s*/i, "")
    .replace(/^(Anime|Pel[íi]cula|Pelicula|Especial|OVA|ONA|Donghua|Corto)\s*/i, "")
    .replace(/\s+\(\d{4}\)\s*$/, "")
    .trim();
}

function b64Encode(str) {
  try {
    const bytes = new TextEncoder().encode(String(str));
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  } catch (_) {
    return btoa(String(str));
  }
}

function b64Decode(b64) {
  try {
    const bin = atob(String(b64).trim());
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch (_) {
    try {
      return atob(String(b64).trim());
    } catch (_e) {
      return "";
    }
  }
}

function extractSlug(url, prefix = "anime") {
  const regex = new RegExp(`\/${prefix}\/([^/?#"'\s]+)`, "i");
  const m = String(url || "").match(regex);
  return m ? m[1] : "";
}

function deriveSeriesSlugFromEp(epSlug) {
  return String(epSlug || "")
    .replace(/-(?:episodio|capitulo)-\d+(?:-\d+)?.*$/i, "-sub-espanol");
}

async function fetchRichMeta(title, kind = "series", altTitle = "") {
  await null;
  if (kino.config.get("enrichMeta") === false || !title) return null;

  const cleanQ = cleanTitle(title)
    .replace(/\s+Season\s+(\d+)/i, " Season $1")
    .trim();
  const cacheKey = `meta:${kind}:${cleanQ.toLowerCase()}`;

  if (memCache.has(cacheKey)) return memCache.get(cacheKey);
  const stored = kino.storage.get(cacheKey);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      memCache.set(cacheKey, parsed);
      return parsed;
    } catch (_) {}
  }

  const info = {
    poster: undefined,
    backdrop: undefined,
    overview: undefined,
    year: undefined,
    rating: undefined,
    genres: [],
    ids: {},
    episodes: {},
  };

  try {
    const gql = `
      query ($search: String) {
        Media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
          id
          idMal
          seasonYear
          averageScore
          genres
          description(asHtml: false)
          coverImage { extraLarge large }
          bannerImage
          streamingEpisodes { title thumbnail }
        }
      }
    `;
    const aniRes = await kino.fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: { json: { query: gql, variables: { search: altTitle || cleanQ } } },
      timeoutMs: 8000,
    });

    if (aniRes.ok) {
      const media = aniRes.json()?.data?.Media;
      if (media) {
        if (media.id) info.ids.anilist = Number(media.id);
        if (media.idMal) info.ids.mal = Number(media.idMal);
        if (media.coverImage?.extraLarge || media.coverImage?.large) {
          info.poster = media.coverImage.extraLarge || media.coverImage.large;
        }
        if (media.bannerImage) info.backdrop = media.bannerImage;
        if (media.seasonYear) info.year = String(media.seasonYear);
        if (media.averageScore) info.rating = Number((media.averageScore / 10).toFixed(1));
        if (Array.isArray(media.genres)) info.genres = media.genres.slice(0, 5);

        if (Array.isArray(media.streamingEpisodes)) {
          for (const se of media.streamingEpisodes) {
            const m = String(se.title || "").match(/Episode\s+(\d+)\s*-\s*(.+)$/i);
            if (m) {
              const num = Number(m[1]);
              info.episodes[num] = {
                title: m[2].trim(),
                still: se.thumbnail || undefined,
              };
            }
          }
        }
      }
    }
  } catch (_) {}

  if (typeof kino.meta === "function" && (info.ids.anilist || info.ids.mal)) {
    try {
      const km = await kino.meta({
        type: kind === "movie" ? "movie" : "series",
        ids: info.ids,
        lang: kino.lang || "es-CO",
      });
      if (km) {
        if (km.poster) info.poster = km.poster;
        if (km.backdrop) info.backdrop = km.backdrop;
        if (km.overview) info.overview = km.overview;
        if (km.year) info.year = String(km.year);
        if (km.ids?.tmdb) info.ids.tmdb = Number(km.ids.tmdb);
        if (km.ids?.imdb) info.ids.imdb = String(km.ids.imdb);
        if (Array.isArray(km.episodes)) {
          for (const ep of km.episodes) {
            if (ep.number >= 1) {
              const prev = info.episodes[ep.number] || {};
              info.episodes[ep.number] = {
                title: ep.title || prev.title,
                still: ep.still || prev.still,
                overview: ep.overview || prev.overview,
                airDate: ep.airDate || prev.airDate,
              };
            }
          }
        }
      }
    } catch (_) {}
  }

  if (typeof kino.tmdb === "function") {
    try {
      const baseSearchTitle = cleanQ.replace(/\s+Season\s+\d+/i, "").trim();
      const searchPath = kind === "movie" ? "/search/movie" : "/search/tv";
      const tmdbLang = isEn() ? "en-US" : "es-MX";
      const searchRes = await kino.tmdb(searchPath, {
        query: baseSearchTitle,
        language: tmdbLang,
      });
      const hit = searchRes?.results?.[0];
      if (hit && hit.id) {
        info.ids.tmdb = Number(hit.id);
        if (hit.poster_path && !info.poster) {
          info.poster = "https://image.tmdb.org/t/p/w780" + hit.poster_path;
        }
        if (hit.backdrop_path) {
          info.backdrop = "https://image.tmdb.org/t/p/w1280" + hit.backdrop_path;
        }
        if (hit.overview) {
          info.overview = hit.overview;
        }
        if (hit.vote_average && !info.rating) {
          info.rating = Number(Number(hit.vote_average).toFixed(1));
        }
        const dateStr = hit.first_air_date || hit.release_date;
        if (dateStr && !info.year) {
          info.year = String(dateStr).slice(0, 4);
        }

        if (kind !== "movie") {
          const seasonMatch = title.match(/(?:Temporada|Season)\s+(\d+)|(\d+)nd\s+Season/i);
          const seasonNum = seasonMatch ? Number(seasonMatch[1] || seasonMatch[2]) : 1;
          const seasonRes = await kino.tmdb(`/tv/${hit.id}/season/${seasonNum}`, {
            language: tmdbLang,
          });
          if (Array.isArray(seasonRes?.episodes)) {
            for (const ep of seasonRes.episodes) {
              const num = Number(ep.episode_number);
              if (num >= 1) {
                const prev = info.episodes[num] || {};
                info.episodes[num] = {
                  title: ep.name || prev.title,
                  still: ep.still_path
                    ? "https://image.tmdb.org/t/p/w500" + ep.still_path
                    : prev.still || info.backdrop,
                  overview: ep.overview || prev.overview,
                  airDate: ep.air_date || prev.airDate,
                };
              }
            }
          }
        }
      }
    } catch (_) {}
  }

  if (kind !== "movie" && info.ids.mal && Object.keys(info.episodes).length === 0) {
    try {
      const jikanRes = await kino.fetch(
        `https://api.jikan.moe/v4/anime/${info.ids.mal}/episodes`,
        { timeoutMs: 6000 }
      );
      if (jikanRes.ok) {
        const list = jikanRes.json()?.data;
        if (Array.isArray(list)) {
          for (const ep of list) {
            const num = Number(ep.mal_id);
            if (num >= 1 && ep.title) {
              info.episodes[num] = { title: ep.title };
            }
          }
        }
      }
    } catch (_) {}
  }

  memCache.set(cacheKey, info);
  try {
    kino.storage.set(cacheKey, JSON.stringify(info), { ttlMs: 12 * 3600 * 1000 });
  } catch (_) {}

  return info;
}

async function enrichItemsBatch(items, limit = 6) {
  await null;
  if (kino.config.get("enrichMeta") === false) return items;
  const subset = items.slice(0, limit);
  await Promise.all(
    subset.map(async (item) => {
      try {
        const meta = await fetchRichMeta(item.title, item.kind);
        if (!meta) return;
        if (meta.poster && !item.poster) item.poster = meta.poster;
        if (meta.backdrop) item.backdrop = meta.backdrop;
        if (meta.overview && !item.overview) item.overview = meta.overview;
        if (meta.year && !item.year) item.year = meta.year;
        if (meta.rating && !item.rating) item.rating = meta.rating;
        if (meta.ids?.tmdb) item.ids = { ...item.ids, tmdb: meta.ids.tmdb };
        if (meta.ids?.imdb) item.ids = { ...item.ids, imdb: meta.ids.imdb };
      } catch (_) {}
    })
  );
  return items;
}

function parseEmisionEpisodes(html) {
  const items = [];
  const seenIds = new Set();
  const regex = /<a[^>]+href=["']([^"']*\/ver\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = regex.exec(html)) !== null) {
    const href = m[1];
    const inner = m[2];
    const epSlug = extractSlug(href, "ver");
    if (!epSlug) continue;

    const seriesSlug = deriveSeriesSlugFromEp(epSlug);
    const itemId = toSafeId("emision-" + seriesSlug);
    if (seenIds.has(itemId)) continue;
    seenIds.add(itemId);

    const imgMatch = inner.match(
      /(?:data-src|src)=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i
    );
    const imgUrl = imgMatch ? absUrl(imgMatch[1]) : undefined;

    const epMatch =
      epSlug.match(/-(?:episodio|capitulo)-(\d+)/i) ||
      inner.match(/EP\.?\s*(\d+)/i);
    const epNum = epMatch ? Number(epMatch[1]) : 1;

    const rawText = inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    let title = cleanTitle(
      rawText
        .replace(/^EP\.?\s*\d+\s*\.?\s*/i, "")
        .replace(
          /(Acci[óo]n|Comedia|Drama|Ciencia Ficci[óo]n|Horror|Fantas[íi]a|Romance|Aventura|Deportes|M[úu]sica|Sobrenatural)\s*$/i,
          ""
        )
        .trim()
    );

    if (!title || title.length < 2) {
      title = seriesSlug
        .replace(/-sub-espanol$/i, "")
        .replace(/-/g, " ")
        .replace(/\w/g, (c) => c.toUpperCase());
    }

    items.push({
      id: itemId,
      ref: "anime:" + seriesSlug,
      title,
      kind: "series",
      poster: imgUrl,
      backdrop: imgUrl,
      badges: [`EP ${epNum}`, "En emisión"],
      genres: ["anime"],
    });
  }
  return items;
}

function parseDirectoryCards(html, forcedKind = null) {
  const items = [];
  const seenIds = new Set();
  const regex = /<a[^>]+href=["']([^"']*\/anime\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = regex.exec(html)) !== null) {
    const href = m[1];
    const inner = m[2];
    const slug = extractSlug(href, "anime");
    if (!slug) continue;

    const imgMatch = inner.match(
      /(?:data-src|src)=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i
    );
    const rawText = inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

    if (!imgMatch && (/^(Ver ahora|M[áa]s info)$/i.test(rawText) || rawText.length < 2)) {
      continue;
    }

    const itemId = toSafeId("anime-" + slug);
    if (seenIds.has(itemId)) continue;
    seenIds.add(itemId);

    const isMovie =
      forcedKind === "movie" ||
      /(Pel[íi]cula|Pelicula|Movie)/i.test(rawText) ||
      /-pelicula/i.test(slug);

    const yearMatch = rawText.match(/(19\d{2}|20\d{2})/);
    const year = yearMatch ? yearMatch[1] : undefined;

    let title = rawText
      .replace(/^(En emisi[óo]n|Finalizado|Estreno|Pr[óo]ximo)\s*(\d{4})?\s*/i, "")
      .replace(/^(Anime|Pel[íi]cula|Pelicula|Especial|OVA|ONA|Donghua|Sin Censura|Corto)\s*/i, "")
      .replace(/(19\d{2}|20\d{2}).*$/, "")
      .replace(/(Ver ahora|M[áa]s info)/gi, "")
      .trim();

    title = cleanTitle(title);
    if (!title || title.length < 2) {
      title = slug
        .replace(/-sub-espanol$/i, "")
        .replace(/-/g, " ")
        .replace(/\w/g, (c) => c.toUpperCase());
    }

    const poster = imgMatch ? absUrl(imgMatch[1]) : undefined;

    items.push({
      id: itemId,
      ref: (isMovie ? "movie:" : "anime:") + slug,
      title,
      kind: isMovie ? "movie" : "series",
      year,
      poster,
      genres: ["anime"],
      badges: isMovie ? ["Película"] : ["Sub Español"],
    });
  }
  return items;
}

export async function home() {
  await null;
  const rows = [];
  const [homeRes, animesRes, moviesRes] = await Promise.allSettled([
    fetchHtml(`${BASE_URL}/`),
    fetchHtml(`${BASE_URL}/animes?tipo=anime`),
    fetchHtml(`${BASE_URL}/animes?tipo=pelicula`),
  ]);

  if (homeRes.status === "fulfilled") {
    const emisionItems = parseEmisionEpisodes(homeRes.value).slice(0, 30);
    await enrichItemsBatch(emisionItems, 5);
    if (emisionItems.length > 0) {
      rows.push({
        id: "en-emision",
        title: isEn() ? "Currently Airing (Latest Episodes)" : "En Emisión (Últimos capítulos)",
        ref: "cat:emision",
        genre: "anime",
        items: emisionItems,
      });
    }
  }

  const animesHtml =
    animesRes.status === "fulfilled"
      ? animesRes.value
      : homeRes.status === "fulfilled"
      ? homeRes.value
      : "";
  if (animesHtml) {
    const animeItems = parseDirectoryCards(animesHtml, "series").slice(0, 30);
    await enrichItemsBatch(animeItems, 5);
    if (animeItems.length > 0) {
      rows.push({
        id: "animes",
        title: "Animes",
        ref: "cat:animes",
        genre: "anime",
        items: animeItems,
      });
    }
  }

  let movieItems =
    moviesRes.status === "fulfilled" ? parseDirectoryCards(moviesRes.value, "movie") : [];
  if (movieItems.length === 0) {
    try {
      const fallbackHtml = await fetchHtml(`${BASE_URL}/animes?categoria=pelicula`);
      movieItems = parseDirectoryCards(fallbackHtml, "movie");
    } catch (_) {}
  }
  if (movieItems.length > 0) {
    movieItems = movieItems.slice(0, 30);
    await enrichItemsBatch(movieItems, 5);
    rows.push({
      id: "peliculas",
      title: isEn() ? "Anime Movies" : "Películas",
      ref: "cat:peliculas",
      genre: "peliculas",
      items: movieItems,
    });
  }

  return rows;
}

export async function section(arg) {
  await null;
  const requestedTab = arg?.tab || "emision";
  const tabs = [
    { id: "emision", label: isEn() ? "Airing" : "En Emisión" },
    { id: "animes", label: "Animes" },
    { id: "peliculas", label: isEn() ? "Movies" : "Películas" },
  ];
  const chosen = tabs.some((t) => t.id === requestedTab) ? requestedTab : "emision";

  const page = await browse(`cat:${chosen}`, null);
  const first = page.items?.[0];

  return {
    tabs,
    tab: chosen,
    hero: first
      ? {
          title: first.title,
          text:
            first.overview ||
            (isEn()
              ? "Watch in HD with Spanish subtitles and multiple servers on MonosChinos."
              : "Disfruta en alta definición con subtítulos en español y múltiples servidores."),
          image: first.backdrop || first.poster,
        }
      : undefined,
    rows: [
      {
        id: `sec-${chosen}`,
        title:
          chosen === "emision"
            ? isEn()
              ? "Currently Airing (Latest Episodes)"
              : "En Emisión (Últimos capítulos)"
            : chosen === "peliculas"
            ? isEn()
              ? "Anime Movies"
              : "Películas"
            : "Animes",
        ref: `cat:${chosen}`,
        genre: chosen === "peliculas" ? "peliculas" : "anime",
        items: page.items || [],
      },
    ],
  };
}

export async function browse(ref, cursor) {
  await null;
  const pageNum = Math.max(1, Number(cursor) || 1);
  const cleanRef = String(ref || "cat:animes");

  if (cleanRef === "cat:emision" || cleanRef === "emision") {
    if (pageNum === 1) {
      const html = await fetchHtml(`${BASE_URL}/`);
      const items = parseEmisionEpisodes(html);
      await enrichItemsBatch(items, 6);
      return { items, next: "2" };
    }
    const html = await fetchHtml(`${BASE_URL}/animes?estado=emision&p=${pageNum - 1}`);
    const items = parseDirectoryCards(html, "series");
    await enrichItemsBatch(items, 6);
    return { items, next: items.length >= 12 ? String(pageNum + 1) : undefined };
  }

  if (cleanRef === "cat:peliculas" || cleanRef === "peliculas") {
    let html = await fetchHtml(`${BASE_URL}/animes?tipo=pelicula&p=${pageNum}`).catch(() => "");
    let items = parseDirectoryCards(html, "movie");
    if (items.length === 0) {
      html = await fetchHtml(`${BASE_URL}/animes?categoria=pelicula&p=${pageNum}`).catch(() => "");
      items = parseDirectoryCards(html, "movie");
    }
    await enrichItemsBatch(items, 6);
    return { items, next: items.length >= 12 ? String(pageNum + 1) : undefined };
  }

  if (cleanRef === "cat:animes" || cleanRef === "animes") {
    const html = await fetchHtml(`${BASE_URL}/animes?tipo=anime&p=${pageNum}`);
    const items = parseDirectoryCards(html, "series");
    await enrichItemsBatch(items, 6);
    return { items, next: items.length >= 12 ? String(pageNum + 1) : undefined };
  }

  throw kino.error("not_found", "Categoría desconocida: " + cleanRef);
}

export async function search(query) {
  await null;
  const q = String(query?.q || "").trim();
  if (!q) return [];

  const pageNum = Math.max(1, Number(query?.cursor) || 1);
  const encodedQ = encodeURIComponent(kino.rank ? kino.rank.shortQuery(q) : q);

  let html = await fetchHtml(`${BASE_URL}/buscar?q=${encodedQ}&p=${pageNum}`).catch(() => "");
  let items = parseDirectoryCards(html);

  if (items.length === 0) {
    html = await fetchHtml(`${BASE_URL}/animes?q=${encodedQ}&p=${pageNum}`).catch(() => "");
    items = parseDirectoryCards(html);
  }

  if (items.length === 0 && query?.originalTitle) {
    const altHtml = await fetchHtml(
      `${BASE_URL}/buscar?q=${encodeURIComponent(query.originalTitle)}`
    ).catch(() => "");
    items = parseDirectoryCards(altHtml);
  }

  if (query?.within) {
    if (query.within.includes("peliculas")) {
      items = items.filter((i) => i.kind === "movie");
    } else if (query.within.includes("animes") || query.within.includes("emision")) {
      items = items.filter((i) => i.kind === "series");
    }
  }

  if (kino.rank) {
    const candidateTitles = [
      q,
      query?.originalTitle || "",
      ...(Array.isArray(query?.altTitles) ? query.altTitles : []),
    ].filter(Boolean);
    items = kino.rank.sortBySimilarity(items, candidateTitles, (x) => x.title);
  }

  await enrichItemsBatch(items, 6);

  return {
    items: items.slice(0, 100),
    next: items.length >= 18 ? String(pageNum + 1) : undefined,
  };
}

async function loadAnimePageData(rawRef) {
  await null;
  const cleanSlug = String(rawRef || "")
    .replace(/^(?:anime|movie):/, "")
    .replace(/^ep:/, "");

  const url = `${BASE_URL}/anime/${cleanSlug}`;
  const html = await fetchHtml(url);

  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = cleanTitle(
    h1Match
      ? h1Match[1].replace(/<[^>]+>/g, "")
      : cleanSlug.replace(/-sub-espanol$/i, "").replace(/-/g, " ")
  );

  const origMatch =
    html.match(/Nombre\s+original\s*:?\s*<\/[^>]+>\s*<[^>]+>([^<]+)/i) ||
    html.match(/Nombre\s+original\s*:?\s*([^
<]+)/i);
  const altTitle = origMatch ? decodeHtmlEntities(origMatch[1]).trim() : "";

  const descMatch =
    html.match(
      /<div[^>]*class=["'][^"']*(?:sinopsis|description|text-justify)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
    ) ||
    html.match(/<p[^>]*class=["'][^"']*text-gray[^"']*["'][^>]*>([\s\S]*?)<\/p>/i) ||
    html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i);
  const pageOverview = descMatch
    ? decodeHtmlEntities(descMatch[1].replace(/<[^>]+>/g, " "))
        .replace(/\s+/g, " ")
        .trim()
    : undefined;

  const imgs = [
    ...html.matchAll(/(?:data-src|src)=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi),
  ];
  const pagePoster = imgs[0]?.[1] ? absUrl(imgs[0][1]) : undefined;
  const pageBackdrop = imgs[1]?.[1] ? absUrl(imgs[1][1]) : pagePoster;

  const isMovie =
    String(rawRef).startsWith("movie:") ||
    /Tipo\s*:?\s*(?:<[^>]+>\s*)*Pel[íi]cula/i.test(html) ||
    /-pelicula/i.test(cleanSlug);

  const rawEpisodes = [];
  const seenNumbers = new Set();
  const epRegex = /<a[^>]+href=["']([^"']*\/ver\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = epRegex.exec(html)) !== null) {
    const epHref = m[1];
    const epInner = m[2];
    const epSlug = extractSlug(epHref, "ver");
    if (!epSlug) continue;

    const numMatch =
      epSlug.match(/-(?:episodio|capitulo)-(\d+)/i) ||
      epInner.match(/(?:Episodio|Cap[íi]tulo|EP\.?)\s*(\d+)/i);
    const epNum = numMatch ? Number(numMatch[1]) : rawEpisodes.length + 1;

    if (epNum < 1 || seenNumbers.has(epNum)) continue;
    seenNumbers.add(epNum);

    const thumbMatch = epInner.match(
      /(?:data-src|src)=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i
    );
    const still = thumbMatch ? absUrl(thumbMatch[1]) : undefined;

    rawEpisodes.push({ number: epNum, slug: epSlug, still });
  }

  if (rawEpisodes.length === 0) {
    const totalMatch =
      html.match(/Cap[íi]tulos\s*:?\s*(?:<[^>]+>\s*)*(\d+)/i) ||
      html.match(/data-total=["'](\d+)["']/i);
    const total = totalMatch ? Math.min(2000, Math.max(1, Number(totalMatch[1]))) : 1;
    const baseEpSlug = cleanSlug.replace(/-sub-espanol$/i, "");
    for (let i = 1; i <= total; i++) {
      rawEpisodes.push({ number: i, slug: `${baseEpSlug}-episodio-${i}`, still: undefined });
    }
  }

  rawEpisodes.sort((a, b) => a.number - b.number);

  const rich = await fetchRichMeta(title, isMovie ? "movie" : "series", altTitle);

  const seriesInfo = {
    title,
    poster: rich?.poster || pagePoster,
    backdrop: rich?.backdrop || pageBackdrop || rich?.poster || pagePoster,
    overview: rich?.overview || pageOverview,
    year: rich?.year,
    rating: rich?.rating,
    genres: rich?.genres?.length ? rich.genres : ["Anime"],
    ids: rich?.ids && Object.keys(rich.ids).length > 0 ? rich.ids : undefined,
  };

  const episodes = rawEpisodes.map((ep) => {
    const rEp = rich?.episodes?.[ep.number];
    return {
      season: 1,
      number: ep.number,
      ref: `ep:${ep.slug}`,
      title: rEp?.title || (isEn() ? `Episode ${ep.number}` : `Capítulo ${ep.number}`),
      still: rEp?.still || ep.still || seriesInfo.backdrop || seriesInfo.poster,
      overview: rEp?.overview || undefined,
      airDate: rEp?.airDate || undefined,
    };
  });

  return { series: seriesInfo, episodes };
}

export async function episodes(ref) {
  await null;
  const cleanRef = String(ref || "");
  const targetRef = cleanRef.startsWith("ep:")
    ? "anime:" + deriveSeriesSlugFromEp(cleanRef.slice(3))
    : cleanRef;
  return loadAnimePageData(targetRef);
}

export async function details(ref) {
  await null;
  const data = await loadAnimePageData(ref);
  return data.series || null;
}

function detectServerLabel(url, rawName = "") {
  const combined = (String(url) + " " + String(rawName)).toLowerCase();
  if (
    combined.includes("wish") ||
    combined.includes("sfastwish") ||
    combined.includes("flaswish") ||
    combined.includes("obeywish") ||
    combined.includes("cdnwish")
  ) {
    return { key: "streamwish", name: "StreamWish · 1080p" };
  }
  if (combined.includes("filemoon")) return { key: "filemoon", name: "Filemoon · 1080p" };
  if (combined.includes("voe")) return { key: "voe", name: "VOE · 720p" };
  if (combined.includes("mp4upload")) return { key: "mp4upload", name: "Mp4Upload · 1080p" };
  if (combined.includes("ok.ru") || combined.includes("okru")) {
    return { key: "okru", name: "OK.ru · 1080p" };
  }
  if (combined.includes("uqload")) return { key: "uqload", name: "Uqload · 720p" };
  if (combined.includes("yourupload")) return { key: "yourupload", name: "YourUpload · 720p" };
  if (combined.includes("streamtape")) return { key: "streamtape", name: "Streamtape · 720p" };
  if (combined.includes("dood") || combined.includes("d000d")) {
    return { key: "doodstream", name: "DoodStream · 720p" };
  }
  if (combined.includes("mixdrop")) return { key: "mixdrop", name: "MixDrop · 720p" };
  if (combined.includes("fireload") || combined.includes("fembed")) {
    return { key: "fireload", name: "Fireload · 720p" };
  }
  const cleanLabel = String(rawName || "Servidor HD")
    .replace(/[^\w\s.-]/g, "")
    .trim()
    .slice(0, 32);
  return { key: "other", name: cleanLabel || "Servidor HD" };
}

async function extractEpisodeServers(epSlug) {
  await null;
  const cleanEpSlug = String(epSlug).replace(/^ep:/, "");
  const epUrl = `${BASE_URL}/ver/${cleanEpSlug}`;
  const html = await fetchHtml(epUrl);

  const servers = [];
  const seenEmbeds = new Set();

  function registerEmbed(rawVal, hintLabel = "") {
    if (!rawVal) return;
    let candidate = String(rawVal).trim();

    if (
      !candidate.startsWith("http") &&
      !candidate.startsWith("//") &&
      /^[A-Za-z0-9+/=]{16,}$/.test(candidate)
    ) {
      const dec = b64Decode(candidate);
      if (dec.includes("http") || dec.startsWith("//") || dec.includes("<iframe")) {
        candidate = dec.trim();
      }
    }

    const iframeSrc = candidate.match(/src=["']([^"']+)["']/i);
    if (iframeSrc) candidate = iframeSrc[1];

    const redirParam = candidate.match(/[?&](?:url|u|v|file)=(https?[^&"']+)/i);
    if (redirParam) {
      try {
        candidate = decodeURIComponent(redirParam[1]);
      } catch (_) {}
    }

    if (candidate.startsWith("//")) candidate = "https:" + candidate;
    if (!candidate.startsWith("http")) return;
    if (/disqus|facebook|twitter|google|doubleclick|analytics/i.test(candidate)) return;

    if (seenEmbeds.has(candidate)) return;
    seenEmbeds.add(candidate);

    const info = detectServerLabel(candidate, hintLabel);
    servers.push({
      key: info.key,
      label: `Sub · ${info.name}`.slice(0, 48),
      embedUrl: candidate,
      epUrl,
    });
  }

  const tagRegex =
    /<(?:button|li|a|div)[^>]*?(?:data-(?:player|video|url|embed|src|iframe)=["']([^"']+)["'])[^>]*>([\s\S]*?)<\/(?:button|li|a|div)>/gi;
  let m;
  while ((m = tagRegex.exec(html)) !== null) {
    registerEmbed(m[1], m[2].replace(/<[^>]+>/g, "").trim());
  }

  const attrRegex = /data-(?:player|video|embed|iframe)=["']([^"']+)["']/gi;
  while ((m = attrRegex.exec(html)) !== null) {
    registerEmbed(m[1]);
  }

  const scriptUrlRegex =
    /["'](https?:\?\/\?\/(?:[^"'\]|\.)*(?:wish|filemoon|voe|mp4upload|ok\.ru|uqload|yourupload|streamtape|dood|d000d|mixdrop|fireload)[^"']*)["']/gi;
  while ((m = scriptUrlRegex.exec(html)) !== null) {
    registerEmbed(m[1].replace(/\\//g, "/"));
  }

  const iframeRegex = /<iframe[^>]+src=["']([^"']+)["'][^>]*>/gi;
  while ((m = iframeRegex.exec(html)) !== null) {
    registerEmbed(m[1]);
  }

  const pref = kino.config.get("preferredServer") || "auto";
  const order = [
    pref !== "auto" ? pref : "",
    "streamwish",
    "filemoon",
    "voe",
    "mp4upload",
    "okru",
    "uqload",
    "yourupload",
    "streamtape",
    "doodstream",
    "mixdrop",
    "fireload",
  ].filter(Boolean);

  servers.sort((a, b) => {
    const ia = order.indexOf(a.key);
    const ib = order.indexOf(b.key);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  return servers;
}

function unpackPackedScript(html) {
  const m = html.match(
    /eval\(function\(p,a,c,k,e,[dr]\)\{[\s\S]*?\}\('([\s\S]*?)',\s*(\d+),\s*(\d+),\s*'([\s\S]*?)'\.split\('\|'\)/
  );
  if (!m) return "";
  let [, p, a, c, k] = m;
  a = Number(a);
  c = Number(c);
  const dict = k.split("|");
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

  const encodeBase = (num) => {
    let out = "";
    let n = num;
    do {
      out = alphabet[n % a] + out;
      n = Math.floor(n / a);
    } while (n > 0);
    return out;
  };

  while (c--) {
    if (dict[c]) {
      const token = encodeBase(c);
      p = p.replace(new RegExp(`\b${token}\b`, "g"), dict[c]);
    }
  }
  return p;
}

async function resolveSingleServer(srv) {
  await null;
  const { embedUrl, epUrl, label } = srv;
  let origin = BASE_URL;
  try {
    origin = new URL(embedUrl).origin;
  } catch (_) {}

  try {
    const r = await kino.fetch(embedUrl, {
      headers: getHeaders({ Referer: epUrl || BASE_URL + "/" }),
      timeoutMs: 12000,
    });
    if (r.ok) {
      const html = r.text();
      const unpacked = unpackPackedScript(html);
      const body = html + "
" + unpacked;

      if (/ok\.ru/i.test(embedUrl)) {
        const optsMatch = html.match(/data-options=["']([^"']+)["']/i);
        if (optsMatch) {
          const opts = JSON.parse(decodeHtmlEntities(optsMatch[1]));
          const meta =
            typeof opts?.flashvars?.metadata === "string"
              ? JSON.parse(opts.flashvars.metadata)
              : opts?.flashvars?.metadata;
          if (meta?.hlsManifestUrl) {
            return {
              url: meta.hlsManifestUrl,
              mime: "application/vnd.apple.mpegurl",
              label,
              headers: { "User-Agent": USER_AGENT, Referer: "https://ok.ru/" },
            };
          }
          if (Array.isArray(meta?.videos) && meta.videos.length > 0) {
            const best = meta.videos[meta.videos.length - 1];
            if (best?.url) {
              return {
                url: best.url,
                mime: "video/mp4",
                label,
                headers: { "User-Agent": USER_AGENT, Referer: "https://ok.ru/" },
              };
            }
          }
        }
      }

      if (/voe/i.test(embedUrl)) {
        const b64Hls = body.match(/['"]hls['"]\s*:\s*['"]([A-Za-z0-9+/=]+)['"]/);
        if (b64Hls) {
          const dec = b64Decode(b64Hls[1]);
          if (dec.startsWith("http")) {
            return {
              url: dec,
              mime: "application/vnd.apple.mpegurl",
              label,
              headers: { "User-Agent": USER_AGENT, Referer: origin + "/" },
            };
          }
        }
      }

      const hlsMatch =
        body.match(/file\s*:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i) ||
        body.match(/["'](https?:\/\/[^"'\s\]+\.m3u8[^"'\s\]*)["']/i);
      if (hlsMatch) {
        return {
          url: hlsMatch[1].replace(/\\//g, "/"),
          mime: "application/vnd.apple.mpegurl",
          label,
          headers: {
            "User-Agent": USER_AGENT,
            Referer: origin + "/",
            Origin: origin,
          },
        };
      }

      if (/streamtape/i.test(embedUrl)) {
        const tapeMatch = body.match(
          /getElementById\(['"]robotlink['"]\)\.innerHTML\s*=\s*['"]([^'"]+)['"]\s*\+\s*\(['"]([^'"]+)['"]\)\.substring\((\d+)\)/i
        );
        if (tapeMatch) {
          const videoUrl = `https:${tapeMatch[1]}${tapeMatch[2].substring(Number(tapeMatch[3]))}&stream=1`;
          return {
            url: videoUrl,
            mime: "video/mp4",
            label,
            headers: { "User-Agent": USER_AGENT, Referer: origin + "/" },
          };
        }
      }

      const mp4Match =
        body.match(/(?:src|file)\s*:\s*["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i) ||
        body.match(/["'](https?:\/\/[^"'\s\]+\/v\.mp4[^"'\s\]*)["']/i) ||
        body.match(/["'](https?:\/\/[^"'\s\]+\.mp4(\?[^"'\s\]*)?)["']/i);
      if (mp4Match) {
        return {
          url: mp4Match[1].replace(/\\//g, "/"),
          mime: "video/mp4",
          label,
          headers: { "User-Agent": USER_AGENT, Referer: origin + "/" },
        };
      }
    }
  } catch (_) {}

  if (kino.browser && typeof kino.browser.capture === "function") {
    try {
      const cap = await kino.browser.capture(embedUrl, {
        timeoutMs: 18000,
        headers: { Referer: epUrl || BASE_URL + "/" },
        autoplay: true,
      });
      const firstMedia = cap?.media?.[0];
      if (firstMedia && firstMedia.url) {
        return {
          url: firstMedia.url,
          mime: firstMedia.mime || (firstMedia.url.includes(".m3u8") ? "application/vnd.apple.mpegurl" : undefined),
          label,
          headers: firstMedia.headers || {
            "User-Agent": USER_AGENT,
            Referer: origin + "/",
          },
        };
      }
    } catch (_) {}
  }

  return null;
}

export async function resolve(ref) {
  await null;
  const rawRef = String(ref || "");

  if (rawRef.startsWith("srv:")) {
    let srvObj = null;
    try {
      srvObj = JSON.parse(b64Decode(rawRef.slice(4)));
    } catch (_) {}

    if (srvObj && srvObj.embedUrl) {
      const resolved = await resolveSingleServer(srvObj);
      if (resolved) return resolved;
    }

    throw kino.error("unavailable", "Falló el servidor seleccionado", {
      userMessage: isEn()
        ? "This server is not responding right now. Pick another one in the Server menu."
        : "Este servidor no está disponible ahora. Elige otro en el menú Servidor.",
    });
  }

  let epSlug = rawRef;
  if (rawRef.startsWith("movie:") || rawRef.startsWith("anime:")) {
    const epData = await loadAnimePageData(rawRef);
    const firstEp = epData.episodes?.[0];
    if (!firstEp) {
      throw kino.error("not_found", "Sin episodios para " + rawRef, {
        userMessage: isEn()
          ? "No episodes were found for this title."
          : "No se encontraron capítulos disponibles para este título.",
      });
    }
    epSlug = firstEp.ref;
  }

  const servers = await extractEpisodeServers(epSlug);
  if (servers.length === 0) {
    throw kino.error("not_found", "0 servidores en " + epSlug, {
      userMessage: isEn()
        ? "No video servers were found for this episode."
        : "Este capítulo aún no tiene servidores disponibles.",
    });
  }

  let mainStream = null;
  let chosenIdx = -1;
  const maxAttempts = Math.min(servers.length, 3);

  for (let i = 0; i < maxAttempts; i++) {
    const s = await resolveSingleServer(servers[i]);
    if (s) {
      mainStream = s;
      chosenIdx = i;
      break;
    }
  }

  if (!mainStream) {
    throw kino.error("unavailable", "Ningún servidor respondió para " + epSlug, {
      userMessage: isEn()
        ? "None of the video servers responded right now. Try again in a moment."
        : "Ninguno de los servidores respondió en este momento. Intenta de nuevo.",
    });
  }

  const alternatives = servers
    .filter((_, idx) => idx !== chosenIdx)
    .slice(0, 8)
    .map((srv) => ({
      label: srv.label,
      ref: ("srv:" + b64Encode(JSON.stringify(srv))).slice(0, 512),
    }));

  return {
    ...mainStream,
    alternatives,
  };
}
