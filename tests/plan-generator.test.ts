import { describe, expect, it } from 'vitest';
import { PlanGenerator } from '../src/services/plan-generator.js';

// ─── Test Instance (no LLM needed for parsing tests) ──────────────────────

function createParser() {
  // We only need the parsePlanResponse method, which doesn't use LLM
  const generator = new PlanGenerator(
    {} as any,
    {} as any,
    '/tmp'
  );
  return generator;
}

// ─── Plan Parsing Tests ───────────────────────────────────────────────────

describe('PlanGenerator', () => {
  describe('parsePlanResponse', () => {
    it('parses a well-formed plan with steps, rationale, and file references', () => {
      const parser = createParser();
      const markdown = `## Rationale
This plan implements user authentication using JWT tokens. The approach uses middleware for route protection.

## Step 1: Create auth middleware
Implement the authentication middleware that verifies JWT tokens from the Authorization header.

Files to modify: \`src/middleware/auth.ts\`, \`src/utils/jwt.ts\`

## Step 2: Add login route
Create a POST /auth/login endpoint that validates credentials and returns a JWT.

Files: \`src/routes/auth.ts\`

## Step 3: Protect routes
Apply auth middleware to protected routes.

Files: \`src/routes/users.ts\`, \`src/routes/posts.ts\`

Symbols referenced: \`AuthService\`, \`UserController\`
`;

      const plan = parser.parsePlanResponse(markdown, 'Add user auth');

      expect(plan.id).toMatch(/^plan_/);
      expect(plan.steps).toHaveLength(3);
      expect(plan.rationale).toContain('JWT tokens');

      // Step 1
      expect(plan.steps[0].id).toBe('step_1');
      expect(plan.steps[0].title).toBe('Create auth middleware');
      expect(plan.steps[0].files).toContain('src/middleware/auth.ts');
      expect(plan.steps[0].files).toContain('src/utils/jwt.ts');

      // Step 2
      expect(plan.steps[1].id).toBe('step_2');
      expect(plan.steps[1].title).toBe('Add login route');
      expect(plan.steps[1].files).toContain('src/routes/auth.ts');

      // Step 3
      expect(plan.steps[2].id).toBe('step_3');
      expect(plan.steps[2].title).toBe('Protect routes');
      expect(plan.steps[2].files).toContain('src/routes/users.ts');
      expect(plan.steps[2].symbols).toContain('AuthService');
      expect(plan.steps[2].symbols).toContain('UserController');
    });

    it('extracts rationale from a Rationale section', () => {
      const parser = createParser();
      const markdown = `## Rationale
We need to refactor the database layer to use connection pooling for better performance under load.

## Step 1: Create connection pool
Files: \`src/db/pool.ts\`
`;

      const plan = parser.parsePlanResponse(markdown, 'Refactor DB');

      expect(plan.rationale).toContain('connection pooling');
      expect(plan.rationale).toContain('better performance');
    });

    it('extracts mermaid diagrams', () => {
      const parser = createParser();
      const markdown = `## Rationale
Multi-step setup.

## Step 1: First
Files: \`a.ts\`

\`\`\`mermaid
graph TD
    Step1["Step 1"] --> Step2["Step 2"]
\`\`\`
`;

      const plan = parser.parsePlanResponse(markdown, 'Test');

      expect(plan.mermaidDiagram).toContain('graph TD');
      expect(plan.mermaidDiagram).toContain('Step1');
    });

    it('handles missing rationale gracefully', () => {
      const parser = createParser();
      const markdown = `## Step 1: Do something
Files: \`a.ts\`
`;

      const plan = parser.parsePlanResponse(markdown, 'Test');

      expect(plan.steps).toHaveLength(1);
      expect(plan.rationale).toBe('');
    });

    it('falls back to single step when no structured steps found', () => {
      const parser = createParser();
      const markdown = `Here is my plan: create a new file called \`auth.ts\` that handles login.`;

      const plan = parser.parsePlanResponse(markdown, 'Add auth');

      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0].title).toBe('Add auth');
      expect(plan.steps[0].description).toContain('auth.ts');
      expect(plan.steps[0].files).toContain('auth.ts');
    });

    it('handles empty response', () => {
      const parser = createParser();
      const plan = parser.parsePlanResponse('', 'Test query');

      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0].title).toBe('Test query');
    });

    it('parses steps with ### (triple hash) headers', () => {
      const parser = createParser();
      const markdown = `### Step 1: First step
Description here.
Files: \`a.ts\`

### Step 2: Second step
More description.
Files: \`b.ts\`
`;

      const plan = parser.parsePlanResponse(markdown, 'Test');

      expect(plan.steps).toHaveLength(2);
      expect(plan.steps[0].title).toBe('First step');
      expect(plan.steps[1].title).toBe('Second step');
    });

    it('parses steps with dash separator', () => {
      const parser = createParser();
      const markdown = `## Step 1 - Create the service
Files: \`svc.ts\`
`;

      const plan = parser.parsePlanResponse(markdown, 'Test');

      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0].title).toBe('Create the service');
    });

    it('parses steps with em dash separator', () => {
      const parser = createParser();
      const markdown = `## Step 1 — Create the service
Files: \`svc.ts\`
`;

      const plan = parser.parsePlanResponse(markdown, 'Test');

      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0].title).toBe('Create the service');
    });

    it('extracts file references from backtick patterns with various extensions', () => {
      const parser = createParser();
      const markdown = `## Step 1: Setup
Files: \`src/index.ts\`, \`config.json\`, \`styles.css\`, \`template.html\`
`;

      const plan = parser.parsePlanResponse(markdown, 'Test');

      expect(plan.steps[0].files).toContain('src/index.ts');
      expect(plan.steps[0].files).toContain('config.json');
      expect(plan.steps[0].files).toContain('styles.css');
      expect(plan.steps[0].files).toContain('template.html');
    });

    it('extracts symbols only for PascalCase names', () => {
      const parser = createParser();
      const markdown = `## Step 1: Implement service
Create \`AuthService\` and \`UserRepository\` classes. Use \`jwt\` for tokens.
`;

      const plan = parser.parsePlanResponse(markdown, 'Test');

      const symbols = plan.steps[0].symbols ?? [];
      expect(symbols).toContain('AuthService');
      expect(symbols).toContain('UserRepository');
      // 'jwt' is lowercase, should not be included
      expect(symbols).not.toContain('jwt');
    });

    it('handles steps without file references', () => {
      const parser = createParser();
      const markdown = `## Rationale
Planning phase.

## Step 1: Research
Research the best approach for the feature.

## Step 2: Design
Design the architecture.
`;

      const plan = parser.parsePlanResponse(markdown, 'Research feature');

      expect(plan.steps).toHaveLength(2);
      expect(plan.steps[0].files).toHaveLength(0);
      expect(plan.steps[1].files).toHaveLength(0);
    });

    it('handles steps without symbols', () => {
      const parser = createParser();
      const markdown = `## Step 1: Update config
Files: \`config.ts\`
No specific symbols needed.
`;

      const plan = parser.parsePlanResponse(markdown, 'Update config');

      expect(plan.steps[0].symbols).toBeUndefined();
    });

    it('creates plan with correct IDs', () => {
      const parser = createParser();
      const markdown = `## Rationale
Test rationale.

## Step 1: First
Files: \`a.ts\`

## Step 2: Second
Files: \`b.ts\`

## Step 3: Third
Files: \`c.ts\`
`;

      const plan = parser.parsePlanResponse(markdown, 'Test');

      expect(plan.id).toMatch(/^plan_/);
      expect(plan.steps[0].id).toBe('step_1');
      expect(plan.steps[1].id).toBe('step_2');
      expect(plan.steps[2].id).toBe('step_3');
    });

    it('has empty iterations array', () => {
      const parser = createParser();
      const plan = parser.parsePlanResponse('## Step 1: Test\nFiles: `a.ts`', 'Test');

      expect(plan.iterations).toEqual([]);
    });
  });
});
