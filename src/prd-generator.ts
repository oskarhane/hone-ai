import { loadConfig, resolveModelForPhase } from './config';
import { readFile, writeFile, readdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import * as readline from 'readline';
import { exitWithError, ErrorMessages } from './errors';
import { AgentClient } from './agent-client';

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

async function analyzeCodebase(): Promise<string> {
  const analysis: string[] = [];
  
  // Check for common files/directories
  const projectRoot = process.cwd();
  
  // Package.json
  if (existsSync(join(projectRoot, 'package.json'))) {
    const pkg = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf-8'));
    analysis.push(`Project: ${pkg.name || 'unnamed'}`);
    
    if (pkg.dependencies) {
      const deps = Object.keys(pkg.dependencies);
      if (deps.includes('react')) analysis.push('Framework: React');
      if (deps.includes('next')) analysis.push('Framework: Next.js');
      if (deps.includes('vue')) analysis.push('Framework: Vue');
      if (deps.includes('typescript')) analysis.push('Language: TypeScript');
    }
  }
  
  // Check directory structure
  const srcExists = existsSync(join(projectRoot, 'src'));
  const componentsExists = existsSync(join(projectRoot, 'src/components')) || 
                           existsSync(join(projectRoot, 'components'));
  
  if (srcExists) analysis.push('Structure: src/ directory');
  if (componentsExists) analysis.push('Has: Components directory');
  
  // Check for testing
  if (existsSync(join(projectRoot, 'jest.config.js')) || 
      existsSync(join(projectRoot, 'vitest.config.ts'))) {
    analysis.push('Testing: Configured');
  }
  
  return analysis.length > 0 ? analysis.join(', ') : 'No specific patterns detected';
}

interface QAResponse {
  question: string | null;
  shouldContinue: boolean;
}

async function askQuestion(prompt: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function generateClarifyingQuestion(
  featureDescription: string,
  codebaseAnalysis: string,
  previousQA: Array<{ question: string; answer: string }>,
  roundNumber: number
): Promise<QAResponse> {
  const config = await loadConfig();
  const model = resolveModelForPhase(config, 'prd');
  
  const client = new AgentClient({ 
    agent: config.defaultAgent,
    model 
  });
  
  const qaHistory = previousQA.map(qa => `Q: ${qa.question}\nA: ${qa.answer}`).join('\n\n');
  
  const systemPrompt = `You are helping generate a Product Requirements Document (PRD) for a software feature.
The user has provided a feature description, and you need to ask clarifying questions to make the PRD comprehensive.

Rules:
- Ask ONE specific, focused question at a time
- Questions should help clarify requirements, scope, UX, technical approach, or edge cases
- Keep questions concise
- If you have enough information to write a good PRD, respond with "DONE" instead of a question
- You are on round ${roundNumber} of maximum 5 rounds

Codebase context: ${codebaseAnalysis}

Feature description: ${featureDescription}

${qaHistory ? `Previous Q&A:\n${qaHistory}` : 'This is the first question.'}`;

  try {
    const response = await client.messages.create({
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: 'What is your next clarifying question, or respond with "DONE" if you have enough information?'
      }],
      system: systemPrompt
    });
    
    const content = response.content[0];
    const text = content && content.type === 'text' ? content.text.trim() : '';
    
    if (text.toUpperCase().includes('DONE') || text === '') {
      return { question: null, shouldContinue: false };
    }
    
    return { question: text, shouldContinue: true };
  } catch (error) {
    const { message, details } = ErrorMessages.NETWORK_ERROR_FINAL(error);
    exitWithError(message, details);
    throw error; // Never reached but satisfies TypeScript
  }
}

async function generatePRDContent(
  featureDescription: string,
  codebaseAnalysis: string,
  qa: Array<{ question: string; answer: string }>
): Promise<{ content: string; featureName: string }> {
  const config = await loadConfig();
  const model = resolveModelForPhase(config, 'prd');
  
  const client = new AgentClient({
    agent: config.defaultAgent,
    model
  });
  
  const qaHistory = qa.map(q => `Q: ${q.question}\nA: ${q.answer}`).join('\n\n');
  
  const systemPrompt = `You are a technical product manager writing a Product Requirements Document (PRD).

Generate a comprehensive PRD with the following structure:

# PRD: <Feature Name>

## Overview
Brief description of the feature and its purpose.

## Goals
What this feature aims to achieve.

## Non-Goals
What is explicitly out of scope.

## Requirements

### Functional Requirements
- REQ-F-001: ...
- REQ-F-002: ...

### Non-Functional Requirements
- REQ-NF-001: ...

## Technical Considerations
Architecture decisions, integration points, potential challenges.

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Out of Scope
Items explicitly not included in this feature.

## Open Questions
Any unresolved questions.

Context:
- Codebase: ${codebaseAnalysis}
- Feature: ${featureDescription}
${qaHistory ? `\n- Q&A Session:\n${qaHistory}` : ''}

Write a complete, detailed PRD following the structure above.`;

  try {
    const response = await client.messages.create({
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: 'Generate the PRD now.'
      }],
      system: systemPrompt
    });
    
    const content = response.content[0];
    const prdContent = content && content.type === 'text' ? content.text : '';
    
    // Extract feature name from the first heading
    const match = prdContent.match(/# PRD: (.+)/);
    const featureName = match && match[1] ? match[1].trim() : featureDescription;
    
    return { content: prdContent, featureName };
  } catch (error) {
    const { message, details } = ErrorMessages.NETWORK_ERROR_FINAL(error);
    exitWithError(message, details);
    throw error; // Never reached but satisfies TypeScript
  }
}

export async function generatePRD(featureDescription: string): Promise<string> {
  console.log('\nAnalyzing codebase...');
  const codebaseAnalysis = await analyzeCodebase();
  console.log(`Found: ${codebaseAnalysis}\n`);
  
  const qa: Array<{ question: string; answer: string }> = [];
  const maxRounds = 5;
  
  console.log('I have a few questions to refine this PRD:\n');
  
  for (let round = 1; round <= maxRounds; round++) {
    const { question, shouldContinue } = await generateClarifyingQuestion(
      featureDescription,
      codebaseAnalysis,
      qa,
      round
    );
    
    if (!shouldContinue || !question) {
      break;
    }
    
    console.log(`${round}. ${question}`);
    const answer = await askQuestion('> ');
    
    if (answer.toLowerCase() === 'done') {
      break;
    }
    
    qa.push({ question, answer });
    console.log('');
  }
  
  console.log('\nGenerating PRD...');
  const { content, featureName } = await generatePRDContent(
    featureDescription,
    codebaseAnalysis,
    qa
  );
  
  const slug = slugify(featureName);
  const filename = `prd-${slug}.md`;
  const filepath = join(process.cwd(), '.plans', filename);
  
  await writeFile(filepath, content, 'utf-8');
  
  console.log(`✓ Saved to .plans/${filename}\n`);
  
  return filename;
}
