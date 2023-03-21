import { JSONFile, Low } from 'lowdb';
import type TelegramBot from 'node-telegram-bot-api';
import { join } from 'path';
import type { ChatGPT } from '../chatgpt_api';
import { BingChatApi } from '../bingchat_api';
import { BotOptions, UsageData } from '../types';
import { logWithTime } from '../utils';
import { Authenticator } from './authentication';
import { BingChatHandler } from './bingchat_handler';
import { ChatHandler } from './chatgpt_handler';
import { CommandHandler } from './command_handler';

class MessageHandler {
  debug: number;
  protected _opts: BotOptions;
  protected _bot: TelegramBot;
  protected _botUsername = '';
  protected _api: ChatGPT;
  protected _authenticator: Authenticator;
  protected _commandHandler: CommandHandler;
  protected _bingChatApi: BingChatApi;
  protected _chatHandler: ChatHandler;
  protected _bingHandler: BingChatHandler;
  protected _db: Low<UsageData>;

  constructor(bot: TelegramBot, api: ChatGPT, bingChatApi: BingChatApi, botOpts: BotOptions, debug = 1) {
    this.debug = debug;
    this._bot = bot;
    this._api = api;
    this._opts = botOpts;
    this._authenticator = new Authenticator(bot, botOpts, debug);
    this._commandHandler = new CommandHandler(bot, api, bingChatApi, botOpts, debug);
    this._chatHandler = new ChatHandler(bot, api, botOpts, debug);
    this._bingChatApi = bingChatApi;
    this._bingHandler = new BingChatHandler(bot, bingChatApi, botOpts, debug);
    const adapter = new JSONFile<UsageData>(join(process.cwd(), 'config', 'usage.json'));
    this._db = new Low<UsageData>(adapter);
  }

  init = async () => {
    this._botUsername = (await this._bot.getMe()).username ?? '';
    await this._db.read()
    this._db.data ||= {} as UsageData
    await this._chatHandler.init(this._db)
    await this._commandHandler.init(this._db)
    logWithTime(`🤖 Bot @${this._botUsername} has started...`);
  };

  handle = async (msg: TelegramBot.Message) => {
    if (this.debug >= 2) logWithTime(msg);

    // Authentication.
    if (!(await this._authenticator.authenticate(msg))) return;

    // Parse message.
    const { text, command, isMentioned } = this._parseMessage(msg);
    if (command !== '') {
      if (command === this._opts.bingCmd) {
        await this._bingHandler.handle(msg, text);
      } else {
        await this._commandHandler.handle(
          msg,
          command,
          isMentioned,
          this._botUsername,
        )
      }
    } else {
      // Handles:
      // - direct messages in private chats
      // - replied messages in both private chats and group chats
      // - messages that start with `chatCmd` in private chats and group chats
      await this._chatHandler.handle(msg, text);
    }
  };

  protected _parseMessage = (msg: TelegramBot.Message) => {
    let text = msg.text ?? '';
    let command = '';
    let isMentioned = false;
    if ('entities' in msg) {
      // May have bot commands.
      const regMention = new RegExp(`@${this._botUsername}$`);
      for (const entity of msg.entities ?? []) {
        if (entity.type == 'bot_command' && entity.offset == 0) {
          text = msg.text?.slice(entity.length).trim() ?? '';
          command = msg.text?.slice(0, entity.length) ?? '';
          isMentioned = regMention.test(command);
          command = command.replace(regMention, ''); // Remove the mention.
          break;
        }
      }
    }
    return { text, command, isMentioned };
  };
}

export { MessageHandler };
