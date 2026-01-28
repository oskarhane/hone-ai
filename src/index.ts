#!/usr/bin/env bun
import { Command } from 'commander';
import { loadConfig, ensurePlansDir, resolveAgent } from './config';
import type { AgentType } from './config';
import { listPrds } from './prds';

// Ensure .plans directory exists on startup
ensurePlansDir();

// Load config to create default if not exists (but don't await in top level)
loadConfig().catch(console.error);

const program = new Command();

program
  .name('xloop')
  .description('AI Coding Agent Orchestrator - Orchestrate AI agents to implement features based on PRDs')
  .version('0.1.0');

// Global flags
program.option('--agent <type>', 'Override default agent (opencode or claude)');

// Commands
program
  .command('prds')
  .description('List all PRDs in .plans/ directory')
  .action(async () => {
    const prds = await listPrds();
    
    if (prds.length === 0) {
      console.log('No PRDs found in .plans/');
      console.log('');
      console.log('Create a PRD with: xloop prd "your feature description"');
      return;
    }
    
    console.log('PRDs in .plans/');
    console.log('');
    
    for (const prd of prds) {
      console.log(`  ${prd.filename}`);
      console.log(`    Tasks: ${prd.taskFile || 'none'}`);
      
      if (prd.status === 'in progress' && prd.completedCount !== undefined && prd.totalCount !== undefined) {
        console.log(`    Status: ${prd.status} (${prd.completedCount}/${prd.totalCount} completed)`);
      } else {
        console.log(`    Status: ${prd.status}`);
      }
      console.log('');
    }
  });

program
  .command('status')
  .description('Show task status for incomplete task lists')
  .action(async () => {
    const agent = await resolveAgent(program.opts().agent);
    console.log(`Using agent: ${agent}`);
    console.log('Status display - not yet implemented');
  });

program
  .command('prd <description>')
  .description('Generate PRD interactively from feature description')
  .action(async (description: string) => {
    const agent = await resolveAgent(program.opts().agent);
    console.log(`Using agent: ${agent}`);
    console.log('PRD generation - not yet implemented');
    console.log(`Feature: ${description}`);
  });

program
  .command('prd-to-tasks <prd-file>')
  .description('Generate task list from PRD file')
  .action(async (prdFile: string) => {
    const agent = await resolveAgent(program.opts().agent);
    console.log(`Using agent: ${agent}`);
    console.log('Task generation - not yet implemented');
    console.log(`PRD file: ${prdFile}`);
  });

program
  .command('do <tasks-file>')
  .description('Execute tasks iteratively')
  .requiredOption('-i, --iterations <number>', 'Number of iterations to run')
  .option('--skip <phase>', 'Skip a phase (e.g., review)')
  .action(async (tasksFile: string, options: { iterations: string; skip?: string }) => {
    const agent = await resolveAgent(program.opts().agent);
    console.log(`Using agent: ${agent}`);
    console.log('Task execution - not yet implemented');
    console.log(`Tasks file: ${tasksFile}`);
    console.log(`Iterations: ${options.iterations}`);
    if (options.skip) {
      console.log(`Skip: ${options.skip}`);
    }
  });

program.parse();
