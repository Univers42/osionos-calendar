import { afterEach, describe, expect, it, vi } from 'vitest';
import { isBridgeEnabled, LOCAL_ONLY_NOTICE, resolveBaasUrl, resolveBridgeEndpoint } from './bridgeConfig';
import {
  createBridgeEvent,
  deleteBridgeEvent,
  disconnectCalendarBridge,
  loadBaaSStatus,
  loadBridgeCalendars,
  loadCalendarSession,
  openCalendarAuth,
  syncBridgeEvents,
  updateBridgeEvent,
} from './calendarBridge';

afterEach(() => vi.restoreAllMocks());

describe('url resolution', () => {
  it.each([undefined, '', '   '])('is empty in production when the URL is %j', (configured) => {
    expect(resolveBridgeEndpoint(configured, false)).toBe('');
    expect(resolveBaasUrl(configured, false)).toBe('');
  });

  it('keeps the localhost fallbacks in dev only', () => {
    expect(resolveBridgeEndpoint(undefined, true)).toBe('http://localhost:4200');
    expect(resolveBaasUrl(undefined, true)).toBe('http://localhost:8000');
  });

  it('prefers the configured URL in both modes', () => {
    expect(resolveBridgeEndpoint('https://bridge.example', false)).toBe('https://bridge.example');
    expect(resolveBaasUrl('https://baas.example', true)).toBe('https://baas.example');
  });
});

describe('local-only mode (empty endpoint)', () => {
  it('reports the bridge as disabled and the label text is the contract', () => {
    expect(isBridgeEnabled('')).toBe(false);
    expect(isBridgeEnabled('http://x')).toBe(true);
    expect(LOCAL_ONLY_NOTICE).toBe('Events are saved in this browser only');
  });

  it('never calls fetch or window.open from any bridge function', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);
    const event = { id: 'e1' } as never;
    const calendar = { id: 'c1' } as never;
    const range = { start: '2026-01-01', end: '2026-01-08' };

    await expect(loadCalendarSession('')).rejects.toThrow('No calendar bridge');
    await expect(loadBaaSStatus('')).rejects.toThrow('No calendar bridge');
    await expect(disconnectCalendarBridge('')).rejects.toThrow('No calendar bridge');
    await expect(loadBridgeCalendars('')).rejects.toThrow('No calendar bridge');
    await expect(syncBridgeEvents('', range, [])).rejects.toThrow('No calendar bridge');
    await expect(createBridgeEvent('', event, calendar)).rejects.toThrow('No calendar bridge');
    await expect(updateBridgeEvent('', event, calendar)).rejects.toThrow('No calendar bridge');
    await expect(deleteBridgeEvent('', event, calendar)).rejects.toThrow('No calendar bridge');
    expect(() => openCalendarAuth('')).toThrow('No calendar bridge');

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('still calls fetch when an endpoint is configured', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    await loadCalendarSession('http://bridge.test/');
    expect(fetchSpy).toHaveBeenCalledWith('http://bridge.test/session', undefined);
  });
});
