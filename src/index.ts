#!/usr/bin/env bun
import { Command } from 'commander';
import { loadConfig, ensurePlansDir, resolveAgent, initProject } from './config';
import type { AgentType } from './config';
import { listPrds } from './prds';
import { listIncompleteTaskFiles } from './status';
import { generatePRD } from './prd-generator';
import { generateTasksFromPRD } from './task-generator';

const program = new Command();

// Get command name to avoid auto-init on 'init' command
const isInitCommand = process.argv[2] === 'init';

// Auto-initialize for all commands except 'init'
if (!isInitCommand) {
  ensurePlansDir();
  loadConfig().catch(console.error);
}

program
  .name('hone')
  .description('AI Coding Agent Orchestrator - Orchestrate AI agents to implement features based on PRDs')
  .version('0.1.0');

// Global flags
program.option('--agent <type>', 'Override default agent (opencode or claude)');

// Commands
program
  .command('init')
  .description('Initialize hone in current directory')
  .action(async () => {
    try {
      const result = await initProject();
      
      if (!result.plansCreated && !result.configCreated) {
        console.log('hone is already initialized in this directory.');
        console.log('');
        console.log('  .plans/ directory: exists');
        console.log('  config file: exists');
        return;
      }
      
      console.log('Initialized hone successfully!');
      console.log('');
      
      if (result.plansCreated) {
        console.log('  ✓ Created .plans/ directory');
      } else {
        console.log('  • .plans/ directory already exists');
      }
      
      if (result.configCreated) {
        console.log('  ✓ Created .plans/hone.config.yml');
      } else {
        console.log('  • .plans/hone.config.yml already exists');
      }
      
      console.log('');
      console.log('Next steps:');
      console.log('  1. Install opencode or claude CLI (hone uses agent subprocesses)');
      console.log('  2. Generate a PRD: hone prd "your feature description"');
      console.log('  3. Generate tasks: hone prd-to-tasks .plans/prd-<feature>.md');
      console.log('  4. Execute tasks: hone run .plans/tasks-<feature>.yml -i 5');
    } catch (error) {
      console.error('\n✗ Error initializing hone:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('prds')
  .description('List all PRDs in .plans/ directory')
  .action(async () => {
    const prds = await listPrds();
    
    if (prds.length === 0) {
      console.log('No PRDs found in .plans/');
      console.log('');
      console.log('Create a PRD with: hone prd "your feature description"');
      return;
    }
    
    console.log('PRDs in .plans/');
    console.log('');
    
    for (const prd of prds) {
      console.log(`  .plans/${prd.filename}`);
      console.log(`    Tasks: ${prd.taskFile ? `.plans/${prd.taskFile}` : 'none'}`);
      
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
    const taskFiles = await listIncompleteTaskFiles();
    
    if (taskFiles.length === 0) {
      console.log('No incomplete task lists found.');
      console.log('');
      console.log('All tasks completed! 🎉');
      return;
    }
    
    console.log('Incomplete task lists:');
    console.log('');
    
    for (const taskFile of taskFiles) {
      console.log(`  .plans/${taskFile.filename}`);
      console.log(`    Feature: ${taskFile.feature}`);
      console.log(`    Progress: ${taskFile.completedCount}/${taskFile.totalCount} tasks completed`);
      
      if (taskFile.nextTask) {
        console.log(`    Next: ${taskFile.nextTask.id} - ${taskFile.nextTask.title}`);
      } else {
        console.log(`    Next: (waiting for dependencies)`);
      }
      console.log('');
    }
  });

program
  .command('prd <description>')
  .description('Generate PRD interactively from feature description')
  .action(async (description: string) => {
    try {
      await generatePRD(description);
    } catch (error) {
      console.error('\n✗ Error generating PRD:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('prd-to-tasks <prd-file>')
  .description('Generate task list from PRD file')
  .action(async (prdFile: string) => {
    try {
      await generateTasksFromPRD(prdFile);
    } catch (error) {
      console.error('\n✗ Error generating tasks:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('run <tasks-file>')
  .description('Execute tasks iteratively')
  .requiredOption('-i, --iterations <number>', 'Number of iterations to run')
  .option('--skip <phase>', 'Skip a phase (e.g., review)')
  .action(async (tasksFile: string, options: { iterations: string; skip?: string }) => {
    try {
      const agent = await resolveAgent(program.opts().agent);
      const { executeTasks } = await import('./run');
      await executeTasks({
        tasksFile,
        iterations: parseInt(options.iterations, 10),
        agent,
        skipPhase: options.skip as 'review' | undefined
      });
    } catch (error) {
      console.error('\n✗ Error executing tasks:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();
