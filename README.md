# TMDB WuPlay Home Catalog Addon

A lightweight Stremio catalog addon designed specifically for **WuPlay**, using **TMDB** as the primary source for catalog discovery and metadata.

The addon provides curated homepage catalogs combining movies and series, with separate rows for anime and animation.

## Current Version

**v1.4.1**

---

## Catalogs

### 🇰🇪 Trending in Kenya
A mixed movie + series catalog based on TMDB popularity with the Kenya watch region.

- Movies + series combined
- Kenya region
- Sorted by popularity
- Anime excluded
- No-poster titles excluded
- Movies require a digital release

### 🎬 Trending Movies
Movies currently trending according to TMDB.

- Movies only
- Anime excluded
- Animation excluded
- Unwanted genres excluded
- No-poster titles excluded
- Digital-release requirement
- Sorted by trending/popularity

### 📺 Trending Series
Series currently trending according to TMDB.

- Series only
- Anime excluded
- Animation excluded
- Unwanted genres excluded
- No-poster titles excluded
- Sorted by trending/popularity

### 🎨 Trending Animation
A dedicated catalog for animated movies and series.

- Movies + series
- Animation focused
- Separate from normal movie/series rows
- Anime separated into the dedicated anime catalog
- No-poster titles excluded

### 🍥 Trending Anime Series
A dedicated catalog for trending anime series.

- Anime series only
- Japanese-origin animation
- No-poster titles excluded
- Expanded coverage

### 🆕 New Releases
Recent popular movies and series.

- Mixed movies + series
- Recent releases
- Popularity filtering
- Anime excluded
- No-poster titles excluded
- Movies require digital release

### 🆕 New Episodes
Recently released episodes from popular series.

- Popular series
- Episodes released within the recent release window
- Anime excluded
- No-poster titles excluded

### 📅 Calendar Videos
Upcoming and recently scheduled content.

- Movies + series
- Calendar/release-date based
- Popularity filtering
- Anime excluded
- No-poster titles excluded

### 🔥 Top 10 This Week
Mixed movies + series based on weekly popularity.

- Movies + series combined
- Current-year releases
- Anime excluded
- No-poster titles excluded

### 🔥 Top 10 Movies This Week
Weekly top movies.

- Movies only
- Current-year releases
- Anime/animation excluded
- No-poster titles excluded
- Digital-release filtering

### 🔥 Top 10 Series This Week
Weekly top series.

- Series only
- Current-year releases
- Anime/animation excluded
- No-poster titles excluded

### 📺 Airing Today
Series with episodes airing today.

- Series only
- Popularity focused
- Anime excluded
- No-poster titles excluded

---

## Global Filtering

The addon applies common filtering to the general catalogs.

### Poster requirement

Titles without a TMDB poster are removed.

This prevents entries such as podcasts, videos, or incomplete metadata records from appearing without artwork.

### General genre exclusions

The general catalogs exclude:

- Documentary
- Music
- News
- Reality
- Soap
- Talk
- TV Movie (movies)

Animation is **not globally excluded** because animated content has its own dedicated catalog.

### Anime filtering

Anime is separated from the normal movie and series catalogs.

Anime is identified using:

- TMDB Animation genre
- Japanese origin

A dedicated **Trending Anime Series** row is provided instead.

---

## Movie Digital Release Filter

Movies in applicable catalogs must have a TMDB digital release.

This helps prevent theatrical-only/CAM releases from appearing in the homepage catalogs.

A TMDB digital release does **not** guarantee that a particular scraper or debrid provider already has the movie. It simply indicates that the movie has reached a digital release stage according to TMDB.

---

## Data Source

The addon uses:

**TMDB (The Movie Database)**

for:

- Movie discovery
- Series discovery
- Popularity
- Trending
- Release dates
- Genres
- Posters
- Metadata
- Anime identification
- Regional discovery

The addon is designed as a **catalog provider**, not a stream scraper or debrid provider.

It does not provide video streams itself.

---

## WuPlay

The catalogs are designed for use with **WuPlay** as homepage/catalog rows.

The addon focuses on providing clean catalog data so WuPlay can display:

- Posters
- Titles
- Movies
- Series
- Release information
- Popularity-based discovery

Stream sources continue to come from the user's configured streaming/scraper/debrid setup.

---

## Deployment

The addon can be deployed using services such as Railway.

Typical deployment structure:

```text
server.js
package.json
README.md
