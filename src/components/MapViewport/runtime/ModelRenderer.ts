import type { Map as MapboxMap } from 'mapbox-gl';
import type { ModelItem } from '@/store/types';
import { modelFrame } from '@/models/modelAnimation';
import { modelExtent } from '@/models/modelGeometry';
import {
  getGeoJSONSource,
  LayerPropertyWriter,
  mutateMap,
  noPaintTransitions,
  removeLayerIfPresent,
  removeSourceIfPresent,
} from './mapboxResources';
import type { ModelResolver, ResolvedModel } from './ModelCatalog';

interface PaintCache {
  visible: boolean;
  opacity: number;
  scale: string;
  rotation: string;
  translation: string;
  modelId: string;
}

const createPaintCache = (): PaintCache => ({
  visible: true, opacity: -1, scale: '', rotation: '', translation: '', modelId: '',
});

/** Draws one placed 3D model with a Mapbox model layer, so lighting, terrain and export match the route markers. */
export class ModelRenderer {
  private item: ModelItem;
  private resolved: ResolvedModel | null = null;
  private readonly sourceId: string;
  private readonly layerId: string;
  private readonly layers: LayerPropertyWriter<PaintCache>;
  private lastPosition = '';
  private disposed = false;

  constructor(
    private readonly map: MapboxMap,
    item: ModelItem,
    private readonly resolver: ModelResolver,
  ) {
    this.item = item;
    this.sourceId = `model-source-${item.id}`;
    this.layerId = `model-layer-${item.id}`;
    this.layers = new LayerPropertyWriter(map, createPaintCache);
  }

  mount(): void {
    this.disposed = false;
    this.layers.reset();
    this.lastPosition = '';
    this.ensureResources();
  }

  setItem(item: ModelItem): void {
    if (item.id !== this.item.id) throw new Error('ModelRenderer cannot change item ids');
    const assetChanged = item.assetId !== this.item.assetId;
    this.item = item;
    if (assetChanged) this.ensureResources();
    else this.uploadPosition();
  }

  /** The model's file or metadata changed (relinked, released): look it up again. */
  refresh(): void {
    this.ensureResources();
  }

  render(time: number, { settled = false } = {}): void {
    if (this.disposed || !this.resolved || !this.map.getLayer(this.layerId)) return;
    const frame = modelFrame(this.item, time, { settled });
    const visible = frame !== null && frame.opacity > 0 && frame.scale > 0 && frame.height > 0;
    this.layers.setLayout(this.layerId, 'visibility', visible ? 'visible' : 'none', 'visible', visible);
    if (!visible) return;

    const { altitude, heading, pitch, roll } = this.item;
    const s = this.item.scale * frame.scale;
    const z = s * frame.height;
    const lift = modelExtent(this.resolved.asset.bounds).lift;
    const scale = [s, s, z];
    const rotation = [roll, -pitch, heading];
    const translation = [0, 0, altitude + lift * z];
    this.layers.setPaint(this.layerId, 'model-opacity', frame.opacity, 'opacity', frame.opacity);
    this.layers.setPaint(this.layerId, 'model-scale', scale, 'scale', scale.join());
    this.layers.setPaint(this.layerId, 'model-rotation', rotation, 'rotation', rotation.join());
    this.layers.setPaint(this.layerId, 'model-translation', translation, 'translation', translation.join());
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    removeLayerIfPresent(this.map, this.layerId);
    removeSourceIfPresent(this.map, this.sourceId);
  }

  private ensureResources(): void {
    this.resolved = this.resolver.resolve(this.item.assetId);
    if (!this.resolved) {
      // Missing file: nothing on the map until it is relinked.
      removeLayerIfPresent(this.map, this.layerId);
      removeSourceIfPresent(this.map, this.sourceId);
      this.layers.reset();
      this.lastPosition = '';
      return;
    }
    if (!this.map.getSource(this.sourceId)) {
      this.lastPosition = '';
      this.map.addSource(this.sourceId, { type: 'geojson', data: this.pointData() });
    }
    const { modelId } = this.resolved;
    if (!this.map.getLayer(this.layerId)) {
      this.layers.reset();
      mutateMap(this.map, { operation: 'addLayer', phase: 'setup', resourceId: this.layerId }, () => {
        this.map.addLayer({
          id: this.layerId,
          type: 'model',
          source: this.sourceId,
          layout: { 'model-id': modelId },
          paint: {
            'model-opacity': 1,
            'model-scale': [1, 1, 1],
            'model-rotation': [0, 0, 0],
            'model-translation': [0, 0, 0],
            ...noPaintTransitions('model-opacity', 'model-rotation', 'model-scale', 'model-translation'),
          },
        });
      });
      this.layers.cache.modelId = modelId;
    }
    this.layers.setLayout(this.layerId, 'model-id', modelId, 'modelId', modelId);
    this.uploadPosition();
  }

  private pointData(): GeoJSON.Feature {
    return { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [...this.item.position] } };
  }

  private uploadPosition(): void {
    const key = this.item.position.join();
    if (key === this.lastPosition) return;
    const source = getGeoJSONSource(this.map, this.sourceId);
    if (!source) return;
    source.setData(this.pointData());
    this.lastPosition = key;
  }
}
