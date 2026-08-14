const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");

const API = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";
const PORT = process.env.PORT || 7000;
const KEY = process.env.TMDB_API_KEY;

const manifest = {
  id: "org.pkimany254.tmdb-home-catalogs",
  version: "2.0.0",
  name: "TMDB WuPlay Home Catalogs",
  description: "Catalog-only WuPlay/Stremio addon powered by TMDB.",
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
      id: "new-episodes",
      type: "series",
      name: "New Episodes",
      extra: [{ name: "skip", isRequired: false }]
    },
    {
      id: "calendar-videos",
      type: "movie",
      name: "Calendar Videos",
      extra: [{ name: "skip", isRequired: false }]
    },
    {
      id: "top10-movies-week",
      type: "movie",
      name: "Top 10 Movies This Week",
      extra: [{ name: "skip", isRequired: false }]
    },
    {
      id: "top10-series-week",
      type: "series",
      name: "Top 10 Series This Week",
      extra: [{ name: "skip", isRequired: false }]
    },
    {
      id: "new-releases",
      type: "movie",
      name: "New Releases",
      extra: [{ name: "skip", isRequired: false }]
    },
    {
      id: "anime-movies",
      type: "movie",
      name: "Trending Anime Movies",
      extra: [{ name: "skip", isRequired: false }]
    },
    {
      id: "anime-series",
      type: "series",
      name: "Trending Anime Series",
      extra: [{ name: "skip", isRequired: false }]
    }
  ]
};

const builder = new addonBuilder(manifest);
const cache = new Map();

async function tmdb(path, params = {}, ttl = 900) {
  if (!KEY) {
    throw new Error("TMDB_API_KEY is not configured");
  }

  const url = new URL(API + path);

  url.searchParams.set("api_key", KEY);
  url.searchParams.set("language", "en-US");

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  }

  const cacheKey = url.toString();
  const cached = cache.get(cacheKey);

  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`TMDB ${response.status}`);
  }

  const data = await response.json();

  cache.set(cacheKey, {
    data,
    expires: Date.now() + ttl * 1000
  });

  return data;
}

function img(path, size = "w500") {
  return path ? `${IMG}/${size}${path}` : undefined;
}

function movieMeta(x) {
  return {
    id: `tmdb:${x.id}`,
    type: "movie",
    name: x.title || x.name,
    poster: img(x.poster_path),
    background: img(x.backdrop_path, "w1280"),
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
    poster: img(x.poster_path),
    background: img(x.backdrop_path, "w1280"),
    description: x.overview || undefined,
    releaseInfo: x.first_air_date || undefined,
    imdbRating: x.vote_average || undefined
  };
}

/*
 * Anime detection.
 *
 * TMDB doesn't provide a perfect "is anime" flag.
 * We use:
 *   Animation genre (16)
 *   +
 *   Japanese origin (JP)
 *
 * This keeps normal Western animation out of the anime catalogs.
 */
function isAnime(x) {
  return (
    (x.genre_ids || []).includes(16) &&
    (x.origin_country || []).includes("JP")
  );
}

function withoutAnime(items) {
  return items.filter(x => !isAnime(x));
}

function sortPopularity(items) {
  return [...items].sort(
    (a, b) => (b.popularity || 0) - (a.popularity || 0)
  );
}

function mixedMeta(items) {
  return items
    .filter(
      x => x.media_type === "movie" || x.media_type === "tv"
    )
    .map(x =>
      x.media_type === "movie"
        ? movieMeta(x)
        : seriesMeta(x)
    );
}

function dedupe(items) {
  const seen = new Set();

  return items.filter(item => {
    if (seen.has(item.id)) {
      return false;
    }

    seen.add(item.id);
    return true;
  });
}

function day(offset = 0) {
  const d = new Date();

  d.setUTCDate(d.getUTCDate() + offset);

  return d.toISOString().slice(0, 10);
}

/*
 * Check whether a movie has a TMDB digital release.
 *
 * TMDB release type:
 *
 * 4 = Digital
 * 5 = Physical
 * 6 = TV
 */
async function hasDigitalRelease(movieId) {
  const data = await tmdb(
    `/movie/${movieId}/release_dates`,
    {},
    86400
  );

  return (data.results || []).some(country =>
    (country.release_dates || []).some(
      release => release.type === 4
    )
  );
}

/*
 * Filter movie results so unreleased/CAM-style theatrical movies
 * don't appear in the general movie catalogs.
 */
