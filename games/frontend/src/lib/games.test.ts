// Run with: npm test (Node's built-in runner; no extra dependencies)
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Game, UserEntry } from "../api/client";
import {
  DEFAULT_FILTER,
  draftError,
  fromDay,
  toDay,
  filterFromParams,
  filterToParams,
  matches,
  owned,
  sortGames,
  toCsv,
  type EntryDraft,
} from "./games.ts";

const entry = (e: Partial<UserEntry> = {}): UserEntry => ({
  id: 1, platformId: 1, platformName: "PC", status: "Backlog", hoursPlayed: null, rating: null, notes: null,
  achievementsEarned: null, achievementsTotal: null, mode: null, hardware: "Original", source: "Manual",
  startedAt: null, completedAt: null, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", ...e,
});
const game = (id: number, g: Partial<Game> = {}, e: Partial<UserEntry> = {}): Game => ({
  id, title: `Game ${id}`, coverUrl: null, genre: null, releaseYear: null, developer: null, summary: null,
  igdbId: null, steamAppId: null, isFavourite: false, createdAt: "2026-01-01T00:00:00Z",
  userEntries: [entry(e)], ...g,
});

test("hidden games only match the Hidden filter", () => {
  const hidden = game(1, { isHidden: true });
  assert.equal(matches(hidden, DEFAULT_FILTER), false);
  assert.equal(matches(hidden, { ...DEFAULT_FILTER, status: "Hidden" }), true);
  assert.equal(matches(game(2), { ...DEFAULT_FILTER, status: "Hidden" }), false);
});

test("status, platform, genre, hardware, decade and search filters", () => {
  const g = game(1, { genre: "RPG", releaseYear: 1999, developer: "Sega" }, { status: "Playing", platformId: 26, hardware: "Modded" });
  const f = { ...DEFAULT_FILTER, status: "Playing" as const, platformId: 26, genre: "RPG", hardware: "Modded", decade: 1990, query: "sega" };
  assert.equal(matches(g, f), true);
  assert.equal(matches(g, { ...f, decade: 2000 }), false);
  assert.equal(matches(g, { ...f, status: "Completed" }), false);
  assert.equal(matches(g, { ...f, status: "Completed" }, true), true); // chip counts ignore status
  assert.equal(matches(g, { ...f, query: "nintendo" }), false);
});

test("recent sort prefers Steam's last played over edit time", () => {
  const a = game(1, {}, { updatedAt: "2026-06-01T00:00:00Z", lastPlayedAt: "2024-01-01T00:00:00Z" });
  const b = game(2, {}, { updatedAt: "2025-01-01T00:00:00Z" });
  assert.deepEqual(sortGames([a, b], "recent").map((g) => g.id), [2, 1]);
  const neverLaunched = game(3, {}, { source: "Steam", updatedAt: "2026-11-01T00:00:00Z" });
  assert.deepEqual(sortGames([neverLaunched, a], "recent").map((g) => g.id), [1, 3]);
});

test("owned leaves out hidden and wishlist games", () => {
  assert.deepEqual(owned([game(1), game(2, { isHidden: true }), game(3, {}, { status: "Wishlist" })]).map((g) => g.id), [1]);
});

test("filters round-trip through the URL, keeping only non-defaults", () => {
  const f = { ...DEFAULT_FILTER, status: "Completed" as const, platformId: 19, query: "zelda" };
  const p = filterToParams(f, DEFAULT_FILTER);
  assert.equal(p.toString(), "status=Completed&platform=19&q=zelda");
  assert.deepEqual(filterFromParams(p, DEFAULT_FILTER), f);
  assert.equal(filterFromParams(new URLSearchParams("status=Bogus&sort=nope"), DEFAULT_FILTER).status, "All");
});

test("entry drafts reject bad numbers and backwards dates", () => {
  const d: EntryDraft = { platformId: 1, status: "Backlog", mode: "", hardware: "Original", hours: "", rating: "", notes: "", started: "", completed: "" };
  assert.equal(draftError(d), null);
  assert.ok(draftError({ ...d, hours: "-1" }));
  assert.ok(draftError({ ...d, rating: "11" }));
  assert.ok(draftError({ ...d, started: "2026-05-02", completed: "2026-05-01" }));
});

test("CSV quotes commas, quotes and newlines", () => {
  const csv = toCsv([game(1, { title: 'Say "hi", ok', developer: "Sega\r" }, { notes: "line1\nline2" })]);
  assert.match(csv.split("\n")[1], /^"Say ""hi"", ok",PC,Backlog/);
  assert.ok(csv.includes('"line1\nline2"'));
  assert.ok(csv.includes('"Sega\r"'));
});

test("a picked day reads back as the same day", () => {
  for (const d of ["2026-01-01", "2026-03-05", "2026-12-31"]) assert.equal(toDay(fromDay(d)), d);
  assert.equal(toDay(null), "");
  assert.equal(fromDay(""), null);
});
