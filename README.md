# TMDB Home Catalogs — Stremio Addon

A catalog-only Stremio addon for a home-menu setup.

## Catalogs

1. Trending in Kenya — mixed movies + series, using TMDB Kenya availability/popularity filtering.
2. Airing Today — TV series with episodes airing today.
3. Calendar Videos — upcoming movies + TV releases over the next 14 days, ordered by date.
4. Top 10 This Week — mixed movies + series, ordered by TMDB popularity.

This addon provides **no streams**.

## Requirements

- Node.js 18+
- A TMDB API key

## Run locally

```bash
npm install
```

Set the environment variable:

```bash
TMDB_API_KEY=YOUR_KEY npm start
```

The manifest will be available at:

`http://localhost:7000/manifest.json`

For a phone/TV to use it, the addon must be hosted on a reachable HTTPS URL.

## Deploy

Deploy the folder to a Node.js host, set `TMDB_API_KEY` as an environment variable, and expose the port supplied by the host.

Then install:

`https://YOUR-DOMAIN/manifest.json`

## Important

TMDB's `/trending` endpoint is not a true Kenya-specific trending chart. The "Trending in Kenya" catalog therefore uses TMDB movie and TV discovery with `watch_region=KE` and popularity sorting. If you want a stricter Kenya ranking, that logic can be changed later.
