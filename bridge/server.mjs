#!/usr/bin/env node
/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   server.mjs                                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:16 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:16 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function unquote(value) {
  return value.trim().replaceAll(/^"|"$/g, '');
}

for (const envFile of ['.env.local', '.env']) {
  const envPath = resolve(rootDir, envFile);
  if (!existsSync(envPath)) continue;
  for (const rawLine of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_]\w*)\s*=\s*(.*)\s*$/.exec(rawLine);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = unquote(match[2]);
  }
}

const port = Number(process.env.CALENDAR_BRIDGE_PORT || 4200);
const appOrigin = process.env.CALENDAR_APP_ORIGIN || 'http://localhost:3003';
const bridgeOrigin = process.env.CALENDAR_BRIDGE_PUBLIC_ORIGIN || `http://localhost:${port}`;
const tokenFile = resolve(rootDir, process.env.CALENDAR_BRIDGE_TOKEN_FILE || '.calendar-bridge-tokens.json');
const stateFile = resolve(rootDir, process.env.CALENDAR_BRIDGE_STATE_FILE || '.calendar-bridge-state.json');
const vaultStatus = { enabled: process.env.CALENDAR_BRIDGE_VAULT_ENABLED === 'true', loaded: false, message: '' };
const vaultCredentials = await loadVaultGoogleCredentials();
const googleClientId = process.env.GOOGLE_CLIENT_ID || vaultCredentials.googleClientId || '';
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || vaultCredentials.googleClientSecret || '';
const googleRedirectUri = process.env.CALENDAR_REDIRECT_URI || `${bridgeOrigin}/auth/google/callback`;
const oauthStateTtlMs = Number(process.env.CALENDAR_BRIDGE_OAUTH_STATE_TTL_MS || 10 * 60 * 1000);
const googleEventsPageSize = Math.min(positiveInt(process.env.CALENDAR_EVENTS_PAGE_SIZE, 2500), 2500);
const callbackPaths = new Set([
  new URL(googleRedirectUri).pathname,
  ...String(process.env.CALENDAR_CALLBACK_PATHS || '').split(',').map((pathValue) => pathValue.trim()).filter(Boolean),
]);

const googleScopes = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar',
];

const baasUrl = (process.env.CALENDAR_BAAS_URL || '').replace(/\/+$/, '');
const baasPublicUrl = process.env.CALENDAR_BAAS_PUBLIC_URL || process.env.VITE_CALENDAR_BAAS_URL || 'http://localhost:8000';
const baasServiceKey = process.env.CALENDAR_BAAS_SERVICE_KEY || process.env.KONG_SERVICE_API_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const requireBaaS = process.env.CALENDAR_BRIDGE_REQUIRE_BAAS === 'true';
const baasRuntime = {
  configured: Boolean(baasUrl),
  connected: false,
  url: baasPublicUrl,
  message: baasUrl ? 'BaaS backend configured; status has not been checked yet.' : 'BaaS backend URL is not configured.',
  lastMirrorAt: null,
};

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function json(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  response.end(JSON.stringify(payload));
}

function html(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  response.end(body);
}

