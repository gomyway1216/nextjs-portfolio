import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  buildParentOccurrences,
  discoverCsaUrls,
  importCsaDirectory,
  loadOrFetchObject,
  parseCacheManifest,
  parseCsaGame,
  serializeCacheManifest,
  sha256,
  stableGameSplit,
  verifyManifestCache,
  main as importCsaMain,
  type CacheManifestEntry,
  type FetchLike,
} from '../../../ml/import-csa-games';

const ARCHIVE_SHA = 'a'.repeat(64);
const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'csa-import-test-'));
  temporaryDirectories.push(directory);
  return directory;
}

function completedGame(extraLines: readonly string[] = []): string {
  return [
    'V3.0',
    '$ENCODING:SHIFT_JIS',
    '$EVENT:WCSC36-fixture',
    '$SITE:online-fixture',
    '$START_TIME:2026/05/05 16:10:24',
    '$END_TIME:2026/05/05 16:53:11',
    '$TIME:900+0+5',
    'N+Alice',
    'N-Bob',
    "'black_rate:3200",
    "'** 0 -9394FU, this whole physical line is a comment",
    'PI',
    '+',
    '+7776FU,T0',
    '-3334FU,T1',
    '+8822UM,T2',
    '-3122GI,T0',
    '+0088KA,T3',
    ...extraLines,
    '%TORYO,T0',
    '+9999FU,T999',
  ].join('\r\n');
}

function response(body: string): ReturnType<FetchLike> {
  const bytes = Uint8Array.from(Buffer.from(body, 'utf8'));
  return Promise.resolve({
    ok: true,
    status: 200,
    statusText: 'OK',
    arrayBuffer: async () => bytes.buffer,
  });
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.promises.rm(directory, { recursive: true })));
});

describe('CSA parsing and parent occurrences', () => {
  it('parses WCSC V3 comma statements, captures, promotion, and a drop', () => {
    const game = parseCsaGame(Buffer.from(completedGame(), 'ascii'), {
      source: 'wcsc',
      sourceUrl: 'https://example.test/wcsc36/',
      recordPath: 'final/001.csa',
      archiveSha256: ARCHIVE_SHA,
    });

    expect(game.moves.map((move) => move.token)).toEqual([
      '+7776FU',
      '-3334FU',
      '+8822UM',
      '-3122GI',
      '+0088KA',
    ]);
    expect(game.moves.map((move) => move.usi)).toEqual(['7g7f', '3c3d', '8h2b+', '3a2b', 'B*8h']);
    expect(game.moves.map((move) => move.sideToMove)).toEqual(['b', 'w', 'b', 'w', 'b']);
    expect(game.terminal).toBe('TORYO');
    expect(game.players).toEqual({ sente: 'Alice', gote: 'Bob' });
    expect(game.ratings).toEqual({ sente: 3200, gote: null });
    expect(game).toMatchObject({
      event: 'WCSC36-fixture',
      site: 'online-fixture',
      startTime: '2026/05/05 16:10:24',
      endTime: '2026/05/05 16:53:11',
      timeControl: '900+0+5',
    });

    const parents = buildParentOccurrences(game);
    expect(parents).toHaveLength(5);
    expect(parents[0]).toMatchObject({
      source: 'wcsc',
      ply: 0,
      side_to_move: 'b',
      played_move: '7g7f',
      played_move_csa: '+7776FU',
      record_path: 'final/001.csa',
      archive_sha256: ARCHIVE_SHA,
      site: 'online-fixture',
      start_time: '2026/05/05 16:10:24',
      end_time: '2026/05/05 16:53:11',
      time_control: '900+0+5',
    });
    expect(parents[0].parent_sfen).toBe('lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1');
    expect(parents[1].parent_sfen.endsWith(' w - 2')).toBe(true);
    expect(parents[0]).not.toHaveProperty('cp');
    expect(parents[0].game_id).toBe(game.gameId);
    expect(parents[0].parent_id).not.toBe(parents[1].parent_id);
  });

  it('ignores move-looking comments and everything after the first terminal statement', () => {
    const fixture = [
      'V3.0',
      'PI',
      '+',
      "' +9999FU,T0",
      '+7776FU,T0',
      '%TORYO,+9999FU,T0',
      '-3334FU,T0',
    ].join('\n');
    const game = parseCsaGame(fixture, { source: 'wcsc' });
    expect(game.moves.map((move) => move.token)).toEqual(['+7776FU']);
    expect(game.terminal).toBe('TORYO');
  });

  it('fails closed on wrong side, illegal moves, and non-hirate PI modifications', () => {
    expect(() =>
      parseCsaGame(['V3.0', 'PI', '+', '-3334FU,T0', '%TORYO'].join('\n'), { source: 'wcsc' })
    ).toThrow(/side-to-move mismatch/);
    expect(() =>
      parseCsaGame(['V3.0', 'PI', '+', '+7775FU,T0', '%TORYO'].join('\n'), { source: 'wcsc' })
    ).toThrow(/illegal or piece-mismatched/);
    expect(() =>
      parseCsaGame(['V3.0', 'PI82HI', '+', '+7776FU,T0', '%TORYO'].join('\n'), { source: 'wcsc' })
    ).toThrow(/handicap/);
  });

  it('produces a stable game-group split', () => {
    const gameId = `sha256:${sha256('same game')}`;
    expect(stableGameSplit(gameId, { seed: 'fixed', valRatio: 0 })).toBe('train');
    expect(stableGameSplit(gameId, { seed: 'fixed', valRatio: 1 })).toBe('val');
    expect(stableGameSplit(gameId, { seed: 'fixed', valRatio: 0.2 })).toBe(
      stableGameSplit(gameId, { seed: 'fixed', valRatio: 0.2 })
    );
    expect(() => stableGameSplit(gameId, { valRatio: 1.1 })).toThrow(/valRatio/);
  });
});

