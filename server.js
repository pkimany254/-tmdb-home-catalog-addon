const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");

const API = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";
const PORT = process.env.PORT || 7000;
const KEY = process.env.TMDB_API_KEY;

const manifest = {
  id: "org.pkimany254.tmdb-home-catalogs",
  version: "3.2.0",
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
}
  ]
};

const builder = new addonBuilder(manifest);
const cache = new Map();

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
  return items.filter(x => !isAnime(x));
}

const EXCLUDED_TV_GENRES = new Set([
  99,     // Documentary
  10402,  // Music
  10763,  // News
  10764,  // Reality
  10766,  // Soap
  10767   // Talk
]);

const EXCLUDED_MOVIE_GENRES = new Set([
  99,     // Documentary
  10402,  // Music
  10770   // TV Movie
]);

function withoutExcludedGenres(items, mediaType) {
  const excluded =
    mediaType === "movie"
      ? EXCLUDED_MOVIE_GENRES
      : EXCLUDED_TV_GENRES;

  return items.filter(item =>
    !(item.genre_ids || []).some(id =>
      excluded.has(id)
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

  return d.toISOString().slice(0, 10);
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

async function hasDigitalRelease(movieId) {
  const data = await tmdb(
    `/movie/${movieId}/release_dates`,
    {},
    86400
  );

  return (data.results || []).some(
    country =>
      (country.release_dates || []).some(
        release => release.type === 4
      )
  );
}

async function digitalOnly(items) {
  const output = [];

  let index = 0;

  async function worker() {
    while (index < items.length) {
      const item = items[index++];

      try {
        if (
          await hasDigitalRelease(item.id)
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

  const workerCount = Math.min(
    8,
    items.length
  );

  await Promise.all(
    Array.from(
      { length: workerCount },
      worker
    )
  );

  return output;
}

/* =========================================================
   1. TRENDING IN KENYA
========================================================= */

async function trendingKenya() {
  const [movies, tv] =
    await Promise.all([
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

  const movieItems =
    withoutAnime(
      (movies.results || []).map(
        x => ({
          ...x,
          media_type: "movie"
        })
      )
    );

  const digitalMovies =
    await digitalOnly(movieItems);

  const seriesItems =
    withoutAnime(
      (tv.results || []).map(
        x => ({
          ...x,
          media_type: "tv"
        })
      )
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
  const data = await tmdb(
    "/tv/airing_today",
    { page: 1 }
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
   3. NEW EPISODES
========================================================= */

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
  const [movies, tv] =
    await Promise.all([
      tmdb("/discover/movie", {
        "primary_release_date.gte":
          day(),

        "primary_release_date.lte":
          day(14),

        sort_by:
          "popularity.desc",

        include_adult:
          "false",

        page: 1
      }),

      tmdb("/discover/tv", {
        "air_date.gte":
          day(),

        "air_date.lte":
          day(14),

        sort_by:
          "popularity.desc",

        include_adult:
          "false",

        page: 1
      })
    ]);

  const movieItems =
    withoutAnime(
      (movies.results || []).map(
        x => ({
          ...x,
          media_type: "movie"
        })
      )
    );

  const digitalMovies =
    await digitalOnly(movieItems);

  const seriesItems =
    withoutAnime(
      (tv.results || []).map(
        x => ({
          ...x,
          media_type: "tv"
        })
      )
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
    new Date().getUTCFullYear();

  /*
   * Movies:
   * - Current year
   * - No anime
   * - Digital release
   */

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
    await digitalOnly(movies);

  movies =
    movies.map(x => ({
      ...x,
      media_type: "movie"
    }));

  /*
   * Series:
   * - Current year
   * - No anime
   */

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

  /*
   * Mix movies + series.
   * Rank everything by TMDB popularity.
   */

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
    new Date().getUTCFullYear();

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
    await digitalOnly(movies);

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
    new Date().getUTCFullYear();

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
  const [movies, tv] =
    await Promise.all([
      tmdb("/discover/movie", {
        "primary_release_date.gte":
          day(-14),

        "primary_release_date.lte":
          day(),

        sort_by:
          "popularity.desc",

        include_adult:
          "false",

        page: 1
      }),

      tmdb("/discover/tv", {
        "first_air_date.gte":
          day(-14),

        "first_air_date.lte":
          day(),

        sort_by:
          "popularity.desc",

        include_adult:
          "false",

        page: 1
      })
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
    await digitalOnly(movieItems);

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
   EXPANDED COVERAGE
========================================================= */

/*
 * Instead of relying only on /trending/tv/week,
 * use TMDB Discover across several pages.
 *
 * TMDB supports:
 *
 * with_genres=16
 * with_origin_country=JP
 *
 * This gives us a much larger anime pool.
 */

async function animeSeries() {
  const pages = [1, 2, 3, 4, 5];

  const responses =
    await Promise.all(
      pages.map(page =>
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

  for (const response of responses) {
    anime.push(
      ...(response.results || [])
    );
  }

  /*
   * Extra safety:
   * Keep only Japanese animation.
   */

  anime = anime.filter(
    x =>
      (x.genre_ids || []).includes(16) &&
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
  const [movies, tv] =
    await Promise.all([
      tmdb("/discover/movie", {
        with_genres: "16",
        sort_by: "popularity.desc",
        include_adult: "false",
        page: 1
      }),

      tmdb("/discover/tv", {
        with_genres: "16",
        sort_by: "popularity.desc",
        include_adult: "false",
        page: 1
      })
    ]);

  let movieItems =
    withoutAnime(
      (movies.results || []).map(
        x => ({
          ...x,
          media_type: "movie"
        })
      )
    );

  movieItems =
    await digitalOnly(movieItems);

  const seriesItems =
    withoutAnime(
      (tv.results || []).map(
        x => ({
          ...x,
          media_type: "tv"
        })
      )
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
   CATALOG HANDLER
========================================================= */

builder.defineCatalogHandler(
  async args => {
    let metas = [];

    try {
      switch (args.id) {

        case "trending-kenya":
          metas =
            await trendingKenya();
          break;

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
  Number(
    args.extra?.skip || 0
  );

// Global poster filter
metas = metas.filter(meta =>
  Boolean(meta.poster)
);

// Global unwanted-genre filter
metas = metas.filter(meta =>
  !(meta._genreIds || []).some(id =>
    (
      meta._mediaType === "movie"
        ? EXCLUDED_MOVIE_GENRES
        : EXCLUDED_TV_GENRES
    ).has(id)
  )
);

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
  `TMDB WuPlay Home Catalogs v3.2.0 listening on port ${PORT}`
);
