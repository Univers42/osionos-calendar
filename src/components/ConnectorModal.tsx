import React from 'react';
import { CheckCircle2, Database, Link2, RefreshCw, ShieldCheck, Unlink, XCircle } from 'lucide-react';

import type { ConnectorState } from '../types';

interface ConnectorModalProps {
  open: boolean;
  connector: ConnectorState;
  isSyncing: boolean;
  onClose: () => void;
  onAuthorize: () => void;
  onRefreshSession: () => void;
  onDisconnect: () => void;
  onSync: () => void;
}

export const ConnectorModal: React.FC<ConnectorModalProps> = ({
  open,
  connector,
  isSyncing,
  onClose,
  onAuthorize,
  onRefreshSession,
  onDisconnect,
  onSync,
}) => {
  if (!open) return null;
  let baasStatusLabel = 'Offline';
  if (connector.baas.connected) baasStatusLabel = 'Reachable';
  else if (connector.baas.configured) baasStatusLabel = 'Configured';

  return (
    <dialog open className="calendar-modal-backdrop" aria-label="Calendar connector">
      <section className="calendar-connector-modal">
        <header className="calendar-connector-modal__header">
          <span>
            <strong>Calendar connectors</strong>
            <small>{connector.endpoint}</small>
          </span>
          <button className="calendar-icon-button" type="button" onClick={onClose} title="Close">
            <XCircle size={18} />
          </button>
        </header>

        <article className="calendar-connector-card">
          <div className="calendar-connector-card__icon">
            {connector.connected ? <CheckCircle2 size={22} /> : <Link2 size={22} />}
          </div>
          <div className="calendar-connector-card__content">
            <strong>Google Calendar</strong>
            <p>{connector.message}</p>
            <dl>
              <div>
                <dt>Account</dt>
                <dd>{connector.connected ? connector.account : 'Not connected'}</dd>
              </div>
              <div>
                <dt>Last sync</dt>
                <dd>{connector.lastSync ? new Date(connector.lastSync).toLocaleString() : 'Never'}</dd>
              </div>
              <div>
                <dt>Bridge</dt>
                <dd>{connector.bridgeAvailable ? 'Available' : 'Waiting'}</dd>
              </div>
            </dl>
          </div>
          <div className="calendar-connector-card__actions">
            <button className="calendar-primary-button" type="button" onClick={connector.connected ? onSync : onAuthorize} disabled={!connector.configured || isSyncing}>
              {connector.connected ? <RefreshCw size={16} className={isSyncing ? 'is-spinning' : ''} /> : <Link2 size={16} />}
              {connector.connected ? 'Sync now' : 'Connect'}
            </button>
            <button className="calendar-secondary-button" type="button" onClick={onRefreshSession}>
              <RefreshCw size={16} />
              Refresh
            </button>
            {connector.connected ? (
              <button className="calendar-danger-button" type="button" onClick={onDisconnect}>
                <Unlink size={16} />
                Disconnect
              </button>
            ) : null}
          </div>
        </article>

        <article className="calendar-connector-card">
          <div className="calendar-connector-card__icon calendar-connector-card__icon--baas">
            <Database size={22} />
          </div>
          <div className="calendar-connector-card__content">
            <strong>BaaS event mirror</strong>
            <p>{connector.baas.message}</p>
            <dl>
              <div>
                <dt>Gateway</dt>
                <dd>{connector.baas.url || 'Not configured'}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{baasStatusLabel}</dd>
              </div>
              <div>
                <dt>Last mirror</dt>
                <dd>{connector.baas.lastMirrorAt ? new Date(connector.baas.lastMirrorAt).toLocaleString() : 'Never'}</dd>
              </div>
            </dl>
          </div>
          <div className="calendar-connector-card__actions">
            <button className="calendar-secondary-button" type="button" onClick={onRefreshSession}>
              <ShieldCheck size={16} />
              Check BaaS
            </button>
          </div>
        </article>
      </section>
    </dialog>
  );
};