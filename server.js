const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");

const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p";

const PORT = process.env.PORT || 7000;
const TMDB_API_KEY = process.env.TMDB_API_KEY;

if (!TMDB_API_KEY) {
  console.warn("WARNING: Set TMDB_API_KEY before running the addon.");
}

const manifest = {
  id: "org.kymcool.tmdbhomecatalogs",
  version: "1.0.0",
  name: "TMDB Home Catalogs",
  description: "Catalog-only home menu lists powered by TMDB. No streams.",
  resources: ["catalog"],
  types: ["movie", "series"],
  catalogs: [
    {
      id: "trending-kenya",
      type: "movie",
      name: "Trending in Kenya",
      extra: [{ name: "skip", isRequired: false }]
    },
    {
      id: "airing-today",
      type: "series",
      name: "Airing Today",
      extra: [{ name: "skip", isRequired: false }]
    },
    {
      id: "calendar-videos",
      type: "movie",
      name: "Calendar Videos",
      extra: [{ name: "skip", isRequired: false }]
    },
    {
      id: "top10-week",
      type: "movie",
      name: "Top 10 This Week",
      extra: [{ name: "skip", isRequired: false }]
    }
  ]
};

const builder = new addonBuilder(manifest);

async function tmdb(path, params = {}) {
  if (!TMDB_API_KEY) throw new Error("TMDB_API_KEY is not configured");

  const url = new URL(TMDB_API + path);
  url.searchParams.set("api_key", TMDB_API_KEY);
  url.searchParams.set("language", "en-US");

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, value);
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`TMDB ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

function poster(path) {
  return path ? `${TMDB_IMG}/w500${path}` : undefined;
}

function background(path) {
  return path ? `${TMDB_IMG}/w1280${path}` : undefined;
}

function movieMeta(x) {
  return {
    id: `tmdb:${x.id}`,
    type: "movie",
    name: x.title || x.name,
    poster: poster(x.poster_path),
    background: background(x.backdrop_path),
    description: x.overview || undefined,
    releaseInfo: x.release_date || undefined,
    imdbRating: x.vote_average || undefined
  };
}

function seriesMeta(x) {
  return {
    id: `tmdb:${x.id}`,
    type: "series",
    name: x.name || x.title,
    poster: poster(x.poster_path),
    background: background(x.backdrop_path),
    description: x.overview || undefined,
    releaseInfo: x.first_air_date || undefined,
    imdbRating: x.vote_average || undefined
  };
}

function mixed(items) {
  return items
    .filter(x => x.media_type === "movie" || x.media_type === "tv")
    .map(x => x.media_type === "movie" ? movieMeta(x) : seriesMeta(x));
}

function dedupe(items) {
  const seen = new Set();
  return items.filter(x => {
    if (seen.has(x.id)) return false;
    seen.add(x.id);
    return true;
  });
}

async function trendingKenya() {
  // TMDB's trending endpoint is global rather than a true Kenya-specific chart.
  // We therefore use TMDB's discover endpoints with Kenya as the region where
  // release/availability filtering is useful, then merge the movie and TV
  // popularity results into one row.
  const [movies, tv] = await Promise.all([
    tmdb("/discover/movie", {
      watch_region: "KE",
      sort_by: "popularity.desc",
      page: 1,
      include_adult: "false"
    }),
    tmdb("/discover/tv", {
      watch_region: "KE",
      sort_by: "popularity.desc",
      page: 1,
      include_adult: "false"
    })
  ]);

  const merged = [
    ...movies.results.map(x => ({ ...x, media_type: "movie" })),
    ...tv.results.map(x => ({ ...x, media_type: "tv" }))
  ];

  merged.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  return mixed(merged).slice(0, 100);
}

async function airingToday() {
  const data = await tmdb("/tv/airing_today", { page: 1 });
  return (data.results || []).map(seriesMeta).slice(0, 100);
}

async function calendarVideos() {
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + 14);

  const fmt = d => d.toISOString().slice(0, 10);

  const [movies, tv] = await Promise.all([
    tmdb("/discover/movie", {
      "primary_release_date.gte": fmt(now),
      "primary_release_date.lte": fmt(end),
      sort_by: "primary_release_date.asc",
      page: 1,
      include_adult: "false"
    }),
    tmdb("/discover/tv", {
      "air_date.gte": fmt(now),
      "air_date.lte": fmt(end),
      sort_by: "first_air_date.asc",
      page: 1,
      include_adult: "false"
    })
  ]);

  const merged = [
    ...(movies.results || []).map(x => ({ ...x, media_type: "movie", calendarDate: x.release_date })),
    ...(tv.results || []).map(x => ({ ...x, media_type: "tv", calendarDate: x.first_air_date }))
  ];

  merged.sort((a, b) => String(a.calendarDate).localeCompare(String(b.calendarDate)));
  return mixed(merged).slice(0, 100);
}

async function top10Week() {
  const [movies, tv] = await Promise.all([
    tmdb("/discover/movie", {
      sort_by: "popularity.desc",
      page: 1,
      include_adult: "false"
    }),
    tmdb("/discover/tv", {
      sort_by: "popularity.desc",
      page: 1,
      include_adult: "false"
    })
  ]);

  const merged = [
    ...(movies.results || []).map(x => ({ ...x, media_type: "movie" })),
    ...(tv.results || []).map(x => ({ ...x, media_type: "tv" }))
  ];

  merged.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  return mixed(merged).slice(0, 10);
}

builder.defineCatalogHandler(async args => {
  const id = args.id;
  const skip = Number(args.extra?.skip || 0);

  let metas;

  try {
    if (id === "trending-kenya") metas = await trendingKenya();
    else if (id === "airing-today") metas = await airingToday();
    else if (id === "calendar-videos") metas = await calendarVideos();
    else if (id === "top10-week") metas = await top10Week();
    else metas = [];

    return {
      metas: metas.slice(skip, skip + 100),
      cacheMaxAge: 900,
      staleRevalidate: 1800,
      staleError: 86400
    };
  } catch (err) {
    console.error(err);
    return { metas: [] };
  }
});

serveHTTP(builder.getInterface(), { port: PORT });
console.log(`TMDB Home Catalogs addon listening on port ${PORT}`);