describe('URL discovery and checksum-locked cache', () => {
  it('hashes exact bytes and URL-sorts/de-duplicates CSA links', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    const html = [
      '<a href="b.csa">b</a>',
      '<a href="./a.csa#fragment">a</a>',
      '<a href="a.csa">duplicate</a>',
      '<a href="https://cdn.example.test/C.CSA?raw=1&amp;x=2">c</a>',
      '<a href="notes.txt">not a game</a>',
    ].join('');
    const actual = discoverCsaUrls(html, 'https://example.test/2026/05/04/');
    expect(actual).toEqual(
      [
        'https://example.test/2026/05/04/a.csa',
        'https://example.test/2026/05/04/b.csa',
        'https://cdn.example.test/C.CSA?raw=1&x=2',
      ].sort()
    );
  });

  it('detects offline cache tampering and refuses a changed remote lock', async () => {
    const root = await temporaryDirectory();
    const manifest = new Map<string, CacheManifestEntry>();
    const url = 'https://example.test/game.csa';
    const fetchAlpha: FetchLike = async () => response('alpha');
    const first = await loadOrFetchObject(url, {
      cacheDir: root,
      manifest,
      source: 'floodgate',
      fetchImpl: fetchAlpha,
    });

    expect(Buffer.from(first.bytes).toString('utf8')).toBe('alpha');
    await verifyManifestCache(root, manifest.values());
    const serialized = serializeCacheManifest(manifest.values());
    expect([...parseCacheManifest(serialized).keys()]).toEqual([url]);
    expect(serialized.endsWith('\n')).toBe(true);

    const objectPath = path.join(root, ...first.entry.object.split('/'));
    await fs.promises.writeFile(objectPath, 'omega'); // same byte length, different checksum
    await expect(verifyManifestCache(root, manifest.values())).rejects.toThrow(/cache checksum mismatch/);
    await expect(
      loadOrFetchObject(url, { cacheDir: root, manifest, offline: true })
    ).rejects.toThrow(/cache checksum mismatch/);

    await fs.promises.writeFile(objectPath, 'alpha');
    const fetchBravo: FetchLike = async () => response('bravo');
    await expect(
      loadOrFetchObject(url, {
        cacheDir: root,
        manifest,
        refresh: true,
        fetchImpl: fetchBravo,
      })
    ).rejects.toThrow(/remote checksum changed/);

    const updated = await loadOrFetchObject(url, {
      cacheDir: root,
      manifest,
      refresh: true,
      updateLock: true,
      fetchImpl: fetchBravo,
    });
    expect(updated.entry.sha256).toBe(sha256('bravo'));
    await verifyManifestCache(root, manifest.values());
    await expect(
      loadOrFetchObject('https://example.test/missing.csa', {
        cacheDir: root,
        manifest,
        offline: true,
      })
    ).rejects.toThrow(/offline cache miss/);
  });
});

