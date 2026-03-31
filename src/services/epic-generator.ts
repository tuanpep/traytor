import type { Spec, SpecType, Ticket, Workflow, WorkflowStep } from '../models/epic.js';
import { createWorkflowStepId, createTicketId } from '../models/epic.js';
import { LLMService } from '../integrations/llm/llm-service.js';
import { TemplateEngine } from './template-engine.js';
import { ContextManager } from '../core/context-manager.js';
import { getLogger } from '../utils/logger.js';

// ─── Elicitation Types ────────────────────────────────────────────────────

export interface ElicitationQuestion {
  id: string;
  question: string;
  context?: string;
}

export interface ElicitationResponse {
  questionId: string;
  answer: string;
}

export interface ElicitationState {
  query: string;
  round: number;
  maxRounds: number;
  questions: ElicitationQuestion[];
  responses: ElicitationResponse[];
  complete: boolean;
  summary?: string;
}

// ─── Epic Generation Types ───────────────────────────────────────────────

export interface EpicPromptData {
  query: string;
  projectDescription: string;
  projectContext: {
    totalFiles: number;
    totalLines: number;
    languages: Record<string, { files: number; lines: number }>;
  };
  relevantFiles: {
    relativePath: string;
    language: string;
    symbols: string[];
    content: string;
  }[];
  agentsMd: string | null;
  elicitationSummary?: string;
}

export interface SpecGenerationData {
  query: string;
  specType: SpecType;
  elicitationResponses: string[];
  existingSpecs: { type: SpecType; title: string; summary: string }[];
}

export interface TicketGenerationData {
  query: string;
  specs: { id: string; type: SpecType; title: string; content: string }[];
  existingTickets: { title: string; status: string }[];
}

// ─── Epic Generator ──────────────────────────────────────────────────────

export class EpicGenerator {
  private logger = getLogger();

  constructor(
    private readonly llmService: LLMService,
    private readonly templateEngine: TemplateEngine,
    private readonly workingDir: string
  ) {}

  // ─── Elicitation Engine ────────────────────────────────────────────────

  /**
   * Start an elicitation session for a user query.
   * Returns the first set of clarifying questions.
   */
  async startElicitation(query: string, maxRounds = 3): Promise<ElicitationState> {
    this.logger.info(`Starting elicitation for: ${query}`);

    const projectContext = await this.gatherProjectContext();
    const prompt = this.buildElicitationPrompt(query, projectContext, []);

    const response = await this.llmService.complete(prompt, {
      maxTokens: 2048,
      temperature: 0.3,
    });

    const questions = this.parseQuestions(response.content);

    return {
      query,
      round: 1,
      maxRounds,
      questions,
      responses: [],
      complete: questions.length === 0,
      summary: questions.length === 0 ? response.content : undefined,
    };
  }

  /**
   * Continue an elicitation session with user responses.
   * Returns the next set of questions or marks the session as complete.
   */
  async continueElicitation(state: ElicitationState, answers: string[]): Promise<ElicitationState> {
    if (state.complete) {
      return state;
    }

    // Record responses
    for (let i = 0; i < Math.min(answers.length, state.questions.length); i++) {
      state.responses.push({
        questionId: state.questions[i].id,
        answer: answers[i],
      });
    }

    // Check if max rounds reached
    if (state.round >= state.maxRounds) {
      const summary = await this.generateElicitationSummary(state);
      return {
        ...state,
        round: state.round + 1,
        complete: true,
        summary,
      };
    }

    // Generate next questions
    const projectContext = await this.gatherProjectContext();
    const responseHistory = state.responses.map((r) => ({
      question: state.questions.find((q) => q.id === r.questionId)?.question ?? '',
      answer: r.answer,
    }));

    const prompt = this.buildFollowUpElicitationPrompt(
      state.query,
      projectContext,
      responseHistory
    );

    const response = await this.llmService.complete(prompt, {
      maxTokens: 2048,
      temperature: 0.3,
    });

    const parsed = this.parseFollowUpResponse(response.content);

    if (parsed.type === 'complete') {
      return {
        ...state,
        round: state.round + 1,
        complete: true,
        summary: parsed.summary,
        questions: [],
      };
    }

    return {
      ...state,
      round: state.round + 1,
      questions: parsed.questions,
    };
  }

