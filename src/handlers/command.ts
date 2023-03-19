import type TelegramBot from 'node-telegram-bot-api';
import type { ChatGPT } from '../api';
import { BotOptions } from '../types';
import { logWithTime } from '../utils';

class CommandHandler {
  debug: number;
  protected _opts: BotOptions;
  protected _bot: TelegramBot;
  protected _api: ChatGPT;

  constructor(bot: TelegramBot, api: ChatGPT, botOpts: BotOptions, debug = 1) {
    this.debug = debug;
    this._bot = bot;
    this._api = api;
    this._opts = botOpts;
  }

  handle = async (
    msg: TelegramBot.Message,
    command: string,
    isMentioned: boolean,
    botUsername: string
  ) => {
    const userInfo = `@${msg.from?.username ?? ''} (${msg.from?.id})`;
    const chatInfo =
      msg.chat.type == 'private'
        ? 'private chat'
        : `group ${msg.chat.title} (${msg.chat.id})`;
    if (this.debug >= 1) {
      logWithTime(
        `👨‍💻️ User ${userInfo} issued command "${command}" in ${chatInfo} (isMentioned=${isMentioned}).`
      );
    }

    // Ignore commands without mention in groups.
    if (msg.chat.type != 'private' && !isMentioned) return;

    switch (command) {
      case '/help':
        await this._bot.sendMessage(
          msg.chat.id,
          '您可以:\n' +
          '  • 直接发送消息（仅支持私聊）\n' +
          `  • 发送以 ${this._opts.chatCmd} 命令开头的消息\n` +
          '  • 回复我的上一条消息\n\n' +
          '支持的命令:\n' +
          `（在群聊中使用命令需要加上at，例如 /help@${botUsername}）\n` +
          '  • /help 显示帮助\n' +
          '  • /reset 重置当前对话，开始新对话\n'
        );
        break;

      case '/reset':
        await this._bot.sendChatAction(msg.chat.id, 'typing');
        await this._api.resetThread();
        await this._bot.sendMessage(
          msg.chat.id,
          '🔄 对话已重置。可开始新对话。'
        );
        logWithTime(`🔄 Chat thread reset by ${userInfo}.`);
        break;

      default:
        await this._bot.sendMessage(
          msg.chat.id,
          '⚠️ 不支持此命令。使用 /help 查看帮助。'
        );
        break;
    }
  };
}

export { CommandHandler };
