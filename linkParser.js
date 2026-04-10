function extractAffiliateLink(text) {
  if (!text) return null;

  const match = text.match(/https?:\/\/[^\s]+/i);
  return match ? match[0].trim() : null;
}

module.exports = {
  extractAffiliateLink
};
