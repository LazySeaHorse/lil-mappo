import { cn } from "@/lib/utils";
import { NumberRow } from './NumberRow';

export function CoordinatesRows({
  lngLat,
  onChange,
  className,
}: {
  lngLat: [number, number];
  onChange: (lngLat: [number, number]) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <NumberRow
        label="Longitude"
        value={lngLat[0]}
        onChange={(lng) => onChange([lng, lngLat[1]])}
        step={0.00001}
        precision={5}
      />
      <NumberRow
        label="Latitude"
        value={lngLat[1]}
        onChange={(lat) => onChange([lngLat[0], lat])}
        step={0.00001}
        precision={5}
      />
    </div>
  );
}
