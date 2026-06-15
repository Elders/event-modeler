// Factory for the Claude-backed Planner. The panel's composition root calls
// this and adds the result to the Services bundle; swapping in a different LLM
// (or a deterministic parser) is a matter of providing another Planner here.

import type { Planner } from '../../ports/planner';
import { AnthropicPlanner } from './planner';

export function createAnthropicPlanner(): Planner {
  return new AnthropicPlanner();
}
