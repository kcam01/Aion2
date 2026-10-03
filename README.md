# Kcamyazimoto AION 2

The `main` branch deploys automatically to https://kcamyazimoto-aion2.vercel.app.

The Vercel function at `/api/aion2?type=info` (or `type=equipment`) loads the
public NA East character on server `2101`. PLAYNC Global requires `region=nae`
and `lang=en-US` on `/api/character/info` and `/api/character/equipment`.
Character search uses `https://api-search.plaync.com/aion2global/search/v2/character`
with `region=nae` and `localeInfo=en-US`; the supplied official profile ID remains
the fallback if search is unavailable. These contracts were verified against
the official site's character client and live responses on October 3, 2026.

Successful responses are cached for five minutes; errors are not cached. The
page displays the returned server, primary attributes, equipment and skill levels.

Run the endpoint regression tests with Node.js 24:

```sh
node --test tests/aion2.test.mjs
```
