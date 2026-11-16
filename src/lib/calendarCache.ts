import type { CalendarEvent, CalendarRange, CalendarSource } from '../types';

const CACHE_VERSION = 1;
const CACHE_INDEX_KEY = 'osionos-calendar-cache:index';
const CACHE_PREFIX = 'osionos-calendar-cache:range:';

export interface CalendarRangeCache {
  version: number;
  endpoint: string;
  account: string;
  syncedAt: string;
  activeEventId: string | null;
  cursorDate: string;
  range: CalendarRange;
  calendars: CalendarSource[];
  events: CalendarEvent[];
}

function canUseStorage() {
  return typeof globalThis.localStorage !== 'undefined';
}

function keyPart(value: string) {
  return value.trim().replaceAll(/\W+/g, '_').toLowerCase();
}

function cacheKey(endpoint: string, account: string, range: CalendarRange) {
  return `${CACHE_PREFIX}${keyPart(endpoint)}:${keyPart(account)}:${keyPart(range.start)}:${keyPart(range.end)}`;
}

function readCache(key: string): CalendarRangeCache | null {
  if (!canUseStorage()) return null;
  const raw = globalThis.localStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CalendarRangeCache;
    if (parsed.version !== CACHE_VERSION || !Array.isArray(parsed.events) || !Array.isArray(parsed.calendars)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function loadCalendarRangeCache(endpoint: string, account: string, range: CalendarRange) {
  if (!account) return null;
  return readCache(cacheKey(endpoint, account, range));
}

export function loadLatestCalendarCache() {
  if (!canUseStorage()) return null;
  const key = globalThis.localStorage.getItem(CACHE_INDEX_KEY);
  return key ? readCache(key) : null;
}

export function saveCalendarRangeCache(cache: Omit<CalendarRangeCache, 'version'>) {
  if (!canUseStorage() || !cache.account) return;
  const key = cacheKey(cache.endpoint, cache.account, cache.range);
  const payload: CalendarRangeCache = { ...cache, version: CACHE_VERSION };
  try {
    globalThis.localStorage.setItem(key, JSON.stringify(payload));
    globalThis.localStorage.setItem(CACHE_INDEX_KEY, key);
  } catch {
    globalThis.localStorage.removeItem(key);
  }
}

export function clearCalendarCache(endpoint: string, account: string, range: CalendarRange) {
  if (!canUseStorage() || !account) return;
  globalThis.localStorage.removeItem(cacheKey(endpoint, account, range));
}