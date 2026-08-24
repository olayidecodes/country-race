import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join, resolve as resolvePath } from 'path';
import { WebcastEvent } from 'tiktok-live-connector';
import { WebcastPushConnection } from 'tiktok-live-connector/legacy';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const PORT = process.env.PORT || 8080;

// ---- Countries ---------------------------------------------------------------
const ALL_COUNTRIES = [
  { id: 'vn', name: 'VIETNAM',     flag: '🇻🇳', color: '#e8334a', keys: ['vietnam', 'viet', 'vn'] },
  { id: 'mm', name: 'MYANMAR',     flag: '🇲🇲', color: '#f5a623', keys: ['myanmar', 'burma', 'mm'] },
  { id: 'jp', name: 'JAPAN',       flag: '🇯🇵', color: '#ff6b9d', keys: ['japan', 'jp'] },
  { id: 'my', name: 'MALAYSIA',    flag: '🇲🇾', color: '#0096c7', keys: ['malaysia', 'my'] },
  { id: 'us', name: 'USA',         flag: '🇺🇸', color: '#4361ee', keys: ['usa', 'america', 'us'] },
  { id: 'id', name: 'INDONESIA',   flag: '🇮🇩', color: '#2dc653', keys: ['indonesia', 'indo', 'id'] },
  { id: 'th', name: 'THAILAND',    flag: '🇹🇭', color: '#9b5de5', keys: ['thailand', 'thai', 'th'] },
  { id: 'ph', name: 'PHILIPPINES', flag: '🇵🇭', color: '#00b4d8', keys: ['philippines', 'ph'] },
  { id: 'kr', name: 'KOREA',       flag: '🇰🇷', color: '#f72585', keys: ['korea', 'kr'] },
  { id: 'cn', name: 'CHINA',       flag: '🇨🇳', color: '#ff5722', keys: ['china', 'cn'] },
];

// ---- Gift types --------------------------------------------------------------
const GIFT_TYPES = [
  { id: 'rose',      name: 'Rose',      emoji: '🌹', diamonds: 1   },
  { id: 'panda',     name: 'Panda',     emoji: '🐼', diamonds: 5   },
  { id: 'butterfly', name: 'Butterfly', emoji: '🦋', diamonds: 1   },
  { id: 'fish',      name: 'Fish',      emoji: '🐟', diamonds: 1   },
  { id: 'turtle',    name: 'Turtle',    emoji: '🐢', diamonds: 1   },
  { id: 'icecream',  name: 'Ice Cream', emoji: '🍦', diamonds: 1   },
  { id: 'dumbbell',  name: 'Dumbbell',  emoji: '🏋️', diamonds: 1   },
  { id: 'fireworks', name: 'Fireworks', emoji: '🎆', diamonds: 199 },
];

// ---- Game state --------------------------------------------------------------
let gameConfig = {
  activeCountries: ALL_COUNTRIES.map(c => c.id),
  goalPoints: 200,
  giftMapping: {},
};
const winCounts = Object.fromEntries(ALL_COUNTRIES.map(c => [c.id, 0]));
const userTeam  = new Map();

// ---- Helpers -----------------------------------------------------------------
function getActiveCountries() {
  return ALL_COUNTRIES.filter(c => gameConfig.activeCountries.includes(c.id));
}

function resolveTeamForGift(giftName) {
  const active = gameConfig.activeCountries;
  if (!active.length) return null;
  const entry = gameConfig.giftMapping[giftName];
  if (entry?.country && entry.country !== 'random' && active.includes(entry.country)) {
    return entry.country;
  }
  return active[Math.floor(Math.random() * active.length)];
}

function resolveTeamFromText(text = '') {
  const lower = text.toLowerCase();
  for (const c of ALL_COUNTRIES) {
    if (gameConfig.activeCountries.includes(c.id) && c.keys.some(k => lower.includes(k))) {
      return c.id;
    }
  }
  return null;
}

function teamForUser(uniqueId) {
  const tid = userTeam.get(uniqueId);
  if (tid && gameConfig.activeCountries.includes(tid)) return tid;
  const active = gameConfig.activeCountries;
  return active.length ? active[Math.floor(Math.random() * active.length)] : null;
}

// Legacy connector emits flat objects — fields are at top level, not nested.
function userOf(data) {
  return {
    id:   data.uniqueId  || data.userId || 'anon',
    name: data.nickname  || data.uniqueId || 'Someone',
    pic:  data.profilePictureUrl || data.user?.profilePicture?.url?.[0] || null,
  };
}

function configPayload(isSimulating = false) {
  return {
    kind: 'config',
    allCountries: ALL_COUNTRIES,
    giftTypes:    GIFT_TYPES,
    teams:        getActiveCountries(),
    goalPoints:   gameConfig.goalPoints,
    giftMapping:  gameConfig.giftMapping,
    winCounts,
    isSimulating,
  };
}

// ---- Express -----------------------------------------------------------------
const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

app.get('/api/config', (_req, res) => {
  res.json({
    allCountries:    ALL_COUNTRIES,
    giftTypes:       GIFT_TYPES,
    activeCountries: gameConfig.activeCountries,
    goalPoints:      gameConfig.goalPoints,
    giftMapping:     gameConfig.giftMapping,
    winCounts,
  });
});