  /**
   * Generate a summary of the elicitation session.
   */
  async generateElicitationSummary(state: ElicitationState): Promise<string> {
    if (state.summary) return state.summary;

    const responseHistory = state.responses.map((r) => ({
      question: state.questions.find((q) => q.id === r.questionId)?.question ?? '',
      answer: r.answer,
    }));

    const prompt = this.buildSummaryPrompt(state.query, responseHistory);

    const response = await this.llmService.complete(prompt, {
      maxTokens: 2048,
      temperature: 0.3,
    });

    return response.content;
  }

  // ─── Spec Generation ───────────────────────────────────────────────────

  /**
   * Generate a spec document using the LLM.
   */
  async generateSpec(data: SpecGenerationData): Promise<string> {
    this.logger.info(`Generating ${data.specType} spec: ${data.query}`);

    const prompt = this.templateEngine.render('epic-spec', {
      query: data.query,
      specType: data.specType,
      elicitationResponses: data.elicitationResponses,
      existingSpecs: data.existingSpecs,
    });

    const response = await this.llmService.complete(prompt, {
      maxTokens: 4096,
    });

    return response.content;
  }

  // ─── Ticket Generation ─────────────────────────────────────────────────

  /**
   * Generate tickets from specs using the LLM.
   */
  async generateTickets(data: TicketGenerationData): Promise<Ticket[]> {
    this.logger.info(`Generating tickets for: ${data.query}`);

    const prompt = this.templateEngine.render('epic-ticket', {
      query: data.query,
      specs: data.specs,
      existingTickets: data.existingTickets,
    });

    const response = await this.llmService.complete(prompt, {
      maxTokens: 4096,
    });

    return this.parseTickets(response.content);
  }

  // ─── Workflow Generation ───────────────────────────────────────────────

  /**
   * Generate a workflow (execution plan) for the epic.
   */
  async generateWorkflow(query: string, specs: Spec[], tickets: Ticket[]): Promise<Workflow> {
    this.logger.info(`Generating workflow for: ${query}`);

    const specSummaries = specs.map((s) => `[${s.type}] ${s.title}`);
    const ticketSummaries = tickets.map((t) => `- ${t.title} (${t.status})`);

    const prompt = `You are a project planner. Given the following epic, generate a workflow with sequential steps.

Epic: ${query}

Specs:
${specSummaries.join('\n')}

Tickets:
${ticketSummaries.join('\n')}

Generate a workflow with 3-8 ordered steps. Each step should represent a logical phase of work.

Respond in the following JSON format only, no other text:
{
  "name": "Workflow Name",
  "steps": [
    { "name": "Step Name", "description": "What this step accomplishes", "order": 1 },
    { "name": "Step Name", "description": "What this step accomplishes", "order": 2 }
  ]
}`;

    const response = await this.llmService.complete(prompt, {
      maxTokens: 2048,
    });

    return this.parseWorkflow(response.content);
  }

  // ─── Prompt Builders ───────────────────────────────────────────────────

  private async gatherProjectContext() {
    const contextManager = new ContextManager();
    return contextManager.gatherWithCodebase(this.workingDir);
  }

