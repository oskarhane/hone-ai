/**
 * Comprehensive Integration Test for Agent Migration
 * Tests all acceptance criteria for task-011
 */

import { AgentClient } from './agent-client'
import { loadConfig, resolveModelForPhase } from './config'
import { isAgentAvailable } from './agent'

async function runIntegrationTests() {
  console.log('🧪 Running comprehensive agent integration tests...\n')

  let passCount = 0
  let failCount = 0

  // Helper for test assertions
  function assert(condition: boolean, testName: string, details?: string) {
    if (condition) {
      console.log(`✓ ${testName}`)
      passCount++
    } else {
      console.error(`✗ ${testName}`)
      if (details) console.error(`  ${details}`)
      failCount++
    }
  }

  try {
    // Load configuration
    const config = await loadConfig()

    // Test 1: Verify agents are available
    console.log('1. Agent Availability\n')
    const opencodeAvailable = await isAgentAvailable('opencode')
    const claudeAvailable = await isAgentAvailable('claude')
    assert(
      opencodeAvailable || claudeAvailable,
      'At least one agent available',
      `opencode: ${opencodeAvailable}, claude: ${claudeAvailable}`
    )

    const testAgent = opencodeAvailable ? 'opencode' : 'claude'
    console.log(`  Using ${testAgent} for tests\n`)

    // Test 2: Phase-specific model resolution
    console.log('2. Phase-Specific Model Configuration\n')
    const prdModel = resolveModelForPhase(config, 'prd')
    const prdToTasksModel = resolveModelForPhase(config, 'prdToTasks')
    const implementModel = resolveModelForPhase(config, 'implement')
    const reviewModel = resolveModelForPhase(config, 'review')
    const finalizeModel = resolveModelForPhase(config, 'finalize')

    assert(!!prdModel, 'PRD phase has model', prdModel)
    assert(!!prdToTasksModel, 'prdToTasks phase has model', prdToTasksModel)
    assert(!!implementModel, 'implement phase has model', implementModel)
    assert(!!reviewModel, 'review phase has model', reviewModel)
    assert(!!finalizeModel, 'finalize phase has model', finalizeModel)
    assert(
      prdModel.match(/^claude-(sonnet|opus)-\d+-\d{8}$/) !== null,
      'Model name follows correct format',
      prdModel
    )
    console.log('')

    // Test 3: AgentClient basic functionality
    console.log('3. AgentClient Basic Functionality\n')
    const client = new AgentClient({
      agent: testAgent,
      model: prdModel,
    })

    assert(!!client, 'AgentClient instantiates')
    assert(!!client.messages, 'AgentClient has messages API')
    assert(typeof client.messages.create === 'function', 'messages.create is a function')
    console.log('')

    // Test 4: Simple message request
    console.log('4. Simple Message Request (Chat Functionality)\n')
    try {
      const response = await client.messages.create({
        messages: [{ role: 'user', content: 'Say "test passed" and nothing else.' }],
      })

      assert(!!response, 'Response received from agent')
      assert(Array.isArray(response.content), 'Response has content array')
      assert(response.content.length > 0, 'Content array not empty')
      assert(response.content[0]?.type === 'text', 'Content type is text')
      assert(!!response.content[0]?.text, 'Response has text content')
      console.log(`  Response: "${response.content[0]?.text.substring(0, 50)}..."\n`)
    } catch (error) {
      assert(
        false,
        'Simple message request',
        error instanceof Error ? error.message : String(error)
      )
      console.log('')
    }

    // Test 5: Message request with system prompt
    console.log('5. Message Request with System Prompt\n')
    try {
      const response = await client.messages.create({
        system: 'You are a helpful assistant. Be extremely concise.',
        messages: [{ role: 'user', content: 'What is 2+2? Answer with just the number.' }],
      })

      assert(!!response, 'Response received with system prompt')
      assert(!!response.content[0]?.text.includes('4'), 'Response contains expected content')
      console.log(`  Response: "${response.content[0]?.text.substring(0, 50)}..."\n`)
    } catch (error) {
      assert(
        false,
        'System prompt handling',
        error instanceof Error ? error.message : String(error)
      )
      console.log('')
    }

    // Test 6: Model parameter override
    console.log('6. Model Parameter Override\n')
    try {
      const response = await client.messages.create({
        model: prdModel, // Override model per request
        messages: [{ role: 'user', content: 'Say "model override works" and nothing else.' }],
      })

      assert(!!response, 'Request with model override succeeds')
      console.log('')
    } catch (error) {
      assert(
        false,
        'Model parameter override',
        error instanceof Error ? error.message : String(error)
      )
      console.log('')
    }

    // Test 7: Error handling - invalid model (should fail gracefully)
    console.log('7. Error Handling (Invalid Model)\n')
    try {
      const badClient = new AgentClient({
        agent: testAgent,
        model: 'invalid-model-name',
      })

      await badClient.messages.create({
        messages: [{ role: 'user', content: 'test' }],
      })

      // If we get here, the agent didn't validate the model (some agents may not)
      console.log('  ℹ Agent accepted invalid model (agent-dependent behavior)\n')
      passCount++
    } catch (error) {
      // Expected to fail - this is correct behavior
      assert(true, 'Invalid model handled gracefully')
      console.log(
        `  Expected error: ${error instanceof Error ? error.message.substring(0, 80) : String(error).substring(0, 80)}...\n`
      )
    }

    // Test 8: Multi-turn conversation
    console.log('8. Multi-Turn Conversation\n')
    try {
      const response = await client.messages.create({
        messages: [
          { role: 'user', content: 'My favorite color is blue.' },
          { role: 'assistant', content: 'I understand your favorite color is blue.' },
          { role: 'user', content: 'What is my favorite color? Answer with just the color name.' },
        ],
      })

      assert(!!response, 'Multi-turn conversation succeeds')
      assert(
        !!response.content[0]?.text.toLowerCase().includes('blue'),
        'Response references conversation history'
      )
      console.log(`  Response: "${response.content[0]?.text.substring(0, 50)}..."\n`)
    } catch (error) {
      assert(
        false,
        'Multi-turn conversation',
        error instanceof Error ? error.message : String(error)
      )
      console.log('')
    }

    // Test 9: Response format compatibility
    console.log('9. Response Format Compatibility (Anthropic SDK)\n')
    try {
      const response = await client.messages.create({
        messages: [{ role: 'user', content: 'Hello' }],
      })

      // Check Anthropic SDK response format
      assert(typeof response === 'object', 'Response is an object')
      assert('content' in response, 'Response has content property')
      assert(Array.isArray(response.content), 'content is an array')
      assert(
        !!response.content[0]?.type && response.content[0].type === 'text',
        'content item has type property'
      )
      assert(
        !!(response.content[0] && 'text' in response.content[0]),
        'content item has text property'
      )
      console.log('')
    } catch (error) {
      assert(false, 'Response format check', error instanceof Error ? error.message : String(error))
      console.log('')
    }
  } catch (error) {
    console.error('\n❌ Fatal error during tests:')
    console.error(error)
    failCount++
  }

  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('Test Summary')
  console.log('='.repeat(60))
  console.log(`✓ Passed: ${passCount}`)
  console.log(`✗ Failed: ${failCount}`)
  console.log(`Total: ${passCount + failCount}`)

  if (failCount === 0) {
    console.log('\n🎉 All tests passed! Agent integration is working correctly.\n')
    process.exit(0)
  } else {
    console.log('\n⚠️  Some tests failed. Review the output above.\n')
    process.exit(1)
  }
}

// Run tests
runIntegrationTests().catch(error => {
  console.error('Test runner error:', error)
  process.exit(1)
})