describe('local archive import', () => {
  it('verifies an optional ZIP, records checksums, and writes deterministic raw JSONL atomically', async () => {
    const root = await temporaryDirectory();
    const csaDir = path.join(root, 'csa');
    const archiveFile = path.join(root, 'wcsc36.zip');
    const out = path.join(root, 'output', 'parents.raw.jsonl');
    const reportPath = path.join(root, 'output', 'import-report.json');
    await fs.promises.mkdir(csaDir, { recursive: true });
    await fs.promises.writeFile(path.join(csaDir, '001.csa'), completedGame());
    await fs.promises.writeFile(archiveFile, 'pinned archive bytes');
    const archiveSha256 = sha256(Buffer.from('pinned archive bytes'));

    const options = {
      csaDir,
      source: 'wcsc' as const,
      sourceUrl: 'https://example.test/wcsc36/',
      archiveSha256,
      archiveFile,
      out,
      report: reportPath,
    };
    const first = await importCsaDirectory(options);
    const firstOutput = await fs.promises.readFile(out, 'utf8');
    const second = await importCsaDirectory(options);
    const secondOutput = await fs.promises.readFile(out, 'utf8');

    expect(first.archive_sha256_verified).toBe(true);
    expect(first.accepted_games).toBe(1);
    expect(first.rejected_games).toBe(0);
    expect(first.parent_occurrences).toBe(5);
    expect(first.dataset_sha256).toBe(sha256(firstOutput));
    expect(first.output_written).toBe(true);
    expect(second.dataset_sha256).toBe(first.dataset_sha256);
    expect(secondOutput).toBe(firstOutput);
    expect(JSON.parse(firstOutput.split('\n')[0])).not.toHaveProperty('cp');
    expect((await fs.promises.readFile(reportPath, 'utf8')).endsWith('\n')).toBe(true);

    await expect(
      importCsaDirectory({ ...options, archiveSha256: '0'.repeat(64) })
    ).rejects.toThrow(/archive checksum mismatch/);
  });

  it('rejects colliding dataset/report paths and strict CLI mistakes', async () => {
    const root = await temporaryDirectory();
    const csaDir = path.join(root, 'csa');
    const sameOutput = path.join(root, 'same.json');
    await fs.promises.mkdir(csaDir, { recursive: true });
    await fs.promises.writeFile(path.join(csaDir, '001.csa'), completedGame());

    await expect(importCsaDirectory({
      csaDir,
      source: 'wcsc',
      sourceUrl: 'https://example.test/wcsc36/',
      archiveSha256: ARCHIVE_SHA,
      out: sameOutput,
      report: sameOutput,
    })).rejects.toThrow(/different files/);
    await expect(importCsaMain(['--unknown', 'value'])).rejects.toThrow(/unknown option/);
    await expect(importCsaMain(['--csa-dir', 'one', '--csa-dir', 'two'])).rejects.toThrow(
      /duplicate option/
    );

    const realParent = path.join(root, 'real-output');
    const aliasParent = path.join(root, 'alias-output');
    await fs.promises.mkdir(realParent);
    await fs.promises.symlink(realParent, aliasParent);
    await expect(importCsaDirectory({
      csaDir,
      source: 'wcsc',
      sourceUrl: 'https://example.test/wcsc36/',
      archiveSha256: ARCHIVE_SHA,
      out: path.join(realParent, 'missing', 'same.json'),
      report: path.join(aliasParent, 'missing', 'same.json'),
    })).rejects.toThrow(/different files/);

    await expect(importCsaDirectory({
      csaDir,
      source: 'wcsc',
      sourceUrl: 'https://example.test/wcsc36/',
      archiveSha256: ARCHIVE_SHA,
      out: path.join(csaDir, '001.csa'),
      report: path.join(root, 'safe-report.json'),
    })).rejects.toThrow(/must not alias/);
  });

  it('leaves a truthful failure report and does not publish data for a rejected CSA', async () => {
    const root = await temporaryDirectory();
    const csaDir = path.join(root, 'csa');
    const out = path.join(root, 'parents.raw.jsonl');
    const reportPath = path.join(root, 'report.json');
    await fs.promises.mkdir(csaDir, { recursive: true });
    await fs.promises.writeFile(path.join(csaDir, 'bad.csa'), 'V3.0\nPI\n+\n+7775FU,T0\n%TORYO\n');

    await expect(importCsaDirectory({
      csaDir,
      source: 'wcsc',
      sourceUrl: 'https://example.test/wcsc36/',
      archiveSha256: ARCHIVE_SHA,
      out,
      report: reportPath,
    })).rejects.toThrow(/no dataset was written/);
    expect(await fs.promises.stat(out).catch(() => null)).toBeNull();
    expect(JSON.parse(await fs.promises.readFile(reportPath, 'utf8'))).toMatchObject({
      rejected_games: 1,
      output_written: false,
    });
  });
});
