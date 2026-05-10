import React, { useEffect, useMemo, useState } from 'react';
import { Copy, ExternalLink, Save, Trash2, X } from 'lucide-react';

import {
  clampDateRange,
  dateInputValue,
  fromDateInput,
  fromLocalDateTimeInput,
  toLocalDateTimeInput,
} from '../lib/date';
import type { BusyStatus, CalendarEvent, CalendarSource, EventVisibility, RepeatRule } from '../types';

interface EventInspectorProps {
  event: CalendarEvent | null;
  sources: CalendarSource[];
  isDraft: boolean;
  onClose: () => void;
  onSave: (event: CalendarEvent) => void;
  onDelete: (event: CalendarEvent) => void;
  onDuplicate: (event: CalendarEvent) => void;
}

type EventForm = CalendarEvent & { participantsText: string };

function toForm(event: CalendarEvent): EventForm {
  return { ...event, participantsText: event.participants.join(', ') };
}

function normalizeParticipants(value: string) {
  return value.split(',').map((part) => part.trim()).filter(Boolean);
}

function ensureAllDayRange(start: string, end: string) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (endDate.getTime() > startDate.getTime()) return { start, end };
  return { start, end: new Date(startDate.getTime() + 24 * 60 * 60 * 1000).toISOString() };
}

export const EventInspector: React.FC<EventInspectorProps> = ({
  event,
  sources,
  isDraft,
  onClose,
  onSave,
  onDelete,
  onDuplicate,
}) => {
  const [form, setForm] = useState<EventForm | null>(() => (event ? toForm(event) : null));
  const source = useMemo(() => sources.find((item) => item.id === form?.calendarId) || sources[0], [form?.calendarId, sources]);
  const editableSources = useMemo(() => sources.filter((item) => !item.readonly), [sources]);

  useEffect(() => {
    setForm(event ? toForm(event) : null);
  }, [event]);

  if (!form) {
    return (
      <aside className="calendar-inspector calendar-inspector--empty">
        <button className="calendar-icon-button" type="button" onClick={onClose} title="Close">
          <X size={18} />
        </button>
        <span>Select an event</span>
      </aside>
    );
  }

  const isReadonly = Boolean(form.readonly || source?.readonly);

  const updateField = <Key extends keyof EventForm>(key: Key, value: EventForm[Key]) => {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  };

  const submit = (submitEvent: React.FormEvent) => {
    submitEvent.preventDefault();
    const range = form.allDay ? ensureAllDayRange(form.start, form.end) : clampDateRange(form.start, form.end);
    onSave({
      ...form,
      start: range.start,
      end: range.end,
      participants: normalizeParticipants(form.participantsText),
      color: source?.color || form.color,
      source: source?.source || form.source,
    });
  };

  return (
    <aside className="calendar-inspector">
      <form onSubmit={submit}>
        <header className="calendar-inspector__header">
          <span>{isDraft ? 'New event' : 'Event details'}</span>
          <div>
            {form.htmlLink ? (
              <a className="calendar-icon-button" href={form.htmlLink} target="_blank" rel="noreferrer" title="Open provider event">
                <ExternalLink size={17} />
              </a>
            ) : null}
            <button className="calendar-icon-button" type="button" onClick={onClose} title="Close">
              <X size={18} />
            </button>
          </div>
        </header>

        <label className="calendar-field calendar-field--title">
          <span>Title</span>
          <input value={form.title} onChange={(changeEvent) => updateField('title', changeEvent.target.value)} disabled={isReadonly} />
        </label>

        <label className="calendar-field">
          <span>Calendar</span>
          <select value={form.calendarId} onChange={(changeEvent) => updateField('calendarId', changeEvent.target.value)} disabled={isReadonly}>
            {(editableSources.length ? editableSources : sources).map((calendar) => (
              <option value={calendar.id} key={calendar.id}>{calendar.name}</option>
            ))}
          </select>
        </label>

        <label className="calendar-toggle-row">
          <input type="checkbox" checked={form.allDay} onChange={(changeEvent) => updateField('allDay', changeEvent.target.checked)} disabled={isReadonly} />
          <span>All-day</span>
        </label>

        <div className="calendar-field-grid">
          <label className="calendar-field">
            <span>Starts</span>
            <input
              type={form.allDay ? 'date' : 'datetime-local'}
              value={form.allDay ? dateInputValue(form.start) : toLocalDateTimeInput(form.start)}
              onChange={(changeEvent) => updateField('start', form.allDay ? fromDateInput(changeEvent.target.value) : fromLocalDateTimeInput(changeEvent.target.value))}
              disabled={isReadonly}
            />
          </label>
          <label className="calendar-field">
            <span>Ends</span>
            <input
              type={form.allDay ? 'date' : 'datetime-local'}
              value={form.allDay ? dateInputValue(form.end) : toLocalDateTimeInput(form.end)}
              onChange={(changeEvent) => updateField('end', form.allDay ? fromDateInput(changeEvent.target.value) : fromLocalDateTimeInput(changeEvent.target.value))}
              disabled={isReadonly}
            />
          </label>
        </div>

        <div className="calendar-field-grid">
          <label className="calendar-field">
            <span>Repeat</span>
            <select value={form.repeat} onChange={(changeEvent) => updateField('repeat', changeEvent.target.value as RepeatRule)} disabled={isReadonly}>
              <option value="none">Does not repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </label>
          <label className="calendar-field">
            <span>Busy</span>
            <select value={form.busyStatus} onChange={(changeEvent) => updateField('busyStatus', changeEvent.target.value as BusyStatus)} disabled={isReadonly}>
              <option value="busy">Busy</option>
              <option value="free">Free</option>
            </select>
          </label>
        </div>

        <label className="calendar-toggle-row">
          <input type="checkbox" checked={form.conferencing} onChange={(changeEvent) => updateField('conferencing', changeEvent.target.checked)} disabled={isReadonly} />
          <span>Add video meeting</span>
        </label>

        <label className="calendar-field">
          <span>Location</span>
          <input value={form.location || ''} onChange={(changeEvent) => updateField('location', changeEvent.target.value)} disabled={isReadonly} />
        </label>

        <label className="calendar-field">
          <span>Guests</span>
          <input value={form.participantsText} onChange={(changeEvent) => updateField('participantsText', changeEvent.target.value)} disabled={isReadonly} placeholder="email@example.com, team@example.com" />
        </label>

        <label className="calendar-field">
          <span>Visibility</span>
          <select value={form.visibility} onChange={(changeEvent) => updateField('visibility', changeEvent.target.value as EventVisibility)} disabled={isReadonly}>
            <option value="default">Default</option>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
        </label>

        <label className="calendar-field">
          <span>Description</span>
          <textarea value={form.description || ''} onChange={(changeEvent) => updateField('description', changeEvent.target.value)} disabled={isReadonly} rows={6} />
        </label>

        <footer className="calendar-inspector__actions">
          <button className="calendar-primary-button" type="submit" disabled={isReadonly}>
            <Save size={16} />
            Save
          </button>
          <button className="calendar-secondary-button" type="button" onClick={() => onDuplicate(form)}>
            <Copy size={16} />
            Duplicate
          </button>
          {isDraft ? null : (
            <button className="calendar-danger-button" type="button" onClick={() => onDelete(form)} disabled={isReadonly}>
              <Trash2 size={16} />
              Delete
            </button>
          )}
        </footer>
      </form>
    </aside>
  );
};