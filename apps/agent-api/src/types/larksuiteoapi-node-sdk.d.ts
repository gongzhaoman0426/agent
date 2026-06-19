declare module '@larksuiteoapi/node-sdk' {
  export enum LoggerLevel {
    error = 'error',
    warn = 'warn',
    info = 'info',
    debug = 'debug',
  }

  export class EventDispatcher {
    constructor(params: Record<string, unknown>);
    register<T extends Record<string, (...args: any[]) => any>>(handles: T): this;
  }

  export class WSClient {
    constructor(params: {
      appId: string;
      appSecret: string;
      loggerLevel?: LoggerLevel;
      onReady?: () => void;
      onError?: (error: Error) => void;
      onReconnecting?: () => void;
      onReconnected?: () => void;
    });
    start(params: { eventDispatcher: EventDispatcher }): Promise<void>;
    close(params?: { force?: boolean }): void;
  }
}
