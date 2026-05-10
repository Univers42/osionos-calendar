import type { CalendarEvent, CalendarSource } from '../types';

const now = new Date();

function eventIso(dayOffset: number, hour: number, minute = 0) {
  const date = new Date(now);
  date.setDate(now.getDate() + dayOffset);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

function allDayIso(dayOffset: number) {
  const date = new Date(now);
  date.setDate(now.getDate() + dayOffset);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

export const DEFAULT_CALENDARS: CalendarSource[] = [
  {
    id: 'local-personal',
    accountId: 'local-account',
    accountName: 'Local workspace',
    name: 'Personal',
    description: 'Local editable calendar until Google Calendar is connected.',
    color: '#63d18d',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    visible: true,
    primary: true,
    accessRole: 'owner',
    source: 'local',
  },
  {
    id: 'local-projects',
    accountId: 'local-account',
    accountName: 'Local workspace',
    name: 'Projects',
    color: '#51ace3',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    visible: true,
    accessRole: 'owner',
    source: 'local',
  },
  {
    id: 'local-school',
    accountId: 'local-account',
    accountName: 'Local workspace',
    name: '42 school planning',
    color: '#f9c344',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    visible: true,
    accessRole: 'writer',
    source: 'local',
  },
  {
    id: 'local-holidays',
    accountId: 'local-account',
    accountName: 'Local workspace',
    name: 'Holidays in Spain',
    color: '#8783d1',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    visible: true,
    accessRole: 'reader',
    readonly: true,
    source: 'local',
  },
];

export const MOCK_EVENTS: CalendarEvent[] = [
  {
    id: 'local-event-standup',
    calendarId: 'local-projects',
    source: 'local',
    title: 'Bridge architecture review',
    start: eventIso(0, 10),
    end: eventIso(0, 11),
    allDay: false,
    participants: ['team@univers42.local'],
    conferencing: true,
    repeat: 'weekly',
    busyStatus: 'busy',
    visibility: 'default',
    status: 'confirmed',
    description: 'Review provider auth, BaaS mirroring, and range cache behavior.',
    location: 'Localhost room',
  },
  {
    id: 'local-event-focus',
    calendarId: 'local-personal',
    source: 'local',
    title: 'Focus block',
    start: eventIso(1, 14),
    end: eventIso(1, 16),
    allDay: false,
    participants: [],
    conferencing: false,
    repeat: 'none',
    busyStatus: 'busy',
    visibility: 'private',
    status: 'confirmed',
    description: 'Keep the calendar UI dense, fast, and keyboard-friendly.',
  },
  {
    id: 'local-event-release',
    calendarId: 'local-projects',
    source: 'local',
    title: 'BaaS sync smoke test',
    start: eventIso(2, 9, 30),
    end: eventIso(2, 10, 15),
    allDay: false,
    participants: ['infra@univers42.local'],
    conferencing: true,
    repeat: 'none',
    busyStatus: 'busy',
    visibility: 'default',
    status: 'tentative',
    location: 'Kong gateway',
  },
  {
    id: 'local-event-school',
    calendarId: 'local-school',
    source: 'local',
    title: 'C Piscine mentoring',
    start: eventIso(-1, 18),
    end: eventIso(-1, 19, 30),
    allDay: false,
    participants: ['peer@42.local'],
    conferencing: false,
    repeat: 'none',
    busyStatus: 'busy',
    visibility: 'public',
    status: 'confirmed',
    location: 'Cluster',
  },
  {
    id: 'local-event-holiday',
    calendarId: 'local-holidays',
    source: 'local',
    title: 'San Esteban',
    start: allDayIso(4),
    end: allDayIso(5),
    allDay: true,
    participants: [],
    conferencing: false,
    repeat: 'yearly',
    busyStatus: 'free',
    visibility: 'public',
    status: 'confirmed',
    readonly: true,
    description: 'Holiday sample from the prompt capture.',
  },
  {
    id: 'local-event-planning',
    calendarId: 'local-projects',
    source: 'local',
    title: 'Calendar performance pass',
    start: allDayIso(-2),
    end: allDayIso(1),
    allDay: true,
    participants: ['product@univers42.local'],
    conferencing: false,
    repeat: 'none',
    busyStatus: 'busy',
    visibility: 'default',
    status: 'confirmed',
    description: 'Multi-day event used to verify month and week all-day rendering.',
  },
];