app.post('/api/config', (req, res) => {
  const { activeCountries, goalPoints, giftMapping } = req.body;
  if (Array.isArray(activeCountries) && activeCountries.length > 0) gameConfig.activeCountries = activeCountries;
  if (typeof goalPoints === 'number' && goalPoints > 0) gameConfig.goalPoints = goalPoints;
  if (giftMapping && typeof giftMapping === 'object') gameConfig.giftMapping = giftMapping;
  broadcast(configPayload());
  res.json({ ok: true });
});

// ---- WebSocket ---------------------------------------------------------------
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

let _isSimulating = false;

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(data);
  }
}

wss.on('connection', (ws) => {
  ws.send(JSON.stringify(configPayload(_isSimulating)));
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.kind === 'roundWin' && msg.team && winCounts[msg.team] !== undefined) {
        winCounts[msg.team]++;
        broadcast({ kind: 'winCounts', winCounts });
      }
    } catch { /* ignore */ }
  });
});

// ---- TikTok (legacy connector — emits flat, simplified event objects) --------
async function connectTikTok(username) {
  const conn = new WebcastPushConnection(username, { processInitialData: false });

  conn.on(WebcastEvent.CHAT, (data) => {
    const u = userOf(data);
    const picked = resolveTeamFromText(data.comment);
    if (picked) userTeam.set(u.id, picked);
    broadcast({ kind: 'chat', user: u, text: data.comment, team: picked });
  });

  conn.on(WebcastEvent.MEMBER, (data) => {
    broadcast({ kind: 'join', user: userOf(data) });
  });

  conn.on(WebcastEvent.LIKE, (data) => {
    const u = userOf(data);
    broadcast({ kind: 'like', user: u, team: teamForUser(u.id), points: (data.likeCount || 1) * 0.02 });
  });

  conn.on(WebcastEvent.GIFT, (data) => {
    // Legacy connector flattens the proto — giftType/giftName/diamondCount are top-level
    const giftType = data.giftType ?? 0;
    const isStreak = giftType === 1;
    if (isStreak && !data.repeatEnd) return;

    const u        = userOf(data);
    const giftName = data.giftName || 'Gift';
    const diamonds = data.diamondCount ?? 1;
    const count    = data.repeatCount  || 1;
    const teamId   = resolveTeamForGift(giftName);
    const mapping  = gameConfig.giftMapping[giftName];
    const multiplier = mapping?.pts ?? 1;
    const giftInfo = GIFT_TYPES.find(g => g.name === giftName);

    if (!teamId) return;
    console.log(`[GIFT] ${u.name} → ${giftName} x${count} (${diamonds}💎) → ${teamId}`);
    broadcast({
      kind: 'gift',
      user: u,
      team: teamId,
      giftName,
      giftEmoji: giftInfo?.emoji || '🎁',
      points: diamonds * count * multiplier,
    });
  });

  conn.on(WebcastEvent.STREAM_END, () => broadcast({ kind: 'streamEnd' }));
  conn.on('error', (err) => console.error('TikTok error:', err?.message || err));

  await conn.connect();
  console.log(`✅ Connected to @${username}'s LIVE room.`);
}

// ---- Simulator ---------------------------------------------------------------
function startSimulator() {
  console.log('SIMULATE mode — fake gifts every 700 ms.');
  _isSimulating = true;
  const fakeUsers = ['amine', 'sara', 'omar', 'lina', 'yusuf', 'maya', 'alex', 'mia'];
  setInterval(() => {
    const active = gameConfig.activeCountries;
    if (!active.length) return;
    const userName = fakeUsers[Math.floor(Math.random() * fakeUsers.length)];
    const gift     = GIFT_TYPES[Math.floor(Math.random() * GIFT_TYPES.length)];
    const teamId   = resolveTeamForGift(gift.name);
    const mapping  = gameConfig.giftMapping[gift.name];
    const multiplier = mapping?.pts ?? 1;
    broadcast({
      kind: 'gift',
      user: { id: userName, name: userName, pic: null },
      team: teamId,
      giftName: gift.name,
      giftEmoji: gift.emoji,
      points: gift.diamonds * multiplier,
    });
  }, 700);
}

// ---- startServer (exported for Electron) ------------------------------------
export async function startServer({ username, simulate } = {}) {
  _isSimulating = simulate || false;
  return new Promise((resolve, reject) => {
    httpServer.listen(PORT, () => {
      console.log(`Country Race → http://localhost:${PORT}`);
      console.log(`Settings     → http://localhost:${PORT}/settings.html`);
      console.log(`OBS source   → http://localhost:${PORT}/?obs=1`);

      if (simulate) {
        startSimulator();
        resolve({ port: PORT });
      } else if (username) {
        connectTikTok(username)
          .then(() => resolve({ port: PORT }))
          .catch(reject);
      } else {
        resolve({ port: PORT });
      }
    });
    httpServer.on('error', reject);
  });
}

// ---- Direct execution (node server.js / npm start / npm run sim) ------------
const isMain = process.argv[1] && resolvePath(process.argv[1]) === resolvePath(__filename);
if (isMain) {
  startServer({
    username: process.env.TIKTOK_USERNAME,
    simulate: process.env.SIMULATE === '1',
  }).catch(e => console.error('Failed to start:', e?.message || e));
}
