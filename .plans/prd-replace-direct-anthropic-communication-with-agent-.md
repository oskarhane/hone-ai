# PRD: Replace Direct Anthropic Communication with Agent-Based LLM Communication

## Overview
This feature replaces all direct Anthropic API calls in the codebase with agent-based communication, while maintaining model selection capabilities through phase-specific configuration. The system will route LLM requests through existing agent services instead of making direct API calls to Anthropic, enabling better abstraction and supporting multiple LLM providers through the agent layer.

## Goals
- Eliminate direct Anthropic API calls throughout the codebase
- Route all LLM communication through existing agent services
- Maintain model selection functionality with phase-specific configurations
- Improve code maintainability through better abstraction
- Enable support for multiple LLM providers through agent layer
- Preserve existing chat functionality and user experience

## Non-Goals
- Creating new agent services (will use existing ones)
- Changing the user interface for model selection
- Modifying agent service implementations
- Adding new LLM providers beyond what agents already support
- Performance optimization of agent services

## Requirements

### Functional Requirements
- REQ-F-001: Replace all direct Anthropic API calls with agent service calls
- REQ-F-002: Implement phase-specific model configuration (prd, prd-to-tasks, implement, review, finalize)
- REQ-F-003: Maintain default model configuration (Claude Sonnet) for non-phase-specific operations
- REQ-F-004: Preserve existing chat functionality and message handling
- REQ-F-005: Support streaming responses through agent services
- REQ-F-006: Maintain error handling and retry mechanisms
- REQ-F-007: Pass model selection parameters to agent services
- REQ-F-008: Configure model settings in existing config file following current conventions

### Non-Functional Requirements
- REQ-NF-001: Response latency should remain comparable to direct API calls
- REQ-NF-002: System should handle agent service failures gracefully
- REQ-NF-003: Configuration changes should not require application restart
- REQ-NF-004: Backward compatibility with existing chat sessions
- REQ-NF-005: Logging should capture agent service interactions for debugging

## Technical Considerations

### Architecture Decisions
- Identify and map all current Anthropic API endpoints being used directly
- Route chat completions through appropriate agent services
- Implement configuration layer for phase-specific model selection
- Maintain existing message formatting and response parsing
- Preserve streaming functionality through agent abstraction

### Integration Points
- Chat service integration with agent services
- Configuration service for phase-specific model settings
- Error handling integration with agent service responses
- Logging integration for agent service calls

### Potential Challenges
- Agent service interface compatibility with existing chat flows
- Streaming response handling through agent layer
- Error mapping between agent services and current error handling
- Configuration validation for supported models
- Performance impact of additional abstraction layer

## Acceptance Criteria
- [ ] All direct Anthropic API calls are removed from the codebase
- [ ] Chat functionality works seamlessly through agent services
- [ ] Phase-specific model configurations are implemented and functional
- [ ] Default model (Claude Sonnet) is used for non-phase operations
- [ ] Streaming responses work correctly through agent services
- [ ] Error handling maintains current behavior and user experience
- [ ] Configuration follows existing conventions in config file
- [ ] All existing chat features continue to work without regression
- [ ] Agent service calls include proper model selection parameters
- [ ] System logs agent service interactions appropriately
- [ ] Unused dependencies removed from dependency config

## Out of Scope
- Creating new agent service implementations
- Modifying existing agent service APIs or interfaces
- Adding support for new LLM providers not already supported by agents
- UI changes for model selection interface
- Performance optimization of the agent layer
- Migration of existing chat history or sessions
- Authentication/authorization changes for agent services

## Open Questions
1. Which specific agent service should be used for different types of LLM requests (chat vs. code generation vs. review)? The agent service is selected via --agent. The model should b sonnet by default, but surface errors to users, if any.
2. How should model availability validation work when an agent doesn't support a configured model? Surface error to user.
3. Should there be fallback logic if a phase-specific model fails or is unavailable?
4. How should the system handle rate limiting at the agent service level? Surface errors to users.
5. Are there any specific agent service configuration parameters needed beyond model selection? not sure, check agent docs.
