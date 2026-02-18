import {
  proxyActivities,
  defineSignal,
  defineQuery,
  setHandler,
  ApplicationFailure,
} from '@temporalio/workflow';

import type { createActivities } from '../activities';

type Activities = ReturnType<typeof createActivities>;

const { resolveTools, resolveAgents } = proxyActivities<Activities>({
  startToCloseTimeout: '1m',
  retry: {
    initialInterval: '1s',
    backoffCoefficient: 2,
    maximumAttempts: 3,
    maximumInterval: '30s',
  },
});

const { executeDslStep } = proxyActivities<Activities>({
  startToCloseTimeout: '5m',
  retry: {
    initialInterval: '1s',
    backoffCoefficient: 2,
    maximumAttempts: 3,
    maximumInterval: '30s',
    nonRetryableErrorTypes: [
      'DSL_VALIDATION_ERROR',
      'TOOL_NOT_FOUND',
      'AGENT_NOT_FOUND',
      'SyntaxError',
    ],
  },
});

const { executeDslStep: executeDslStepLong } =
  proxyActivities<Activities>({
    startToCloseTimeout: '10m',
    heartbeatTimeout: '30s',
    retry: {
      initialInterval: '2s',
      backoffCoefficient: 2,
      maximumAttempts: 2,
      maximumInterval: '1m',
      nonRetryableErrorTypes: [
        'DSL_VALIDATION_ERROR',
        'TOOL_NOT_FOUND',
        'AGENT_NOT_FOUND',
        'SyntaxError',
      ],
    },
  });

// Signals
export const cancelWorkflowSignal = defineSignal('cancelWorkflow');

// Queries
export const currentStepQuery = defineQuery<string>('currentStep');
export const workflowProgressQuery = defineQuery<{
  completedSteps: string[];
  currentStep: string;
  totalSteps: number;
}>('workflowProgress');

interface DslWorkflowInput {
  dsl: any;
  input: any;
  workflowId: string;
  userId?: string;
  context?: any;
}

export async function dslWorkflow(params: DslWorkflowInput): Promise<any> {
  const { dsl, input, workflowId, userId, context = {} } = params;

  let cancelled = false;
  let currentStepName = '';
  const completedSteps: string[] = [];

  setHandler(cancelWorkflowSignal, () => {
    cancelled = true;
  });
  setHandler(currentStepQuery, () => currentStepName);
  setHandler(workflowProgressQuery, () => ({
    completedSteps,
    currentStep: currentStepName,
    totalSteps: dsl.steps?.length || 0,
  }));

  // Phase 1: Validate tools
  const toolNames: string[] = (dsl.tools || []).filter(
    (t: any) => typeof t === 'string',
  );
  await resolveTools({ toolNames, userId });

  // Phase 2: Resolve agents
  const agentConfigs = await resolveAgents({
    agents: dsl.agents || [],
    workflowId,
    userId,
  });

  // Phase 3: Build step map
  const stepMap = new Map<string, { event: string; handle: string }>();
  for (const step of dsl.steps || []) {
    stepMap.set(step.event, step);
  }

  // Phase 4: Execute event chain
  let currentEvent: { type: string; data: any } | null = {
    type: 'WORKFLOW_START',
    data: input,
  };

  const maxIterations = 50;
  let iterations = 0;

  while (
    currentEvent &&
    currentEvent.type !== 'WORKFLOW_STOP' &&
    !cancelled
  ) {
    if (iterations++ >= maxIterations) {
      throw ApplicationFailure.nonRetryable(
        `Workflow exceeded maximum step iterations (${maxIterations})`,
        'MAX_ITERATIONS_EXCEEDED',
      );
    }

    const step = stepMap.get(currentEvent.type);
    if (!step) {
      throw ApplicationFailure.nonRetryable(
        `No step handler found for event: ${currentEvent.type}`,
        'DSL_VALIDATION_ERROR',
      );
    }

    currentStepName = currentEvent.type;

    // Use longer timeout for steps involving agents
    const hasAgentCalls = agentConfigs.some((a) =>
      step.handle.includes(a.name),
    );
    const executeStep = hasAgentCalls ? executeDslStepLong : executeDslStep;

    const nextEvent = await executeStep({
      handleCode: step.handle,
      eventType: currentEvent.type,
      eventData: currentEvent.data,
      context,
      toolNames,
      agentConfigs,
      workflowId,
      userId,
    });

    completedSteps.push(currentEvent.type);
    currentEvent = nextEvent;
  }

  if (cancelled) {
    throw ApplicationFailure.nonRetryable(
      'Workflow was cancelled by user',
      'WORKFLOW_CANCELLED',
    );
  }

  return currentEvent?.data || null;
}