function readBody(request) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      if (chunks.length === 0) return resolveBody({});
      try {
        resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

async function vaultRequest(path, token, body) {
  const vaultAddr = process.env.VAULT_ADDR || 'http://127.0.0.1:8200';
  const response = await fetch(`${vaultAddr.replace(/\/+$/, '')}/v1/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'X-Vault-Token': token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.errors?.[0] || `Vault request failed with HTTP ${response.status}`);
  return payload;
}

async function loadVaultToken() {
  if (process.env.VAULT_TOKEN) return process.env.VAULT_TOKEN;
  if (process.env.VAULT_ROLE_ID && process.env.VAULT_SECRET_ID) {
    const login = await vaultRequest('auth/approle/login', '', {
      role_id: process.env.VAULT_ROLE_ID,
      secret_id: process.env.VAULT_SECRET_ID,
    });
    return login.auth?.client_token || '';
  }
  return '';
}

async function loadVaultGoogleCredentials() {
  if (process.env.CALENDAR_BRIDGE_VAULT_ENABLED !== 'true') return {};
  try {
    const token = await loadVaultToken();
    if (!token) throw new Error('VAULT_TOKEN or VAULT_ROLE_ID/VAULT_SECRET_ID is required');
    const path = process.env.CALENDAR_BRIDGE_VAULT_OAUTH_PATH || 'secret/data/mini-baas/oauth';
    const payload = await vaultRequest(path, token);
    const data = payload.data?.data || {};
    vaultStatus.loaded = Boolean(data.google_client_id && data.google_client_secret);
    vaultStatus.message = vaultStatus.loaded
      ? 'Google Calendar OAuth credentials loaded from BaaS Vault.'
      : 'BaaS Vault responded but Google OAuth credentials are empty.';
    return {
      googleClientId: data.google_client_id,
      googleClientSecret: data.google_client_secret,
    };
  } catch (error) {
    vaultStatus.message = error instanceof Error ? error.message : 'BaaS Vault credential lookup failed';
    return {};
  }
}

function configured() {
  return Boolean(googleClientId && googleClientSecret);
}

function readTokens() {
  if (!existsSync(tokenFile)) return null;
  return JSON.parse(readFileSync(tokenFile, 'utf8'));
}

function writeTokens(tokens) {
  mkdirSync(dirname(tokenFile), { recursive: true });
  writeFileSync(tokenFile, JSON.stringify(tokens, null, 2), { mode: 0o600 });
}

function readStates() {
  if (!existsSync(stateFile)) return {};
  return JSON.parse(readFileSync(stateFile, 'utf8'));
}

function writeStates(states) {
  mkdirSync(dirname(stateFile), { recursive: true });
  writeFileSync(stateFile, JSON.stringify(states, null, 2), { mode: 0o600 });
}

function pruneStates(states) {
  const now = Date.now();
  return Object.fromEntries(Object.entries(states).filter(([, value]) => now - value.createdAt < oauthStateTtlMs));
}

function saveOauthState(state, redirectUri) {
  const states = pruneStates(readStates());
  states[state] = { createdAt: Date.now(), redirectUri };
  writeStates(states);
}

function consumeOauthState(state) {
  const states = pruneStates(readStates());
  const value = states[state];
  delete states[state];
  writeStates(states);
  return value || null;
}

function callbackDebug() {
  return {
    bridgeOrigin,
    redirectUri: googleRedirectUri,
    callbackPaths: Array.from(callbackPaths),
    vault: vaultStatus.enabled ? { enabled: true, loaded: vaultStatus.loaded, message: vaultStatus.message } : { enabled: false },
  };
}

async function exchangeToken(parameters) {
  const body = new URLSearchParams(parameters);
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error_description || payload.error || 'Google token exchange failed');
  return payload;
}

async function accessToken() {
  const tokens = readTokens();
  if (!tokens) throw new Error('Google Calendar is not connected yet. Authorize it from osionos Calendar first.');
  if (tokens.access_token && tokens.expiresAt && tokens.expiresAt > Date.now() + 60000) return tokens.access_token;
  if (!tokens.refresh_token) throw new Error('Google Calendar refresh token is missing. Reconnect the account from the app.');

  const refreshed = await exchangeToken({
    client_id: googleClientId,
    client_secret: googleClientSecret,
    refresh_token: tokens.refresh_token,
    grant_type: 'refresh_token',
  });
  const nextTokens = {
    ...tokens,
    ...refreshed,
    refresh_token: refreshed.refresh_token || tokens.refresh_token,
    expiresAt: Date.now() + Number(refreshed.expires_in || 3600) * 1000,
  };
  writeTokens(nextTokens);
  return nextTokens.access_token;
}

async function googleFetch(path, options = {}) {
  const token = await accessToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  if (options.headers) Object.assign(headers, options.headers);
  const response = await fetch(`https://www.googleapis.com/calendar/v3/${path}`, {
    ...options,
    headers,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || `Google Calendar API request failed with HTTP ${response.status}`);
  return payload;
}

async function googleUserInfo() {
  const token = await accessToken();
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || `Google userinfo request failed with HTTP ${response.status}`);
  return payload;
}

