import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import MetabloomModelPicker from './MetabloomModelPicker';
import { requestMetabloomModels } from './metabloomModelApiClient';
import { defaultModelPreferences } from './metabloomModelProtocol';
import OrbSection from './OrbSection';
import MetabloomWorkspaceContext from './MetabloomWorkspaceContext';

jest.mock('./metabloomModelApiClient', () => ({ requestMetabloomModels: jest.fn() }));
jest.mock('./MetabloomAvatar', () => () => null);
jest.mock('../contexts/ThemeContext', () => ({ useThemeMode: () => ({ isDark: false }) }));
const preferences = () => ({ provider: 'openai', defaults: { openai: 'gpt-5-mini', deepseek: 'deepseek-flash', anthropic: 'latest' } });
const catalog = () => ({ version: 1, preferences: preferences(), preferencesAvailable: true,
  providers: [['openai', 'gpt-5-mini', 'gpt-6-astra'], ['deepseek', 'deepseek-flash', 'deepseek-pro'], ['anthropic', 'claude-sonnet', 'claude-opus']]
    .map(([id, first, last]) => ({ id, status: 'ready', defaultModel: first, latestModel: last,
      models: [first, last].map(model => ({ id: model, label: model })) })) });
let changed, available;
function Picker(props) {
  const [selection, setSelection] = React.useState(null);
  return <MetabloomModelPicker selection={selection} onChange={value => { setSelection(value); changed(value); }} onAvailability={available} {...props} />;
}
beforeEach(() => { changed = jest.fn(); available = jest.fn(); requestMetabloomModels.mockReset().mockResolvedValue(catalog()); });
const open = async () => {
  await waitFor(() => expect(available).toHaveBeenLastCalledWith(true));
  fireEvent.click(screen.getByRole('button', { name: 'Choose chat model' }));
};

