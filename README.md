# Country Race — TikTok LIVE interactive game

A working version of the country-race LIVE game: viewers send gifts, their
country's runner advances, first to the goal wins, the round resets. One Node
process connects to TikTok, normalizes the live events, and relays them to a
browser game you add as an OBS browser source.

```
viewers send gifts  ->  TikTok event stream  ->  server.js (listener + relay)
       ^                                                  |
       |                                                  v
   they react   <-  OBS broadcasts back  <-  browser game (public/index.html)
```

## What's in this folder

```
country-race/
  server.js            connects to TikTok, scores events, relays over WebSocket
  public/index.html    the canvas game (one lane per country)
  package.json         dependencies + run scripts
  .env.example         template for your TikTok username
  README.md            this file
```

## 1. Install (one time)

Requires Node 18 or newer.

```bash
cd country-race
npm install
```

## 2. Try it offline first (no TikTok needed)

```bash
npm run sim
```

Open `http://localhost:8080` in a browser. Fake gifts fire every ~0.7s so you
can watch the race and tune scoring. Add `?dev=1` to the URL
(`http://localhost:8080/?dev=1`) to get manual "+25" buttons per country.

## 3. Go live for real

1. Copy the env template and add your TikTok username (no `@`):
   ```bash
   cp .env.example .env
   ```
   Then edit `.env`:
   ```
   TIKTOK_USERNAME=your_username
   ```
2. Start your TikTok LIVE first — the account has to actually be live.
3. Start the server:
   ```bash
   npm start
   ```
   You should see `Connected to @your_username's LIVE room.`

## 4. Add it to OBS

1. In OBS: **Sources -> + -> Browser**.
2. URL: `http://localhost:8080/?obs=1`
   (the `obs=1` makes the background transparent so it sits over your scene).
3. Set width/height to your canvas (e.g. 1080 x 1920 for vertical).
4. Position it in your scene and go live through OBS.

## Customizing

Everything tunable lives at the top of `server.js`:

- `TEAMS` — the countries (lanes). Each `keys` entry is a word a viewer can type
  in chat to pick that country (typing "qatar" sends their gifts to Qatar).
- `STEP_PER_DIAMOND` — points per gift diamond.
- `POINTS_PER_LIKE` — points per like (kept tiny; likes are spammy).
- `GOAL_POINTS` — points needed to win a round.

## Notes / caveats

- TikTok has **no official public API** for live gift events. The
  `tiktok-live-connector` library reads TikTok's internal webcast feed — it can
  break when TikTok changes things and runs against TikTok's terms. Fine for
  experimenting; understand the risk before relying on it.
- Heavy traffic can hit rate limits and may need a signing provider; see the
  library's docs for sign servers and reconnection.
- This is an MVP scaffold meant to be extended (combo effects, per-gift
  animations, sound, a control panel).