async function currentAccount() {
  const tokens = readTokens();
  if (tokens?.account) return tokens.account;
  const profile = await googleUserInfo();
  const currentTokens = readTokens() ?? {};
  writeTokens({ ...currentTokens, account: profile.email || currentTokens.account || '' });
  return profile.email || '';
}

function calendarColor(item) {
  return item.backgroundColor || item.foregroundColor || '#63d18d';
}

function normalizeCalendar(item, account) {
  const calendarHash = createHash('sha1').update(`${account}:${item.id}`).digest('hex').slice(0, 16);
  return {
    id: `google-${calendarHash}`,
    providerCalendarId: item.id,
    accountId: `google-${createHash('sha1').update(account).digest('hex').slice(0, 12)}`,
    accountName: account,
    name: item.summary || item.id,
    description: item.description || '',
    color: calendarColor(item),
    timezone: item.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    visible: item.selected !== false,
    primary: Boolean(item.primary),
    accessRole: item.accessRole || 'reader',
    readonly: !['owner', 'writer'].includes(item.accessRole || ''),
    source: 'google',
  };
}

function dateOnlyToIso(value) {
  return new Date(`${value}T00:00:00`).toISOString();
}

function repeatFromGoogle(recurrence = []) {
  const rule = recurrence.find((item) => item.startsWith('RRULE:')) || '';
  if (rule.includes('FREQ=DAILY')) return 'daily';
  if (rule.includes('FREQ=WEEKLY')) return 'weekly';
  if (rule.includes('FREQ=MONTHLY')) return 'monthly';
  if (rule.includes('FREQ=YEARLY')) return 'yearly';
  return 'none';
}

function repeatToGoogle(repeat) {
  if (!repeat || repeat === 'none') return undefined;
  return [`RRULE:FREQ=${repeat.toUpperCase()}`];
}

function normalizeEvent(item, calendar) {
  const eventHash = createHash('sha1').update(`${calendar.providerCalendarId}:${item.id}`).digest('hex').slice(0, 18);
  const allDay = Boolean(item.start?.date);
  const start = allDay ? dateOnlyToIso(item.start.date) : new Date(item.start?.dateTime || Date.now()).toISOString();
  const end = allDay ? dateOnlyToIso(item.end?.date || item.start.date) : new Date(item.end?.dateTime || item.start?.dateTime || Date.now()).toISOString();
  const attendees = (item.attendees || []).map((attendee) => attendee.email).filter(Boolean);
  const meetingUrl = item.hangoutLink || item.conferenceData?.entryPoints?.find((entryPoint) => entryPoint.uri)?.uri || '';
  return {
    id: `google-event-${eventHash}`,
    providerEventId: item.id,
    calendarId: calendar.id,
    source: 'google',
    title: item.summary || '(no title)',
    start,
    end,
    allDay,
    timezone: item.start?.timeZone || calendar.timezone,
    color: calendar.color,
    description: item.description || '',
    location: item.location || '',
    participants: attendees,
    conferencing: Boolean(meetingUrl),
    meetingUrl,
    repeat: repeatFromGoogle(item.recurrence || []),
    busyStatus: item.transparency === 'transparent' ? 'free' : 'busy',
    visibility: item.visibility || 'default',
    status: item.status || 'confirmed',
    htmlLink: item.htmlLink || '',
    readonly: calendar.readonly,
    createdAt: item.created || '',
    updatedAt: item.updated || '',
  };
}

