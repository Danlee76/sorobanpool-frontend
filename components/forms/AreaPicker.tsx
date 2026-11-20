'use client';

import { useState, useRef, useId } from 'react';
import { useTranslations } from 'next-intl';
import { NIGERIA_STATES, SelectedArea, areaLabel, stateByCode } from '@/lib/areas';

interface AreaPickerProps {
  value: SelectedArea[];
  onChange: (areas: SelectedArea[]) => void;
}

export function AreaPicker({ value, onChange }: AreaPickerProps) {
  const t = useTranslations('supplier.offer.areaPicker');
  const stateSelectId = useId();
  const lgaSelectId = useId();

  const [selectedStateCode, setSelectedStateCode] = useState('');
  const [selectedLga, setSelectedLga] = useState('');
  const addBtnRef = useRef<HTMLButtonElement>(null);

  const chosenState = stateByCode(selectedStateCode);

  function addArea() {
    if (!selectedStateCode) return;
    const area: SelectedArea = selectedLga
      ? { state: selectedStateCode, lga: selectedLga }
      : { state: selectedStateCode };

    const alreadyWholeState = value.some((a) => a.state === selectedStateCode && !a.lga);
    const duplicate = value.some(
      (a) => a.state === selectedStateCode && a.lga === (selectedLga || undefined),
    );
    if (alreadyWholeState || duplicate) return;

    onChange([...value, area]);
    setSelectedLga('');
    setSelectedStateCode('');
  }

  function removeArea(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label htmlFor={stateSelectId} className="text-xs font-medium text-gray-600 dark:text-gray-400">
            {t('stateLabel')}
          </label>
          <select
            id={stateSelectId}
            value={selectedStateCode}
            onChange={(e) => { setSelectedStateCode(e.target.value); setSelectedLga(''); }}
            className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">{t('statePlaceholder')}</option>
            {NIGERIA_STATES.map((s) => (
              <option key={s.code} value={s.code}>{s.name}</option>
            ))}
          </select>
        </div>

        {chosenState && (
          <div className="flex flex-col gap-1">
            <label htmlFor={lgaSelectId} className="text-xs font-medium text-gray-600 dark:text-gray-400">
              {t('lgaLabel')}
            </label>
            <select
              id={lgaSelectId}
              value={selectedLga}
              onChange={(e) => setSelectedLga(e.target.value)}
              className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">{t('lgaAllOption')}</option>
              {chosenState.lgas.map((lga) => (
                <option key={lga} value={lga}>{lga}</option>
              ))}
            </select>
          </div>
        )}

        <button
          ref={addBtnRef}
          type="button"
          onClick={addArea}
          disabled={!selectedStateCode}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {t('addButton')}
        </button>
      </div>

      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={t('selectedAreasLabel')}>
          {value.map((area, idx) => (
            <li
              key={`${area.state}-${area.lga ?? ''}`}
              className="inline-flex items-center gap-1 rounded-full bg-indigo-100 dark:bg-indigo-900 px-3 py-1 text-xs font-medium text-indigo-800 dark:text-indigo-200"
            >
              <span>{areaLabel(area)}</span>
              <button
                type="button"
                onClick={() => removeArea(idx)}
                aria-label={t('removeLabel', { area: areaLabel(area) })}
                className="ml-1 rounded-full p-0.5 hover:bg-indigo-200 dark:hover:bg-indigo-800"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {value.length === 0 && (
        <p className="text-xs text-gray-400">{t('emptyHint')}</p>
      )}
    </div>
  );
}
