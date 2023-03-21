import { BingChat, ChatMessage } from 'bing-chat';
import {
  BingChatOptions,
} from './types';
import { logWithTime } from './utils';

class BingChatApi {
  debug: number;
  protected _opts: BingChatOptions;
  protected _api:
    | BingChat
    | undefined;
  protected _context: ChatMessage = {} as ChatMessage;
  protected _timeoutMs: number | undefined;

  constructor(apiOpts: BingChatOptions, debug = 1) {
    this.debug = debug;
    this._opts = apiOpts;
    this._timeoutMs = undefined;
  }

  init = async () => {
    this._api = new BingChat({
      cookie: this._opts.cookie,
      debug: this.debug > 1,
    })
    logWithTime('🔮 BingChat API has started...');
  };

  sendMessage = async (
    text: string,
    onProgress?: (res: ChatMessage) => void
  ) => {
    if (!this._api) return;

    let res: ChatMessage;

    res = await this._api.sendMessage(text, {
      ...this._context,
      onProgress,
    });

    this._context = res;

    return res;
  };

  resetThread = async () => {
    this._context = {} as ChatMessage;
  };
}

export { BingChatApi };
