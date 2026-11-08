import { readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const [destination = 'apple-jp.json'] = process.argv.slice(2);
const SOURCES = [
  'https://rss.marketingtools.apple.com/api/v2/jp/music/most-played/50/songs.json',
  'https://itunes.apple.com/jp/rss/topsongs/limit=10/json'
];
const TTL = 15 * 60 * 1000;
const RETRY_DELAY = 60 * 1000;
let latest = null;
let pending = null;
let retryAfter = 0;

function valid(chart) {
  return Number.isFinite(Date.parse(chart?.fetchedAt)) && chart.songs?.length === 10 &&
    new Set(chart.songs.map(song => song.id)).size === 10 &&
    chart.songs.every(song => [song.id, song.title, song.artist, song.image]
      .every(value => typeof value === 'string' && value.trim()) &&
      /^https:\/\/[^/]+\.mzstatic\.com\//.test(song.image));
}

async function collect() {
  const errors = [];
  for (const url of SOURCES) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000), cf: { cacheTtl: 0 } });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const { feed } = await response.json();
      const songs = (feed?.results || feed?.entry || []).slice(0, 10).map(song => ({
        id: String(song.id?.attributes?.['im:id'] || song.id || ''),
        title: song.name || song['im:name']?.label,
        artist: song.artistName || song['im:artist']?.label,
        image: song.artworkUrl100 || song['im:image']?.at(-1)?.label
      }));
      const chart = { fetchedAt: new Date().toISOString(), sourceUpdatedAt: feed?.updated?.label || feed?.updated || null, songs, error: false };
      if (!valid(chart)) throw new Error('Invalid Apple chart');
      return chart;
    } catch (error) { errors.push(error.message); }
  }
  throw new Error('Apple Music: ' + errors.join('; '));
}


async function save(snapshot) {
  const temporary = destination + '.' + randomUUID() + '.tmp';
  await writeFile(temporary, JSON.stringify(snapshot, null, 2) + '\n');
  await rename(temporary, destination);
}


try { await save(await collect()); console.log('Updated ' + destination); } catch (error) { console.error(error.message); process.exitCode = 1; }
