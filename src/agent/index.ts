/**
 * Transport-agnostic AI tool layer. A transport (WebMCP, tests, ...) needs:
 *  - getAgentTools(): descriptors with JSON Schema inputs and execute()
 *  - runAgentTool(name, input): validated, gated, evented execution
 *  - useAgentStore: enabled switch and plan limits, driven by the UI
 *  - agentEvents / useAgentEvents: activity feed
 *  - setAgentMapRef / setAgentRuntimeRef: wired by MapStudioEditor
 */
export { getAgentTools, runAgentTool } from './runner';
export { useAgentStore } from './store';
export {
  agentEvents,
  useAgentEvents,
  selectAgentCalls,
  AGENT_EVENT_LOG_LIMIT,
  type AgentEvent,
  type AgentEventPhase,
} from './events';
export { setAgentMapRef, setAgentRuntimeRef, getAgentMap, getAgentRuntime } from './mapRef';
export type {
  AgentToolContent,
  AgentToolDescriptor,
  AgentToolResult,
} from './defineTool';
export { isWebMcpSupported, registerWebMcpTool } from './webmcp';
