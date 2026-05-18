/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CalendarGrid.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:16 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:16 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useMemo } from 'react';
import { CalendarClock, MapPin, Plus, Video } from 'lucide-react';

import {
  dateKey,
  eventOverlapsDay,
  formatEventRange,
  formatTime,
  isSameDay,
  isSameMonth,
  minutesFromMidnight,
  monthMatrix,
  startOfDay,
  weekDays,
} from '../lib/date';
import type { CalendarEvent, CalendarSource, CalendarView } from '../types';

interface CalendarGridProps {
  view: CalendarView;
  cursorDate: Date;
  events: CalendarEvent[];
  sourcesById: Map<string, CalendarSource>;
  activeEventId: string | null;
  onSelectEvent: (eventId: string) => void;
  onCreateAt: (date: Date, allDay?: boolean) => void;
}

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

function eventColor(event: CalendarEvent, sourcesById: Map<string, CalendarSource>) {
  return event.color || sourcesById.get(event.calendarId)?.color || '#63d18d';
}

function eventSort(left: CalendarEvent, right: CalendarEvent) {
  return new Date(left.start).getTime() - new Date(right.start).getTime();
}

function eventStartsOnDay(event: CalendarEvent, day: Date) {
  return isSameDay(event.start, day) || eventOverlapsDay(event.start, event.end, day);
}

function createSlotDate(day: Date, hour: number) {
  const date = startOfDay(day);
  date.setHours(hour, 0, 0, 0);
  return date;
}

const EventChip: React.FC<{
  event: CalendarEvent;
  color: string;
  active: boolean;
  compact?: boolean;
  onSelect: () => void;
}> = ({ event, color, active, compact, onSelect }) => (
  <button
    className={[
      compact ? 'calendar-event-chip calendar-event-chip--compact' : 'calendar-event-chip',
      active ? 'is-active' : '',
    ].filter(Boolean).join(' ')}
    style={{ '--event-color': color } as React.CSSProperties}
    type="button"
    onClick={(clickEvent) => {
      clickEvent.stopPropagation();
      onSelect();
    }}
    title={`${event.title} ${formatEventRange(event.start, event.end, event.allDay)}`}
  >
    <span className="calendar-event-chip__dot" />
    <span className="calendar-event-chip__title">{event.title}</span>
    {!compact && !event.allDay ? <small>{formatTime(event.start)}</small> : null}
    {!compact && event.conferencing ? <Video size={12} /> : null}
  </button>
);

