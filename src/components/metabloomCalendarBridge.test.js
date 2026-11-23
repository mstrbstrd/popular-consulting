import { createMetabloomCalendarBridge } from './metabloomCalendarBridge';
import { canonicalCalendarPayload } from './metabloomCalendarProtocol';

function fakeHash(text) {
  let acc1 = 0x811c9dc5;
  let acc2 = 0x01000193;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    acc1 = Math.imul(acc1 ^ code, 0x01000193) >>> 0;
    acc2 = Math.imul(acc2 ^ (code + i), 0x85ebca6b) >>> 0;
  }
  const chunk = `${acc1.toString(16).padStart(8, '0')}${acc2.toString(16).padStart(8, '0')}`;
  return chunk.repeat(4);
}

const adminAuth = (overrides = {}) => ({
  status: 'authenticated',
  user: { id: 'admin-user-1', role: 'admin' },
  logoutRevision: 0,
  ...overrides,
});

function signedProposal(overrides = {}) {
  const base = {
    type: 'calendar_workspace',
    version: 1,
    command: 'focus',
    requestId: 'req-001',
    operationId: 'op-001',
    conversationId: 'conv-100',
    expectedVersion: null,
    requiresConfirmation: false,
    eventId: null,
    expectedEventRevision: null,
    event: null,
    patch: null,
    focus: { date: '2026-11-25', view: 'day', eventId: null },
    sourceText: 'show me Wednesday November 25',
    ...overrides,
  };
  const payloadHash = overrides.payloadHash || fakeHash(canonicalCalendarPayload(base));
  return { ...base, payloadHash };
}

