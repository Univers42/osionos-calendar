import type { CalendarView } from '../types';

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export function startOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function endOfDay(value: Date) {
  const date = startOfDay(value);
  date.setDate(date.getDate() + 1);
  date.setMilliseconds(-1);
  return date;
}

export function addDays(value: Date, days: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

export function addWeeks(value: Date, weeks: number) {
  return addDays(value, weeks * 7);
}

export function addMonths(value: Date, months: number) {
  const date = new Date(value);
  date.setMonth(date.getMonth() + months);
  return date;
}

export function startOfWeek(value: Date, weekStartsOn = 1) {
  const date = startOfDay(value);
  const day = date.getDay();
  const distance = (day - weekStartsOn + 7) % 7;
  date.setDate(date.getDate() - distance);
  return date;
}

export function endOfWeek(value: Date, weekStartsOn = 1) {
  return endOfDay(addDays(startOfWeek(value, weekStartsOn), 6));
}

export function startOfMonth(value: Date) {
  const date = startOfDay(value);
  date.setDate(1);
  return date;
}

export function endOfMonth(value: Date) {
  const date = startOfMonth(value);
  date.setMonth(date.getMonth() + 1);
  date.setMilliseconds(-1);
  return date;
}

export function dateKey(value: Date | string) {
  const date = typeof value === 'string' ? new Date(value) : value;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isSameDay(left: Date | string, right: Date | string) {
  return dateKey(left) === dateKey(right);
}

export function isSameMonth(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();
}

export function monthMatrix(value: Date) {
  const firstVisibleDay = startOfWeek(startOfMonth(value));
  return Array.from({ length: 42 }, (_, index) => addDays(firstVisibleDay, index));
}

export function weekDays(value: Date) {
  const firstDay = startOfWeek(value);
  return Array.from({ length: 7 }, (_, index) => addDays(firstDay, index));
}

export function viewRange(view: CalendarView, cursorDate: Date) {
  if (view === 'month') {
    return {
      start: startOfWeek(startOfMonth(cursorDate)).toISOString(),
      end: endOfWeek(endOfMonth(cursorDate)).toISOString(),
    };
  }
  if (view === 'week' || view === 'agenda') {
    return { start: startOfWeek(cursorDate).toISOString(), end: endOfWeek(cursorDate).toISOString() };
  }
  return { start: startOfDay(cursorDate).toISOString(), end: endOfDay(cursorDate).toISOString() };
}

export function moveCursor(view: CalendarView, cursorDate: Date, direction: -1 | 1) {
  if (view === 'month') return addMonths(cursorDate, direction);
  if (view === 'week' || view === 'agenda') return addWeeks(cursorDate, direction);
  return addDays(cursorDate, direction);
}

export function formatMonthTitle(value: Date) {
  return value.toLocaleDateString([], { month: 'long', year: 'numeric' });
}

export function formatRangeTitle(view: CalendarView, cursorDate: Date) {
  if (view === 'month') return formatMonthTitle(cursorDate);
  if (view === 'day') return cursorDate.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const start = startOfWeek(cursorDate);
  const end = addDays(start, 6);
  const startText = start.toLocaleDateString([], { month: 'short', day: 'numeric' });
  const endText = end.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  return `${startText} - ${endText}`;
}

export function formatTime(value: Date | string) {
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function formatEventRange(start: string, end: string, allDay: boolean) {
  if (allDay) return 'All-day';
  return `${formatTime(start)} - ${formatTime(end)}`;
}

export function toLocalDateTimeInput(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * MINUTE_MS;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function fromLocalDateTimeInput(value: string) {
  return new Date(value).toISOString();
}

export function dateInputValue(value: string) {
  return dateKey(value);
}

export function fromDateInput(value: string, hour = 0, minute = 0) {
  const date = new Date(`${value}T00:00:00`);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

export function minutesFromMidnight(value: Date | string) {
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.getHours() * 60 + date.getMinutes();
}

export function eventOverlapsDay(start: string, end: string, day: Date) {
  const dayStart = startOfDay(day).getTime();
  const dayEnd = dayStart + DAY_MS;
  return new Date(start).getTime() < dayEnd && new Date(end).getTime() > dayStart;
}

export function clampDateRange(startIso: string, endIso: string) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (end.getTime() > start.getTime()) return { start: start.toISOString(), end: end.toISOString() };
  return { start: start.toISOString(), end: new Date(start.getTime() + 60 * MINUTE_MS).toISOString() };
}