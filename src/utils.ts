import type { FetchFn, openai } from 'chatgpt';
import config from 'config';
import pkg from 'https-proxy-agent';
import fetch, { type RequestInfo, type RequestInit } from 'node-fetch';
import {
  Config,
  APIOfficialOptions,
  APIUnofficialOptions,
} from './types';
const { HttpsProxyAgent } = pkg;

function loadConfig(): Config {
  function tryGet<T>(key: string): T | undefined {
    if (!config.has(key)) {
      return undefined;
    } else {
      return config.get<T>(key);
    }
  }

  let fetchFn: FetchFn | undefined = undefined;
  const proxy = tryGet<string>('proxy') || process.env.http_proxy;
  if (proxy) {
    const proxyAgent = new HttpsProxyAgent(proxy);
    fetchFn = ((url, opts) =>
      fetch(
        url as RequestInfo,
        { ...opts, agent: proxyAgent } as RequestInit
      )) as FetchFn;
  }

  const apiType = config.get<'official' | 'unofficial'>('chatgpt.type');
  let apiOfficialCfg: APIOfficialOptions | undefined;
  let apiUnofficialCfg: APIUnofficialOptions | undefined;
  if (apiType == 'official') {
    apiOfficialCfg = {
      apiKey: config.get<string>('chatgpt.apiKey'),
      apiBaseUrl: tryGet<string>('chatgpt.apiBaseUrl') || undefined,
      completionParams:
        tryGet<
          Partial<Omit<openai.CreateChatCompletionRequest, 'messages' | 'n'>>
        >('chatgpt.completionParams') || undefined,
      systemMessage: tryGet<string>('chatgpt.systemMessage') || undefined,
      maxModelTokens:
        tryGet<number>('chatgpt.maxModelTokens') || undefined,
      maxResponseTokens:
        tryGet<number>('chatgpt.maxResponseTokens') || undefined,
      timeoutMs: tryGet<number>('chatgpt.timeoutMs') || undefined,
      fetch: fetchFn,
      debug: config.get<number>('debug') >= 2,
    };
  } else if (apiType == 'unofficial') {
    apiUnofficialCfg = {
      accessToken: config.get<string>('chatgpt.accessToken'),
      apiReverseProxyUrl:
        tryGet<string>('chatgpt.apiReverseProxyUrl') || undefined,
      model: tryGet<string>('chatgpt.model') || undefined,
      timeoutMs: tryGet<number>('chatgpt.timeoutMs') || undefined,
      fetch: fetchFn,
      debug: config.get<number>('debug') >= 2,
    };
  } else {
    throw new RangeError('Invalid API type');
  }

  const enableBingChat = tryGet<boolean>('bingchat.enable') ||
    tryGet<string>('bingchat.cookie') !== '';
  const cfg = {
    debug: tryGet<number>('debug') || 1,
    telegram: {
      token: config.get<string>('telegram.token'),
      userIds: tryGet<number[]>('telegram.userIds') || [],
      groupIds: tryGet<number[]>('telegram.groupIds') || [],
      adminIds: tryGet<number[]>('telegram.adminIds') || [],
      chatCmd: tryGet<string>('telegram.chatCmd') || '/chat',
      bingCmd: tryGet<string>('telegram.bingCmd') || '/bing',
    },
    chatgpt: {
      type: apiType,
      official: apiOfficialCfg,
      unofficial: apiUnofficialCfg,
    },
    bingchat: {
      enable: enableBingChat,
      cookie: tryGet<string>('bingchat.cookie') || '',
    },
    proxy: proxy,
  };

  return cfg;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function logWithTime(...args: any[]) {
  console.log(new Date().toLocaleString(), ...args);
}

export { loadConfig, logWithTime };
