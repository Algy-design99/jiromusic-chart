import { readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const [destination = 'apple-jp.json', endpoint = 'https://rss.marketingtools.apple.com/api/v2/jp/music/most-played/50/songs.json'] = process.argv.slice(2);

async function save(snapshot) {
  const temporary = destination + '.' + randomUUID() + '.tmp';
  await writeFile(temporary, JSON.stringify(snapshot, null, 2) + '\n');
  await rename(temporary, destination);
}

try {
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error('Apple feed returned HTTP ' + response.status);
  const { feed } = await response.json();
  if (!Array.isArray(feed?.results) || feed.results.length < 10) {
    throw new Error('Apple feed has fewer than 10 songs');
  }
  const ids = new Set();
  const songs = feed.results.slice(0, 10).map(({ id, name, artistName, artworkUrl100 }) => {
    if ([id, name, artistName, artworkUrl100].some(value => typeof value !== 'string' || !value.trim()) || ids.has(id)) {
      throw new Error('Incomplete or duplicate song in Apple feed');
    }
    const artwork = new URL(artworkUrl100);
    if (artwork.protocol !== 'https:' || !artwork.hostname.endsWith('.mzstatic.com')) {
      throw new Error('Unexpected Apple artwork URL');
    }
    ids.add(id);
    return { id, title: name, artist: artistName, image: artwork.href };
  });
  await save({ fetchedAt: new Date().toISOString(), sourceUpdatedAt: feed.updated ?? null, songs, error: false });
  console.log('Updated ' + destination);
} catch (error) {
  try {
    const previous = JSON.parse(await readFile(destination, 'utf8'));
    if (previous.songs?.length) {
      await save({ ...previous, error: true });
    }
  } catch (snapshotError) {
    if (snapshotError.code !== 'ENOENT') console.error('Snapshot error:', snapshotError.message);
  }
  console.error('Apple Music JP:', error.message);
  process.exitCode = 1;
}
