import type { LucideIcon } from 'lucide-react';

export type CalendarProvider = 'google' | 'outlook' | 'caldav' | 'local' | 'baas';
export type CalendarSourceKind = 'google' | 'local' | 'baas';
export type CalendarView = 'month' | 'week' | 'day' | 'agenda';
export type BusyStatus = 'busy' | 'free';
export type EventVisibility = 'default' | 'public' | 'private';
export type EventStatus = 'confirmed' | 'tentative' | 'cancelled';
export type RepeatRule = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface BaaSState {
  configured: boolean;
  connected: boolean;
  url: string;
  message: string;
  lastMirrorAt?: string | null;
}

export interface ConnectorState {
  provider: CalendarProvider;
  endpoint: string;
  account: string;
  configured: boolean;
  connected: boolean;
  bridgeAvailable: boolean;
  message: string;
  lastSync: string | null;
  baas: BaaSState;
}

export interface CalendarSource {
  id: string;
  providerCalendarId?: string;
  accountId: string;
  accountName: string;
  name: string;
  description?: string;
  color: string;
  timezone?: string;
  visible: boolean;
  primary?: boolean;
  accessRole?: string;
  readonly?: boolean;
  source: CalendarSourceKind;
}

export interface CalendarEvent {
  id: string;
  providerEventId?: string;
  calendarId: string;
  source: CalendarSourceKind;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  timezone?: string;
  color?: string;
  description?: string;
  location?: string;
  participants: string[];
  conferencing: boolean;
  meetingUrl?: string;
  repeat: RepeatRule;
  busyStatus: BusyStatus;
  visibility: EventVisibility;
  status: EventStatus;
  htmlLink?: string;
  readonly?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CalendarRange {
  start: string;
  end: string;
}

export interface CommandAction {
  id: string;
  label: string;
  icon: LucideIcon;
  active?: boolean;
  danger?: boolean;
  onClick: () => void;
}