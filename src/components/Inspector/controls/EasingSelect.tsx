import React from 'react';
import type { EasingName } from '@/store/types';
import { EASING_OPTIONS, normalizeEasing } from '../inspectorValues';
import { SelectRow } from './SelectRow';

export function EasingSelect({
  value,
  onChange,
  label = "Motion",
  icon
}: {
  value?: EasingName;
  onChange: (v: EasingName) => void;
  label?: string;
  icon?: React.ReactNode;
}) {
  return (
    <SelectRow label={label} icon={icon} value={normalizeEasing(value)} onChange={onChange} options={EASING_OPTIONS} />
  );
}
