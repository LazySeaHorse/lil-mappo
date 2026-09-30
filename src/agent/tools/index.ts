import '@/annotations/styles/index';
import type { AnyAgentTool } from '../defineTool';
import { getGuide, getItem, getProject, searchPlace } from './read';
import { addBoundary, addCallout, addRoute } from './add';
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
  setPlayhead,
  undoTool,
  redoTool,
] as AnyAgentTool[];
