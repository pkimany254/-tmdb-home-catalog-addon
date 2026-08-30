const { addonBuilder, getRouter } = require("stremio-addon-sdk");
const express = require("express");

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const API = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";
const PORT = process.env.PORT || 7000;
const PUBLIC_URL =
  process.env.ADDON_URL ||
  `http://127.0.0.1:${PORT}`;
const KEY = process.env.TMDB_API_KEY;

const MAIN_LANGUAGES = new Set([
  "en", // English
  "es", // Spanish
  "fr", // French
  "de", // German
  "it", // Italian
  "ja", // Japanese
  "ko", // Korean
  "zh", // Chinese
  "pt"  // Portuguese
]);

const manifest = {
  id: "org.pkimany254.tmdb-home-catalogs",
  version: "1.0.0",
  name: "TMDB Catalogs",
  description: "Catalog-only WuPlay/Stremio addon powered by TMDB.",
  resources: ["catalog"],
  types: ["movie", "series"],
  idPrefixes: ["tt", "tmdb:"],

  catalogs: [
    { id: "top-picks", type: "movie", name: "Monthly Top Picks", extra: [{ name: "skip", isRequired: false }] },
    { id: "best-of-year", type: "movie", name: "Best of the Year", extra: [{ name: "skip", isRequired: false }] },
    { id: "trending-now", type: "movie", name: "Trending", extra: [{ name: "skip", isRequired: false }] },
    { id: "popular", type: "movie", name: "Popular", extra: [{ name: "skip", isRequired: false }] },
    { id: "now-playing", type: "movie", name: "Available Today", extra: [{ name: "skip", isRequired: false }] },
    { id: "new-releases", type: "movie", name: "New Releases", extra: [{ name: "skip", isRequired: false }] },
    { id: "in-theatres", type: "movie", name: "In Theatres", extra: [{ name: "skip", isRequired: false }] },
    { id: "upcoming", type: "movie", name: "Upcoming", extra: [{ name: "skip", isRequired: false }] }
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

async function cinemaPoster(x) {

  if (
    !x.inCinemas ||
    !x.poster_path
  ) {
    return img(x.poster_path);
  }

  const fileName =
    `tmdb-${x.id}.jpg`;

  const outputPath =
    path.join(
      __dirname,
      "public",
      "cinema",
      fileName
    );

  const publicUrl =
  `${PUBLIC_URL}/public/cinema/${fileName}`;

  // Use cached generated poster if it already exists
  if (
    fs.existsSync(outputPath)
  ) {
    return publicUrl;
  }

  try {

    const posterUrl =
      img(
        x.poster_path,
        "w500"
      );

    const posterResponse =
      await fetch(posterUrl);

    if (!posterResponse.ok) {
      return img(x.poster_path);
    }

    const posterBuffer =
      Buffer.from(
        await posterResponse.arrayBuffer()
      );

    const badgePath =
      path.join(
        __dirname,
        "assets",
        "in-cinema.png"
      );

    const badge =
      await sharp(badgePath)
        .trim()
        .resize({
          width: 350
        })
        .png()
        .toBuffer();

    await sharp(posterBuffer)
      .composite([
        {
          input: badge,
          gravity: "north"
        }
      ])
      .jpeg({
        quality: 90
      })
      .toFile(outputPath);

    return publicUrl;

  } catch (error) {

    console.error(
      `Cinema poster failed for TMDB ${x.id}:`,
      error
    );

    // Very important:
    // if badge generation fails,
    // keep the normal poster.
    return img(x.poster_path);
  }
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
    _mediaType: "movie",
    _inCinemas: Boolean(x.inCinemas),
    _originalLanguage: x.original_language
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
    _mediaType: "series",
    _originalLanguage: x.original_language
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
    10767,   // Talk
    10762    // Kids
  ]);

const EXCLUDED_MOVIE_GENRES =
  new Set([
    99,     // Documentary
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

function interleaveCatalogRows(
  movies,
  series
) {

  const merged = [];
  const length = Math.max(
    movies.length,
    series.length
  );

  for (let index = 0; index < length; index++) {

    if (movies[index]) {
      merged.push(movies[index]);
    }

    if (series[index]) {
      merged.push(series[index]);
    }
  }

  return merged;
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
   3. NEW RELEASES
   MIXED MOVIES + SERIES
   LATEST RELEASES FIRST
========================================================= */

async function newReleases() {

  const [
    movies,
    tv
  ] = await Promise.all([

    tmdbPages(
      "/discover/movie",
      {
        "primary_release_date.gte":
          day(-90),

        "primary_release_date.lte":
          day(),

        sort_by:
          "primary_release_date.desc",

        include_adult:
          "false"
      },
      100
    ),

    tmdbPages(
      "/discover/tv",
      {
        "first_air_date.gte":
          day(-90),

        "first_air_date.lte":
          day(),

        sort_by:
          "first_air_date.desc",

        include_adult:
          "false"
      },
      100
    )

  ]);

  /* -------------------------------------------------------
     MOVIES
  ------------------------------------------------------- */

  const movieItems =
    withoutAnime(
      movies.map(x => ({
        ...x,
        media_type: "movie"
      }))
    );

  /* -------------------------------------------------------
     SERIES
  ------------------------------------------------------- */

  const seriesItems =
    withoutAnime(
      tv.map(x => ({
        ...x,
        media_type: "tv"
      }))
    );

  /* -------------------------------------------------------
     COMBINE
  ------------------------------------------------------- */

  const combined = [
    ...movieItems,
    ...seriesItems
  ];

  /*
   * Latest release/air date first.
   * Popularity does NOT affect the order.
   */

  combined.sort(
    (a, b) => {

      const dateA =
        a.media_type === "movie"
          ? a.release_date
          : a.first_air_date;

      const dateB =
        b.media_type === "movie"
          ? b.release_date
          : b.first_air_date;

      return (
        new Date(dateB || 0) -
        new Date(dateA || 0)
      );
    }
  );

  console.log(
    "NEW RELEASES:",
    combined.length
  );

  return mixedMeta(
    dedupe(combined)
  ).slice(0, 200);
}

/* =========================================================
   4. TRENDING
   MIXED TRENDING MOVIES + SERIES
========================================================= */

async function trendingNow() {

  const [
    movies,
    series
  ] = await Promise.all([
    trendingMovies(),
    trendingSeries()
  ]);

  return interleaveCatalogRows(
    movies,
    series
  );
}


/* =========================================================
   TRENDING MOVIES
========================================================= */

async function trendingMovies() {

  const target = 200;
  const maxPages = 100;

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

    validMovies.push(
  ...movies
);

    page++;
  }

 return dedupe(validMovies)
  .map(movieMeta)
  .slice(0, target);
}

/* =========================================================
   TRENDING SERIES
========================================================= */

async function trendingSeries() {

  const target = 200;
  const maxPages = 100;

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

 return dedupe(validSeries)
  .map(seriesMeta)
  .slice(0, target);
}


/* =========================================================
   5. IN THEATRES
========================================================= */

async function inTheatres() {

  const startDate =
    day(-180);

  const endDate =
    day();

  let movies =
    await tmdbPages(
      "/movie/now_playing",
      {},
      100
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

/* =========================================================
   6. AVAILABLE TODAY
   MIXED MOVIES + AIRING TODAY SERIES
========================================================= */

async function nowPlaying() {

  const [
    movies,
    series
  ] = await Promise.all([
    nowPlayingMovies(),
    airingToday()
  ]);

  return interleaveCatalogRows(
    movies,
    series
  );
}

/* =========================================================
   NOW PLAYING MOVIES
========================================================= */

async function nowPlayingMovies() {

  const releaseWindowDays = 3;
  const pagesToScan = 50;
  const resultLimit = 100;

  const startDate =
    day(-releaseWindowDays);

  const endDate =
    day();

  let movies =
    await tmdbPages(
      "/movie/now_playing",
      {},
      pagesToScan
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
    .slice(0, resultLimit);
}

/* =========================================================
   AIRING TODAY
========================================================= */

async function airingToday() {

  let shows =
    await tmdbPages(
      "/tv/airing_today",
      {},
      50
    );

  shows =
    withoutAnime(
      shows
    ).filter(
      x =>
        (x.popularity || 0) >= 10 &&
         x.original_language === "en" &&
        !(x.genre_ids || []).includes(16) &&
        !(x.genre_ids || []).includes(35)
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
   7. UPCOMING
   MIXED UPCOMING MOVIES + SERIES
========================================================= */

async function upcoming() {

  const [
    movies,
    series
  ] = await Promise.all([
    upcomingMovies(),
    upcomingSeries()
  ]);

  return interleaveCatalogRows(
    movies,
    series
  );
}


/* =========================================================
   UPCOMING MOVIES
========================================================= */

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

/* =========================================================
   UPCOMING SERIES
========================================================= */

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
   8. MONTHLY TOP PICKS
   MIXED MOVIES + SERIES
========================================================= */

async function topPicks() {

  const today =
    day();

  const oneMonthAgo =
    day(-30);

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

        "primary_release_date.gte":
          oneMonthAgo,

        "primary_release_date.lte":
          today,

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

        "first_air_date.gte":
          oneMonthAgo,

        "first_air_date.lte":
          today,

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
   9. POPULAR
   MIXED MOVIES + SERIES
========================================================= */

async function popular() {

  const [
    movies,
    series
  ] = await Promise.all([

    tmdbPages(
      "/discover/movie",
      {
        sort_by:
          "popularity.desc",

        include_adult:
          "false"
      },
      100
    ),

    tmdbPages(
      "/discover/tv",
      {
        sort_by:
          "popularity.desc",

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
    withoutExcludedGenres(
      movieItems,
      "movie"
    );

  movieItems =
    movieItems.map(x => ({
      ...x,
      media_type: "movie"
    }));

  /* -------------------------------------------------------
     SERIES
  ------------------------------------------------------- */

  let seriesItems =
    withoutAnime(series);

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

  const combined = [
    ...movieItems,
    ...seriesItems
  ];

  return mixedMeta(
    dedupe(
      sortPopularity(combined)
    )
  ).slice(0, 200);
}

/* =========================================================
   10. BEST OF THE YEAR
   MIXED MOVIES + SERIES
========================================================= */

async function bestOfYear() {

  const today =
    day();

  const yearStart =
    `${new Date().getFullYear()}-01-01`;

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

        "primary_release_date.gte":
          yearStart,

        "primary_release_date.lte":
          today,

        include_adult:
          "false"
      },
      10
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

        "first_air_date.gte":
          yearStart,

        "first_air_date.lte":
          today,

        include_adult:
          "false"
      },
      10
    )

  ]);

  /* -------------------------------------------------------
     MOVIES
  ------------------------------------------------------- */

  let movieItems =
    withoutAnime(movies);

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

  /* -------------------------------------------------------
     SERIES
  ------------------------------------------------------- */

  let seriesItems =
    withoutAnime(series);

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
   * Quality-focused ranking.
   * Rating is strongest, while vote count
   * and popularity also contribute.
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

  console.log(
    "BEST OF THE YEAR:",
    combined.length
  );

  return mixedMeta(
    dedupe(combined)
  ).slice(0, 100);
}

/* =========================================================
   CATALOG HANDLER
========================================================= */

builder.defineCatalogHandler(
  async args => {

    let metas = [];

    try {

      switch (args.id) {

        case "top-picks":
          metas =
            await topPicks();
          break;

        case "trending-now":
          metas =
            await trendingNow();
          break;

        case "new-releases":
          metas =
            await newReleases();
          break;

        case "in-theatres":
          metas =
            await inTheatres();
          break;

        case "now-playing":
          metas =
            await nowPlaying();
          break;

        case "upcoming":
          metas =
            await upcoming();
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

    // Global main-language filter
    metas =
  metas.filter(
    meta =>
      MAIN_LANGUAGES.has(
        meta._originalLanguage
      )
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

const app = express();

// Stremio addon routes
app.use(
  getRouter(
    builder.getInterface()
  )
);

// Serve generated cinema posters
app.use(
  "/public",
  express.static(
    path.join(
      __dirname,
      "public"
    )
  )
);

app.listen(
  PORT,
  () => {
    console.log(
      `TMDB WuPlay Home Catalogs v1.0.0 listening on port ${PORT}`
    );

    console.log(
      `HTTP addon accessible at: http://127.0.0.1:${PORT}/manifest.json`
    );
  }
);
