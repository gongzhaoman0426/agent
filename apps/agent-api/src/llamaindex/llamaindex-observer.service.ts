import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class LlamaindexObserverService {
  private readonly logger = new Logger('AgentObserver');
  private readonly llmTimings = new Map<string, number>();

  async setupCallbackManager() {
    const { Settings } = await import('llamaindex');
    const cm = Settings.callbackManager;

    cm.on('llm-start', (e) => {
      const { id, messages } = e.detail;
      this.llmTimings.set(id, Date.now());
      this.logger.log(`[LLM:start] msgs=${messages?.length ?? 0}`);
    });

    cm.on('llm-end', (e) => {
      const { id, response } = e.detail;
      const start = this.llmTimings.get(id);
      const elapsed = start ? Date.now() - start : -1;
      this.llmTimings.delete(id);

      const raw = response?.raw as any;
      const usage = raw?.usage;
      const usageStr = usage
        ? ` tokens(in=${usage.input_tokens ?? '?'},out=${usage.output_tokens ?? '?'})`
        : '';

      this.logger.log(`[LLM:end] ${elapsed}ms${usageStr}`);
    });

    cm.on('llm-tool-call', (e) => {
      const { toolCall } = e.detail;
      const inputStr = JSON.stringify(toolCall.input ?? {});
      const truncated = inputStr.length > 300 ? inputStr.slice(0, 300) + '...' : inputStr;
      this.logger.log(`[Tool:call] name=${toolCall.name} input=${truncated}`);
    });

    cm.on('llm-tool-result', (e) => {
      const { toolCall, toolResult } = e.detail;
      const outputStr = typeof toolResult?.output === 'string'
        ? toolResult.output
        : JSON.stringify(toolResult?.output ?? '');
      const truncated = outputStr.length > 500 ? outputStr.slice(0, 500) + '...' : outputStr;
      this.logger.log(`[Tool:result] name=${toolCall.name} output=${truncated}`);
    });

    cm.on('agent-start', () => {
      this.logger.log('[Agent:start]');
    });

    cm.on('agent-end', () => {
      this.logger.log('[Agent:end]');
    });

    cm.on('retrieve-start', (e) => {
      const query = (e.detail as any)?.query;
      const queryStr = typeof query?.queryStr === 'string'
        ? query.queryStr.slice(0, 100)
        : '';
      this.logger.log(`[Retrieve:start] query="${queryStr}"`);
    });

    cm.on('retrieve-end', (e) => {
      const nodes = (e.detail as any)?.nodes;
      this.logger.log(`[Retrieve:end] nodes=${nodes?.length ?? 0}`);
    });

    this.logger.log('CallbackManager listeners registered');
  }
}
