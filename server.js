const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");

const API = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";
const PORT = process.env.PORT || 7000;
const KEY = process.env.TMDB_API_KEY;

const manifest = {
  id: "org.pkimany254.tmdb-home-catalogs",
  version: "1.0.3",
  name: "TMDB WuPlay Home Catalogs",
  description: "Catalog-only WuPlay/Stremio addon powered by TMDB.",
  resources: ["catalog"],
  types: ["movie", "series"],
  idPrefixes: ["tt", "tmdb:"],

  catalogs: [
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
      id: "top10-week",
      type: "movie",
      name: "Top 10 This Week",
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
      id: "anime-series",
      type: "series",
      name: "Trending Anime Series",
      extra: [{ name: "skip", isRequired: false }]
    },
    {
      id: "trending-animation",
      type: "movie",
      name: "Trending Animation",
      extra: [{ name: "skip", isRequired: false }]
    },
    {
      id: "trending-movies",
      type: "movie",
      name: "Trending Movies",
      extra: [{ name: "skip", isRequired: false }]
    },
    {
      id: "trending-series",
      type: "series",
      name: "Trending Series",
      extra: [{ name: "skip", isRequired: false }]
    },
    {
  id: "top-picks",
  type: "movie",
  name: "Top Picks",
  extra: [{ name: "skip", isRequired: false }]
},
    {
      id: "popular-movies",
      type: "movie",
      name: "Popular Movies",
      extra: [{ name: "skip", isRequired: false }]
    },
    {
      id: "in-theatres",
      type: "movie",
      name: "In Theatres",
      extra: [{ name: "skip", isRequired: false }]
    },
    {
      id: "top-rated-movies",
      type: "movie",
      name: "Top Rated Movies",
      extra: [{ name: "skip", isRequired: false }]
    },
    {
      id: "most-rated-movies",
      type: "movie",
      name: "Most Rated Movies",
      extra: [{ name: "skip", isRequired: false }]
    },
    {
      id: "now-playing",
      type: "movie",
      name: "Now Playing",
      extra: [{ name: "skip", isRequired: false }]
    },
    {
      id: "upcoming-movies",
      type: "movie",
      name: "Upcoming Movies",
      extra: [{ name: "skip", isRequired: false }]
    },
    {
      id: "newly-released-movies",
      type: "movie",
      name: "Newly Released Movies",
      extra: [{ name: "skip", isRequired: false }]
    },
    {
      id: "popular-series",
      type: "series",
      name: "Popular Series",
      extra: [{ name: "skip", isRequired: false }]
    },
    {
      id: "top-rated-series",
      type: "series",
      name: "Top Rated Series",
      extra: [{ name: "skip", isRequired: false }]
    },
    {
      id: "most-rated-series",
      type: "series",
      name: "Most Rated Series",
      extra: [{ name: "skip", isRequired: false }]
    },
    {
      id: "on-the-air",
      type: "series",
      name: "On The Air",
      extra: [{ name: "skip", isRequired: false }]
    },
    {
      id: "upcoming-series",
      type: "series",
      name: "Upcoming Series",
      extra: [{ name: "skip", isRequired: false }]
    },
    {
      id: "newly-released-series",
      type: "series",
      name: "Newly Released Series",
      extra: [{ name: "skip", isRequired: false }]
    }
  ]
};

const builder = new addonBuilder(manifest);
const cache = new Map();

/* =========================================================
   TMDB REQUEST CONCURRENCY LIMIT
========================================================= */

const TMDB_MAX_CONCURRENT = 10;

let tmdbActiveRequests = 0;
const tmdbQueue = [];

function acquireTmdbSlot() {
  return new Promise(resolve => {

    if (tmdbActiveRequests < TMDB_MAX_CONCURRENT) {
      tmdbActiveRequests++;
      resolve();
      return;
    }

    tmdbQueue.push(resolve);
  });
}

function releaseTmdbSlot() {
  tmdbActiveRequests--;

  if (tmdbQueue.length > 0) {
    const next = tmdbQueue.shift();

    tmdbActiveRequests++;

    next();
  }
}

/* =========================================================
   TMDB REQUEST
========================================================= */