async function digitalOnly(items) {
  const output = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const item = items[index++];

      try {
        if (await hasDigitalRelease(item.id)) {
          output.push(item);
        }
      } catch (error) {
        console.warn(
          "Digital release check failed:",
          item.id,
          error.message
        );
      }
    }
  }

  const workers = Math.min(8, items.length);

  await Promise.all(
    Array.from({ length: workers }, worker)
  );

  return output;
}

/*
 * 1. TRENDING IN KENYA
 *
 * Movies + series
 * Kenya watch-region
 * Movies require digital release
 * Anime excluded
 * Popularity sorted
 */
async function trendingKenya() {
  const [movies, tv] = await Promise.all([
    tmdb("/discover/movie", {
      watch_region: "KE",
      sort_by: "popularity.desc",
      include_adult: "false",
      page: 1
    }),

    tmdb("/discover/tv", {
      watch_region: "KE",
      sort_by: "popularity.desc",
      include_adult: "false",
      page: 1
    })
  ]);

  const movieItems = withoutAnime(
    (movies.results || []).map(x => ({
      ...x,
      media_type: "movie"
    }))
  );

  const digitalMovies = await digitalOnly(movieItems);

  const seriesItems = withoutAnime(
    (tv.results || []).map(x => ({
      ...x,
      media_type: "tv"
    }))
  );

  const combined = sortPopularity([
    ...digitalMovies,
    ...seriesItems
  ]);

  return mixedMeta(dedupe(combined)).slice(0, 100);
}

/*
 * 2. AIRING TODAY
 *
 * Only reasonably popular shows.
 * Anime excluded.
 */
async function airingToday() {
  const data = await tmdb(
    "/tv/airing_today",
    { page: 1 }
  );

  const shows = withoutAnime(
    data.results || []
  ).filter(
    x => (x.popularity || 0) >= 10
  );

  return shows
    .sort(
      (a, b) =>
        (b.popularity || 0) -
        (a.popularity || 0)
    )
    .map(seriesMeta)
    .slice(0, 100);
}

/*
 * 3. NEW EPISODES
 *
 * Popular series with recent air-date activity.
 *
 * Window: last 7 days.
 */
async function newEpisodes() {
  const data = await tmdb(
    "/discover/tv",
    {
      "air_date.gte": day(-7),
      "air_date.lte": day(),
      sort_by: "popularity.desc",
      include_adult: "false",
      page: 1
    }
  );

  const shows = withoutAnime(
    data.results || []
  ).filter(
    x => (x.popularity || 0) >= 10
  );

  return shows
    .sort(
      (a, b) =>
        (b.popularity || 0) -
        (a.popularity || 0)
    )
    .map(seriesMeta)
    .slice(0, 100);
}

/*
 * 4. CALENDAR VIDEOS
 *
 * Upcoming movies + series
 * Next 14 days
 * Popularity sorted
 * Anime excluded
 * Movies require digital release
 */
async function calendarVideos() {
  const [movies, tv] = await Promise.all([
    tmdb("/discover/movie", {
      "primary_release_date.gte": day(),
      "primary_release_date.lte": day(14),
      sort_by: "popularity.desc",
      include_adult: "false",
      page: 1
    }),

    tmdb("/discover/tv", {
      "air_date.gte": day(),
      "air_date.lte": day(14),
      sort_by: "popularity.desc",
      include_adult: "false",
      page: 1
    })
  ]);

  const movieItems = withoutAnime(
    (movies.results || []).map(x => ({
      ...x,
      media_type: "movie"
    }))
  );

  const digitalMovies = await digitalOnly(movieItems);

  const seriesItems = withoutAnime(
    (tv.results || []).map(x => ({
      ...x,
      media_type: "tv"
    }))
  );

  const combined = sortPopularity([
    ...digitalMovies,
    ...seriesItems
  ]);

  return mixedMeta(
    dedupe(combined)
  ).slice(0, 100);
}

/*
 * 5. TOP 10 MOVIES THIS WEEK
 *
 * Uses TMDB weekly trending.
 * Only movies released during the current year.
 * Anime excluded.
 * Digital release required.
 */
async function top10MoviesWeek() {
  const data = await tmdb(
    "/trending/movie/week",
    { page: 1 }
  );

  const currentYear =
    new Date().getUTCFullYear();

  let movies = (data.results || [])
    .filter(
      x =>
        (x.release_date || "").startsWith(
          String(currentYear)
        )
    )
    .filter(
      x => !isAnime(x)
    );

  movies = await digitalOnly(movies);

  return movies
    .sort(
      (a, b) =>
        (b.popularity || 0) -
        (a.popularity || 0)
    )
    .map(movieMeta)
    .slice(0, 10);
}

