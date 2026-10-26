import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import MetabloomResearchStatus from './MetabloomResearchStatus';
import { metabloomSourceMediaUrl } from './metabloomSourceMediaProtocol';

const source = { url: 'https://observed.example.test/report', token: 'signed.observed.source' };
const summary = 'Checking the published announcement';

test('shows a publisher icon and canonical hostname only for an actual supplied source', () => {
  const { container } = render(<MetabloomResearchStatus phase="diving" summary={summary} source={source} />);
  expect(screen.getByRole('status', { name: 'Research progress' })).toHaveTextContent(summary);
  expect(screen.getByText('observed.example.test')).toBeInTheDocument();
  const icon = container.querySelector('img');
  expect(icon).toHaveAttribute('src', metabloomSourceMediaUrl(source.token, 'icon'));
  fireEvent.error(icon);
  expect(container.querySelector('img')).toBeNull();
  expect(screen.getByText('observed.example.test')).toBeInTheDocument();
  expect(screen.getByText(summary)).toBeInTheDocument();
});

test.each([undefined, { ...source, token: 'bad/token' }, { ...source, url: 'data:text/plain,not-a-site' },
  { ...source, icon: 'https://untrusted.test/favicon' }])('ignores invalid optional source metadata without suppressing progress', value => {
  const { container } = render(<MetabloomResearchStatus phase="diving" summary={summary} source={value} />);
  expect(screen.getByText(summary)).toBeInTheDocument();
  expect(container.querySelector('img')).toBeNull();
  expect(screen.queryByText('observed.example.test')).not.toBeInTheDocument();
});

test.each([{ phase: 'diving', preview: true }, { phase: 'surfacing' }])('never presents a publisher as checked during a scene preview or surfacing', props => {
  const { container } = render(<MetabloomResearchStatus {...props} summary={summary} source={source} />);
  expect(container.querySelector('img')).toBeNull();
  expect(screen.queryByText('observed.example.test')).not.toBeInTheDocument();
});
