import type { Map as MapboxMap } from 'mapbox-gl';
import type { ModelItem } from '@/store/types';
import { modelFrame } from '@/models/modelAnimation';
import { modelExtent } from '@/models/modelGeometry';
import {
  getModelSource,
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
  translation: string;
}

const createPaintCache = (): PaintCache => ({
  visible: true, opacity: -1, scale: '', translation: '',
});

/** The one model in a placed model's model source. */
const MODEL = 'model';

/**
 * Draws one placed 3D model with a Mapbox model layer, so lighting, terrain and export match the
 * route markers.
 *
 * The layer draws from a Mapbox model source, never a GeoJSON one, and the model is turned by its
 * `orientation` ([roll, -pitch, heading]), never by `model-rotation`: on a GeoJSON source Mapbox
 * bakes model-rotation into tile buckets, and its globe draw path (drawVectorLayerModels) keeps
 * only the axis of that rotation, so a model was drawn facing north and upright whenever the map
 * was zoomed out to the globe. A model source is placed at draw time from the model's position
 * and orientation and the layer's model-scale, model-translation and model-opacity (drawModels ->
 * calculateModelMatrix), in either projection. See RouteRenderer's vehicleModel.
 */
export class ModelRenderer {
  private item: ModelItem;
  private resolved: ResolvedModel | null = null;
  private readonly sourceId: string;
  private readonly layerId: string;
  private readonly layers: LayerPropertyWriter<PaintCache>;
  /** The model file the source was made with. */
  private modelUrl = '';
  /** Last position and orientation sent to the source. */
  private lastPlacement = '';
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
    this.lastPlacement = '';
    this.ensureResources();
  }

  setItem(item: ModelItem): void {
    if (item.id !== this.item.id) throw new Error('ModelRenderer cannot change item ids');
    const assetChanged = item.assetId !== this.item.assetId;
    this.item = item;
    if (assetChanged) this.ensureResources();
    else this.place();
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

    const s = this.item.scale * frame.scale;
    const z = s * frame.height;
    const lift = modelExtent(this.resolved.asset.bounds).lift;
    const scale = [s, s, z];
    const translation = [0, 0, this.item.altitude + lift * z];
    this.layers.setPaint(this.layerId, 'model-opacity', frame.opacity, 'opacity', frame.opacity);
    this.layers.setPaint(this.layerId, 'model-scale', scale, 'scale', scale.join());
    this.layers.setPaint(this.layerId, 'model-translation', translation, 'translation', translation.join());
    this.place();
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
      this.lastPlacement = '';
      return;
    }
    const { url } = this.resolved;
    // A source left from an older version (GeoJSON) or another file is replaced.
    if (this.map.getSource(this.sourceId) && (!getModelSource(this.map, this.sourceId) || url !== this.modelUrl)) {
      removeLayerIfPresent(this.map, this.layerId);
      removeSourceIfPresent(this.map, this.sourceId);
    }
    if (!this.map.getSource(this.sourceId)) {
      this.modelUrl = url;
      const models = this.models();
      this.map.addSource(this.sourceId, { type: 'model', models });
      this.lastPlacement = JSON.stringify(models);
    }
    if (!this.map.getLayer(this.layerId)) {
      this.layers.reset();
      mutateMap(this.map, { operation: 'addLayer', phase: 'setup', resourceId: this.layerId }, () => {
        this.map.addLayer({
          id: this.layerId,
          type: 'model',
          source: this.sourceId,
          // No model-rotation: the model's orientation turns it (see the class comment).
          paint: {
            'model-opacity': 1,
            'model-scale': [1, 1, 1],
            'model-translation': [0, 0, 0],
            ...noPaintTransitions('model-opacity', 'model-scale', 'model-translation'),
          },
        });
      });
    }
    this.place();
  }

  private models() {
    const { position, heading, pitch, roll } = this.item;
    return {
      [MODEL]: {
        uri: this.modelUrl,
        position: [position[0], position[1]] as [number, number],
        orientation: [roll, -pitch, heading] as [number, number, number],
      },
    };
  }

  /** Moves and turns the model in one write, drawn on the next frame. */
  private place(): void {
    const models = this.models();
    const key = JSON.stringify(models);
    if (key === this.lastPlacement) return;
    const source = getModelSource(this.map, this.sourceId);
    if (!source) return;
    if (mutateMap(this.map, { operation: 'setModels', phase: 'update', resourceId: this.sourceId }, () => {
      source.setModels(models);
      this.map.triggerRepaint();
    })) this.lastPlacement = key;
  }
}
