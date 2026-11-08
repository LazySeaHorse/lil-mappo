import type { CalloutItem } from '@/store/types';
import { ColorRow, SwitchRow } from '@/components/Inspector/InspectorShared';
import { InspectorSection } from '@/components/Inspector/InspectorSection';
import type { MixedFields } from '@/components/Inspector/mergeValues';

type Connector = CalloutItem['connector'];

/** The line from a callout down to its point on the map. */
export function CalloutConnectorSection({
  connector,
  onChange,
  mixed,
}: {
  connector: Connector;
  onChange: (patch: Partial<Connector>) => void;
  mixed?: MixedFields<Connector>;
}) {
  const visibleMixed = mixed?.has('visible') ?? false;
  return (
    <InspectorSection kind="callout" id="connector">
      <div className="flex flex-col gap-2.5">
        <SwitchRow
          label="Show anchor line"
          checked={connector.visible}
          onChange={(visible) => onChange({ visible })}
          mixed={visibleMixed}
        />
        {connector.visible && !visibleMixed && (
          <ColorRow
            label="Line color"
            value={connector.color}
            onChange={(color) => onChange({ color })}
            mixed={mixed?.has('color')}
          />
        )}
      </div>
    </InspectorSection>
  );
}
