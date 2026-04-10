const path = require("path");
const express = require("express");
const dotenv = require("dotenv");
const config = require("./config");
const { sendLinkToBot, initTelegramClient } = require("./telegramClient");
const { extractAffiliateLink } = require("./linkParser");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

function isValidHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isAllowedDomain(urlString) {
  try {
    const hostname = new URL(urlString).hostname.toLowerCase();
    return config.ALLOWED_DOMAINS.some((domain) => hostname === domain || hostname.endsWith("." + domain));
  } catch {
    return false;
  }
}

app.post("/api/convert", async (req, res) => {
  try {
    const url = String(req.body.url || "").trim();

    if (!url) {
      return res.status(400).json({
        success: false,
        error: "Product URL is required"
      });
    }

    if (!isValidHttpUrl(url)) {
      return res.status(400).json({
        success: false,
        error: "Invalid URL"
      });
    }

    if (!isAllowedDomain(url)) {
      return res.status(400).json({
        success: false,
        error: "Only Flipkart/Amazon links are allowed"
      });
    }

    const botReply = await sendLinkToBot(url);
    const affiliateLink = extractAffiliateLink(botReply);

    if (!affiliateLink) {
      return res.status(500).json({
        success: false,
        error: "Could not detect affiliate link from bot reply",
        botReply
      });
    }

    return res.json({
      success: true,
      affiliateLink,
      botReply
    });
  } catch (error) {
    console.error("Convert error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Something went wrong"
    });
  }
});

app.get("/api/health", async (req, res) => {
  res.json({
    success: true,
    message: "Server is running"
  });
});

app.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);
  try {
    await initTelegramClient();
  } catch (err) {
    console.log("Telegram client will initialize on first request.");
  }
});