/*
 * 6. TOP 10 SERIES THIS WEEK
 *
 * Uses TMDB weekly trending.
 * Only shows first aired during current year.
 * Anime excluded.
 */
async function top10SeriesWeek() {
  const data = await tmdb(
    "/trending/tv/week",
    { page: 1 }
  );

  const currentYear =
    new Date().getUTCFullYear();

  return (data.results || [])
    .filter(
      x =>
        (x.first_air_date || "").startsWith(
          String(currentYear)
        )
    )
    .filter(
      x => !isAnime(x)
    )
    .sort(
      (a, b) =>
        (b.popularity || 0) -
        (a.popularity || 0)
    )
    .map(seriesMeta)
    .slice(0, 10);
}

/*
 * 7. NEW RELEASES
 *
 * Last 14 days
 * Popular movies + series
 * Anime excluded
 * Movies require digital release.
 */
async function newReleases() {
  const [movies, tv] = await Promise.all([
    tmdb("/discover/movie", {
      "primary_release_date.gte": day(-14),
      "primary_release_date.lte": day(),
      sort_by: "popularity.desc",
      include_adult: "false",
      page: 1
    }),

    tmdb("/discover/tv", {
      "first_air_date.gte": day(-14),
      "first_air_date.lte": day(),
      sort_by: "popularity.desc",
      include_adult: "false",
      page: 1
    })
  ]);

  const movieItems = withoutAnime(
    (movies.results || [])
      .filter(
        x => (x.popularity || 0) >= 10
      )
      .map(x => ({
        ...x,
        media_type: "movie"
      }))
  );

  const digitalMovies =
    await digitalOnly(movieItems);

  const seriesItems = withoutAnime(
    (tv.results || [])
      .filter(
        x => (x.popularity || 0) >= 10
      )
      .map(x => ({
        ...x,
        media_type: "tv"
      }))
  );

  const combined = sortPopularity([
    ...digitalMovies,
    ...seriesItems
  ]);

  return mixedMeta(
    dedupe(combined)
  ).slice(0, 100);
}

/*
 * 8. TRENDING ANIME MOVIES
 */
async function animeMovies() {
  const data = await tmdb(
    "/trending/movie/week",
    { page: 1 }
  );

  return (data.results || [])
    .filter(
      x => isAnime(x)
    )
    .sort(
      (a, b) =>
        (b.popularity || 0) -
        (a.popularity || 0)
    )
    .map(movieMeta)
    .slice(0, 100);
}

/*
 * 9. TRENDING ANIME SERIES
 */
async function animeSeries() {
  const data = await tmdb(
    "/trending/tv/week",
    { page: 1 }
  );

  return (data.results || [])
    .filter(
      x => isAnime(x)
    )
    .sort(
      (a, b) =>
        (b.popularity || 0) -
        (a.popularity || 0)
    )
    .map(seriesMeta)
    .slice(0, 100);
}

/*
 * CATALOG HANDLER
 */
builder.defineCatalogHandler(
  async args => {
    let metas = [];

    try {
      switch (args.id) {
        case "trending-kenya":
          metas = await trendingKenya();
          break;

        case "airing-today":
          metas = await airingToday();
          break;

        case "new-episodes":
          metas = await newEpisodes();
          break;

        case "calendar-videos":
          metas = await calendarVideos();
          break;

        case "top10-movies-week":
          metas = await top10MoviesWeek();
          break;

        case "top10-series-week":
          metas = await top10SeriesWeek();
          break;

        case "new-releases":
          metas = await newReleases();
          break;

        case "anime-movies":
          metas = await animeMovies();
          break;

        case "anime-series":
          metas = await animeSeries();
          break;

        default:
          metas = [];
      }
    } catch (error) {
      console.error(
        `Catalog ${args.id} failed:`,
        error
      );
    }

    const skip =
      Number(args.extra?.skip || 0);

    return {
      metas: metas.slice(
        skip,
        skip + 100
      ),

      cacheMaxAge: 900,
      staleRevalidate: 1800,
      staleError: 86400
    };
  }
);

serveHTTP(
  builder.getInterface(),
  { port: PORT }
);

console.log(
  `TMDB WuPlay Home Catalogs v2.0 listening on ${PORT}`
);
