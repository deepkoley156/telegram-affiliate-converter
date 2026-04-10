const fs = require("fs");
const path = require("path");
const input = require("input");
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { Api } = require("telegram");
const dotenv = require("dotenv");
const config = require("./config");

dotenv.config();

const sessionDir = path.join(__dirname, "session");
const sessionFile = path.join(sessionDir, "telegram.session");

if (!fs.existsSync(sessionDir)) {
  fs.mkdirSync(sessionDir, { recursive: true });
}

function loadSessionString() {
  if (fs.existsSync(sessionFile)) {
    return fs.readFileSync(sessionFile, "utf8").trim();
  }
  return "";
}

function saveSessionString(sessionString) {
  fs.writeFileSync(sessionFile, sessionString, "utf8");
}

const apiId = Number(process.env.API_ID);
const apiHash = process.env.API_HASH;
const phoneNumber = process.env.PHONE_NUMBER;

if (!apiId || !apiHash || !phoneNumber) {
  throw new Error("Missing API_ID, API_HASH, or PHONE_NUMBER in .env");
}

const stringSession = new StringSession(loadSessionString());
const client = new TelegramClient(stringSession, apiId, apiHash, {
  connectionRetries: 5
});

let initialized = false;

async function initTelegramClient() {
  if (initialized) return client;

  await client.start({
    phoneNumber: async () => phoneNumber,
    password: async () => await input.text("Enter your 2FA password (if any): "),
    phoneCode: async () => await input.text("Enter the OTP from Telegram: "),
    onError: (err) => console.log("Telegram login error:", err)
  });

  saveSessionString(client.session.save());
  initialized = true;

  console.log("Telegram client initialized.");
  return client;
}

async function resolveBotEntity() {
  try {
    return await client.getEntity(config.BOT_USERNAME_FALLBACK);
  } catch (e) {
    throw new Error("Could not find Telegram bot. Check BOT_USERNAME_FALLBACK in config.js");
  }
}

async function getLastBotMessageId(botEntity) {
  const messages = await client.getMessages(botEntity, { limit: 1 });
  if (!messages || messages.length === 0) return 0;
  return messages[0].id || 0;
}

async function waitForBotReply(botEntity, afterMessageId) {
  const start = Date.now();

  while (Date.now() - start < config.REPLY_TIMEOUT_MS) {
    const messages = await client.getMessages(botEntity, { limit: 5 });

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
  await initTelegramClient();

  const botEntity = await resolveBotEntity();
  const lastMessageId = await getLastBotMessageId(botEntity);

  await client.sendMessage(botEntity, { message: url });

  const replyText = await waitForBotReply(botEntity, lastMessageId);
  return replyText;
}

module.exports = {
  initTelegramClient,
  sendLinkToBot
};
