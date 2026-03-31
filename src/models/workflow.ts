export type WorkflowStepCommand = 'plan' | 'exec' | 'verify' | 'complete' | 'custom';

export type WorkflowStepStatus = 'pending' | 'active' | 'completed' | 'skipped';

export type WorkflowStatus = 'in_progress' | 'completed' | 'paused';

export type AgentMode = 'planner' | 'reviewer' | 'balanced';

export interface WorkflowDefinition {
  name: string;
  description?: string;
  steps: WorkflowStepDefinition[];
  isBuiltIn?: boolean;
}

export interface WorkflowStepDefinition {
  id: string;
  name: string;
  description: string;
  order: number;
  command: WorkflowStepCommand;
  customCommand?: string;
  required: boolean;
  nextSteps?: string[];
  agentMode?: AgentMode;
  content?: string;
  argumentHints?: ArgumentHint[];
}

export interface ArgumentHint {
  name: string;
  description: string;
}

export interface WorkflowState {
  workflowId: string;
  definition: WorkflowDefinition;
  taskId: string;
  currentStepIndex: number;
  stepStates: WorkflowStepState[];
  status: WorkflowStatus;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface WorkflowStepState {
  stepId: string;
  status: WorkflowStepStatus;
  startedAt?: string;
  completedAt?: string;
  result?: string;
}

export interface WorkflowDefinitionFile {
  name: string;
  description?: string;
  steps: {
    name: string;
    description?: string;
    command?: string;
    customCommand?: string;
    required?: boolean;
    nextSteps?: string[];
    agentMode?: AgentMode;
    content?: string;
    argumentHints?: { name: string; description: string }[];
  }[];
}

export function createWorkflowId(now = Date.now()): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `wf_${now}_${random}`;
}

export function createWorkflowStepDefId(order: number): string {
  return `wf_step_def_${order}`;
}

export const DEFAULT_WORKFLOW: WorkflowDefinition = {
  name: 'default',
  description: 'Default workflow: Plan → Execute → Verify → Complete',
  steps: [
    {
      id: createWorkflowStepDefId(1),
      name: 'Plan',
      description: 'Generate an implementation plan for the task',
      order: 1,
      command: 'plan',
      required: true,
    },
    {
      id: createWorkflowStepDefId(2),
      name: 'Execute',
      description: 'Execute the plan using an AI agent',
      order: 2,
      command: 'exec',
      required: true,
    },
    {
      id: createWorkflowStepDefId(3),
      name: 'Verify',
      description: 'Verify the implementation against the plan',
      order: 3,
      command: 'verify',
      required: true,
    },
    {
      id: createWorkflowStepDefId(4),
      name: 'Complete',
      description: 'Mark the task as completed',
      order: 4,
      command: 'complete',
      required: true,
    },
  ],
};

