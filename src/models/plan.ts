export interface PlanStep {
  id: string;
  title: string;
  description: string;
  files: string[];
  symbols?: string[];
  codeSnippet?: string;
}

export interface PlanIteration {
  id: string;
  note: string;
  createdAt: string;
}

export interface Plan {
  id: string;
  steps: PlanStep[];
  mermaidDiagram?: string;
  rationale: string;
  iterations: PlanIteration[];
}

export function createPlanId(now = Date.now()): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `plan_${now}_${random}`;
}

export function createPlanStepId(index: number): string {
  return `step_${index + 1}`;
}

export function createPlanIterationId(now = Date.now()): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `iter_${now}_${random}`;
}