async function tmdb(path, params = {}, ttl = 900) {

  if (!KEY) {
    throw new Error("TMDB_API_KEY is not configured");
  }

  const url = new URL(API + path);

  url.searchParams.set("api_key", KEY);
  url.searchParams.set("language", "en-US");

  for (const [key, value] of Object.entries(params)) {

    if (
      value !== undefined &&
      value !== null
    ) {
      url.searchParams.set(
        key,
        value
      );
    }
  }

  const cacheKey = url.toString();

  /* -------------------------------------------------------
     CHECK CACHE BEFORE QUEUING
  ------------------------------------------------------- */

  const cached = cache.get(cacheKey);

  if (
    cached &&
    cached.expires > Date.now()
  ) {
    return cached.data;
  }

  /* -------------------------------------------------------
     WAIT FOR A TMDB REQUEST SLOT
  ------------------------------------------------------- */

  await acquireTmdbSlot();

  try {

    /* -----------------------------------------------------
       CHECK CACHE AGAIN

       Another request may have populated the cache while
       this request was waiting in the queue.
    ----------------------------------------------------- */

    const cachedAgain =
      cache.get(cacheKey);

    if (
      cachedAgain &&
      cachedAgain.expires > Date.now()
    ) {
      return cachedAgain.data;
    }

    /* -----------------------------------------------------
       TMDB REQUEST
    ----------------------------------------------------- */

    const response =
      await fetch(url);

    if (!response.ok) {
      throw new Error(
        `TMDB ${response.status}`
      );
    }

    const data =
      await response.json();

    /* -----------------------------------------------------
       SAVE TO CACHE
    ----------------------------------------------------- */

    cache.set(
      cacheKey,
      {
        data,
        expires:
          Date.now() +
          ttl * 1000
      }
    );

    return data;

  } finally {

    /* -----------------------------------------------------
       ALWAYS RELEASE THE SLOT

       Even if TMDB returns an error.
    ----------------------------------------------------- */

    releaseTmdbSlot();
  }
}

/* =========================================================
   HELPERS
========================================================= */

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
    imdbRating: x.vote_average || undefined,
    _genreIds: x.genre_ids || [],
    _mediaType: "movie"
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
    imdbRating: x.vote_average || undefined,
    _genreIds: x.genre_ids || [],
    _mediaType: "series"
  };
}

/* =========================================================
   CANONICAL CONTENT IDs FOR WUPLAY USER STATE

   The catalog selection/filtering remains TMDB-based. Before
   returning the catalog, we resolve each TMDB ID to its IMDb ID
   when TMDB provides one.

   If no IMDb ID exists, the original tmdb:<id> is retained.
========================================================= */

const externalIdCache = new Map();

async function getCanonicalId(tmdbId, mediaType) {
  const key = `${mediaType}:${tmdbId}`;
  const cached = externalIdCache.get(key);

  if (cached && cached.expires > Date.now()) {
    return cached.id;
  }

  try {
    const endpoint =
      mediaType === "movie"
        ? `/movie/${tmdbId}/external_ids`
        : `/tv/${tmdbId}/external_ids`;

    const data = await tmdb(endpoint, {}, 86400);

    const id =
      data.imdb_id ||
      `tmdb:${tmdbId}`;

    externalIdCache.set(key, {
      id,
      expires: Date.now() + 86400 * 1000
    });

    return id;

  } catch (error) {

    console.warn(
      `IMDb ID lookup failed for ${mediaType}:${tmdbId}:`,
      error.message
    );

    const fallback =
      `tmdb:${tmdbId}`;

    externalIdCache.set(key, {
      id: fallback,
      expires: Date.now() + 3600 * 1000
    });

    return fallback;
  }
}

async function canonicalizeCatalogIds(
  metas,
  concurrency = 6
) {
  const output = [...metas];

  let nextIndex = 0;

  async function worker() {

    while (true) {

      const index = nextIndex++;

      if (index >= output.length) {
        return;
      }

      const meta = output[index];

      if (
        !meta ||
        !meta.id ||
        !meta.id.startsWith("tmdb:")
      ) {
        continue;
      }

      const tmdbId =
        meta.id.slice(5);

      const mediaType =
        meta._mediaType === "movie"
          ? "movie"
          : "series";

      meta.id =
        await getCanonicalId(
          tmdbId,
          mediaType
        );
    }
  }

  const workerCount =
    Math.min(
      concurrency,
      output.length
    );

  await Promise.all(
    Array.from(
      {
        length: workerCount
      },
      worker
    )
  );

  return output;
}

/*
 * Anime detection for EXCLUDING anime from normal rows.
 *
 * Animation genre = 16
 * Japanese origin = JP
 */

function isAnime(x) {
  return (
    (x.genre_ids || []).includes(16) &&
    (x.origin_country || []).includes("JP")
  );
}

function withoutAnime(items) {
  return items.filter(
    x => !isAnime(x)
  );
}

const EXCLUDED_TV_GENRES =
  new Set([
    99,     // Documentary
    10402,  // Music
    10763,  // News
    10764,  // Reality
    10766,  // Soap
    10767   // Talk
  ]);

const EXCLUDED_MOVIE_GENRES =
  new Set([
    99,     // Documentary
    10402,  // Music
    10770   // TV Movie
  ]);

function withoutExcludedGenres(
  items,
  mediaType
) {

  const excluded =
    mediaType === "movie"
      ? EXCLUDED_MOVIE_GENRES
      : EXCLUDED_TV_GENRES;

  return items.filter(
    item =>
      !(item.genre_ids || []).some(
        id => excluded.has(id)
      )
  );
}

function sortPopularity(items) {
  return [...items].sort(
    (a, b) =>
      (b.popularity || 0) -
      (a.popularity || 0)
  );
}