  private buildElicitationPrompt(
    query: string,
    context: Awaited<ReturnType<ContextManager['gatherWithCodebase']>>,
    previousResponses: { question: string; answer: string }[]
  ): string {
    const projectInfo = this.buildProjectInfo(context);

    let prompt = `You are a requirements analyst helping to clarify a software project. The user wants to build something and you need to ask focused clarifying questions.

Project Context:
${projectInfo}

User's Request: "${query}"`;

    if (previousResponses.length > 0) {
      prompt += `\n\nPrevious Q&A:\n${previousResponses.map((r) => `Q: ${r.question}\nA: ${r.answer}`).join('\n\n')}`;
    }

    prompt += `

Based on the user's request${previousResponses.length > 0 ? ' and their previous answers' : ''}, generate 2-4 focused clarifying questions to better understand:
1. Scope and boundaries
2. Key requirements and constraints
3. Technical preferences
4. User personas or target audience

For each question, provide brief context about why you're asking.

Respond in the following JSON format only, no other text:
{
  "questions": [
    { "id": "q1", "question": "Your question here?", "context": "Why you're asking this" },
    { "id": "q2", "question": "Your question here?", "context": "Why you're asking this" }
  ]
}`;

    return prompt;
  }

  private buildFollowUpElicitationPrompt(
    query: string,
    context: Awaited<ReturnType<ContextManager['gatherWithCodebase']>>,
    responseHistory: { question: string; answer: string }[]
  ): string {
    const projectInfo = this.buildProjectInfo(context);

    return `You are a requirements analyst. Based on the conversation so far, determine if you have enough information to proceed or if you need more clarification.

Project Context:
${projectInfo}

User's Original Request: "${query}"

Conversation:
${responseHistory.map((r) => `Q: ${r.question}\nA: ${r.answer}`).join('\n\n')}

If you have enough information to understand the requirements, respond with:
{"type": "complete", "summary": "A comprehensive summary of the requirements gathered from the conversation"}

If you need more information, respond with:
{"type": "questions", "questions": [{"id": "qN", "question": "...", "context": "..."}]}

Respond in JSON format only, no other text.`;
  }

  private buildSummaryPrompt(
    query: string,
    responseHistory: { question: string; answer: string }[]
  ): string {
    return `Summarize the following requirements elicitation conversation into a comprehensive requirements summary.

Original Request: "${query}"

Conversation:
${responseHistory.map((r) => `Q: ${r.question}\nA: ${r.answer}`).join('\n\n')}

Provide a clear, structured summary covering:
- Core objective
- Key requirements
- Constraints and preferences
- Suggested scope

Respond in markdown format.`;
  }

  private buildProjectInfo(
    context: Awaited<ReturnType<ContextManager['gatherWithCodebase']>>
  ): string {
    const parts: string[] = [];
    const langSummary = Object.entries(context.summary.languages)
      .map(([lang, info]) => `${lang} (${info.files} files)`)
      .join(', ');
    parts.push(`Languages: ${langSummary}`);
    parts.push(`Total files: ${context.summary.totalFiles}`);
    if (context.packageJson?.name) {
      parts.push(`Project: ${context.packageJson.name}`);
      if (context.packageJson.description) {
        parts.push(`Description: ${context.packageJson.description}`);
      }
    }
    return parts.join('\n');
  }

  // ─── Response Parsers ──────────────────────────────────────────────────

