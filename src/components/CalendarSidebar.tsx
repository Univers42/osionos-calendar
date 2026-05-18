/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CalendarSidebar.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:16 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:16 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useMemo, useState } from 'react';
import {
  CalendarPlus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  HelpCircle,
  Link,
  Plus,
  Settings,
} from 'lucide-react';

import { addMonths, dateKey, formatMonthTitle, isSameDay, isSameMonth, monthMatrix } from '../lib/date';
import type { CalendarSource, ConnectorState } from '../types';

interface CalendarSidebarProps {
  open: boolean;
  sources: CalendarSource[];
  visibleSourceIds: Set<string>;
  selectedDate: Date;
  connector: ConnectorState;
  onSelectDate: (date: Date) => void;
  onToggleSource: (sourceId: string) => void;
  onCreateSource: () => void;
  onOpenConnector: () => void;
}

function groupSources(sources: CalendarSource[]) {
  const groups = new Map<string, CalendarSource[]>();
  for (const source of sources) {
    groups.set(source.accountName, [...(groups.get(source.accountName) || []), source]);
  }
  return Array.from(groups.entries()).map(([accountName, calendars]) => ({ accountName, calendars }));
}

export const CalendarSidebar: React.FC<CalendarSidebarProps> = ({
  open,
  sources,
  visibleSourceIds,
  selectedDate,
  connector,
  onSelectDate,
  onToggleSource,
  onCreateSource,
  onOpenConnector,
}) => {
  const [miniDate, setMiniDate] = useState(() => selectedDate);
  const sourceGroups = useMemo(() => groupSources(sources), [sources]);
  const miniDays = useMemo(() => monthMatrix(miniDate), [miniDate]);

  return (
    <aside className={open ? 'calendar-sidebar' : 'calendar-sidebar calendar-sidebar--closed'}>
      <div className="calendar-sidebar__brand">
        <button className="calendar-sidebar__workspace" type="button" onClick={onOpenConnector}>
          <span className="calendar-sidebar__mark">O</span>
          <span>
            <strong>osionos Calendar</strong>
            <small>{connector.connected ? connector.account : 'Local + Google bridge'}</small>
          </span>
        </button>
      </div>

      <div className="calendar-mini-month">
        <div className="calendar-mini-month__header">
          <strong>{formatMonthTitle(miniDate)}</strong>
          <span>
            <button type="button" onClick={() => setMiniDate(addMonths(miniDate, -1))} title="Previous month">
              <ChevronLeft size={14} />
            </button>
            <button type="button" onClick={() => setMiniDate(addMonths(miniDate, 1))} title="Next month">
              <ChevronRight size={14} />
            </button>
          </span>
        </div>
        <div className="calendar-mini-month__weekdays" aria-hidden="true">
          {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((weekday) => <span key={weekday}>{weekday}</span>)}
        </div>
        <div className="calendar-mini-month__grid">
          {miniDays.map((day) => (
            <button
              key={dateKey(day)}
              className={[
                isSameMonth(day, miniDate) ? '' : 'is-outside',
                isSameDay(day, new Date()) ? 'is-today' : '',
                isSameDay(day, selectedDate) ? 'is-selected' : '',
              ].filter(Boolean).join(' ')}
              type="button"
              onClick={() => onSelectDate(day)}
            >
              {day.getDate()}
            </button>
          ))}
        </div>
      </div>

      <button className="calendar-sidebar-link calendar-sidebar-link--strong" type="button" onClick={onOpenConnector}>
        <Link size={17} />
        Scheduling
        <span className={connector.connected ? 'calendar-status-dot is-connected' : 'calendar-status-dot'} />
      </button>

      <div className="calendar-sidebar-search">
        <span>Meet with...</span>
        <kbd>F</kbd>
      </div>

      <nav className="calendar-sidebar__nav" aria-label="Calendar sources">
        {sourceGroups.map((group) => (
          <section className="calendar-source-group" key={group.accountName}>
            <button className="calendar-source-group__header" type="button">
              <ChevronDown size={14} />
              <span>{group.accountName}</span>
              <Plus size={14} />
            </button>
            <div className="calendar-source-group__body">
              {group.calendars.map((source) => {
                const isVisible = visibleSourceIds.has(source.id);
                return (
                  <div className="calendar-source-row" key={source.id}>
                    <button className="calendar-source-row__main" type="button" onClick={() => onToggleSource(source.id)}>
                      <span className="calendar-source-swatch" style={{ '--calendar-color': source.color } as React.CSSProperties} />
                      <span className="calendar-source-row__name">{source.name}</span>
                      {source.primary ? <small>Default</small> : null}
                    </button>
                    <button className="calendar-source-row__icon" type="button" onClick={() => onToggleSource(source.id)} title={isVisible ? 'Hide calendar' : 'Show calendar'}>
                      {isVisible ? <Eye size={15} /> : <EyeOff size={15} />}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        <button className="calendar-add-button" type="button" onClick={onOpenConnector}>
          <CalendarPlus size={17} />
          Add calendar account
        </button>
        <button className="calendar-add-button" type="button" onClick={onCreateSource}>
          <Plus size={17} />
          Add local calendar
        </button>
      </nav>

      <div className="calendar-sidebar__footer">
        <button className="calendar-sidebar-link" type="button">
          <Settings size={17} />
          Settings
        </button>
        <button className="calendar-sidebar-link" type="button">
          <HelpCircle size={17} />
          Help
        </button>
      </div>
    </aside>
  );
};