function mixedMeta(items) {
  return items
    .filter(
      x =>
        x.media_type === "movie" ||
        x.media_type === "tv"
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

  d.setUTCDate(
    d.getUTCDate() + offset
  );

  return d
    .toISOString()
    .slice(0, 10);
}

async function tmdbPages(
  endpoint,
  params = {},
  pages = 3
) {

  let results = [];

  for (
    let page = 1;
    page <= pages;
    page++
  ) {

    const data =
      await tmdb(
        endpoint,
        {
          ...params,
          page
        },
        900
      );

    results.push(
      ...(data.results || [])
    );
  }

  return results;
}

/* =========================================================
   DIGITAL RELEASE FILTER
========================================================= */

/*
 * TMDB release type:
 *
 * 1 = Premiere
 * 2 = Theatrical limited
 * 3 = Theatrical
 * 4 = Digital
 * 5 = Physical
 * 6 = TV
 *
 * We only allow movies that have a type 4 digital release.
 */

async function hasDigitalRelease(
  movieId
) {

  const data =
    await tmdb(
      `/movie/${movieId}/release_dates`,
      {},
      86400
    );

  return (
    data.results || []
  ).some(
    country =>
      (country.release_dates || [])
        .some(
          release =>
            release.type === 4
        )
  );
}

async function digitalOnly(items) {

  const output = [];

  let index = 0;

  async function worker() {

    while (
      index < items.length
    ) {

      const item =
        items[index++];

      try {

        if (
          await hasDigitalRelease(
            item.id
          )
        ) {
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

  const workerCount =
    Math.min(
      8,
      items.length
    );

  await Promise.all(
    Array.from(
      {
        length: workerCount
      },
      worker
    )
  );

  return output;
}

/* =========================================================
   1. TRENDING IN KENYA
========================================================= */

async function trendingKenya() {

  const [
    movies,
    tv
  ] = await Promise.all([

    tmdb(
      "/discover/movie",
      {
        watch_region: "KE",
        sort_by: "popularity.desc",
        include_adult: "false",
        page: 1
      }
    ),

    tmdb(
      "/discover/tv",
      {
        watch_region: "KE",
        sort_by: "popularity.desc",
        include_adult: "false",
        page: 1
      }
    )
  ]);

  const movieItems =
    withoutAnime(
      (movies.results || [])
        .map(x => ({
          ...x,
          media_type: "movie"
        }))
    );

  const digitalMovies =
    await digitalOnly(
      movieItems
    );

  const seriesItems =
    withoutAnime(
      (tv.results || [])
        .map(x => ({
          ...x,
          media_type: "tv"
        }))
    );

  const combined =
    sortPopularity([
      ...digitalMovies,
      ...seriesItems
    ]);

  return mixedMeta(
    dedupe(combined)
  ).slice(0, 100);
}

/* =========================================================
   2. AIRING TODAY
========================================================= */

async function airingToday() {

  let shows =
    await tmdbPages(
      "/tv/airing_today",
      {},
      10
    );

  shows =
    withoutAnime(
      shows
    ).filter(
      x =>
        (x.popularity || 0) >= 10 &&
         x.original_language === "en" &&
        !(x.genre_ids || []).includes(16)
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

/* =========================================================
   3. NEW EPISODES
========================================================= */

async function newEpisodes() {

  const data =
    await tmdb(
      "/discover/tv",
      {
        "air_date.gte":
          day(-7),

        "air_date.lte":
          day(),

        sort_by:
          "popularity.desc",

        include_adult:
          "false",

        page: 1
      }
    );

  const shows =
    withoutAnime(
      data.results || []
    ).filter(
      x =>
        (x.popularity || 0) >= 10
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

/* =========================================================
   4. CALENDAR VIDEOS
========================================================= */

async function calendarVideos() {

  const [
    movies,
    tv
  ] = await Promise.all([

    tmdb(
      "/discover/movie",
      {
        "primary_release_date.gte":
          day(),

        "primary_release_date.lte":
          day(14),

        sort_by:
          "popularity.desc",

        include_adult:
          "false",

        page: 1
      }
    ),

    tmdb(
      "/discover/tv",
      {
        "air_date.gte":
          day(),

        "air_date.lte":
          day(14),

        sort_by:
          "popularity.desc",

        include_adult:
          "false",

        page: 1
      }
    )
  ]);

  const movieItems =
    withoutAnime(
      (movies.results || [])
        .map(x => ({
          ...x,
          media_type: "movie"
        }))
    );

  const digitalMovies =
    await digitalOnly(
      movieItems
    );

  const seriesItems =
    withoutAnime(
      (tv.results || [])
        .map(x => ({
          ...x,
          media_type: "tv"
        }))
    );

  const combined =
    sortPopularity([
      ...digitalMovies,
      ...seriesItems
    ]);

  return mixedMeta(
    dedupe(combined)
  ).slice(0, 100);
}

/* =========================================================
   5. TOP 10 THIS WEEK
   MIXED MOVIES + SERIES
========================================================= */

async function top10Week() {

  const [
    movieTrending,
    seriesTrending
  ] = await Promise.all([

    tmdb(
      "/trending/movie/week",
      { page: 1 }
    ),

    tmdb(
      "/trending/tv/week",
      { page: 1 }
    )
  ]);

  const currentYear =
    new Date()
      .getUTCFullYear();

  let movies =
    (movieTrending.results || [])
      .filter(
        x =>
          (x.release_date || "")
            .startsWith(
              String(currentYear)
            )
      )
      .filter(
        x => !isAnime(x)
      );

  movies =
    await digitalOnly(
      movies
    );

  movies =
    movies.map(x => ({
      ...x,
      media_type: "movie"
    }));

  const series =
    (seriesTrending.results || [])
      .filter(
        x =>
          (x.first_air_date || "")
            .startsWith(
              String(currentYear)
            )
      )
      .filter(
        x => !isAnime(x)
      )
      .map(x => ({
        ...x,
        media_type: "tv"
      }));

  const combined =
    sortPopularity([
      ...movies,
      ...series
    ]);

  return mixedMeta(
    dedupe(combined)
  ).slice(0, 10);
}

/* =========================================================
   6. TOP 10 MOVIES THIS WEEK
========================================================= */

async function top10MoviesWeek() {

  const data =
    await tmdb(
      "/trending/movie/week",
      { page: 1 }
    );

  const currentYear =
    new Date()
      .getUTCFullYear();

  let movies =
    (data.results || [])
      .filter(
        x =>
          (x.release_date || "")
            .startsWith(
              String(currentYear)
            )
      )
      .filter(
        x => !isAnime(x)
      );

  movies =
    await digitalOnly(
      movies
    );

  return movies
    .sort(
      (a, b) =>
        (b.popularity || 0) -
        (a.popularity || 0)
    )
    .map(movieMeta)
    .slice(0, 10);
}

/* =========================================================
   7. TOP 10 SERIES THIS WEEK
========================================================= */

async function top10SeriesWeek() {

  const data =
    await tmdb(
      "/trending/tv/week",
      { page: 1 }
    );

  const currentYear =
    new Date()
      .getUTCFullYear();

  return (
    data.results || []
  )
    .filter(
      x =>
        (x.first_air_date || "")
          .startsWith(
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

/* =========================================================
   8. NEW RELEASES
========================================================= */

async function newReleases() {

  const [
    movies,
    tv
  ] = await Promise.all([

    tmdb(
      "/discover/movie",
      {
        "primary_release_date.gte":
          day(-14),

        "primary_release_date.lte":
          day(),

        sort_by:
          "popularity.desc",

        include_adult:
          "false",

        page: 1
      }
    ),

    tmdb(
      "/discover/tv",
      {
        "first_air_date.gte":
          day(-14),

        "first_air_date.lte":
          day(),

        sort_by:
          "popularity.desc",

        include_adult:
          "false",

        page: 1
      }
    )
  ]);

  const movieItems =
    withoutAnime(
      (movies.results || [])
        .filter(
          x =>
            (x.popularity || 0) >= 10
        )
        .map(x => ({
          ...x,
          media_type: "movie"
        }))
    );

  const digitalMovies =
    await digitalOnly(
      movieItems
    );

  const seriesItems =
    withoutAnime(
      (tv.results || [])
        .filter(
          x =>
            (x.popularity || 0) >= 10
        )
        .map(x => ({
          ...x,
          media_type: "tv"
        }))
    );

  const combined =
    sortPopularity([
      ...digitalMovies,
      ...seriesItems
    ]);

  return mixedMeta(
    dedupe(combined)
  ).slice(0, 100);
}

/* =========================================================
   9. TRENDING ANIME SERIES
========================================================= */

async function animeSeries() {

  const pages =
    [1, 2, 3, 4, 5];

  const responses =
    await Promise.all(
      pages.map(
        page =>
          tmdb(
            "/discover/tv",
            {
              with_genres: "16",
              with_origin_country: "JP",
              sort_by:
                "popularity.desc",
              include_adult:
                "false",
              page
            },
            1800
          )
      )
    );

  let anime = [];

  for (
    const response of responses
  ) {

    anime.push(
      ...(response.results || [])
    );
  }

  anime =
    anime.filter(
      x =>
        (x.genre_ids || [])
          .includes(16) &&
        (
          x.origin_country || []
        ).includes("JP")
    );

  anime =
    sortPopularity(
      dedupe(
        anime.map(x => ({
          ...x,
          media_type: "tv"
        }))
      )
    );

  return anime
    .map(seriesMeta)
    .slice(0, 100);
}

/* =========================================================
   10. TRENDING ANIMATION
========================================================= */

async function trendingAnimation() {

  const [
    movies,
    tv
  ] = await Promise.all([

    tmdb(
      "/discover/movie",
      {
        with_genres: "16",
        sort_by:
          "popularity.desc",
        include_adult:
          "false",
        page: 1
      }
    ),

    tmdb(
      "/discover/tv",
      {
        with_genres: "16",
        sort_by:
          "popularity.desc",
        include_adult:
          "false",
        page: 1
      }
    )
  ]);

  let movieItems =
    withoutAnime(
      (movies.results || [])
        .map(x => ({
          ...x,
          media_type: "movie"
        }))
    );

  movieItems =
    await digitalOnly(
      movieItems
    );

  const seriesItems =
    withoutAnime(
      (tv.results || [])
        .map(x => ({
          ...x,
          media_type: "tv"
        }))
    );

  const combined =
    sortPopularity([
      ...movieItems,
      ...seriesItems
    ]);

  return mixedMeta(
    dedupe(combined)
  ).slice(0, 100);
}

/* =========================================================
   11. TRENDING MOVIES
========================================================= */

async function trendingMovies() {

  const target = 100;
  const maxPages = 10;

  let validMovies = [];
  let page = 1;

  while (
    validMovies.length < target &&
    page <= maxPages
  ) {

    const data =
      await tmdb(
        "/trending/movie/week",
        { page },
        900
      );

    let movies =
      data.results || [];

    if (!movies.length) {
      break;
    }

    movies =
      withoutAnime(movies);

    movies =
      movies.filter(
        x =>
          !(x.genre_ids || [])
            .includes(16)
      );

    movies =
      withoutExcludedGenres(
        movies,
        "movie"
      );

    movies =
      movies.map(x => ({
        ...x,
        media_type: "movie"
      }));

    const existingIds =
      new Set(
        validMovies.map(
          x => x.id
        )
      );

    movies =
      movies.filter(
        x =>
          !existingIds.has(x.id)
      );

    const digitalMovies =
      await digitalOnly(
        movies
      );

    validMovies.push(
      ...digitalMovies
    );

    page++;
  }

  return sortPopularity(
    dedupe(validMovies)
  )
    .map(movieMeta)
    .slice(0, target);
}

/* =========================================================
   12. TRENDING SERIES
========================================================= */

async function trendingSeries() {

  const target = 100;
  const maxPages = 10;

  let validSeries = [];
  let page = 1;

  while (
    validSeries.length < target &&
    page <= maxPages
  ) {

    const data =
      await tmdb(
        "/trending/tv/week",
        { page },
        900
      );

    let series =
      data.results || [];

    if (!series.length) {
      break;
    }

    series =
      withoutAnime(series);

    series =
      series.filter(
        x =>
          !(x.genre_ids || [])
            .includes(16)
      );

    series =
      withoutExcludedGenres(
        series,
        "series"
      );

    series =
      series.map(x => ({
        ...x,
        media_type: "tv"
      }));

    const existingIds =
      new Set(
        validSeries.map(
          x => x.id
        )
      );

    series =
      series.filter(
        x =>
          !existingIds.has(x.id)
      );

    series =
      series.filter(
        x =>
          Boolean(x.poster_path)
      );

    validSeries.push(
      ...series
    );

    page++;
  }

  return sortPopularity(
    dedupe(validSeries)
  )
    .map(seriesMeta)
    .slice(0, target);
}

/* =========================================================
   13. POPULA MOVIES
========================================================= */

async function popularMovies() {

  const target = 100;
  const maxPages = 10;

  let validMovies = [];
  let page = 1;

  while (
    validMovies.length < target &&
    page <= maxPages
  ) {

    let movies =
      await tmdb(
        "/movie/popular",
        { page },
        900
      );

    movies =
      movies.results || [];

    if (!movies.length) {
      break;
    }

    movies =
      withoutAnime(movies);

    movies =
      movies.filter(
        x =>
          !(x.genre_ids || [])
            .includes(16)
      );

    movies =
      withoutExcludedGenres(
        movies,
        "movie"
      );

    movies =
      movies.map(x => ({
        ...x,
        media_type: "movie"
      }));

    const existingIds =
      new Set(
        validMovies.map(
          x => x.id
        )
      );

    movies =
      movies.filter(
        x =>
          !existingIds.has(x.id)
      );

    const digitalMovies =
      await digitalOnly(
        movies
      );

    validMovies.push(
      ...digitalMovies
    );

    page++;
  }

  return sortPopularity(
    dedupe(validMovies)
  )
    .map(movieMeta)
    .slice(0, target);
}

/* =========================================================
   14. IN THEATRES — RECENT THEATRICAL MOVIES AWAITING DIGITAL RELEASE
========================================================= */

async function inTheatres() {

  const startDate =
    day(-90);

  const endDate =
    day();

  let movies =
    await tmdbPages(
      "/movie/now_playing",
      {},
      3
    );

  movies =
    movies.filter(
      x => {
        const releaseDate =
          x.release_date || "";

        return (
          releaseDate >= startDate &&
          releaseDate <= endDate
        );
      }
    );

  movies =
    withoutAnime(movies);

  movies =
    movies.filter(
      x =>
        !(x.genre_ids || [])
          .includes(16)
    );

  movies =
    withoutExcludedGenres(
      movies,
      "movie"
    );

  movies =
    movies.map(x => ({
      ...x,
      media_type: "movie"
    }));

  const withoutDigitalRelease = [];

  let index = 0;

  async function worker() {

    while (
      index < movies.length
    ) {

      const item =
        movies[index++];

      try {

        if (
          !(await hasDigitalRelease(item.id))
        ) {
          withoutDigitalRelease.push(item);
        }

      } catch (error) {

        console.warn(
          "Theatre digital release check failed:",
          item.id,
          error.message
        );
      }
    }
  }

  const workerCount =
    Math.min(
      8,
      movies.length
    );

  await Promise.all(
    Array.from(
      {
        length: workerCount
      },
      worker
    )
  );

  return sortPopularity(
    dedupe(withoutDigitalRelease)
  )
    .map(movieMeta)
    .slice(0, 100);
}

async function topRatedMovies() {

  let movies =
    await tmdbPages(
      "/movie/top_rated",
      {},
      3
    );

  movies =
    withoutAnime(movies);

  movies =
    movies.filter(
      x =>
        !(x.genre_ids || [])
          .includes(16)
    );

  movies =
    withoutExcludedGenres(
      movies,
      "movie"
    );

  movies =
    movies.map(x => ({
      ...x,
      media_type: "movie"
    }));

  return dedupe(movies)
    .map(movieMeta)
    .slice(0, 100);
}

async function mostRatedMovies() {

  let movies =
    await tmdbPages(
      "/discover/movie",
      {
        sort_by:
          "vote_count.desc",
        include_adult:
          "false"
      },
      3
    );

  movies =
    withoutAnime(movies);

  movies =
    movies.filter(
      x =>
        !(x.genre_ids || [])
          .includes(16)
    );

  movies =
    withoutExcludedGenres(
      movies,
      "movie"
    );

  movies =
    movies.map(x => ({
      ...x,
      media_type: "movie"
    }));

  return dedupe(movies)
    .map(movieMeta)
    .slice(0, 100);
}

async function nowPlaying() {

  const startDate =
    day(-7);

  const endDate =
    day();

  let movies =
    await tmdbPages(
      "/movie/now_playing",
      {},
      3
    );

  movies =
    movies.filter(
      x => {
        const releaseDate =
          x.release_date || "";

        return (
          releaseDate >= startDate &&
          releaseDate <= endDate
        );
      }
    );

  movies =
    withoutAnime(movies);

  movies =
    movies.filter(
      x =>
        !(x.genre_ids || [])
          .includes(16)
    );

  movies =
    withoutExcludedGenres(
      movies,
      "movie"
    );

  movies =
    movies.map(x => ({
      ...x,
      media_type: "movie"
    }));

  movies =
    await digitalOnly(
      movies
    );

  return sortPopularity(
    dedupe(movies)
  )
    .map(movieMeta)
    .slice(0, 100);
}

async function upcomingMovies() {

  const tomorrowDate =
    new Date();

  tomorrowDate.setDate(
    tomorrowDate.getDate() + 1
  );

  const tomorrow =
    tomorrowDate
      .toISOString()
      .split("T")[0];

  const endOfYear =
    `${new Date().getFullYear()}-12-31`;

  let movies =
    await tmdbPages(
      "/discover/movie",
      {
        sort_by:
          "popularity.desc",

        "primary_release_date.gte":
          tomorrow,

        "primary_release_date.lte":
          endOfYear,

        include_adult:
          "false"
      },
      5
    );

  movies =
    withoutAnime(movies);

  movies =
    movies.filter(
      x =>
        !(x.genre_ids || [])
          .includes(16)
    );

  movies =
    withoutExcludedGenres(
      movies,
      "movie"
    );

  movies =
    movies.map(x => ({
      ...x,
      media_type: "movie"
    }));

  return sortPopularity(
    dedupe(movies)
  )
    .map(movieMeta)
    .slice(0, 100);
}

async function newlyReleasedMovies() {

  const today =
    new Date()
      .toISOString()
      .split("T")[0];

  const threeMonthsAgo =
    new Date();

  threeMonthsAgo.setMonth(
    threeMonthsAgo.getMonth() - 3
  );

  const startDate =
    threeMonthsAgo
      .toISOString()
      .split("T")[0];

  let movies =
    await tmdbPages(
      "/discover/movie",
      {
        sort_by:
          "popularity.desc",

        "primary_release_date.gte":
          startDate,

        "primary_release_date.lte":
          today,

        include_adult:
          "false"
      },
      10
    );

  movies =
    withoutAnime(movies);

  movies =
    movies.filter(
      x =>
        !(x.genre_ids || [])
          .includes(16)
    );

  movies =
    withoutExcludedGenres(
      movies,
      "movie"
    );

  movies =
    movies.map(x => ({
      ...x,
      media_type: "movie"
    }));

  return sortPopularity(
    dedupe(movies)
  )
    .map(movieMeta)
    .slice(0, 100);
}

/* =========================================================
   15. POPULAR SERIES
========================================================= */

async function popularSeries() {

  let series =
    await tmdbPages(
      "/tv/popular",
      {},
      10
    );

  series =
    withoutAnime(series);

  series =
    series.filter(
      x =>
        !(x.genre_ids || [])
          .includes(16)
    );

  series =
    withoutExcludedGenres(
      series,
      "series"
    );

  series =
    series.map(x => ({
      ...x,
      media_type: "tv"
    }));

  return sortPopularity(
    dedupe(series)
  )
    .map(seriesMeta)
    .slice(0, 100);
}

async function topRatedSeries() {

  let series =
    await tmdbPages(
      "/tv/top_rated",
      {},
      3
    );

  series =
    withoutAnime(series);

  series =
    series.filter(
      x =>
        !(x.genre_ids || [])
          .includes(16)
    );

  series =
    withoutExcludedGenres(
      series,
      "series"
    );

  series =
    series.map(x => ({
      ...x,
      media_type: "tv"
    }));

  return dedupe(series)
    .map(seriesMeta)
    .slice(0, 100);
}

async function mostRatedSeries() {

  let series =
    await tmdbPages(
      "/discover/tv",
      {
        sort_by:
          "vote_count.desc",
        include_adult:
          "false"
      },
      3
    );

  series =
    withoutAnime(series);

  series =
    series.filter(
      x =>
        !(x.genre_ids || [])
          .includes(16)
    );

  series =
    withoutExcludedGenres(
      series,
      "series"
    );

  series =
    series.map(x => ({
      ...x,
      media_type: "tv"
    }));

  return dedupe(series)
    .map(seriesMeta)
    .slice(0, 100);
}

async function onTheAir() {

  let series =
    await tmdbPages(
      "/tv/on_the_air",
      {},
      3
    );

  series =
    withoutAnime(series);

  series =
    series.filter(
      x =>
        !(x.genre_ids || [])
          .includes(16)
    );

  series =
    withoutExcludedGenres(
      series,
      "series"
    );

  series =
    series.map(x => ({
      ...x,
      media_type: "tv"
    }));

  return dedupe(series)
    .map(seriesMeta)
    .slice(0, 100);
}

async function newlyReleasedSeries() {

  const today =
    new Date()
      .toISOString()
      .split("T")[0];

  const threeMonthsAgo =
    new Date();

  threeMonthsAgo.setMonth(
    threeMonthsAgo.getMonth() - 3
  );

  const startDate =
    threeMonthsAgo
      .toISOString()
      .split("T")[0];

  let series =
    await tmdbPages(
      "/discover/tv",
      {
        sort_by:
          "popularity.desc",

        "first_air_date.gte":
          startDate,

        "first_air_date.lte":
          today,

        include_adult:
          "false"
      },
      10
    );

  series =
    withoutAnime(series);

  series =
    series.filter(
      x =>
        !(x.genre_ids || [])
          .includes(16)
    );

  series =
    withoutExcludedGenres(
      series,
      "series"
    );

  series =
    series.map(x => ({
      ...x,
      media_type: "tv"
    }));

  return sortPopularity(
    dedupe(series)
  )
    .map(seriesMeta)
    .slice(0, 100);
}

async function upcomingSeries() {

  const tomorrowDate =
    new Date();

  tomorrowDate.setDate(
    tomorrowDate.getDate() + 1
  );

  const tomorrow =
    tomorrowDate
      .toISOString()
      .split("T")[0];

  const endOfYear =
    `${new Date().getFullYear()}-12-31`;

  let series =
    await tmdbPages(
      "/discover/tv",
      {
        sort_by:
          "popularity.desc",

        "first_air_date.gte":
          tomorrow,

        "first_air_date.lte":
          endOfYear,

        include_adult:
          "false"
      },
      5
    );

  series =
    withoutAnime(series);

  series =
    series.filter(
      x =>
        !(x.genre_ids || [])
          .includes(16)
    );

  series =
    withoutExcludedGenres(
      series,
      "series"
    );

  series =
    series.map(x => ({
      ...x,
      media_type: "tv"
    }));

  return sortPopularity(
    dedupe(series)
  )
    .map(seriesMeta)
    .slice(0, 100);
}

/* =========================================================
   16. TOP PICKS
   MIXED MOVIES + SERIES
========================================================= */

async function topPicks() {

  const [
    movies,
    series
  ] = await Promise.all([

    tmdbPages(
      "/discover/movie",
      {
        sort_by:
          "popularity.desc",

        "vote_average.gte":
          7,

        "vote_count.gte":
          500,

        include_adult:
          "false"
      },
      5
    ),

    tmdbPages(
      "/discover/tv",
      {
        sort_by:
          "popularity.desc",

        "vote_average.gte":
          7,

        "vote_count.gte":
          500,

        include_adult:
          "false"
      },
      5
    )
  ]);

  /* -------------------------------------------------------
     MOVIES
     ------------------------------------------------------- */

  let movieItems =
    withoutAnime(movies);

  movieItems =
    movieItems.filter(
      x =>
        !(x.genre_ids || [])
          .includes(16)
    );

  movieItems =
    withoutExcludedGenres(
      movieItems,
      "movie"
    );

  movieItems =
    movieItems.map(x => ({
      ...x,
      media_type: "movie"
    }));

  /*
   * Movies must already have a digital release.
   */

  movieItems =
    await digitalOnly(
      movieItems
    );

  /* -------------------------------------------------------
     SERIES
     ------------------------------------------------------- */

  let seriesItems =
    withoutAnime(series);

  seriesItems =
    seriesItems.filter(
      x =>
        !(x.genre_ids || [])
          .includes(16)
    );

  seriesItems =
    withoutExcludedGenres(
      seriesItems,
      "series"
    );

  seriesItems =
    seriesItems.map(x => ({
      ...x,
      media_type: "tv"
    }));

  /* -------------------------------------------------------
     COMBINE
     ------------------------------------------------------- */

  let combined = [
    ...movieItems,
    ...seriesItems
  ];

  /*
   * Give highly rated titles a strong advantage while
   * still allowing popularity and vote count to matter.
   */

  combined =
    combined.sort(
      (a, b) => {

        const scoreA =
          (a.vote_average || 0) * 10 +
          Math.log10(
            (a.vote_count || 0) + 1
          ) * 8 +
          Math.min(
            a.popularity || 0,
            100
          ) * 0.15;

        const scoreB =
          (b.vote_average || 0) * 10 +
          Math.log10(
            (b.vote_count || 0) + 1
          ) * 8 +
          Math.min(
            b.popularity || 0,
            100
          ) * 0.15;

        return scoreB - scoreA;
      }
    );

  return mixedMeta(
    dedupe(combined)
  ).slice(0, 20);
}

/* =========================================================
   CATALOG HANDLER
========================================================= */

builder.defineCatalogHandler(
  async args => {

    let metas = [];

    try {

      switch (args.id) {

        case "airing-today":
          metas =
            await airingToday();
          break;

        case "new-episodes":
          metas =
            await newEpisodes();
          break;

        case "calendar-videos":
          metas =
            await calendarVideos();
          break;

          case "top-picks":
  metas =
    await topPicks();
  break;

        case "top10-week":
          metas =
            await top10Week();
          break;

        case "top10-movies-week":
          metas =
            await top10MoviesWeek();
          break;

        case "top10-series-week":
          metas =
            await top10SeriesWeek();
          break;

        case "new-releases":
          metas =
            await newReleases();
          break;

        case "anime-series":
          metas =
            await animeSeries();
          break;

        case "trending-animation":
          metas =
            await trendingAnimation();
          break;

        case "trending-movies":
          metas =
            await trendingMovies();
          break;

        case "trending-series":
          metas =
            await trendingSeries();
          break;

        case "popular-movies":
          metas =
            await popularMovies();
          break;

        case "in-theatres":
          metas =
            await inTheatres();
          break;

        case "top-rated-movies":
          metas =
            await topRatedMovies();
          break;

        case "most-rated-movies":
          metas =
            await mostRatedMovies();
          break;

        case "now-playing":
          metas =
            await nowPlaying();
          break;

        case "upcoming-movies":
          metas =
            await upcomingMovies();
          break;

        case "newly-released-movies":
          metas =
            await newlyReleasedMovies();
          break;

        case "popular-series":
          metas =
            await popularSeries();
          break;

        case "top-rated-series":
          metas =
            await topRatedSeries();
          break;

        case "most-rated-series":
          metas =
            await mostRatedSeries();
          break;

        case "on-the-air":
          metas =
            await onTheAir();
          break;

        case "newly-released-series":
          metas =
            await newlyReleasedSeries();
          break;

        case "upcoming-series":
          metas =
            await upcomingSeries();
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

    /*
     * NEW:
     * Convert TMDB IDs into canonical IMDb IDs
     * before WuPlay receives the catalog.
     */
    metas =
      await canonicalizeCatalogIds(
        metas
      );

    const skip =
      Number(
        args.extra?.skip || 0
      );

    // Global poster filter
    metas =
      metas.filter(
        meta =>
          Boolean(meta.poster)
      );

    // Global unwanted-genre filter
    metas =
      metas.filter(
        meta =>
          !(meta._genreIds || [])
            .some(
              id =>
                (
                  meta._mediaType === "movie"
                    ? EXCLUDED_MOVIE_GENRES
                    : EXCLUDED_TV_GENRES
                ).has(id)
            )
      );

    return {

      metas:
        metas.slice(
          skip,
          skip + 100
        ),

      cacheMaxAge: 900,

      staleRevalidate: 1800,

      staleError: 86400
    };
  }
);

/* =========================================================
   START SERVER
========================================================= */

serveHTTP(
  builder.getInterface(),
  {
    port: PORT
  }
);

console.log(
  `TMDB WuPlay Home Catalogs v1.0.3 listening on port ${PORT}`
);
