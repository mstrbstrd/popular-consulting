import React from 'react';
import { TextEncoder } from 'util';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import MetabloomBoomRequestCard from './MetabloomBoomRequestCard';
import MetabloomVisualFrame from './MetabloomVisualFrame';
import { emptyBoomFields, boomRequestDownload, buildBoomRequestVisual } from './metabloomBoomRequest';
import { createMetabloomVisualSnapshot, parseMetabloomVisualSnapshot } from './metabloomVisualSnapshot';
import { summarizeMetabloomVisual } from './metabloomVisualSelection';
expect.extend(toHaveNoViolations);
const draft = () => ({ version: 1, revision: 1, updatedAt: 1000, fields: { ...emptyBoomFields(), market: 'CA',
  firstName: 'Alex', lastName: 'Example', companyName: 'Demo Concrete', email: 'alex@example.test', phoneNumber: '+1 250 555 0100',
  pumpMake: 'DY', pumpModel: '40X-5ZR', serialNumber: 'DEMO-123', hardness: 'Twin Wall', backEnd: 'Yes' } });
const oldEncoder = global.TextEncoder;
beforeAll(() => { global.TextEncoder = TextEncoder; });
afterAll(() => { global.TextEncoder = oldEncoder; });
afterEach(() => { cleanup(); jest.restoreAllMocks(); jest.useRealTimers(); });
test('required intake gates download and optional fields and missing attachments are explicit', async () => {
  const partial = draft(); partial.fields.serialNumber = null;
  const view = render(<MetabloomBoomRequestCard draft={partial} />);
  expect(screen.getByRole('button', { name: 'Download demo request' })).toBeDisabled();
  expect(screen.getByText('1 required details remaining')).toBeVisible();
  expect(screen.getByText(/No schematic is attached/)).toBeVisible();
  view.rerender(<MetabloomBoomRequestCard draft={draft()} />);
  expect(screen.getByRole('button', { name: 'Download demo request' })).toBeEnabled();
  expect(screen.getByRole('link', { name: 'Open DY’s real request form' })).toHaveAttribute('href', 'https://shop.dyconcretepumps.com/boom-system-request');
  expect(screen.getByText(/Not submitted to DY/)).toBeVisible();
  expect(await axe(view.container)).toHaveNoViolations();
});
test('download contains exact reviewed revision and never posts the request', () => {
  jest.useFakeTimers();
  const create = jest.fn(() => 'blob:fixture'), revoke = jest.fn();
  const oldCreate = URL.createObjectURL, oldRevoke = URL.revokeObjectURL;
  URL.createObjectURL = create; URL.revokeObjectURL = revoke;
  const clicked = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  try {
    render(<MetabloomBoomRequestCard draft={draft()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Download demo request' }));
    expect(clicked).toHaveBeenCalledTimes(1); expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].type).toBe('text/plain;charset=utf-8');
    expect(boomRequestDownload(draft())).toContain('Serial number: DEMO-123');
    expect(boomRequestDownload(draft())).toContain('Draft revision: 1');
    jest.runOnlyPendingTimers(); expect(revoke).toHaveBeenCalledWith('blob:fixture');
  } finally { URL.createObjectURL = oldCreate; URL.revokeObjectURL = oldRevoke; }
});
test('native frame and saved thread snapshot preserve the request without executing customer text', () => {
  const value = draft(); value.fields.companyName = '<img src=x onerror=alert(1)>';
  const spec = buildBoomRequestVisual(value);
  const record = { id: 'a'.repeat(48), kind: spec.kind, mode: 'optional', userId: null, replyId: 'assistant-2',
    expiresAt: 2000, status: 'ready', spec, sources: [], viewState: { detailsOpen: false } };
  const messages = [{ id: 'assistant-2', role: 'assistant', status: 'complete', content: 'Review this demo request.' }];
  const snapshot = createMetabloomVisualSnapshot([record], messages);
  const parsed = parseMetabloomVisualSnapshot(snapshot, messages);
  expect(parsed.records[0].spec).toEqual(spec);
  expect(summarizeMetabloomVisual(record)).toContain('Not submitted');
  render(<MetabloomVisualFrame artifact={record} />);
  expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeVisible();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Download demo request' })).toBeEnabled();
});
