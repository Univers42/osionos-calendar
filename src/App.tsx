import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { CalendarGrid } from './components/CalendarGrid';
import { CalendarSidebar } from './components/CalendarSidebar';
import { CalendarToolbar } from './components/CalendarToolbar';
import { ConnectorModal } from './components/ConnectorModal';
import { EventInspector } from './components/EventInspector';
import { DEFAULT_CALENDARS, MOCK_EVENTS } from './data/mockCalendar';
import {
  bridgeErrorStatus,
  bridgeSessionToConnector,
  createBridgeEvent,
  deleteBridgeEvent,
  disconnectCalendarBridge,
  loadCalendarSession,
  openCalendarAuth,
  syncBridgeEvents,
  updateBridgeEvent,
} from './lib/calendarBridge';
import { addDays, clampDateRange, formatRangeTitle, moveCursor, startOfDay, viewRange } from './lib/date';
import { loadLatestCalendarCache, saveCalendarRangeCache } from './lib/calendarCache';
import type { CalendarEvent, CalendarSource, CalendarView, ConnectorState } from './types';

const BRIDGE_ENDPOINT = import.meta.env.VITE_CALENDAR_BRIDGE_URL || 'http://localhost:4200';
const LOCAL_ACCOUNT = 'Local workspace';
const LOCAL_COLORS = ['#de5550', '#63d18d', '#51ace3', '#f9c344', '#8783d1', '#d477b8'];

const INITIAL_CONNECTOR: ConnectorState = {
  provider: 'google',
  endpoint: BRIDGE_ENDPOINT,
  account: '',
  configured: false,
  connected: false,
  bridgeAvailable: false,
  message: 'Calendar bridge has not responded yet.',
  lastSync: null,
  baas: {
    configured: false,
    connected: false,
    url: import.meta.env.VITE_CALENDAR_BAAS_URL || 'http://localhost:8000',
    message: 'BaaS status has not been checked yet.',
    lastMirrorAt: null,
  },
};

function randomId(prefix: string) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function mergeSources(currentSources: CalendarSource[], incomingSources: CalendarSource[]) {
  const sourceMap = new Map(currentSources.map((source) => [source.id, source]));
  for (const source of incomingSources) {
    sourceMap.set(source.id, { ...sourceMap.get(source.id), ...source });
  }
  return Array.from(sourceMap.values());
}

function sourceIds(sources: CalendarSource[]) {
  return new Set(sources.filter((source) => source.visible).map((source) => source.id));
}

function overlapsRange(event: CalendarEvent, rangeStart: string, rangeEnd: string) {
  return new Date(event.start).getTime() < new Date(rangeEnd).getTime() && new Date(event.end).getTime() > new Date(rangeStart).getTime();
}

