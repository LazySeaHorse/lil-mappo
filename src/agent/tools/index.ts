import type { AnyAgentTool } from '../defineTool';
import { redoTool, setPlayhead, undoTool } from './playback';

/** Every tool exposed to agents, in the order they are listed. */
export const ALL_TOOLS: AnyAgentTool[] = [setPlayhead, undoTool, redoTool] as AnyAgentTool[];