test('restores the account default and switches to each provider’s own saved model', async () => {
  render(<Picker />); await open();
  expect(changed).toHaveBeenCalledWith({ provider: 'openai', model: 'gpt-5-mini' });
  fireEvent.change(screen.getByRole('combobox', { name: 'Model provider' }), { target: { value: 'anthropic' } });
  expect(screen.getByRole('combobox', { name: 'Chat model' })).toHaveValue('latest');
  fireEvent.change(screen.getByRole('combobox', { name: 'Model provider' }), { target: { value: 'deepseek' } });
  expect(screen.getByRole('combobox', { name: 'Chat model' })).toHaveValue('deepseek-flash');
  fireEvent.change(screen.getByRole('combobox', { name: 'Chat model' }), { target: { value: 'deepseek-pro' } });
  fireEvent.click(screen.getByRole('button', { name: 'Use model' }));
  expect(changed).toHaveBeenLastCalledWith({ provider: 'deepseek', model: 'deepseek-pro' });
  expect(requestMetabloomModels).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Choose chat model' })).toHaveFocus();
});
test('saving changes only the chosen provider and claims success only after the receipt', async () => {
  render(<Picker />); await open();
  fireEvent.change(screen.getByRole('combobox', { name: 'Model provider' }), { target: { value: 'anthropic' } });
  let resolve;
  requestMetabloomModels.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  fireEvent.click(screen.getByRole('button', { name: 'Save as provider default' }));
  expect(requestMetabloomModels).toHaveBeenLastCalledWith(expect.objectContaining({ selection: { provider: 'anthropic', model: 'latest' } }));
  expect(screen.queryByText('Default saved for Claude.')).not.toBeInTheDocument();
  await act(async () => resolve({ preferences: { ...preferences(), provider: 'anthropic' } }));
  expect(screen.getByText('Default saved for Claude.')).toBeInTheDocument();
  expect(changed).toHaveBeenLastCalledWith({ provider: 'anthropic', model: 'latest' });
});
test('failed persistence leaves the saved preference untouched and permits a session choice', async () => {
  render(<Picker />); await open();
  fireEvent.change(screen.getByRole('combobox', { name: 'Chat model' }), { target: { value: 'gpt-6-astra' } });
  requestMetabloomModels.mockRejectedValueOnce(new Error('offline'));
  fireEvent.click(screen.getByRole('button', { name: 'Save as provider default' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('could not be confirmed');
  expect(changed).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/Default for this provider:/)).toHaveTextContent('gpt-5-mini');
  expect(screen.getByRole('button', { name: 'Use model' })).toBeEnabled();
});
test('removed models and unconnected providers never silently change the selected provider', async () => {
  const value = catalog(); value.preferences.defaults.openai = 'gpt-retired'; value.providers[2] = { id: 'anthropic', status: 'not_configured', models: [], defaultModel: null, latestModel: null };
  requestMetabloomModels.mockResolvedValueOnce(value); render(<Picker />);
  await waitFor(() => expect(available).toHaveBeenLastCalledWith(false));
  expect(changed).toHaveBeenLastCalledWith({ provider: 'openai', model: 'gpt-retired' });
  fireEvent.click(screen.getByRole('button', { name: 'Choose chat model' }));
  expect(screen.getByRole('alert')).toHaveTextContent('no longer offered');
  expect(screen.getByRole('button', { name: 'Use model' })).toBeDisabled();
  fireEvent.change(screen.getByRole('combobox', { name: 'Model provider' }), { target: { value: 'anthropic' } });
  expect(screen.getByText(/Claude is not connected yet/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save as provider default' })).toBeDisabled();
});
test('a missing preference response requires an explicit choice and does not invent a saved default', async () => {
  requestMetabloomModels.mockResolvedValueOnce({ ...catalog(), preferences: null, preferencesAvailable: false });
  render(<Picker />); await waitFor(() => expect(available).toHaveBeenLastCalledWith(false));
  expect(changed).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Choose chat model' }));
  expect(screen.getByText(/Saved preferences could not load/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Use model' }));
  expect(changed).toHaveBeenLastCalledWith({ provider: defaultModelPreferences().provider, model: 'default' });
});
test('unmount aborts discovery and ignores a late saved preference', async () => {
  let resolve, signal;
  requestMetabloomModels.mockImplementationOnce(options => { signal = options.signal; return new Promise(done => { resolve = done; }); });
  const view = render(<Picker />); view.unmount(); expect(signal.aborted).toBe(true);
  await act(async () => resolve(catalog())); expect(changed).not.toHaveBeenCalled();
});
test('a pending request disables switching without stealing composer focus', async () => {
  const view = render(<><input aria-label="Composer" /><Picker disabled={false} /></>);
  await waitFor(() => expect(available).toHaveBeenLastCalledWith(true));
  screen.getByRole('textbox', { name: 'Composer' }).focus();
  view.rerender(<><input aria-label="Composer" /><Picker disabled /></>);
  expect(screen.getByRole('button', { name: 'Choose chat model' })).toBeDisabled();
  expect(screen.getByRole('textbox', { name: 'Composer' })).toHaveFocus();
});

test('Orb sends the chosen provider, freezes it for the request and applies a switch to the next turn', async () => {
  const requests = [];
  window.__metabloomRequest = jest.fn(value => { requests.push(value); return new Promise(() => {}); });
  try {
    render(<MetabloomWorkspaceContext.Provider value={{}}><OrbSection /></MetabloomWorkspaceContext.Provider>);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Choose chat model' })).toHaveTextContent('gpt-5-mini'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'First question' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Message Metabloom' }));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].modelSelection).toEqual({ provider: 'openai', model: 'gpt-5-mini' });
    expect(screen.getByRole('button', { name: 'Choose chat model' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Stop response' }));
    expect(requests[0].signal.aborted).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Choose chat model' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Model provider' }), { target: { value: 'anthropic' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use model' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Second question' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Message Metabloom' }));
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1].modelSelection).toEqual({ provider: 'anthropic', model: 'latest' });
    expect(requests[0].modelSelection).toEqual({ provider: 'openai', model: 'gpt-5-mini' });
  } finally { delete window.__metabloomRequest; }
});

test('marks the picker with a warning state only while the warning is shown', async () => {
  requestMetabloomModels.mockRejectedValueOnce(new Error('unavailable'));
  const { container } = render(<MetabloomModelPicker selection={null} onChange={jest.fn()} onAvailability={jest.fn()} isActive />);
  const root = container.querySelector('.metabloom-model-picker');
  await waitFor(() => expect(screen.queryByRole('status')).toHaveTextContent('Choose an available model to continue.'));
  expect(root).toHaveAttribute('data-warning', 'true');
});
