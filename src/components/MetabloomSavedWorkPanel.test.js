import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import MetabloomSavedWorkPanel from './MetabloomSavedWorkPanel';
import { requestMetabloomSavedWork } from './metabloomSavedWorkApiClient';

// The shared client is delivered by the saved-work API change. Keep these
// interaction tests isolated from its transport and database implementation.
jest.mock('./metabloomSavedWorkApiClient', () => ({ requestMetabloomSavedWork: jest.fn() }));

const source = () => ({ title: 'Project price', source: { kind: 'visual', id: 'a'.repeat(48), artifactVersion: 'b'.repeat(32) },
  scenario: { inputs: { hours: 17, rate: 85 } } });
const item = (number = 1, extra = {}) => ({ artifactId: `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`,
  title: `Project ${number}`, kind: 'visual', version: 1, revision: 1, headRevision: 1,
  createdAt: '2026-11-03T12:00:00.000Z', updatedAt: '2026-11-03T12:00:00.000Z', ...extra });
const failure = code => Object.assign(new Error('A safe saved-work error.'), { code });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const originalShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
const restore = (owner, name, descriptor) => {
  if (descriptor) Object.defineProperty(owner, name, descriptor);
  else delete owner[name];
};

function Host(props) {
  const [open, setOpen] = React.useState(false);
  return <div className="orb-page">
    <button type="button" onClick={() => setOpen(true)}>Saved work</button>
    {open && <MetabloomSavedWorkPanel {...props} onClose={() => { props.onClose?.(); setOpen(false); }} />}
  </div>;
}
function mount(props = {}, strict = false) {
  const view = render(strict ? <React.StrictMode><Host {...props} /></React.StrictMode> : <Host {...props} />);
  const opener = screen.getByRole('button', { name: 'Saved work', exact: true });
  opener.focus();
  fireEvent.click(opener);
  return { ...view, opener };
}
const loaded = () => waitFor(() => expect(screen.getByRole('button', { name: 'Refresh list' })).toBeEnabled());

beforeEach(() => {
  requestMetabloomSavedWork.mockReset().mockResolvedValue({ items: [], nextCursor: null });
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: jest.fn(function () { this.setAttribute('open', ''); }) });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: jest.fn(function () {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  }) });
  let uuid = 0;
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { randomUUID: jest.fn(() => item(++uuid).artifactId) } });
});
afterEach(() => {
  cleanup();
  restore(HTMLDialogElement.prototype, 'showModal', originalShow);
  restore(HTMLDialogElement.prototype, 'close', originalClose);
  restore(globalThis, 'crypto', originalCrypto);
});

test('opens a native named modal, lists on demand, and returns focus on Escape', async () => {
  const onClose = jest.fn();
  const view = mount({ onClose });
  const dialog = screen.getByRole('dialog', { name: 'Saved work' });
  expect(dialog).toHaveAttribute('open');
  expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Close saved work' })).toHaveFocus();
  await loaded();
  expect(requestMetabloomSavedWork).toHaveBeenCalledTimes(1);
  expect(requestMetabloomSavedWork).toHaveBeenCalledWith({ action: 'list', limit: 20 }, { signal: expect.any(AbortSignal) });
  fireEvent(dialog, new Event('cancel', { cancelable: true }));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(view.opener).toHaveFocus();
});

