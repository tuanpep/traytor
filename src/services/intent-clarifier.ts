import { LLMService } from '../integrations/llm/llm-service.js';
import { TemplateEngine } from './template-engine.js';
import { getLogger } from '../utils/logger.js';

export interface ClarificationQuestion {
  category: 'business' | 'architecture' | 'performance' | 'security' | 'edge_cases' | 'other';
  question: string;
  reason: string;
}

export interface ClarificationResult {
  questions: ClarificationQuestion[];
  shouldClarify: boolean;
}

export class IntentClarifier {
  private logger = getLogger();

  constructor(
    private readonly llmService: LLMService,
    private readonly templateEngine: TemplateEngine
  ) {}

  async generateClarificationQuestions(
    query: string,
    projectContext: string
  ): Promise<ClarificationResult> {
    this.logger.info('Generating clarification questions for intent');

    const prompt = this.templateEngine.renderClarificationTemplate({
      query,
      projectContext,
    });

    const stepOptions = this.llmService.getStepOptions('planning');
    const response = await this.llmService.complete(prompt, {
      ...stepOptions,
      maxTokens: stepOptions.maxTokens ?? 2048,
    });

    try {
      const questions = this.parseClarificationResponse(response.content);
      return {
        questions,
        shouldClarify: questions.length > 0,
      };
    } catch (error) {
      this.logger.warn(`Failed to parse clarification response: ${error}`);
      return { questions: [], shouldClarify: false };
    }
  }

  private parseClarificationResponse(content: string): ClarificationQuestion[] {
    const questions: ClarificationQuestion[] = [];
    const lines = content.split('\n');
    let currentCategory: ClarificationQuestion['category'] = 'other';
    let currentQuestion = '';
    let currentReason = '';

    for (const line of lines) {
      const trimmed = line.trim();

      const categoryMatch = trimmed.match(
        /^##?\s+(business|architecture|performance|security|edge_cases|other)/i
      );
      if (categoryMatch) {
        if (currentQuestion) {
          questions.push({
            category: currentCategory,
            question: currentQuestion,
            reason: currentReason,
          });
        }
        currentCategory = categoryMatch[1]!.toLowerCase() as ClarificationQuestion['category'];
        currentQuestion = '';
        currentReason = '';
        continue;
      }

      const questionMatch = trimmed.match(/^[-*]\s+Q:\s*(.+)/);
      if (questionMatch) {
        if (currentQuestion) {
          questions.push({
            category: currentCategory,
            question: currentQuestion,
            reason: currentReason,
          });
        }
        currentQuestion = questionMatch[1]!;
        currentReason = '';
        continue;
      }

      const reasonMatch = trimmed.match(/^[-*]\s+Reason:\s*(.+)/);
      if (reasonMatch) {
        currentReason = reasonMatch[1]!;
        continue;
      }
    }

    if (currentQuestion) {
      questions.push({
        category: currentCategory,
        question: currentQuestion,
        reason: currentReason,
      });
    }

    return questions.slice(0, 5);
  }
}
