const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const dotenv = require("dotenv");
const config = require("./config");

dotenv.config();

const apiId = Number(process.env.API_ID);
const apiHash = process.env.API_HASH;
const sessionString = process.env.TELEGRAM_SESSION || "";

if (!apiId || !apiHash) {
  throw new Error("Missing API_ID or API_HASH in environment");
}

let client = null;
let initPromise = null;
let botEntityCache = null;

async function initTelegramClient() {
  if (client && client.connected) {
    return client;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    if (!sessionString) {
      throw new Error("TELEGRAM_SESSION not found in environment");
    }

    const stringSession = new StringSession(sessionString);

    client = new TelegramClient(stringSession, apiId, apiHash, {
      connectionRetries: 5
    });

    await client.connect();
    return client;
  })();

  try {
    return await initPromise;
  } finally {
    initPromise = null;
  }
}

async function resolveBotEntity() {
  if (botEntityCache) return botEntityCache;

  const tgClient = await initTelegramClient();

  try {
    botEntityCache = await tgClient.getEntity(config.BOT_USERNAME_FALLBACK);
    return botEntityCache;
  } catch (e) {
    throw new Error("Could not find Telegram bot. Check BOT_USERNAME_FALLBACK in config.js");
  }
}

async function getLastBotMessageId(botEntity) {
  const tgClient = await initTelegramClient();
  const messages = await tgClient.getMessages(botEntity, { limit: 1 });
  if (!messages || messages.length === 0) return 0;
  return messages[0].id || 0;
}

async function waitForBotReply(botEntity, afterMessageId) {
  const tgClient = await initTelegramClient();
  const start = Date.now();

  while (Date.now() - start < config.REPLY_TIMEOUT_MS) {
    const messages = await tgClient.getMessages(botEntity, { limit: 10 });

    const reply = messages.find((msg) => {
      return (
        msg &&
        typeof msg.message === "string" &&
        msg.id > afterMessageId &&
        msg.out === false
      );
    });

    if (reply) {
      return reply.message;
    }

    await new Promise((resolve) => setTimeout(resolve, config.POLL_INTERVAL_MS));
  }

  throw new Error("Bot did not reply in time");
}

async function sendLinkToBot(url) {
  const tgClient = await initTelegramClient();
  const botEntity = await resolveBotEntity();
  const lastMessageId = await getLastBotMessageId(botEntity);

  await tgClient.sendMessage(botEntity, { message: url });

  const replyText = await waitForBotReply(botEntity, lastMessageId);
  return replyText;
}

module.exports = {
  initTelegramClient,
  sendLinkToBot
};