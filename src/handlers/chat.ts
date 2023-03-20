import type { ChatMessage as ChatResponseV4 } from 'chatgpt';
import _, { chain } from 'lodash';
import type TelegramBot from 'node-telegram-bot-api';
import telegramifyMarkdown from 'telegramify-markdown';
import type { ChatGPT } from '../api';
import { BotOptions, UsageData } from '../types';
import { logWithTime } from '../utils';
import Queue from 'promise-queue';
import { JSONFile, Low } from 'lowdb';
import { encoding_for_model, Tiktoken } from '@dqbd/tiktoken';
import { join } from 'path';

class ChatHandler {
  debug: number;
  protected _opts: BotOptions;
  protected _bot: TelegramBot;
  protected _api: ChatGPT;
  protected _n_queued = 0;
  protected _n_pending = 0;
  protected _apiRequestsQueue = new Queue(1, Infinity);
  protected _positionInQueue: Record<string, number> = {};
  protected _updatePositionQueue = new Queue(20, Infinity);
  protected _enc: Tiktoken;
  protected _db?: Low<UsageData>;

  constructor(bot: TelegramBot, api: ChatGPT, botOpts: BotOptions, debug = 1) {
    this.debug = debug;
    this._bot = bot;
    this._api = api;
    this._opts = botOpts;
    this._enc = encoding_for_model('gpt-3.5-turbo');
  }

  init = async (db: Low<UsageData>) => {
    this._db = db;
  }

  handle = async (msg: TelegramBot.Message, text: string) => {
    if (!text) return;

    const chatId = msg.chat.id;
    if (this.debug >= 1) {
      const userInfo = `@${msg.from?.username ?? ''} (${msg.from?.id})`;
      const chatInfo =
        msg.chat.type == 'private'
          ? 'private chat'
          : `group ${msg.chat.title} (${msg.chat.id})`;
      logWithTime(`📩 Message from ${userInfo} in ${chatInfo}:\n${text}`);
    }

    // Send a message to the chat acknowledging receipt of their message
    const reply = await this._bot.sendMessage(chatId, '⌛', {
      reply_to_message_id: msg.message_id,
    });

    // add to sequence queue due to chatGPT processes only one request at a time
    const requestPromise = this._apiRequestsQueue.add(() => {
      return this._sendToGpt(text, chatId, reply);
    });
    if (this._n_pending == 0) this._n_pending++;
    else this._n_queued++;
    this._positionInQueue[this._getQueueKey(chatId, reply.message_id)] =
      this._n_queued;

    await this._bot.editMessageText(
      this._n_queued > 0 ? `⌛: 排队中（第${this._n_queued}位）` : '🤔',
      {
        chat_id: chatId,
        message_id: reply.message_id,
      }
    );
    await requestPromise;
  };

  protected _sendToGpt = async (
    text: string,
    chatId: number,
    originalReply: TelegramBot.Message
  ) => {
    let reply = originalReply;
    await this._bot.sendChatAction(chatId, 'typing');

    // Send message to ChatGPT
    try {
      const res = await this._api.sendMessage(
        text,
        _.throttle(
          async (partialResponse: ChatResponseV4) => {
            const resText = (partialResponse as ChatResponseV4).text;
            reply = await this._editMessage(reply, resText);
            await this._bot.sendChatAction(chatId, 'typing');
          },
          3000,
          { leading: true, trailing: false }
        )
      );
      const resText = (res as ChatResponseV4).text;

      let tokenCount = 0;
      tokenCount += this._enc.encode(text, 'all').length;
      tokenCount += this._enc.encode(resText, 'all').length;
      const now = new Date();
      // Store token count
      if (!(chatId in this._db!.data!)) {
        this._db!.data![chatId] = {
          chatgpt: {
            updated: now.getTime() / 1000.0,
            dailyTokens: tokenCount,
            monthlyTokens: tokenCount,
            totalTokens: tokenCount,
          }
        }
      } else {
        const updated = new Date((this._db!.data![chatId].chatgpt.updated || 0) * 1000.0);
        // same day
        if (updated.getUTCMonth() === now.getUTCMonth() && updated.getUTCDate() === now.getUTCDate()) {
          this._db!.data![chatId].chatgpt.dailyTokens += tokenCount;
          this._db!.data![chatId].chatgpt.monthlyTokens += tokenCount;
        } else {
          this._db!.data![chatId].chatgpt.dailyTokens = tokenCount;
          // next day
          if (updated.getUTCMonth() === now.getUTCMonth()) {
            this._db!.data![chatId].chatgpt.monthlyTokens += tokenCount;
          } else { // next month
            this._db!.data![chatId].chatgpt.monthlyTokens = tokenCount;
          }
        }
        this._db!.data![chatId].chatgpt.totalTokens += tokenCount;
        this._db!.data![chatId].chatgpt.updated = now.getTime() / 1000.0;
      }
      await this._db!.write()

      await this._editMessage(reply, resText);

      if (this.debug >= 1) logWithTime(`📨 Response:\n${resText}`);
    } catch (err) {
      logWithTime('⛔️ ChatGPT API error:', (err as Error).message);
      this._bot.sendMessage(
        chatId,
        "⚠️ ChatGPT 接口错误，请稍后重试。"
      );
    }

    // Update queue order after finishing current request
    await this._updateQueue(chatId, reply.message_id);
  };

  // Edit telegram message
  protected _editMessage = async (
    msg: TelegramBot.Message,
    text: string,
    needParse = true
  ) => {
    if (text.trim() == '' || msg.text == text) {
      return msg;
    }
    try {
      text = telegramifyMarkdown(text, 'escape');
      const res = await this._bot.editMessageText(text, {
        chat_id: msg.chat.id,
        message_id: msg.message_id,
        parse_mode: needParse ? 'MarkdownV2' : undefined,
      });
      // type of res is boolean | Message
      if (typeof res === 'object') {
        // return a Message type instance if res is a Message type
        return res as TelegramBot.Message;
      } else {
        // return the original message if res is a boolean type
        return msg;
      }
    } catch (err) {
      logWithTime('⛔️ Edit message error:', (err as Error).message);
      if (this.debug >= 2) logWithTime('⛔️ Message text:', text);
      return msg;
    }
  };

  protected _getQueueKey = (chatId: number, messageId: number) =>
    `${chatId}:${messageId}`;

  protected _parseQueueKey = (key: string) => {
    const [chat_id, message_id] = key.split(':');

    return { chat_id, message_id };
  };

  protected _updateQueue = async (chatId: number, messageId: number) => {
    // delete value for current request
    delete this._positionInQueue[this._getQueueKey(chatId, messageId)];
    if (this._n_queued > 0) this._n_queued--;
    else this._n_pending--;

    for (const key in this._positionInQueue) {
      const { chat_id, message_id } = this._parseQueueKey(key);
      this._positionInQueue[key]--;
      this._updatePositionQueue.add(() => {
        return this._bot.editMessageText(
          this._positionInQueue[key] > 0
            ? `⌛: 排队中（第${this._positionInQueue[key]}位）`
            : '🤔',
          {
            chat_id,
            message_id: Number(message_id),
          }
        );
      });
    }
  };
}

export { ChatHandler };