  private parseQuestions(content: string): ElicitationQuestion[] {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return [];

      const parsed = JSON.parse(jsonMatch[0]);
      const questions = parsed.questions ?? [];

      return questions.map((q: { id?: string; question: string; context?: string }) => ({
        id: q.id ?? `q_${Math.random().toString(36).slice(2, 6)}`,
        question: q.question,
        context: q.context,
      }));
    } catch {
      this.logger.warn('Failed to parse elicitation questions from LLM response');
      return [];
    }
  }

  private parseFollowUpResponse(
    content: string
  ):
    | { type: 'questions'; questions: ElicitationQuestion[] }
    | { type: 'complete'; summary: string } {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { type: 'complete', summary: content };
      }

      const parsed = JSON.parse(jsonMatch[0]);

      if (parsed.type === 'complete') {
        return { type: 'complete', summary: parsed.summary ?? content };
      }

      const questions = (parsed.questions ?? []).map(
        (q: { id?: string; question: string; context?: string }) => ({
          id: q.id ?? `q_${Math.random().toString(36).slice(2, 6)}`,
          question: q.question,
          context: q.context,
        })
      );

      return { type: 'questions', questions };
    } catch {
      this.logger.warn('Failed to parse follow-up elicitation response');
      return { type: 'complete', summary: content };
    }
  }

  private parseTickets(content: string): Ticket[] {
    const tickets: Ticket[] = [];

    // Match ## Ticket N: Title or ## Ticket N - Title patterns
    const ticketRegex = /^#{2,3}\s+Ticket\s+(\d+)\s*[-:—]\s*(.+)$/gim;
    let match: RegExpExecArray | null;
    const ticketMatches: { index: number; ticketNum: number; title: string }[] = [];

    while ((match = ticketRegex.exec(content)) !== null) {
      ticketMatches.push({
        index: match.index,
        ticketNum: parseInt(match[1], 10),
        title: match[2].trim(),
      });
    }

    for (let i = 0; i < ticketMatches.length; i++) {
      const current = ticketMatches[i];
      const nextIndex = i + 1 < ticketMatches.length ? ticketMatches[i + 1].index : content.length;
      const block = content.slice(current.index, nextIndex);

      const description = this.extractTicketDescription(block);
      const acceptanceCriteria = this.extractAcceptanceCriteria(block);
      const linkedSpecs = this.extractLinkedSpecs(block);

      tickets.push({
        id: createTicketId(),
        title: current.title,
        description,
        acceptanceCriteria,
        status: 'todo',
        linkedSpecs,
      });
    }

    // If no structured tickets found, treat the whole response as a single ticket
    if (tickets.length === 0) {
      this.logger.warn('No structured tickets found, creating single ticket from response');
      tickets.push({
        id: createTicketId(),
        title: 'Implementation',
        description: content.trim(),
        acceptanceCriteria: [],
        status: 'todo',
        linkedSpecs: [],
      });
    }

    return tickets;
  }

  private extractTicketDescription(block: string): string {
    const lines = block.split('\n').filter((line) => {
      const trimmed = line.trim();
      if (trimmed.match(/^#{2,3}\s+Ticket\s+\d+/i)) return false;
      if (trimmed.match(/^#{1,3}\s+Acceptance\s+Criteria/i)) return false;
      return true;
    });
    return lines.join('\n').trim();
  }

  private extractAcceptanceCriteria(block: string): string[] {
    const criteria: string[] = [];

    // Look for acceptance criteria section
    const acSection = block.match(
      /^#{1,3}\s+Acceptance\s+Criteria\s*\n([\s\S]*?)(?=^#{1,3}\s|$)/gim
    );

    if (acSection) {
      for (const section of acSection) {
        const lines = section.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          // Match list items: - item, * item, 1. item
          const listMatch = trimmed.match(/^[-*\d.)\]]\s+(.+)/);
          if (listMatch) {
            criteria.push(listMatch[1].trim());
          }
        }
      }
    }

    return criteria;
  }

  private extractLinkedSpecs(_block: string): string[] {
    // Specs are linked by ID after creation; parse any explicit references
    void _block;
    return [];
  }

  private parseWorkflow(content: string): Workflow {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { name: 'Default', steps: [] };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const steps: WorkflowStep[] = (parsed.steps ?? []).map(
        (step: { name: string; description: string; order: number }, i: number) => ({
          id: createWorkflowStepId(step.order ?? i + 1),
          name: step.name,
          description: step.description,
          order: step.order ?? i + 1,
        })
      );

      return {
        name: parsed.name ?? 'Epic Workflow',
        steps,
      };
    } catch {
      this.logger.warn('Failed to parse workflow from LLM response');
      return { name: 'Default', steps: [] };
    }
  }
}
