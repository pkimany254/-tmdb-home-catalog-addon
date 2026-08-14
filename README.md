# TMDB WuPlay Home Catalogs

A catalog-only Stremio/WuPlay addon powered by TMDB.

This addon provides curated home-page catalogs for WuPlay. It provides catalog data only and does not provide streams.

## Current Version

**3.0.0**

## Catalogs

### General Discovery

- **Trending in Kenya**
  - Mixed movies and series
  - Uses Kenya as the target region
  - Sorted by popularity
  - Anime excluded
  - Movies require a digital release

- **New Releases**
  - Mixed movies and series
  - Recent releases from the last 14 days
  - Focuses on popular titles
  - Anime excluded
  - Movies require a digital release

- **New Episodes**
  - Popular series with recent episode activity
  - Covers the previous 7 days
  - Anime excluded

- **Airing Today**
  - Popular TV series airing today
  - Anime excluded

### Top 10

- **Top 10 This Week**
  - Mixed movies and series
  - Based on TMDB weekly trending
  - Limited to releases from the current year
  - Anime excluded
  - Movies require a digital release

- **Top 10 Movies This Week**
  - Movies only
  - Based on TMDB weekly trending
  - Current-year releases only
  - Anime excluded
  - Movies require a digital release

- **Top 10 Series This Week**
  - Series only
  - Based on TMDB weekly trending
  - Current-year releases only
  - Anime excluded

### Upcoming

- **Calendar Videos**
  - Mixed movies and series
  - Covers upcoming releases over the next 14 days
  - Sorted by popularity
  - Anime excluded
  - Movies require a digital release

### Anime

- **Trending Anime Series**
  - Anime series only
  - Uses multiple TMDB discovery pages for broader coverage
  - Japanese-origin animation
  - Sorted by popularity

## Filtering

### Anime

Anime is excluded from the general catalogs so that anime can have its own dedicated section.

The general anime detection uses:

- TMDB Animation genre
- Japanese origin

The dedicated anime catalog uses a broader TMDB discovery search across multiple pages.

### Digital Movie Releases

Movie catalogs use TMDB release-date information.

Movies are included only when TMDB reports a digital release.

This helps prevent unreleased theatrical titles and CAM-style releases from appearing in the normal movie catalogs.

## Caching

Catalog responses are cached to reduce unnecessary TMDB API requests.

Default catalog cache:

- 15 minutes

Stale revalidation:

- 30 minutes

Stale-error fallback:

- 24 hours

TMDB digital-release information is cached for 24 hours.

## Environment Variables

The addon requires:

`TMDB_API_KEY`

Example:

```text
TMDB_API_KEY=your_tmdb_api_key