describe('metabloomCalendarBridge', () => {
  test('returns null from capture when unauthenticated or non-admin', () => {
    const bridge = createMetabloomCalendarBridge({ digest: async value => fakeHash(value) });
    bridge.configure({ auth: { status: 'anonymous', user: null, logoutRevision: 0 }, pathname: '/calendar' });
    expect(bridge.capture({ conversationId: 'conv-100' })).toBeNull();

    bridge.configure({
      auth: { status: 'authenticated', user: { id: 'member-1', role: 'viewer' }, logoutRevision: 0 },
      pathname: '/calendar',
    });
    expect(bridge.capture({ conversationId: 'conv-100' })).toBeNull();
  });

  test('captures available context off /calendar and strips unapproved fields when connected', () => {
    const bridge = createMetabloomCalendarBridge({ digest: async value => fakeHash(value) });
    bridge.configure({
      auth: adminAuth(),
      pathname: '/orb',
      getConversationId: () => 'conv-100',
    });

    const available = bridge.capture({ conversationId: 'conv-100' });
    expect(available).toMatchObject({
      version: 1,
      status: 'available',
      conversationId: 'conv-100',
      visibleStart: null,
      visibleEnd: null,
      view: 'month',
      selectedEventId: null,
      dataRevision: 0,
    });

    const controller = {
      getContext: () => ({
        visibleStart: '2026-11-01',
        visibleEnd: '2026-11-30',
        view: 'week',
        timeZone: 'America/Vancouver',
        selectedEventId: 'evt_1234567890ab',
        dataRevision: 4,
        rawEvents: [{ title: 'Private secret meeting' }],
        accessToken: 'should-never-leak',
      }),
    };

    bridge.configure({ pathname: '/calendar' });
    const unregister = bridge.register(controller);

    const connected = bridge.capture({ conversationId: 'conv-100' });
    expect(connected).toEqual({
      version: 1,
      status: 'connected',
      conversationId: 'conv-100',
      visibleStart: '2026-11-01',
      visibleEnd: '2026-11-30',
      view: 'week',
      timeZone: 'America/Vancouver',
      selectedEventId: 'evt_1234567890ab',
      dataRevision: 4,
    });
    expect(connected.rawEvents).toBeUndefined();
    expect(connected.accessToken).toBeUndefined();
    expect(bridge.getStatus().connected).toBe(true);

    unregister();
    expect(bridge.getStatus().connected).toBe(false);
  });

  test('applies open proposals by navigating and delivering pending focus on controller mount', async () => {
    const navigate = jest.fn();
    const bridge = createMetabloomCalendarBridge({ digest: async value => fakeHash(value) });
    bridge.configure({
      auth: adminAuth(),
      pathname: '/orb',
      navigate,
      getConversationId: () => 'conv-100',
    });

    const proposal = signedProposal({
      command: 'open',
      operationId: 'op-open-1',
      focus: { date: '2026-11-27', view: 'week', eventId: null },
    });

    const receipt = await bridge.apply(proposal, { requestId: 'req-001', conversationId: 'conv-100' });
    expect(receipt.status).toBe('applied');
    expect(navigate).toHaveBeenCalledWith('/calendar');

    // Simulate /calendar mounting and registering its controller.
    const focus = jest.fn();
    bridge.configure({ pathname: '/calendar' });
    bridge.register({
      getContext: () => ({ view: 'month', timeZone: 'UTC', dataRevision: 1 }),
      focus,
    });

    expect(focus).toHaveBeenCalledWith({ date: '2026-11-27', view: 'week', eventId: null });
  });

  test('applies focus on live controller, deduplicates identical retries, and rejects tampering or mutations', async () => {
    const focus = jest.fn();
    const bridge = createMetabloomCalendarBridge({ digest: async value => fakeHash(value) });
    bridge.configure({
      auth: adminAuth(),
      pathname: '/calendar',
      getConversationId: () => 'conv-100',
    });
    bridge.register({
      getContext: () => ({ view: 'month', timeZone: 'UTC', dataRevision: 2 }),
      focus,
    });

    const proposal = signedProposal({
      command: 'focus',
      operationId: 'op-focus-1',
      focus: { date: '2026-11-26', view: 'day', eventId: 'evt_1234567890ab' },
    });

    const first = await bridge.apply(proposal, { requestId: 'req-001', conversationId: 'conv-100' });
    expect(first.status).toBe('applied');
    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledWith({ date: '2026-11-26', view: 'day', eventId: 'evt_1234567890ab' });

    const retry = await bridge.apply(proposal, { requestId: 'req-001', conversationId: 'conv-100' });
    expect(retry.status).toBe('duplicate');
    expect(focus).toHaveBeenCalledTimes(1);

    const tampered = signedProposal({
      command: 'focus',
      operationId: 'op-tampered',
      payloadHash: 'f'.repeat(64),
    });
    const badHash = await bridge.apply(tampered, { requestId: 'req-001', conversationId: 'conv-100' });
    expect(badHash.status).toBe('rejected');

    const deleteProposal = signedProposal({
      command: 'delete',
      operationId: 'op-del-1',
      requiresConfirmation: true,
      eventId: 'evt_1234567890ab',
      expectedEventRevision: 1,
      focus: null,
    });
    const rejectedMutation = await bridge.apply(deleteProposal, { requestId: 'req-001', conversationId: 'conv-100' });
    expect(rejectedMutation.status).toBe('rejected');
  });

  test('notifyRefresh triggers live controller refresh and invalidates cleanly on auth or logoutRevision change', () => {
    const refresh = jest.fn();
    const disconnect = jest.fn();
    const statusListener = jest.fn();
    const bridge = createMetabloomCalendarBridge({ digest: async value => fakeHash(value) });
    const unsubscribe = bridge.subscribe(statusListener);

    bridge.configure({
      auth: adminAuth({ logoutRevision: 1 }),
      pathname: '/calendar',
    });
    bridge.register({
      getContext: () => ({ view: 'month', timeZone: 'UTC', dataRevision: 3 }),
      refresh,
      disconnect,
    });

    expect(bridge.notifyRefresh({ date: '2026-11-28', view: 'agenda', eventId: 'evt_1234567890ab' })).toBe(true);
    expect(refresh).toHaveBeenCalledWith({
      date: '2026-11-28',
      view: 'agenda',
      eventId: 'evt_1234567890ab',
    });
    expect(bridge.getStatus().lastRefreshAt).not.toBeNull();

    // Bumping logoutRevision revokes state and disconnects controller.
    bridge.configure({ auth: adminAuth({ logoutRevision: 2 }) });
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(bridge.getStatus().lastRefreshAt).toBeNull();
    expect(bridge.getStatus().state).toBe('idle');

    bridge.cancel();
    expect(bridge.getStatus().state).toBe('cancelled');

    bridge.disconnect();
    expect(bridge.getStatus().state).toBe('disconnected');

    unsubscribe();
    expect(statusListener).toHaveBeenCalled();
  });
});
