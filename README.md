# TMDB Catalog Addon

A catalog-only WuPlay/Stremio addon powered by TMDB. It provides homepage rows and metadata; it does not provide streams.

## Version

**v1.0.0**

## Catalog rows

The addon currently exposes six rows:

1. **Top Picks** — mixed movies and series from the last year with a rating of at least 7 and 500 votes. Movies must have a TMDB digital release. Results are ranked with a weighted score based on rating, votes, and popularity.
2. **Trending Now** — alternating weekly-trending movies and series. Movies must have a TMDB digital release.
3. **Now Playing** — alternating movies released within the last 2 days and series airing today. Movies must have a TMDB digital release.
4. **New Releases** — mixed movies and series released during the last 30 days, in English, with TMDB popularity of at least 4. Movies must have a TMDB digital release.
5. **In Theatres** — movies from the last 90 days that TMDB does not yet list as digitally released.
6. **Upcoming** — alternating movies and series scheduled from tomorrow through the end of the current year.

## Filtering

All returned items must have a TMDB poster.

Movies exclude these TMDB genres:

- Documentary
- Music
- TV Movie

Series exclude:

- Documentary
- Music
- News
- Reality
- Soap
- Talk
- Kids

The source rows also retain their existing row-specific filters. Trending Now, Top Picks, Now Playing movies, In Theatres, and Upcoming exclude Animation. New Releases retains its original anime-focused filtering, while the Airing Today portion excludes both Animation and Comedy.

Anime is identified as Animation with Japan as its origin country and is removed from the normal rows that use the shared anime filter.

## Digital-release rule

When a row requires a digital movie release, the addon asks TMDB for release information and keeps only movies with a release of type `4` (Digital) in at least one country.

This indicates TMDB has recorded a digital release. It does not guarantee a title is available from a particular scraper, streaming source, or debrid provider.

## Data source

The addon uses [TMDB](https://www.themoviedb.org/) for discovery, popularity, trending rankings, release dates, genre data, images, and metadata.

## Deployment

Deploy the project to a Node.js-compatible service such as Railway. Set the required environment variable:

```text
TMDB_API_KEY=your_tmdb_api_key
```

The service starts with:

```text
npm start
```

After a deployment that changes the manifest, remove and re-add the addon in WuPlay to refresh its catalog rows.
