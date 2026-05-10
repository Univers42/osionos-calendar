import React from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, PanelLeft, Plus, RefreshCw, Search } from 'lucide-react';

import type { CalendarView } from '../types';

interface CalendarToolbarProps {
  view: CalendarView;
  rangeLabel: string;
  search: string;
  sidebarOpen: boolean;
  isSyncing: boolean;
  onViewChange: (view: CalendarView) => void;
  onToday: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onCreateEvent: () => void;
  onRefresh: () => void;
  onSearchChange: (value: string) => void;
  onToggleSidebar: () => void;
}

const VIEW_OPTIONS: CalendarView[] = ['month', 'week', 'day', 'agenda'];

export const CalendarToolbar: React.FC<CalendarToolbarProps> = ({
  view,
  rangeLabel,
  search,
  sidebarOpen,
  isSyncing,
  onViewChange,
  onToday,
  onPrevious,
  onNext,
  onCreateEvent,
  onRefresh,
  onSearchChange,
  onToggleSidebar,
}) => (
  <header className="calendar-toolbar">
    <div className="calendar-toolbar__left">
      <button className="calendar-icon-button" type="button" onClick={onToggleSidebar} title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}>
        <PanelLeft size={18} />
      </button>
      <button className="calendar-primary-button" type="button" onClick={onCreateEvent}>
        <Plus size={16} />
        New event
      </button>
      <div className="calendar-nav-group" aria-label="Calendar navigation">
        <button className="calendar-secondary-button" type="button" onClick={onToday}>
          <CalendarDays size={16} />
          Today
        </button>
        <button className="calendar-icon-button" type="button" onClick={onPrevious} title="Previous range">
          <ChevronLeft size={18} />
        </button>
        <button className="calendar-icon-button" type="button" onClick={onNext} title="Next range">
          <ChevronRight size={18} />
        </button>
      </div>
      <h1 className="calendar-toolbar__title">{rangeLabel}</h1>
    </div>

    <div className="calendar-toolbar__right">
      <label className="calendar-search">
        <Search size={16} />
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search events"
          type="search"
        />
      </label>
      <div className="calendar-view-switch" role="tablist" aria-label="Calendar view">
        {VIEW_OPTIONS.map((option) => (
          <button
            key={option}
            className={option === view ? 'is-active' : ''}
            type="button"
            onClick={() => onViewChange(option)}
            role="tab"
            aria-selected={option === view}
          >
            {option[0].toUpperCase()}{option.slice(1)}
          </button>
        ))}
      </div>
      <button className="calendar-icon-button" type="button" onClick={onRefresh} title="Sync visible range" disabled={isSyncing}>
        <RefreshCw size={18} className={isSyncing ? 'is-spinning' : ''} />
      </button>
    </div>
  </header>
);