export const SDD_AGILE_WORKFLOW: WorkflowDefinition = {
  name: 'agile',
  description:
    'Traycer Agile Workflow: Collaborative, spec-driven development with elicitation and structured handoffs',
  isBuiltIn: true,
  steps: [
    {
      id: createWorkflowStepDefId(1),
      name: 'trigger_workflow',
      description:
        'Initial requirements gathering and clarification. Discuss user request and goals, ask clarifying questions, build shared understanding.',
      order: 1,
      command: 'custom',
      customCommand: 'trigger_workflow',
      required: true,
      agentMode: 'planner',
      nextSteps: ['epic-brief', 'core-flows'],
      content: `# Trigger Workflow Command

<processing_user_request>
The user wants to implement: $1
</processing_user_request>

## Your Task

Discuss the user's request and goals actively. Your objective is to build shared understanding before any artifacts are created.

## Guidelines

1. Ask clarifying questions to understand:
   - What problem are you trying to solve?
   - Who are the affected users?
   - What does success look like?
   - Are there any constraints or requirements?

2. Avoid assumptions - alignment first

3. Do NOT start drafting specs or plans until you have clear understanding

4. Surface any edge cases or edge case handling requirements

## Next Steps

When ready, suggest next steps: epic-brief or core-flows`,
    },
    {
      id: createWorkflowStepDefId(2),
      name: 'epic-brief',
      description:
        'Define problem and context collaboratively. Create concise Epic Brief spec (under 50 lines).',
      order: 2,
      command: 'custom',
      customCommand: 'epic-brief',
      required: true,
      agentMode: 'planner',
      nextSteps: ['core-flows'],
      content: `# Epic Brief Command

<context>
User Request: $1
</context>

## Your Task

Define the problem and context collaboratively with the user.

## Guidelines

1. Capture:
   - Who's affected and current pain points
   - The problem at a product level
   - Desired outcomes

2. Create a concise Epic Brief spec (under 50 lines)

3. Do NOT include UI specifics or technical design yet

4. Focus on the "why" not the "how"

## Epic Brief Template

\`\`\`markdown
# Epic Brief: [Feature Name]

## Problem Statement
[What's the problem we're solving?]

## Who's Affected
[Who experiences this problem?]

## Current Pain Points
- [Pain point 1]
- [Pain point 2]

## Desired Outcome
[What success looks like]

## Success Metrics
- [How we'll measure success]
\`\`\`

## Next Steps

When complete, proceed to core-flows`,
    },
    {
      id: createWorkflowStepDefId(3),
      name: 'core-flows',
      description:
        'Map out user flows and interactions. Explore current product flows, design UX decisions, document user actions.',
      order: 3,
      command: 'custom',
      customCommand: 'core-flows',
      required: true,
      agentMode: 'planner',
      nextSteps: ['tech-plan', 'ticket-breakdown'],
      content: `# Core Flows Command

<context>
Epic Brief: $1
</context>

## Your Task

Map out user flows and interactions based on the epic brief.

## Guidelines

1. Explore current product flows
2. Design UX decisions:
   - Information hierarchy
   - User journeys
3. Document step-by-step user actions
4. Include wireframes or ASCII sketches if helpful

## Flow Documentation Template

\`\`\`markdown
# User Flows: [Feature Name]

## Main User Flow
[Step-by-step flow with numbered steps]

## Alternative Flows
[Any alternative scenarios]

## Key Decisions
[UX decisions made and rationale]

## Edge Cases
[How edge cases are handled]
\`\`\`

## Next Steps

When complete, suggest: tech-plan (for backend-heavy) or ticket-breakdown (for straightforward features)`,
    },
    {
      id: createWorkflowStepDefId(4),
      name: 'tech-plan',
      description:
        'Create technical implementation plan. Define architecture, identify files to modify, document decisions.',
      order: 4,
      command: 'custom',
      customCommand: 'tech-plan',
      required: false,
      agentMode: 'planner',
      nextSteps: ['ticket-breakdown'],
      content: `# Tech Plan Command

<context>
Epic Brief: $1
User Flows: $2
</context>

## Your Task

Create a technical implementation plan.

## Guidelines

1. Define architecture and technical approach
2. Identify files and components to modify
3. Document technical decisions and rationale
4. Reference existing code patterns

## Technical Plan Template

\`\`\`markdown
# Technical Plan: [Feature Name]

## Architecture
[High-level architecture]

## Files to Modify
| File | Changes |
|------|---------|
| [file] | [changes] |

## Technical Decisions
- [Decision 1]: [Rationale]
- [Decision 2]: [Rationale]

## Dependencies
- [External dependency]
- [Internal dependency]

## Risks
- [Risk 1]: [Mitigation]
\`\`\`

## Next Steps

When complete, proceed to ticket-breakdown`,
    },
    {
      id: createWorkflowStepDefId(5),
      name: 'ticket-breakdown',
      description:
        'Break down work into actionable tickets. Create independently implementable tickets with acceptance criteria.',
      order: 5,
      command: 'custom',
      customCommand: 'ticket-breakdown',
      required: true,
      agentMode: 'planner',
      content: `# Ticket Breakdown Command

<context>
Epic Brief: $1
User Flows: $2
Technical Plan: $3 (if available)
</context>

## Your Task

Break down the work into actionable, independently implementable tickets.

## Guidelines

1. Create tickets that can be implemented independently
2. Link tickets to relevant specs
3. Define clear acceptance criteria
4. Prioritize and sequence work

## Ticket Template

\`\`\`markdown
## TICKET: [Ticket Name]

### Description
[Brief description of what to implement]

### Acceptance Criteria
- [ ] [Criterion 1]
- [ ] [Criterion 2]

### Files to Modify
- [file 1]
- [file 2]

### Dependencies
- [Any dependencies on other tickets]
\`\`\`

## Output

Generate a list of tickets that cover the full scope of the epic.`,
    },
  ],
};
