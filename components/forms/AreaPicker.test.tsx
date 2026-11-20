import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { AreaPicker } from './AreaPicker';

const messages = {
  supplier: {
    offer: {
      areaPicker: {
        stateLabel: 'State',
        statePlaceholder: 'Select state',
        lgaLabel: 'LGA',
        lgaAllOption: 'All LGAs',
        addButton: 'Add',
        selectedAreasLabel: 'Selected areas',
        removeLabel: 'Remove {area}',
        emptyHint: 'No areas selected',
      },
    },
  },
};

function renderPicker(value = [], onChange = vi.fn()) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AreaPicker value={value} onChange={onChange} />
    </NextIntlClientProvider>,
  );
}

describe('AreaPicker', () => {
  it('renders state select and add button', () => {
    renderPicker();
    expect(screen.getByLabelText('State')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
  });

  it('shows LGA select when a state is chosen', () => {
    renderPicker();
    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'LA' } });
    expect(screen.getByLabelText('LGA')).toBeInTheDocument();
  });

  it('calls onChange with whole-state area when no LGA selected', () => {
    const onChange = vi.fn();
    renderPicker([], onChange);
    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'LA' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(onChange).toHaveBeenCalledWith([{ state: 'LA' }]);
  });

  it('calls onChange with state + LGA when LGA selected', () => {
    const onChange = vi.fn();
    renderPicker([], onChange);
    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'LA' } });
    fireEvent.change(screen.getByLabelText('LGA'), { target: { value: 'Ikeja' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(onChange).toHaveBeenCalledWith([{ state: 'LA', lga: 'Ikeja' }]);
  });

  it('renders chips for selected areas', () => {
    renderPicker([{ state: 'LA', lga: 'Ikeja' }, { state: 'FC' }] as never);
    expect(screen.getByText('Lagos – Ikeja')).toBeInTheDocument();
    expect(screen.getByText('FCT (all LGAs)')).toBeInTheDocument();
  });

  it('calls onChange without the removed area when × clicked', () => {
    const onChange = vi.fn();
    renderPicker([{ state: 'LA', lga: 'Ikeja' }] as never, onChange);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Lagos – Ikeja' }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('shows empty hint when no areas selected', () => {
    renderPicker();
    expect(screen.getByText('No areas selected')).toBeInTheDocument();
  });

  it('does not add duplicate areas', () => {
    const onChange = vi.fn();
    renderPicker([{ state: 'LA' }] as never, onChange);
    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'LA' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