export const CalendarGrid: React.FC<CalendarGridProps> = ({
  view,
  cursorDate,
  events,
  sourcesById,
  activeEventId,
  onSelectEvent,
  onCreateAt,
}) => {
  const days = useMemo(() => (view === 'day' ? [cursorDate] : weekDays(cursorDate)), [cursorDate, view]);
  const sortedEvents = useMemo(() => [...events].sort(eventSort), [events]);

  if (view === 'month') {
    const monthDays = monthMatrix(cursorDate);
    return (
      <section className="calendar-grid calendar-grid--month" aria-label="Month calendar">
        <div className="calendar-month-weekdays">
          {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((weekday) => <span key={weekday}>{weekday}</span>)}
        </div>
        <div className="calendar-month-grid">
          {monthDays.map((day) => {
            const dayEvents = sortedEvents.filter((event) => eventStartsOnDay(event, day)).slice(0, 5);
            return (
              <div
                key={dateKey(day)}
                className={[
                  'calendar-month-cell',
                  isSameMonth(day, cursorDate) ? '' : 'is-outside',
                  isSameDay(day, new Date()) ? 'is-today' : '',
                ].filter(Boolean).join(' ')}
              >
                <div className="calendar-month-cell__head">
                  <button type="button" onClick={() => onCreateAt(day, true)}>{day.getDate()}</button>
                  <button type="button" onClick={() => onCreateAt(day)} title="Create event">
                    <Plus size={13} />
                  </button>
                </div>
                <div className="calendar-month-cell__events">
                  {dayEvents.map((event) => (
                    <EventChip
                      key={`${event.id}-${dateKey(day)}`}
                      event={event}
                      color={eventColor(event, sourcesById)}
                      active={event.id === activeEventId}
                      compact
                      onSelect={() => onSelectEvent(event.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  if (view === 'agenda') {
    const agendaDays = weekDays(cursorDate);
    return (
      <section className="calendar-grid calendar-grid--agenda" aria-label="Agenda">
        {agendaDays.map((day) => {
          const dayEvents = sortedEvents.filter((event) => eventStartsOnDay(event, day));
          return (
            <article className="calendar-agenda-day" key={dateKey(day)}>
              <button className="calendar-agenda-day__date" type="button" onClick={() => onCreateAt(day)}>
                <strong>{day.toLocaleDateString([], { weekday: 'short' })}</strong>
                <span>{day.toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
              </button>
              <div className="calendar-agenda-day__events">
                {dayEvents.length ? dayEvents.map((event) => (
                  <button
                    key={event.id}
                    className={event.id === activeEventId ? 'calendar-agenda-event is-active' : 'calendar-agenda-event'}
                    type="button"
                    onClick={() => onSelectEvent(event.id)}
                    style={{ '--event-color': eventColor(event, sourcesById) } as React.CSSProperties}
                  >
                    <span className="calendar-agenda-event__bar" />
                    <span>
                      <strong>{event.title}</strong>
                      <small>{formatEventRange(event.start, event.end, event.allDay)}</small>
                    </span>
                    {event.location ? <MapPin size={14} /> : null}
                  </button>
                )) : <button className="calendar-agenda-empty" type="button" onClick={() => onCreateAt(day)}>Create event</button>}
              </div>
            </article>
          );
        })}
      </section>
    );
  }

  const allDayEvents = sortedEvents.filter((event) => event.allDay);
  const timedEvents = sortedEvents.filter((event) => !event.allDay);

  return (
    <section className={view === 'day' ? 'calendar-grid calendar-grid--time calendar-grid--day' : 'calendar-grid calendar-grid--time'} aria-label="Time calendar">
      <div className="calendar-time-header" style={{ '--calendar-day-count': days.length } as React.CSSProperties}>
        <div className="calendar-time-header__corner">
          <CalendarClock size={16} />
          <span>GMT</span>
        </div>
        {days.map((day) => (
          <button className={isSameDay(day, new Date()) ? 'is-today' : ''} key={dateKey(day)} type="button" onClick={() => onCreateAt(day, true)}>
            <span>{day.toLocaleDateString([], { weekday: 'short' })}</span>
            <strong>{day.getDate()}</strong>
          </button>
        ))}
      </div>

      <div className="calendar-all-day-row" style={{ '--calendar-day-count': days.length } as React.CSSProperties}>
        <span>All-day</span>
        {days.map((day) => (
          <div className="calendar-all-day-cell" key={dateKey(day)}>
            {allDayEvents.filter((event) => eventStartsOnDay(event, day)).slice(0, 3).map((event) => (
              <EventChip
                key={`${event.id}-${dateKey(day)}`}
                event={event}
                color={eventColor(event, sourcesById)}
                active={event.id === activeEventId}
                compact
                onSelect={() => onSelectEvent(event.id)}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="calendar-time-scroll">
        <div className="calendar-time-ruler">
          {HOURS.map((hour) => (
            <span key={hour}>{hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}</span>
          ))}
        </div>
        <div className="calendar-time-columns" style={{ '--calendar-day-count': days.length } as React.CSSProperties}>
          {days.map((day) => {
            const dayTimedEvents = timedEvents.filter((event) => eventStartsOnDay(event, day));
            return (
              <div className="calendar-time-column" key={dateKey(day)}>
                {HOURS.map((hour) => (
                  <button key={hour} className="calendar-time-slot" type="button" onClick={() => onCreateAt(createSlotDate(day, hour))} />
                ))}
                <div className="calendar-time-column__events">
                  {dayTimedEvents.map((event) => {
                    const startMinutes = minutesFromMidnight(event.start);
                    const endMinutes = Math.max(startMinutes + 30, minutesFromMidnight(event.end));
                    const top = (startMinutes / 1440) * 100;
                    const height = ((endMinutes - startMinutes) / 1440) * 100;
                    return (
                      <button
                        key={event.id}
                        className={event.id === activeEventId ? 'calendar-timed-event is-active' : 'calendar-timed-event'}
                        type="button"
                        style={{ '--event-color': eventColor(event, sourcesById), top: `${top}%`, height: `${height}%` } as React.CSSProperties}
                        onClick={() => onSelectEvent(event.id)}
                      >
                        <strong>{event.title}</strong>
                        <small>{formatEventRange(event.start, event.end, false)}</small>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};