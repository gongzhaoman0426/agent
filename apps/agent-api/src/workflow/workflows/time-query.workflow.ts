import { workflowId } from '../workflow.decorator';
import { BaseWorkflow, WorkflowDsl } from '../base-workflow';

@workflowId('time-query-workflow-01')
export class TimeQueryWorkflow extends BaseWorkflow {
  readonly name = '智能聊天工作流';
  readonly description = '具备时间查询能力的自动回复机器人';

  getDsl(): WorkflowDsl {
    return {
      id: 'timeQueryWorkflow',
      name: this.name,
      description: this.description,
      version: 'v1',
      tools: ['getCurrentTime'],
      agents: [
        {
          name: 'ChatBot',
          description: '具备时间查询能力的智能聊天机器人',
          prompt: '你是一个友好的智能聊天助手，能够与用户自然对话。你具备查询当前时间的能力，当用户的问题涉及时间时，请调用 getCurrentTime 工具获取准确时间并融入你的回答中。对于其他话题，请正常与用户交流。',
          output: { result: 'string' },
          tools: ['getCurrentTime'],
        },
      ],
      events: [
        { type: 'WORKFLOW_START', data: { input: 'string' } },
        { type: 'WORKFLOW_STOP', data: { result: 'string' } },
      ],
      steps: [
        {
          event: 'WORKFLOW_START',
          handle: `async (event, context) => {
            const response = await ChatBot.run(event.data.input);
            const result = response.data.result;
            return { type: 'WORKFLOW_STOP', data: { result } };
          }`,
        },
      ],
    };
  }
}
