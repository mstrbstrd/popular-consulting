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
const historyPage = (artifact, revisions, nextBeforeRevision = null) => ({ artifact,
  items: revisions.map(revision => ({ revision, createdAt: `2026-11-03T12:${String(revision).padStart(2, '0')}:00.000Z` })), nextBeforeRevision });
const revisionResult = (artifact, previousRevision) => ({ artifact,
  undo: { artifactId: artifact.artifactId, revision: previousRevision, expectedVersion: artifact.version } });
const opened = artifact => ({ artifact, content: { kind: artifact.kind, scenario: { inputs: { hours: 17, rate: 85 } } },
  reference: { kind: artifact.kind, artifactVersion: 'c'.repeat(32) } });
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
  expect(screen.getByRole('button', { name: 'Retry captured save: Project price' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Retry captured save: Project price' }));
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

test('an in-flight Save reports its captured context to the latest callback without marking another work item Saved', async () => {
  const pending = deferred(), initialOnSaved = jest.fn(), currentOnSaved = jest.fn();
  const contextA = {}, contextB = {}, sourceA = { ...source(), title: 'Estimate A' }, sourceB = { ...source(), title: 'Estimate B' };
  const savedA = item(9, { title: sourceA.title });
  requestMetabloomSavedWork.mockResolvedValueOnce({ items: [], nextCursor: null }).mockReturnValueOnce(pending.promise);
  const view = mount({ source: sourceA, saveContext: contextA, onSaved: initialOnSaved });
  await loaded();
  fireEvent.click(screen.getByRole('button', { name: 'Save current work' }));
  const captured = requestMetabloomSavedWork.mock.calls[1][0];
  view.rerender(<Host source={sourceB} saveContext={contextB} onSaved={currentOnSaved} />);
  const current = screen.getByRole('region', { name: 'Current work' });
  expect(within(current).getByText('Estimate B')).toBeVisible();
  expect(within(current).queryByText('Estimate A')).not.toBeInTheDocument();
  expect(within(current).getByRole('button', { name: 'Save current work' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Retry captured save: Estimate A' })).toBeDisabled();
  await act(async () => pending.resolve({ artifact: savedA }));
  expect(initialOnSaved).not.toHaveBeenCalled();
  expect(currentOnSaved).toHaveBeenCalledWith(savedA, contextA, captured);
  expect(captured).toEqual({ action: 'save', requestId: expect.any(String), ...sourceA });
  expect(currentOnSaved.mock.calls[0][1]).toBe(contextA);
  expect(screen.queryByRole('button', { name: 'Saved', exact: true })).not.toBeInTheDocument();
  expect(within(current).getByRole('button', { name: 'Save current work' })).toBeEnabled();
  expect(screen.queryByRole('region', { name: 'Captured save' })).not.toBeInTheDocument();
  expect(requestMetabloomSavedWork).toHaveBeenCalledTimes(2);
});

test('retrying captured A after Restore opens B preserves its origin and permits a fresh Save of B only after confirmation', async () => {
  const contextA = {}, contextB = {}, sourceA = { ...source(), title: 'Estimate A' };
  const sourceB = { ...source(), title: 'Estimate B', source: { ...source().source, id: 'd'.repeat(48) }, scenario: { inputs: { hours: 28, rate: 95 } } };
  const headB = item(2, { title: 'Saved B', version: 7, revision: 3, headRevision: 3 });
  const restoredB = { ...headB, version: 8, revision: 4, headRevision: 4 };
  const savedA = item(9, { title: sourceA.title }), savedB = item(10, { title: sourceB.title });
  const onSaved = jest.fn(), onOpen = jest.fn().mockReturnValue(true);
  requestMetabloomSavedWork.mockResolvedValueOnce({ items: [headB], nextCursor: null })
    .mockRejectedValueOnce(failure('saved_work_timeout'))
    .mockResolvedValueOnce(historyPage(headB, [3, 2, 1]))
    .mockResolvedValueOnce(revisionResult(restoredB, 3)).mockResolvedValueOnce(opened(restoredB))
    .mockResolvedValueOnce({ artifact: savedA }).mockResolvedValueOnce({ artifact: savedB });
  const view = mount({ source: sourceA, saveContext: contextA, onSaved, onOpen });
  await loaded();
  fireEvent.click(screen.getByRole('button', { name: 'Save current work' }));
  await screen.findByRole('alert');
  const capturedA = requestMetabloomSavedWork.mock.calls[1][0];
  fireEvent.click(screen.getByRole('button', { name: 'History of Saved B' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Restore revision 1 of Saved B' }));
  fireEvent.click(screen.getByRole('button', { name: 'Restore as current' }));
  await loaded();
  expect(onOpen).toHaveBeenCalledWith(opened(restoredB));
  view.rerender(<Host source={sourceB} saveContext={contextB} activeArtifact={restoredB} onSaved={onSaved} onOpen={onOpen} />);
  const current = screen.getByRole('region', { name: 'Current work' });
  expect(within(current).getByText('Estimate B')).toBeVisible();
  expect(within(current).queryByText('Estimate A')).not.toBeInTheDocument();
  expect(within(current).getByRole('button', { name: 'Save as new' })).toBeDisabled();
  expect(within(current).getByRole('button', { name: 'Save changes' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Retry captured save: Estimate A' })).toBeEnabled();
  const receipt = screen.getByRole('region', { name: 'Confirmed revision' });
  expect(receipt).toHaveTextContent('Restored revision 1 as revision 4. This revision is now open.');
  fireEvent.click(screen.getByRole('button', { name: 'Retry captured save: Estimate A' }));
  await loaded();
  expect(requestMetabloomSavedWork.mock.calls[5][0]).toEqual(capturedA);
  expect(onSaved).toHaveBeenNthCalledWith(1, savedA, contextA, capturedA);
  expect(onSaved.mock.calls[0][1]).toBe(contextA);
  expect(screen.queryByRole('button', { name: 'Saved', exact: true })).not.toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Captured save' })).not.toBeInTheDocument();
  expect(within(current).getByRole('button', { name: 'Save as new' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Undo last saved change' })).toBeEnabled();
  fireEvent.click(within(current).getByRole('button', { name: 'Save as new' }));
  await loaded();
  const capturedB = requestMetabloomSavedWork.mock.calls[6][0];
  expect(capturedB).toEqual({ action: 'save', requestId: expect.any(String), ...sourceB });
  expect(capturedB.requestId).not.toBe(capturedA.requestId);
  expect(globalThis.crypto.randomUUID).toHaveBeenCalledTimes(2);
  expect(onSaved).toHaveBeenNthCalledWith(2, savedB, contextB, capturedB);
  expect(onSaved.mock.calls[1][1]).toBe(contextB);
  expect(within(current).getByRole('button', { name: 'Saved', exact: true })).toBeDisabled();
  expect(receipt).toHaveTextContent('Restored revision 1 as revision 4. This revision is now open.');
  expect(screen.getByRole('button', { name: 'Undo last saved change' })).toBeEnabled();
  expect(requestMetabloomSavedWork.mock.calls.map(([request]) => request.action)).toEqual(['list', 'save', 'history', 'restore', 'open', 'save', 'save']);
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
  await waitFor(() => expect(requestMetabloomSavedWork).toHaveBeenCalledTimes(2));
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

test('an invalid current draft shows its reason and cannot Save or Save changes', async () => {
  mount({ source: { title: 'Project price', hint: 'Enter valid calculator inputs before saving.' }, activeArtifact: item(1) });
  await loaded();
  expect(screen.getByText('Enter valid calculator inputs before saving.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Save current work' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
  expect(requestMetabloomSavedWork).toHaveBeenCalledTimes(1);
});

test('History paginates revisions and opens the exact chosen research revision without a mutation', async () => {
  const head = item(1, { kind: 'research', version: 7, revision: 3, headRevision: 3 });
  const selected = { ...head, revision: 1 };
  const result = { artifact: selected,
    content: { kind: 'research', asOf: '2026-10-10T08:00:00.000Z', localDate: '2026-10-10', timeZone: 'America/Toronto', report: { title: 'Original dated report' } },
    reference: { kind: 'research', research: { researchId: 'c'.repeat(48), asOf: '2026-10-10T08:00:00.000Z' } } };
  const onOpen = jest.fn().mockReturnValue(true), onRevisionSaved = jest.fn();
  requestMetabloomSavedWork.mockResolvedValueOnce({ items: [head], nextCursor: null })
    .mockResolvedValueOnce(historyPage(head, [3, 2], 2))
    .mockResolvedValueOnce(historyPage(head, [1])).mockResolvedValueOnce(result);
  mount({ onOpen, onRevisionSaved });
  await loaded();
  fireEvent.click(screen.getByRole('button', { name: 'History of Project 1' }));
  await screen.findByRole('button', { name: 'Load older revisions' });
  expect(requestMetabloomSavedWork.mock.calls[1][0]).toEqual({ action: 'history', artifactId: head.artifactId, limit: 20 });
  expect(screen.queryByRole('button', { name: 'Restore revision 3 of Project 1' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Load older revisions' }));
  await screen.findByRole('button', { name: 'Open revision 1 of Project 1' });
  expect(requestMetabloomSavedWork.mock.calls[2][0]).toEqual({ action: 'history', artifactId: head.artifactId, limit: 20, beforeRevision: 2 });
  expect(within(screen.getByRole('region', { name: 'History of Project 1' })).getAllByRole('listitem')).toHaveLength(3);
  fireEvent.click(screen.getByRole('button', { name: 'Open revision 1 of Project 1' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(requestMetabloomSavedWork.mock.calls[3][0]).toEqual({ action: 'open', artifactId: head.artifactId, revision: 1 });
  expect(onOpen).toHaveBeenCalledWith(result);
  expect(onRevisionSaved).not.toHaveBeenCalled();
  expect(requestMetabloomSavedWork.mock.calls.map(([request]) => request.action)).toEqual(['list', 'history', 'history', 'open']);
});

test('Restore confirms inline, opens its returned head, and Undo uses the exact version-bound receipt', async () => {
  const head = item(1, { version: 7, revision: 3, headRevision: 3 });
  const restored = item(1, { version: 8, revision: 4, headRevision: 4 });
  const undone = item(1, { version: 9, revision: 5, headRevision: 5 });
  const onRevisionSaved = jest.fn(), onOpen = jest.fn().mockReturnValue(true), onClose = jest.fn();
  requestMetabloomSavedWork.mockResolvedValueOnce({ items: [head], nextCursor: null })
    .mockResolvedValueOnce(historyPage(head, [3, 2, 1]))
    .mockResolvedValueOnce(revisionResult(restored, 3)).mockResolvedValueOnce(opened(restored))
    .mockResolvedValueOnce(revisionResult(undone, 4)).mockResolvedValueOnce(opened(undone));
  mount({ onRevisionSaved, onOpen, onClose });
  await loaded();
  fireEvent.click(screen.getByRole('button', { name: 'History of Project 1' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Restore revision 1 of Project 1' }));
  expect(screen.getByRole('button', { name: 'Cancel restore' })).toHaveFocus();
  expect(requestMetabloomSavedWork).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole('button', { name: 'Restore as current' }));
  await loaded();
  expect(requestMetabloomSavedWork.mock.calls[2][0]).toEqual({ action: 'restore', artifactId: head.artifactId, expectedVersion: 7, revision: 1 });
  expect(requestMetabloomSavedWork.mock.calls[3][0]).toEqual({ action: 'open', artifactId: head.artifactId, revision: 4 });
  expect(onRevisionSaved).toHaveBeenCalledWith(restored);
  expect(onRevisionSaved.mock.invocationCallOrder[0]).toBeLessThan(onOpen.mock.invocationCallOrder[0]);
  const receipt = screen.getByRole('region', { name: 'Confirmed revision' });
  expect(receipt).toHaveTextContent('Restored revision 1 as revision 4. This revision is now open.');
  expect(receipt).toHaveFocus();
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Undo last saved change' }));
  await loaded();
  expect(requestMetabloomSavedWork.mock.calls[4][0]).toEqual({ action: 'restore', artifactId: head.artifactId, revision: 3, expectedVersion: 8 });
  expect(requestMetabloomSavedWork.mock.calls[5][0]).toEqual({ action: 'open', artifactId: head.artifactId, revision: 5 });
  expect(onRevisionSaved).toHaveBeenLastCalledWith(undone);
  expect(receipt).toHaveTextContent('Undo saved as revision 5.');
  expect(screen.queryByRole('button', { name: 'Undo last saved change' })).not.toBeInTheDocument();
  expect(requestMetabloomSavedWork.mock.calls.map(([request]) => request.action)).toEqual(['list', 'history', 'restore', 'open', 'restore', 'open']);
});

test.each(['transport', 'conversation'])('a %s hydration failure retains the confirmed receipt and retries only Open', async mode => {
  const head = item(1, { version: 7, revision: 3, headRevision: 3 });
  const revised = item(1, { version: 8, revision: 4, headRevision: 4 });
  const onRevisionSaved = jest.fn();
  const onOpen = mode === 'conversation' ? jest.fn().mockReturnValueOnce(false).mockReturnValueOnce(true) : jest.fn().mockReturnValue(true);
  requestMetabloomSavedWork.mockResolvedValueOnce({ items: [head], nextCursor: null })
    .mockResolvedValueOnce(revisionResult(revised, 3));
  if (mode === 'transport') requestMetabloomSavedWork.mockRejectedValueOnce(failure('saved_work_unavailable'));
  else requestMetabloomSavedWork.mockResolvedValueOnce(opened(revised));
  requestMetabloomSavedWork.mockResolvedValueOnce(opened(revised));
  mount({ source: source(), activeArtifact: head, onRevisionSaved, onOpen });
  await loaded();
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await loaded();
  expect(screen.getByRole('alert')).toHaveTextContent('Revision 4 is saved, but it could not be opened');
  expect(screen.getByRole('region', { name: 'Confirmed revision' })).toHaveTextContent('Changes saved as revision 4.');
  expect(screen.getByRole('button', { name: 'Undo last saved change' })).toBeEnabled();
  expect(onRevisionSaved).toHaveBeenCalledTimes(1);
  expect(onRevisionSaved).toHaveBeenCalledWith(revised);
  fireEvent.click(screen.getByRole('button', { name: 'Retry open' }));
  await loaded();
  expect(requestMetabloomSavedWork.mock.calls.map(([request]) => request.action)).toEqual(['list', 'revise', 'open', 'open']);
  expect(requestMetabloomSavedWork.mock.calls[3][0]).toEqual({ action: 'open', artifactId: head.artifactId, revision: 4 });
  expect(onRevisionSaved).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('region', { name: 'Confirmed revision' })).toHaveTextContent('This revision is now open.');
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

test('Save changes captures the associated artifact and inputs before a newer source arrives', async () => {
  const head = item(1, { version: 7, revision: 3, headRevision: 3 }), saved = item(1, { version: 8, revision: 4, headRevision: 4 });
  const mutation = deferred(), current = source(), onRevisionSaved = jest.fn(), onOpen = jest.fn().mockReturnValue(false);
  requestMetabloomSavedWork.mockResolvedValueOnce({ items: [head], nextCursor: null })
    .mockReturnValueOnce(mutation.promise).mockResolvedValueOnce(opened(saved));
  const view = mount({ source: current, activeArtifact: head, onRevisionSaved, onOpen });
  await loaded();
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  const request = requestMetabloomSavedWork.mock.calls[1][0];
  expect(request).toEqual({ action: 'revise', artifactId: head.artifactId, expectedVersion: 7, source: current.source, scenario: current.scenario });
  current.scenario.inputs.hours = 20;
  view.rerender(<Host source={{ ...source(), title: 'Other work' }} activeArtifact={item(2)} onRevisionSaved={onRevisionSaved} onOpen={onOpen} />);
  await act(async () => mutation.resolve(revisionResult(saved, 3)));
  expect(request.scenario.inputs).toEqual({ hours: 17, rate: 85 });
  expect(onRevisionSaved).toHaveBeenCalledWith(saved);
  expect(onOpen).toHaveBeenCalledWith(opened(saved));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('Revision 4 is saved');
});

test('an uncertain revision response is reconciled through explicit History without retrying the write', async () => {
  const head = item(1, { version: 7, revision: 3, headRevision: 3 }), changed = item(1, { version: 8, revision: 4, headRevision: 4 });
  const onRevisionSaved = jest.fn(), onOpen = jest.fn();
  requestMetabloomSavedWork.mockResolvedValueOnce({ items: [head], nextCursor: null })
    .mockRejectedValueOnce(failure('saved_work_timeout')).mockResolvedValueOnce(historyPage(changed, [4, 3, 2, 1]));
  mount({ source: source(), activeArtifact: head, onRevisionSaved, onOpen });
  await loaded();
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('This revision update could not be confirmed. Check History');
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  expect(screen.queryByRole('region', { name: 'Confirmed revision' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'History of Project 1' }));
  await screen.findByRole('button', { name: 'Open revision 4 of Project 1' });
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  expect(screen.getByText('A newer saved version is available. Open it or save this work as new.')).toBeVisible();
  expect(requestMetabloomSavedWork.mock.calls.map(([request]) => request.action)).toEqual(['list', 'revise', 'history']);
  expect(onRevisionSaved).not.toHaveBeenCalled();
  expect(onOpen).not.toHaveBeenCalled();
});

test('a confirmed rename advances metadata, not content, and invalidates a previous Undo', async () => {
  const head = item(1, { version: 7, revision: 3, headRevision: 3 });
  const saved = item(1, { version: 8, revision: 4, headRevision: 4 });
  const renamed = { ...saved, title: 'Renamed project', version: 9 };
  const onRevisionSaved = jest.fn(), onRenamed = jest.fn(), onOpen = jest.fn().mockReturnValue(true);
  requestMetabloomSavedWork.mockResolvedValueOnce({ items: [head], nextCursor: null })
    .mockResolvedValueOnce(revisionResult(saved, 3)).mockResolvedValueOnce(opened(saved)).mockResolvedValueOnce({ artifact: renamed });
  mount({ source: source(), activeArtifact: head, onRevisionSaved, onRenamed, onOpen });
  await loaded();
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await loaded();
  fireEvent.click(screen.getByRole('button', { name: 'Rename Project 1' }));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: renamed.title } });
  fireEvent.submit(screen.getByRole('form'));
  await loaded();
  expect(requestMetabloomSavedWork.mock.calls[3][0]).toEqual({ action: 'rename', artifactId: saved.artifactId, expectedVersion: 8, title: renamed.title });
  expect(onRenamed).toHaveBeenCalledWith(renamed);
  expect(onRevisionSaved).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('region', { name: 'Confirmed revision' })).toHaveTextContent('Changes saved as revision 4.');
  expect(screen.getByRole('button', { name: 'Undo last saved change' })).toBeDisabled();
  expect(screen.getByText('A newer change prevents Undo. You can choose an earlier revision in History.')).toBeVisible();
});

test('an external change makes Undo conflict without overwriting the confirmed saved receipt', async () => {
  const head = item(1, { version: 7, revision: 3, headRevision: 3 }), saved = item(1, { version: 8, revision: 4, headRevision: 4 });
  const onRevisionSaved = jest.fn(), onOpen = jest.fn().mockReturnValue(true);
  requestMetabloomSavedWork.mockResolvedValueOnce({ items: [head], nextCursor: null })
    .mockResolvedValueOnce(revisionResult(saved, 3)).mockResolvedValueOnce(opened(saved))
    .mockRejectedValueOnce(failure('saved_work_conflict'));
  mount({ source: source(), activeArtifact: head, onRevisionSaved, onOpen });
  await loaded();
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await loaded();
  fireEvent.click(screen.getByRole('button', { name: 'Undo last saved change' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('This item changed elsewhere.');
  expect(requestMetabloomSavedWork.mock.calls[3][0]).toEqual({ action: 'restore', artifactId: saved.artifactId, revision: 3, expectedVersion: 8 });
  expect(onRevisionSaved).toHaveBeenCalledTimes(1);
  expect(onOpen).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('region', { name: 'Confirmed revision' })).toHaveTextContent('Changes saved as revision 4.');
  expect(screen.getByRole('button', { name: 'Undo last saved change' })).toBeDisabled();
});

test('deleting associated work notifies the parent only on confirmation and leaves Save as new possible', async () => {
  const head = item(1, { version: 7, revision: 3, headRevision: 3 }), onDeleted = jest.fn();
  requestMetabloomSavedWork.mockResolvedValueOnce({ items: [head], nextCursor: null })
    .mockResolvedValueOnce({ artifactId: head.artifactId, version: 7, deleted: true });
  mount({ source: source(), activeArtifact: head, onDeleted });
  await loaded();
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Delete Project 1' }));
  expect(onDeleted).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Delete saved copy' }));
  await loaded();
  expect(onDeleted).toHaveBeenCalledTimes(1);
  expect(onDeleted).toHaveBeenCalledWith(head.artifactId);
  expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save current work' })).toBeEnabled();
});

test('closing after a confirmed mutation aborts its separate hydration without a late conversation update', async () => {
  const head = item(1, { version: 7, revision: 3, headRevision: 3 }), saved = item(1, { version: 8, revision: 4, headRevision: 4 });
  const hydration = deferred(), onRevisionSaved = jest.fn(), onOpen = jest.fn();
  requestMetabloomSavedWork.mockResolvedValueOnce({ items: [head], nextCursor: null })
    .mockResolvedValueOnce(revisionResult(saved, 3)).mockReturnValueOnce(hydration.promise);
  const view = mount({ source: source(), activeArtifact: head, onRevisionSaved, onOpen });
  await loaded();
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(requestMetabloomSavedWork).toHaveBeenCalledTimes(3));
  expect(onRevisionSaved).toHaveBeenCalledTimes(1);
  expect(onRevisionSaved).toHaveBeenCalledWith(saved);
  expect(screen.getByRole('region', { name: 'Confirmed revision' })).toHaveTextContent('Changes saved as revision 4.');
  const signal = requestMetabloomSavedWork.mock.calls[2][1].signal;
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => hydration.resolve(opened(saved)));
  expect(onOpen).not.toHaveBeenCalled();
  expect(onRevisionSaved).toHaveBeenCalledTimes(1);
});

test('a rejected unchanged revision has no confirmed receipt, Undo, or hydration', async () => {
  const head = item(1, { version: 7, revision: 3, headRevision: 3 }), onRevisionSaved = jest.fn(), onOpen = jest.fn();
  requestMetabloomSavedWork.mockResolvedValueOnce({ items: [head], nextCursor: null }).mockRejectedValueOnce(failure('saved_work_invalid'));
  mount({ source: source(), activeArtifact: head, onRevisionSaved, onOpen });
  await loaded();
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('This content could not be saved as a new revision. It may already be current.');
  expect(screen.queryByRole('region', { name: 'Confirmed revision' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Undo last saved change' })).not.toBeInTheDocument();
  expect(onRevisionSaved).not.toHaveBeenCalled();
  expect(onOpen).not.toHaveBeenCalled();
  expect(requestMetabloomSavedWork.mock.calls.map(([request]) => request.action)).toEqual(['list', 'revise']);
});
