import '@/annotations/styles/index';
import type { AnyAgentTool } from '../defineTool';
import { getGuide, getItem, getProject, searchPlace } from './read';
import { addBoundary, addCallout, addRoute } from './add';
import { addCameraKeyframe, frameItems, removeCameraKeyframe, updateCameraKeyframe } from './camera';
import { duplicateItem, removeItem, reorderItems, updateItem } from './edit';
import { redoTool, setPlayhead, undoTool } from './playback';

/** Every tool exposed to agents, in the order they are listed. */
export const ALL_TOOLS = [
  getGuide,
  getProject,
  getItem,
  searchPlace,
  addRoute,
  addBoundary,
  addCallout,
  updateItem,
  removeItem,
  duplicateItem,
  reorderItems,
  addCameraKeyframe,
  updateCameraKeyframe,
  removeCameraKeyframe,
  frameItems,
  setPlayhead,
  undoTool,
  redoTool,
] as AnyAgentTool[];
