const path = require("path");
const express = require("express");
const dotenv = require("dotenv");
const config = require("./config");
const { sendLinkToBot } = require("./telegramClient");
const { extractAffiliateLink } = require("./linkParser");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

let isConverting = false;

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
    return config.ALLOWED_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith("." + domain)
    );
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

    if (isConverting) {
      return res.status(429).json({
        success: false,
        error: "Another conversion is already running. Please wait a few seconds."
      });
    }

    isConverting = true;

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
  } finally {
    isConverting = false;
  }
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Server is running"
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});