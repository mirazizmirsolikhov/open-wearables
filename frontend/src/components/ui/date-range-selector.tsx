import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export type DateRangeValue = 7 | 30 | 90 | 365;

interface DateRangeSelectorProps {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  className?: string;
}

const labelKeys: Record<DateRangeValue, string> = {
  7: 'dateRange.7d',
  30: 'dateRange.30d',
  90: 'dateRange.90d',
  365: 'dateRange.365d',
};

export function DateRangeSelector({
  value,
  onChange,
  className,
}: DateRangeSelectorProps) {
  const { t } = useTranslation();
  const ranges: DateRangeValue[] = [7, 30, 90, 365];

  return (
    <div
      className={cn(
        'flex items-center gap-1 bg-zinc-800/50 p-1 rounded-lg',
        className
      )}
    >
      {ranges.map((days) => (
        <button
          key={days}
          onClick={() => onChange(days)}
          className={cn(
            'px-2 py-1 text-xs font-medium rounded-md transition-colors',
            value === days
              ? 'bg-zinc-700 text-white'
              : 'text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800'
          )}
        >
          {t(labelKeys[days])}
        </button>
      ))}
    </div>
  );
}