function defaultEvent(source: CalendarSource, start: Date, allDay: boolean): CalendarEvent {
  const startDate = allDay ? startOfDay(start) : start;
  const endDate = allDay ? addDays(startDate, 1) : new Date(startDate.getTime() + 60 * 60 * 1000);
  return {
    id: randomId('local-event'),
    calendarId: source.id,
    source: source.source,
    title: 'New event',
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    allDay,
    timezone: source.timezone,
    color: source.color,
    description: '',
    location: '',
    participants: [],
    conferencing: false,
    repeat: 'none',
    busyStatus: 'busy',
    visibility: 'default',
    status: 'confirmed',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export const App: React.FC = () => {
  const cached = useMemo(() => loadLatestCalendarCache(), []);
  const [view, setView] = useState<CalendarView>('week');
  const [cursorDate, setCursorDate] = useState(() => (cached?.cursorDate ? new Date(cached.cursorDate) : new Date()));
  const [sources, setSources] = useState<CalendarSource[]>(() => (cached?.calendars?.length ? cached.calendars : DEFAULT_CALENDARS));
  const [events, setEvents] = useState<CalendarEvent[]>(() => (cached?.events?.length ? cached.events : MOCK_EVENTS));
  const [visibleSourceIds, setVisibleSourceIds] = useState<Set<string>>(() => sourceIds(cached?.calendars?.length ? cached.calendars : DEFAULT_CALENDARS));
  const [activeEventId, setActiveEventId] = useState<string | null>(() => cached?.activeEventId || MOCK_EVENTS[0]?.id || null);
  const [draftEvent, setDraftEvent] = useState<CalendarEvent | null>(null);
  const [search, setSearch] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [connectorOpen, setConnectorOpen] = useState(false);
  const [connector, setConnector] = useState<ConnectorState>(INITIAL_CONNECTOR);
  const [isSyncing, setIsSyncing] = useState(false);
  const [notice, setNotice] = useState('Local sample calendar is ready. Connect Google Calendar when your OAuth credentials are configured.');

  const range = useMemo(() => viewRange(view, cursorDate), [cursorDate, view]);
  const rangeLabel = useMemo(() => formatRangeTitle(view, cursorDate), [cursorDate, view]);
  const sourcesById = useMemo(() => new Map(sources.map((source) => [source.id, source])), [sources]);
  const selectedEvent = draftEvent || events.find((event) => event.id === activeEventId) || null;
  const hasInspector = Boolean(selectedEvent);

  const visibleEvents = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return events.filter((event) => {
      if (!visibleSourceIds.has(event.calendarId)) return false;
      if (!overlapsRange(event, range.start, range.end)) return false;
      if (!normalizedSearch) return true;
      return [event.title, event.location, event.description, event.participants.join(' ')]
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [events, range.end, range.start, search, visibleSourceIds]);

  useEffect(() => {
    saveCalendarRangeCache({
      endpoint: connector.endpoint,
      account: connector.account || LOCAL_ACCOUNT,
      syncedAt: connector.lastSync || new Date().toISOString(),
      activeEventId,
      cursorDate: cursorDate.toISOString(),
      range,
      calendars: sources,
      events,
    });
  }, [activeEventId, connector.account, connector.endpoint, connector.lastSync, cursorDate, events, range, sources]);

  const refreshSession = useCallback(async () => {
    try {
      const session = await loadCalendarSession(BRIDGE_ENDPOINT);
      setConnector((current) => bridgeSessionToConnector(BRIDGE_ENDPOINT, current, session));
      setNotice(session.connected ? `Connected to Google Calendar as ${session.account}.` : session.message || 'Calendar bridge is available.');
      return session;
    } catch (error) {
      setConnector((current) => ({
        ...current,
        bridgeAvailable: false,
        connected: false,
        message: bridgeErrorStatus(error),
      }));
      setNotice(bridgeErrorStatus(error));
      return null;
    }
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const syncVisibleRange = useCallback(async () => {
    setIsSyncing(true);
    try {
      const session = connector.connected ? null : await refreshSession();
      const canSync = connector.connected || session?.connected;
      if (!canSync) {
        setNotice('Google Calendar is not connected yet. The local calendar remains fully editable.');
        return;
      }
      const providerCalendarIds = sources
        .filter((source) => source.source === 'google' && visibleSourceIds.has(source.id))
        .map((source) => source.providerCalendarId || source.id);
      const response = await syncBridgeEvents(BRIDGE_ENDPOINT, range, providerCalendarIds);
      setSources((current) => mergeSources(current.filter((source) => source.source !== 'google'), response.calendars));
      setVisibleSourceIds((current) => {
        const next = new Set(current);
        for (const calendar of response.calendars) if (calendar.visible) next.add(calendar.id);
        return next;
      });
      setEvents((current) => [...current.filter((event) => event.source !== 'google'), ...response.events]);
      setConnector((current) => ({
        ...current,
        account: response.account,
        connected: true,
        configured: true,
        bridgeAvailable: true,
        lastSync: response.syncedAt,
        baas: response.baas || current.baas,
        message: `Synced ${response.events.length} events from Google Calendar.`,
      }));
      setNotice(`Synced ${response.events.length} events from Google Calendar for ${formatRangeTitle(view, cursorDate)}.`);
      if (!activeEventId && response.events[0]) setActiveEventId(response.events[0].id);
    } catch (error) {
      setNotice(bridgeErrorStatus(error));
    } finally {
      setIsSyncing(false);
    }
  }, [activeEventId, connector.connected, cursorDate, range, refreshSession, sources, view, visibleSourceIds]);

  const createDraftAt = useCallback((date: Date = cursorDate, allDay = false) => {
    const writableSource = sources.find((source) => visibleSourceIds.has(source.id) && !source.readonly) || sources.find((source) => !source.readonly) || DEFAULT_CALENDARS[0];
    const event = defaultEvent(writableSource, date, allDay);
    setDraftEvent(event);
    setActiveEventId(event.id);
  }, [cursorDate, sources, visibleSourceIds]);

  const handleSaveEvent = useCallback(async (event: CalendarEvent) => {
    const source = sourcesById.get(event.calendarId) || sources[0];
    if (!source) return;
    const rangeResult = event.allDay ? { start: event.start, end: event.end } : clampDateRange(event.start, event.end);
    const nextEvent: CalendarEvent = {
      ...event,
      ...rangeResult,
      source: source.source,
      color: source.color,
      updatedAt: new Date().toISOString(),
    };
    let savedEvent = nextEvent;
    try {
      if (source.source === 'google' && connector.connected) {
        const response = nextEvent.providerEventId
          ? await updateBridgeEvent(BRIDGE_ENDPOINT, nextEvent, source)
          : await createBridgeEvent(BRIDGE_ENDPOINT, nextEvent, source);
        savedEvent = response.event;
        const baas = response.baas;
        if (baas) setConnector((current) => ({ ...current, baas }));
      }
      setEvents((current) => {
        const withoutEvent = current.filter((item) => item.id !== event.id);
        return [...withoutEvent, savedEvent].sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime());
      });
      setDraftEvent(null);
      setActiveEventId(savedEvent.id);
      setNotice(source.source === 'google' ? 'Event saved to Google Calendar.' : 'Local event saved.');
    } catch (error) {
      setNotice(bridgeErrorStatus(error));
    }
  }, [connector.connected, sources, sourcesById]);

  const handleDeleteEvent = useCallback(async (event: CalendarEvent) => {
    const source = sourcesById.get(event.calendarId);
    try {
      if (source?.source === 'google' && connector.connected) {
        await deleteBridgeEvent(BRIDGE_ENDPOINT, event, source);
      }
      setEvents((current) => current.filter((item) => item.id !== event.id));
      setDraftEvent(null);
      setActiveEventId(null);
      setNotice(source?.source === 'google' ? 'Event deleted from Google Calendar.' : 'Local event deleted.');
    } catch (error) {
      setNotice(bridgeErrorStatus(error));
    }
  }, [connector.connected, sourcesById]);

  const handleDuplicateEvent = useCallback((event: CalendarEvent) => {
    const start = addDays(new Date(event.start), 1);
    const end = addDays(new Date(event.end), 1);
    const duplicate: CalendarEvent = {
      ...event,
      id: randomId('local-event'),
      providerEventId: undefined,
      source: sourcesById.get(event.calendarId)?.source || 'local',
      title: `${event.title} copy`,
      start: start.toISOString(),
      end: end.toISOString(),
      readonly: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setDraftEvent(duplicate);
    setActiveEventId(duplicate.id);
  }, [sourcesById]);

  const handleAuthorize = useCallback(() => {
    try {
      openCalendarAuth(BRIDGE_ENDPOINT);
      setNotice('Google authorization opened in a new tab. Refresh the connector after approval.');
    } catch (error) {
      setNotice(bridgeErrorStatus(error));
    }
  }, []);

  const handleDisconnect = useCallback(async () => {
    try {
      const session = await disconnectCalendarBridge(BRIDGE_ENDPOINT);
      setConnector((current) => bridgeSessionToConnector(BRIDGE_ENDPOINT, current, session));
      setSources((current) => current.filter((source) => source.source !== 'google'));
      setEvents((current) => current.filter((event) => event.source !== 'google'));
      setVisibleSourceIds((current) => new Set(Array.from(current).filter((id) => sourcesById.get(id)?.source !== 'google')));
      setNotice('Google Calendar disconnected. Local calendars are still available.');
    } catch (error) {
      setNotice(bridgeErrorStatus(error));
    }
  }, [sourcesById]);

  const toggleSource = useCallback((sourceId: string) => {
    setVisibleSourceIds((current) => {
      const next = new Set(current);
      if (next.has(sourceId)) next.delete(sourceId);
      else next.add(sourceId);
      return next;
    });
  }, []);

  const createLocalSource = useCallback(() => {
    const color = LOCAL_COLORS[sources.length % LOCAL_COLORS.length];
    const source: CalendarSource = {
      id: randomId('local-calendar'),
      accountId: 'local-account',
      accountName: LOCAL_ACCOUNT,
      name: `Local calendar ${sources.filter((item) => item.source === 'local').length + 1}`,
      color,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      visible: true,
      accessRole: 'owner',
      source: 'local',
    };
    setSources((current) => [...current, source]);
    setVisibleSourceIds((current) => new Set([...current, source.id]));
    setNotice(`${source.name} created.`);
  }, [sources]);

  return (
    <main className="calendar-app">
      <CalendarSidebar
        open={sidebarOpen}
        sources={sources}
        visibleSourceIds={visibleSourceIds}
        selectedDate={cursorDate}
        connector={connector}
        onSelectDate={setCursorDate}
        onToggleSource={toggleSource}
        onCreateSource={createLocalSource}
        onOpenConnector={() => setConnectorOpen(true)}
      />

      <section className="calendar-main" aria-label="Calendar workspace">
        <CalendarToolbar
          view={view}
          rangeLabel={rangeLabel}
          search={search}
          sidebarOpen={sidebarOpen}
          isSyncing={isSyncing}
          onViewChange={setView}
          onToday={() => setCursorDate(new Date())}
          onPrevious={() => setCursorDate((current) => moveCursor(view, current, -1))}
          onNext={() => setCursorDate((current) => moveCursor(view, current, 1))}
          onCreateEvent={() => createDraftAt(cursorDate)}
          onRefresh={syncVisibleRange}
          onSearchChange={setSearch}
          onToggleSidebar={() => setSidebarOpen((current) => !current)}
        />

        <div className="calendar-statusbar">
          <button className="calendar-status-pill" type="button" onClick={() => setConnectorOpen(true)}>
            <span className={connector.connected ? 'calendar-status-dot is-connected' : 'calendar-status-dot'} />
            {connector.connected ? connector.account : 'Google not connected'}
          </button>
          <button className="calendar-status-pill" type="button" onClick={() => setConnectorOpen(true)}>
            <span className={connector.baas.connected ? 'calendar-status-dot is-connected' : 'calendar-status-dot'} />
            BaaS {connector.baas.connected ? 'mirroring' : 'standby'}
          </button>
          <p>{notice}</p>
        </div>

        <div className={hasInspector ? 'calendar-workspace has-inspector' : 'calendar-workspace'}>
          <CalendarGrid
            view={view}
            cursorDate={cursorDate}
            events={visibleEvents}
            sourcesById={sourcesById}
            activeEventId={activeEventId}
            onSelectEvent={(eventId) => {
              setDraftEvent(null);
              setActiveEventId(eventId);
            }}
            onCreateAt={createDraftAt}
          />
          {selectedEvent ? (
            <EventInspector
              event={selectedEvent}
              sources={sources}
              isDraft={Boolean(draftEvent)}
              onClose={() => {
                setDraftEvent(null);
                setActiveEventId(null);
              }}
              onSave={handleSaveEvent}
              onDelete={handleDeleteEvent}
              onDuplicate={handleDuplicateEvent}
            />
          ) : null}
        </div>
      </section>

      <ConnectorModal
        open={connectorOpen}
        connector={connector}
        isSyncing={isSyncing}
        onClose={() => setConnectorOpen(false)}
        onAuthorize={handleAuthorize}
        onRefreshSession={refreshSession}
        onDisconnect={handleDisconnect}
        onSync={syncVisibleRange}
      />
    </main>
  );
};