test('unavailable storage shows an honest message and permits only an explicit retry', async () => {
  requestMetabloomSavedWork.mockRejectedValueOnce(failure('saved_work_unavailable'))
    .mockResolvedValueOnce({ items: [], nextCursor: null });
  mount({ source: source() });
  expect(await screen.findByRole('alert')).toHaveTextContent('Saved work is not available yet.');
  expect(screen.getByRole('button', { name: 'Save current work' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Saved', exact: true })).not.toBeInTheDocument();
  expect(requestMetabloomSavedWork).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Refresh list' }));
  await loaded();
  expect(requestMetabloomSavedWork).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('button', { name: 'Save current work' })).toBeEnabled();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('Save freezes the source and scenario and retries the same UUID without claiming an unconfirmed save', async () => {
  const first = deferred(), retry = deferred(), onSaved = jest.fn();
  requestMetabloomSavedWork.mockResolvedValueOnce({ items: [], nextCursor: null })
    .mockReturnValueOnce(first.promise).mockReturnValueOnce(retry.promise);
  const initial = source();
  const view = mount({ source: initial, onSaved });
  await loaded();
  fireEvent.click(screen.getByRole('button', { name: 'Save current work' }));
  const captured = requestMetabloomSavedWork.mock.calls[1][0];
  expect(captured).toEqual({ action: 'save', requestId: expect.stringMatching(/^[a-f0-9-]{36}$/), ...initial });
  expect(captured.scenario.inputs).not.toBe(initial.scenario.inputs);
  expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  expect(onSaved).not.toHaveBeenCalled();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  initial.scenario.inputs.hours = 20;
  view.rerender(<Host source={{ ...source(), title: 'Different work' }} onSaved={onSaved} />);
  await act(async () => first.reject(failure('saved_work_timeout')));
  expect(screen.getByRole('alert')).toHaveTextContent('This save could not be confirmed.');
  expect(screen.getByRole('button', { name: 'Retry save' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Retry save' }));
  expect(requestMetabloomSavedWork.mock.calls[2][0]).toEqual(captured);
  expect(requestMetabloomSavedWork.mock.calls[2][0].scenario.inputs.hours).toBe(17);
  expect(globalThis.crypto.randomUUID).toHaveBeenCalledTimes(1);
  const artifact = item(9, { title: 'Project price' });
  await act(async () => retry.resolve({ artifact }));
  expect(onSaved).toHaveBeenCalledTimes(1);
  expect(onSaved).toHaveBeenCalledWith(artifact);
  expect(screen.getByRole('status')).toHaveTextContent('Saved “Project price”.');
  expect(screen.getByRole('button', { name: 'Saved', exact: true })).toBeDisabled();
});

test('cursor pagination merges overlapping rows and refresh replaces the visible page', async () => {
  requestMetabloomSavedWork.mockResolvedValueOnce({ items: [item(1)], nextCursor: 'page_two' })
    .mockResolvedValueOnce({ items: [item(1), item(2)], nextCursor: null })
    .mockResolvedValueOnce({ items: [item(3)], nextCursor: null });
  mount();
  await loaded();
  fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
  await loaded();
  expect(requestMetabloomSavedWork.mock.calls[1][0]).toEqual({ action: 'list', limit: 20, after: 'page_two' });
  expect(screen.getAllByRole('listitem')).toHaveLength(2);
  expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh list' }));
  await loaded();
  expect(screen.getAllByRole('listitem')).toHaveLength(1);
  expect(screen.getByRole('heading', { name: 'Project 3' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Project 1' })).not.toBeInTheDocument();
});

test('Open passes the exact saved envelope and closes only after the conversation accepts it', async () => {
  const artifact = item(1, { kind: 'research' });
  const result = { artifact, content: { kind: 'research', asOf: '2026-10-10T08:00:00.000Z', localDate: '2026-10-10', timeZone: 'America/Toronto' },
    reference: { kind: 'research', research: { researchId: 'c'.repeat(48), asOf: '2026-10-10T08:00:00.000Z' } } };
  const acceptance = deferred(), onClose = jest.fn();
  const onOpen = jest.fn().mockResolvedValueOnce(false).mockReturnValueOnce(acceptance.promise);
  requestMetabloomSavedWork.mockResolvedValueOnce({ items: [artifact], nextCursor: null }).mockResolvedValue(result);
  mount({ onOpen, onClose });
  await loaded();
  fireEvent.click(screen.getByRole('button', { name: 'Open Project 1' }));
  await screen.findByRole('alert');
  expect(onOpen).toHaveBeenCalledWith(result);
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Open Project 1' }));
  await waitFor(() => expect(onOpen).toHaveBeenCalledTimes(2));
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  await act(async () => acceptance.resolve(true));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('rename sends the last confirmed version and restores focus to the renamed item action', async () => {
  requestMetabloomSavedWork.mockResolvedValueOnce({ items: [item(1, { version: 4 })], nextCursor: null })
    .mockResolvedValueOnce({ artifact: item(1, { title: 'Next project', version: 5 }) });
  mount();
  await loaded();
  fireEvent.click(screen.getByRole('button', { name: 'Rename Project 1' }));
  const input = screen.getByRole('textbox', { name: 'New name' });
  expect(input).toHaveFocus();
  expect(input).toHaveAttribute('maxlength', '160');
  fireEvent.change(input, { target: { value: '  Next project  ' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Rename Project 1' }));
  await loaded();
  expect(requestMetabloomSavedWork.mock.calls[1][0]).toEqual({ action: 'rename', artifactId: item(1).artifactId, expectedVersion: 4, title: 'Next project' });
  expect(screen.getByRole('button', { name: 'Rename Next project' })).toHaveFocus();
  expect(screen.getByRole('status')).toHaveTextContent('Renamed to “Next project”.');
});

test('a rename conflict preserves the item and blocks another write until an explicit refresh', async () => {
  requestMetabloomSavedWork.mockResolvedValueOnce({ items: [item(1)], nextCursor: null })
    .mockRejectedValueOnce(failure('saved_work_conflict'))
    .mockResolvedValueOnce({ items: [item(1, { title: 'Changed elsewhere', version: 3 })], nextCursor: null })
    .mockResolvedValueOnce({ artifact: item(1, { title: 'My project', version: 4 }) });
  mount();
  await loaded();
  fireEvent.click(screen.getByRole('button', { name: 'Rename Project 1' }));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'My project' } });
  fireEvent.submit(screen.getByRole('form'));
  expect(await screen.findByRole('alert')).toHaveTextContent('This item changed elsewhere.');
  expect(screen.getByRole('heading', { name: 'Project 1' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save name' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh list' }));
  await loaded();
  fireEvent.click(screen.getByRole('button', { name: 'Rename Changed elsewhere' }));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'My project' } });
  fireEvent.submit(screen.getByRole('form'));
  await loaded();
  expect(requestMetabloomSavedWork.mock.calls[3][0].expectedVersion).toBe(3);
  expect(screen.getByRole('heading', { name: 'My project' })).toBeInTheDocument();
});

test('delete requires inline confirmation and keeps the row until the server confirms deletion', async () => {
  const deletion = deferred();
  requestMetabloomSavedWork.mockResolvedValueOnce({ items: [item(1, { version: 6 })], nextCursor: null }).mockReturnValueOnce(deletion.promise);
  mount();
  await loaded();
  fireEvent.click(screen.getByRole('button', { name: 'Delete Project 1' }));
  expect(screen.getByRole('button', { name: 'Keep saved copy' })).toHaveFocus();
  expect(requestMetabloomSavedWork).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Keep saved copy' }));
  expect(screen.getByRole('button', { name: 'Delete Project 1' })).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: 'Delete Project 1' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete saved copy' }));
  expect(requestMetabloomSavedWork.mock.calls[1][0]).toEqual({ action: 'delete', artifactId: item(1).artifactId, expectedVersion: 6 });
  expect(screen.getByRole('heading', { name: 'Project 1' })).toBeInTheDocument();
  await act(async () => deletion.resolve({ artifactId: item(1).artifactId, version: 6, deleted: true }));
  expect(screen.queryByRole('heading', { name: 'Project 1' })).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Deleted “Project 1”.');
  expect(screen.getByRole('button', { name: 'Refresh list' })).toHaveFocus();
  expect(screen.queryByRole('button', { name: /Undo/ })).not.toBeInTheDocument();
});

test.each(['save', 'open'])('unmount aborts a pending %s and discards its late receipt and callbacks', async action => {
  const pending = deferred(), onSaved = jest.fn(), onOpen = jest.fn();
  requestMetabloomSavedWork.mockResolvedValueOnce({ items: [item(1)], nextCursor: null }).mockReturnValueOnce(pending.promise);
  const view = mount({ source: source(), onSaved, onOpen });
  await loaded();
  fireEvent.click(screen.getByRole('button', { name: action === 'save' ? 'Save current work' : 'Open Project 1' }));
  const signal = requestMetabloomSavedWork.mock.calls[1][1].signal;
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => pending.resolve({ artifact: item(1) }));
  expect(onSaved).not.toHaveBeenCalled();
  expect(onOpen).not.toHaveBeenCalled();
});

test('StrictMode aborts the earlier load without letting its response replace the current list', async () => {
  const old = deferred();
  requestMetabloomSavedWork.mockReturnValueOnce(old.promise).mockResolvedValueOnce({ items: [item(2)], nextCursor: null });
  mount({}, true);
  await loaded();
  expect(requestMetabloomSavedWork.mock.calls[0][1].signal.aborted).toBe(true);
  await act(async () => old.resolve({ items: [item(1)], nextCursor: null }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Project 2' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Project 1' })).not.toBeInTheDocument();
  expect(within(screen.getByRole('dialog')).getAllByRole('listitem')).toHaveLength(1);
  // A close event queued by StrictMode's earlier cleanup must not close the
  // already reopened native dialog.
  fireEvent(screen.getByRole('dialog'), new Event('close'));
  expect(screen.getByRole('dialog')).toHaveAttribute('open');
});
