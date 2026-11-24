import { useId } from 'react';
import { useTranslations } from 'next-intl';

export function ProgressToMoq({ totalUnits, moq }: { totalUnits: number; moq: number }) {
  const t = useTranslations('pool');
  const pct = moq > 0 ? Math.min(100, Math.floor((totalUnits * 100) / moq)) : 0;
  const toGo = Math.max(0, moq - totalUnits);
  const descriptionId = useId();
  
  return (
    <div>
      <div 
        role="progressbar" 
        aria-valuemin={0} 
        aria-valuemax={moq}
        aria-valuenow={totalUnits}
        aria-describedby={descriptionId}
        aria-label={t('progressLabel')} 
        className="h-3 w-full overflow-hidden rounded-full bg-neutral-200"
      >
        <div className="h-full bg-emerald-700" style={{ width: `${pct}%` }} />
      </div>
      <p id={descriptionId} className="mt-1 text-sm text-neutral-700">
        {toGo > 0 
          ? `${t('progress', { count: totalUnits, moq })} · ${t('toGo', { count: toGo })}`
          : t('reached')}
      </p>
    </div>
  );
}
