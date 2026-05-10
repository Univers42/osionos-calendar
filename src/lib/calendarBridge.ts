import type { CalendarEvent, CalendarProvider, CalendarRange, CalendarSource, ConnectorState } from '../types';

export interface BridgeSessionResponse {
  provider: CalendarProvider;
  configured: boolean;
  connected: boolean;
  account: string;
  lastSync: string | null;
  message?: string;
  baas?: ConnectorState['baas'];
}

export interface BridgeCalendarsResponse {
  provider: CalendarProvider;
  account: string;
  calendars: CalendarSource[];
}

export interface BridgeEventsResponse {
  provider: CalendarProvider;
  account: string;
  syncedAt: string;
  range: CalendarRange;
  calendars: CalendarSource[];
  events: CalendarEvent[];
  baas?: ConnectorState['baas'];
}

export interface BridgeEventResponse {
  provider: CalendarProvider;
  account: string;
  event: CalendarEvent;
  baas?: ConnectorState['baas'];
}

function bridgeBase(endpoint: string) {
  return endpoint.trim().replace(/\/+$/, '');
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload?.message === 'string' ? payload.message : `Calendar bridge returned HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload as T;
}

export async function loadCalendarSession(endpoint: string): Promise<BridgeSessionResponse> {
  const response = await fetch(`${bridgeBase(endpoint)}/session`);
  return readJson<BridgeSessionResponse>(response);
}

export async function loadBaaSStatus(endpoint: string) {
  const response = await fetch(`${bridgeBase(endpoint)}/baas/status`);
  return readJson<ConnectorState['baas']>(response);
}

export function openCalendarAuth(endpoint: string) {
  const authWindow = globalThis.open(`${bridgeBase(endpoint)}/auth/google/start`, '_blank', 'noopener,noreferrer');
  if (!authWindow) throw new Error('The browser blocked the Google Calendar authorization window.');
}

export async function disconnectCalendarBridge(endpoint: string): Promise<BridgeSessionResponse> {
  const response = await fetch(`${bridgeBase(endpoint)}/disconnect`, { method: 'POST' });
  return readJson<BridgeSessionResponse>(response);
}

export async function loadBridgeCalendars(endpoint: string): Promise<BridgeCalendarsResponse> {
  const response = await fetch(`${bridgeBase(endpoint)}/calendars`);
  return readJson<BridgeCalendarsResponse>(response);
}

export async function syncBridgeEvents(endpoint: string, range: CalendarRange, calendarIds: string[]): Promise<BridgeEventsResponse> {
  const params = new URLSearchParams({ timeMin: range.start, timeMax: range.end });
  if (calendarIds.length) params.set('calendarIds', calendarIds.join(','));
  const response = await fetch(`${bridgeBase(endpoint)}/events?${params}`);
  return readJson<BridgeEventsResponse>(response);
}

export async function createBridgeEvent(endpoint: string, event: CalendarEvent, calendar: CalendarSource): Promise<BridgeEventResponse> {
  const response = await fetch(`${bridgeBase(endpoint)}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, calendar }),
  });
  return readJson<BridgeEventResponse>(response);
}

export async function updateBridgeEvent(endpoint: string, event: CalendarEvent, calendar: CalendarSource): Promise<BridgeEventResponse> {
  const providerCalendarId = calendar.providerCalendarId || calendar.id;
  const providerEventId = event.providerEventId || event.id;
  const response = await fetch(`${bridgeBase(endpoint)}/events/${encodeURIComponent(providerCalendarId)}/${encodeURIComponent(providerEventId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, calendar }),
  });
  return readJson<BridgeEventResponse>(response);
}

export async function deleteBridgeEvent(endpoint: string, event: CalendarEvent, calendar: CalendarSource) {
  const providerCalendarId = calendar.providerCalendarId || calendar.id;
  const providerEventId = event.providerEventId || event.id;
  const response = await fetch(`${bridgeBase(endpoint)}/events/${encodeURIComponent(providerCalendarId)}/${encodeURIComponent(providerEventId)}`, {
    method: 'DELETE',
  });
  return readJson<{ ok: boolean; baas?: ConnectorState['baas'] }>(response);
}

export function bridgeSessionToConnector(endpoint: string, current: ConnectorState, session: BridgeSessionResponse): ConnectorState {
  return {
    ...current,
    endpoint,
    provider: session.provider,
    account: session.account || current.account,
    configured: session.configured,
    connected: session.connected,
    bridgeAvailable: true,
    message: session.message || current.message,
    lastSync: session.lastSync,
    baas: session.baas || current.baas,
  };
}

export function bridgeErrorStatus(error: unknown) {
  return error instanceof Error ? error.message : 'Calendar bridge request failed';
}