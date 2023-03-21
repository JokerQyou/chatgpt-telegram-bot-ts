import TelegramBot from 'node-telegram-bot-api';
import { ChatGPT } from './chatgpt_api';
import { BingChatApi } from './bingchat_api';
import { MessageHandler } from './handlers/message_handler';
import { loadConfig } from './utils';

async function main() {
  const opts = loadConfig();

  // Initialize ChatGPT API.
  const api = new ChatGPT(opts.chatgpt);
  await api.init();
  const bingApi = new BingChatApi(opts.bingchat);
  await bingApi.init();

  // Initialize Telegram Bot and message handler.
  const bot = new TelegramBot(opts.telegram.token, {
    polling: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    request: { proxy: opts.proxy } as any,
  });
  const messageHandler = new MessageHandler(bot, api, bingApi, opts.telegram, opts.debug);
  await messageHandler.init();

  bot.on('message', messageHandler.handle);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