function isoDate(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function googleEventBody(event) {
  const body = {
    summary: event.title || '(no title)',
    description: event.description || '',
    location: event.location || '',
    transparency: event.busyStatus === 'free' ? 'transparent' : 'opaque',
    visibility: event.visibility === 'default' ? undefined : event.visibility,
    status: event.status === 'cancelled' ? 'cancelled' : 'confirmed',
    attendees: event.participants.filter(Boolean).map((email) => ({ email })),
    recurrence: repeatToGoogle(event.repeat),
  };

  if (event.allDay) {
    const startDate = isoDate(event.start);
    const endDate = isoDate(event.end || event.start);
    body.start = { date: startDate };
    body.end = { date: endDate === startDate ? isoDate(new Date(new Date(event.start).getTime() + 24 * 60 * 60 * 1000)) : endDate };
  } else {
    body.start = { dateTime: new Date(event.start).toISOString(), timeZone: event.timezone };
    body.end = { dateTime: new Date(event.end).toISOString(), timeZone: event.timezone };
  }

  if (event.conferencing) {
    body.conferenceData = {
      createRequest: {
        requestId: randomBytes(12).toString('hex'),
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    };
  }
  return body;
}

async function loadCalendars() {
  const account = await currentAccount();
  const payload = await googleFetch('users/me/calendarList?minAccessRole=reader&showHidden=true');
  return (payload.items || []).map((item) => normalizeCalendar(item, account));
}

async function loadEvents(timeMin, timeMax, requestedCalendarIds = []) {
  const calendars = await loadCalendars();
  const selectedCalendars = requestedCalendarIds.length
    ? calendars.filter((calendar) => requestedCalendarIds.includes(calendar.providerCalendarId || calendar.id) || requestedCalendarIds.includes(calendar.id))
    : calendars.filter((calendar) => calendar.visible);
  const events = [];
  for (const calendar of selectedCalendars) {
    const params = new URLSearchParams({
      singleEvents: 'true',
      orderBy: 'startTime',
      showDeleted: 'false',
      maxResults: String(googleEventsPageSize),
      timeMin,
      timeMax,
    });
    let pageToken = '';
    do {
      if (pageToken) params.set('pageToken', pageToken);
      const payload = await googleFetch(`calendars/${encodeURIComponent(calendar.providerCalendarId || calendar.id)}/events?${params}`);
      events.push(...(payload.items || []).map((item) => normalizeEvent(item, calendar)));
      pageToken = payload.nextPageToken || '';
    } while (pageToken);
  }
  const account = await currentAccount();
  const currentTokens = readTokens() ?? {};
  writeTokens({ ...currentTokens, account, lastSync: new Date().toISOString() });
  await mirrorSnapshotToBaaS(account, calendars, events);
  return { account, calendars, events };
}

function deterministicUuid(value) {
  const bytes = createHash('sha256').update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function baasHeaders(prefer = '') {
  if (!baasServiceKey) throw new Error('BaaS service key is not configured for calendar mirroring');
  return {
    'Content-Type': 'application/json',
    apikey: baasServiceKey,
    Authorization: `Bearer ${baasServiceKey}`,
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

async function baasRequest(path, options = {}) {
  if (!baasUrl) throw new Error('BaaS URL is not configured');
  const response = await fetch(`${baasUrl}${path}`, {
    method: options.method || 'GET',
    headers: baasHeaders(options.prefer),
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(payload?.message || payload?.hint || `BaaS request failed with HTTP ${response.status}`);
  return payload;
}

let baasStatusCheckedAt = 0;
let baasStatusRefreshing = false;
const BAAS_STATUS_TTL_MS = 30_000;

/**
 * Last-known BaaS status, refreshed in the background at most every 30s.
 * /health must answer instantly even (especially) when the gateway is down —
 * the live probe hangs ~5s in that case, which made Docker's 3s healthcheck
 * mark the bridge unhealthy forever although the bridge itself was fine.
 */
function baasStatusSnapshot() {
  if (!baasStatusRefreshing && Date.now() - baasStatusCheckedAt > BAAS_STATUS_TTL_MS) {
    baasStatusRefreshing = true;
    checkBaaS().catch(() => {}).finally(() => {
      baasStatusCheckedAt = Date.now();
      baasStatusRefreshing = false;
    });
  }
  return { ...baasRuntime };
}

async function checkBaaS() {
  if (!baasUrl) {
    baasRuntime.configured = false;
    baasRuntime.connected = false;
    baasRuntime.message = 'BaaS backend URL is not configured.';
    return { ...baasRuntime };
  }
  baasRuntime.configured = true;
  if (!baasServiceKey) {
    baasRuntime.connected = false;
    baasRuntime.message = 'BaaS URL is configured, but the calendar bridge has no service key for mirroring.';
    return { ...baasRuntime };
  }
  try {
    await baasRequest('/rest/v1/calendar_accounts?select=id&limit=1');
    baasRuntime.connected = true;
    baasRuntime.message = 'BaaS calendar tables are reachable through the local gateway.';
  } catch (error) {
    baasRuntime.connected = false;
    baasRuntime.message = error instanceof Error ? error.message : 'BaaS calendar status check failed';
    if (requireBaaS) throw error;
  }
  return { ...baasRuntime };
}

async function postgrestUpsert(table, records, onConflict) {
  if (!records.length) return;
  const query = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : '';
  await baasRequest(`/rest/v1/${table}${query}`, {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: records,
  });
}

async function mirrorSnapshotToBaaS(account, calendars, events) {
  if (!baasUrl || !baasServiceKey || !account) return { ...baasRuntime };
  try {
    const accountId = deterministicUuid(`google:${account}`);
    await postgrestUpsert('calendar_accounts', [{
      id: accountId,
      provider: 'google',
      account_email: account,
      display_name: account,
      last_seen_at: new Date().toISOString(),
    }], 'provider,account_email');

    const sourceRecords = calendars.map((calendar) => ({
      id: deterministicUuid(`google:${account}:${calendar.providerCalendarId || calendar.id}`),
      account_id: accountId,
      provider_calendar_id: calendar.providerCalendarId || calendar.id,
      name: calendar.name,
      color: calendar.color,
      timezone: calendar.timezone,
      is_visible: calendar.visible,
      is_primary: Boolean(calendar.primary),
      access_role: calendar.accessRole || '',
      metadata: { source: calendar.source, description: calendar.description || '' },
      updated_at: new Date().toISOString(),
    }));
    await postgrestUpsert('calendar_sources', sourceRecords, 'account_id,provider_calendar_id');

    const sourceIdByCalendarId = new Map(calendars.map((calendar) => [
      calendar.id,
      deterministicUuid(`google:${account}:${calendar.providerCalendarId || calendar.id}`),
    ]));
    const eventRecords = events.map((event) => ({
      id: deterministicUuid(`google:${event.calendarId}:${event.providerEventId || event.id}`),
      source_id: sourceIdByCalendarId.get(event.calendarId),
      provider_event_id: event.providerEventId || event.id,
      title: event.title,
      description: event.description || '',
      location: event.location || '',
      starts_at: event.start,
      ends_at: event.end,
      all_day: event.allDay,
      status: event.status,
      visibility: event.visibility,
      busy_status: event.busyStatus,
      attendees: event.participants.map((email) => ({ email })),
      conferencing: { enabled: event.conferencing, meetingUrl: event.meetingUrl || '' },
      recurrence: event.repeat,
      source_payload: event,
      updated_at: new Date().toISOString(),
    })).filter((record) => record.source_id);
    await postgrestUpsert('calendar_event_cache', eventRecords, 'source_id,provider_event_id');
    baasRuntime.connected = true;
    baasRuntime.message = `Mirrored ${eventRecords.length} Google Calendar events into BaaS.`;
    baasRuntime.lastMirrorAt = new Date().toISOString();
  } catch (error) {
    baasRuntime.connected = false;
    baasRuntime.message = error instanceof Error ? error.message : 'BaaS calendar mirror failed';
    if (requireBaaS) throw error;
  }
  return { ...baasRuntime };
}

async function publicSession(extra = {}) {
  const tokens = readTokens();
  let message = 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET before connecting Google Calendar.';
  if (configured()) {
    message = vaultStatus.loaded ? 'Google Calendar bridge is configured from BaaS Vault.' : 'Google Calendar bridge is configured for localhost OAuth.';
  }
  return {
    provider: 'google',
    configured: configured(),
    connected: Boolean(tokens?.refresh_token || tokens?.access_token),
    account: tokens?.account || '',
    lastSync: tokens?.lastSync || null,
    message,
    callback: callbackDebug(),
    baas: await checkBaaS(),
    ...extra,
  };
}

function startGoogleAuth(response) {
  if (!configured()) {
    publicSession().then((session) => json(response, 400, session));
    return;
  }
  const state = randomBytes(24).toString('hex');
  saveOauthState(state, googleRedirectUri);
  const params = new URLSearchParams({
    client_id: googleClientId,
    redirect_uri: googleRedirectUri,
    response_type: 'code',
    scope: googleScopes.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  response.writeHead(302, { Location: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  response.end();
}

async function finishGoogleAuth(requestUrl, response) {
  const code = requestUrl.searchParams.get('code');
  const state = requestUrl.searchParams.get('state');
  const googleError = requestUrl.searchParams.get('error');
  const googleErrorDescription = requestUrl.searchParams.get('error_description');
  const oauthState = state ? consumeOauthState(state) : null;
  if (googleError) {
    const description = googleErrorDescription || googleError;
    html(response, 400, `
      <h1>Google Calendar authorization blocked</h1>
      <p>${escapeHtml(description)}</p>
      <pre>${escapeHtml(JSON.stringify(callbackDebug(), null, 2))}</pre>
    `);
    return;
  }
  if (!code || !state || !oauthState) {
    html(response, 400, `
      <h1>Google Calendar authorization failed</h1>
      <p>Invalid or expired OAuth state. Start again from osionos Calendar.</p>
      <pre>${escapeHtml(JSON.stringify(callbackDebug(), null, 2))}</pre>
    `);
    return;
  }
  const tokens = await exchangeToken({
    code,
    client_id: googleClientId,
    client_secret: googleClientSecret,
    redirect_uri: oauthState.redirectUri,
    grant_type: 'authorization_code',
  });
  writeTokens({
    ...tokens,
    provider: 'google',
    expiresAt: Date.now() + Number(tokens.expires_in || 3600) * 1000,
    lastSync: null,
  });
  const profile = await googleUserInfo();
  writeTokens({ ...readTokens(), account: profile.email || '' });
  html(response, 200, '<h1>Google Calendar connected</h1><p>You can close this tab and refresh osionos Calendar.</p>');
}

async function handleSessionRoutes(request, requestUrl, response) {
  if (request.method === 'GET' && requestUrl.pathname === '/') {
    json(response, 200, { ok: true, service: 'osionos-calendar-bridge', ...await publicSession() });
    return true;
  }
  if (request.method === 'GET' && requestUrl.pathname === '/health') {
    json(response, 200, { ok: true, provider: 'google-calendar', baas: baasStatusSnapshot() });
    return true;
  }
  if (request.method === 'GET' && requestUrl.pathname === '/session') {
    json(response, 200, await publicSession());
    return true;
  }
  if (request.method === 'POST' && requestUrl.pathname === '/disconnect') {
    if (existsSync(tokenFile)) rmSync(tokenFile);
    json(response, 200, await publicSession({ connected: false, account: '', lastSync: null }));
    return true;
  }
  if (request.method === 'GET' && requestUrl.pathname === '/baas/status') {
    json(response, 200, await checkBaaS());
    return true;
  }
  return false;
}

async function handleAuthRoutes(request, requestUrl, response) {
  if (request.method !== 'GET') return false;
  if (requestUrl.pathname === '/auth/google/start') {
    startGoogleAuth(response);
    return true;
  }
  if (callbackPaths.has(requestUrl.pathname)) {
    await finishGoogleAuth(requestUrl, response);
    return true;
  }
  if (/^\/auth\/(outlook|caldav)\/start$/.test(requestUrl.pathname)) {
    json(response, 501, { message: 'Google Calendar is wired now. Outlook and CalDAV can plug into the same endpoint shape next.' });
    return true;
  }
  return false;
}

async function handleCalendarRoutes(request, requestUrl, response) {
  if (request.method === 'GET' && requestUrl.pathname === '/calendars') {
    json(response, 200, { provider: 'google', account: await currentAccount(), calendars: await loadCalendars() });
    return true;
  }
  if (request.method === 'GET' && requestUrl.pathname === '/events') {
    const timeMin = requestUrl.searchParams.get('timeMin') || new Date().toISOString();
    const timeMax = requestUrl.searchParams.get('timeMax') || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const calendarIds = (requestUrl.searchParams.get('calendarIds') || '').split(',').map((item) => item.trim()).filter(Boolean);
    const loaded = await loadEvents(timeMin, timeMax, calendarIds);
    json(response, 200, {
      provider: 'google',
      account: loaded.account,
      syncedAt: new Date().toISOString(),
      range: { start: timeMin, end: timeMax },
      calendars: loaded.calendars,
      events: loaded.events,
      baas: { ...baasRuntime },
    });
    return true;
  }
  if (request.method === 'POST' && requestUrl.pathname === '/events') {
    const body = await readBody(request);
    const calendar = body.calendar || {};
    const event = body.event || {};
    const providerCalendarId = calendar.providerCalendarId || calendar.id || 'primary';
    const created = await googleFetch(`calendars/${encodeURIComponent(providerCalendarId)}/events?conferenceDataVersion=1&sendUpdates=all`, {
      method: 'POST',
      body: JSON.stringify(googleEventBody(event)),
    });
    const normalizedCalendar = { ...calendar, source: 'google', providerCalendarId };
    const normalizedEvent = normalizeEvent(created, normalizedCalendar);
    await mirrorSnapshotToBaaS(await currentAccount(), [normalizedCalendar], [normalizedEvent]);
    json(response, 200, { provider: 'google', account: await currentAccount(), event: normalizedEvent, baas: { ...baasRuntime } });
    return true;
  }
  const eventMatch = /^\/events\/([^/]+)\/([^/]+)$/.exec(requestUrl.pathname);
  if (eventMatch && request.method === 'PUT') {
    const providerCalendarId = decodeURIComponent(eventMatch[1]);
    const providerEventId = decodeURIComponent(eventMatch[2]);
    const body = await readBody(request);
    const calendar = { ...body.calendar, source: 'google', providerCalendarId };
    const updated = await googleFetch(`calendars/${encodeURIComponent(providerCalendarId)}/events/${encodeURIComponent(providerEventId)}?conferenceDataVersion=1&sendUpdates=all`, {
      method: 'PUT',
      body: JSON.stringify(googleEventBody(body.event || {})),
    });
    const normalizedEvent = normalizeEvent(updated, calendar);
    await mirrorSnapshotToBaaS(await currentAccount(), [calendar], [normalizedEvent]);
    json(response, 200, { provider: 'google', account: await currentAccount(), event: normalizedEvent, baas: { ...baasRuntime } });
    return true;
  }
  if (eventMatch && request.method === 'DELETE') {
    const providerCalendarId = decodeURIComponent(eventMatch[1]);
    const providerEventId = decodeURIComponent(eventMatch[2]);
    await googleFetch(`calendars/${encodeURIComponent(providerCalendarId)}/events/${encodeURIComponent(providerEventId)}?sendUpdates=all`, { method: 'DELETE' });
    json(response, 200, { ok: true, baas: { ...baasRuntime } });
    return true;
  }
  if (request.method === 'POST' && requestUrl.pathname === '/baas/mirror') {
    const body = await readBody(request);
    const baas = await mirrorSnapshotToBaaS(body.account || await currentAccount(), body.calendars || [], body.events || []);
    json(response, 200, baas);
    return true;
  }
  return false;
}

async function route(request, response) {
  if (request.method === 'OPTIONS') return json(response, 204, {});
  const requestUrl = new URL(request.url || '/', `http://localhost:${port}`);
  try {
    if (await handleSessionRoutes(request, requestUrl, response)) return;
    if (await handleAuthRoutes(request, requestUrl, response)) return;
    if (await handleCalendarRoutes(request, requestUrl, response)) return;
    return json(response, 404, { message: 'Calendar bridge route not found' });
  } catch (error) {
    return json(response, 500, { message: error instanceof Error ? error.message : 'Calendar bridge error' });
  }
}

createServer((request, response) => {
  route(request, response);
}).listen(port, '0.0.0.0', () => {
  console.log(`[calendar-bridge] Google Calendar bridge listening on http://localhost:${port}`);
  console.log(`[calendar-bridge] OAuth redirect URI: ${googleRedirectUri}`);
});