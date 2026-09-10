import { Command } from 'commander';
import { sendTelegramMessage } from 'sendkit-core';

const program = new Command();

program
  .name('sendkit')
  .description('CLI for SendKit')
  .command('telegram')
  .description('Send a Telegram message')
  .argument('<chatId>', 'Telegram chat ID')
  .argument('<message>', 'Message text to send')
  .action(async (chatId: string, message: string) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (!token) {
      console.error('Missing TELEGRAM_BOT_TOKEN env variable.')
      process.exit(1);
    }

    if (!chatId) {
      console.error('Missing Telegram chat id.')
      process.exit(1);
    }

    if (!message) {
      console.error('Missing Telegram message text.')
      process.exit(1);
    }

    try {
      const result = await sendTelegramMessage({
        botToken: token,
        chatId,
        message
      })

      console.log(`Sent Telegram message to chat ${result.chatId}`);
      console.log(`Telegram message ID: ${result.messageId}`);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      console.error(`Telegram API request failed: ${detail}`)

      process.exit(1);
    }
  });

  program.parseAsync(process.argv);