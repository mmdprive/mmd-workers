#!/usr/bin/env node

const assert = require("node:assert/strict");

function normalizeProvider(provider) {
  return String(provider || "").trim().toLowerCase() === "cloudinary" ? "cloudinary" : "none";
}

function hasPortfolioLink(value) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

function resolveSubmission(input) {
  const provider = normalizeProvider(input.provider);
  const portfolioLink = String(input.portfolio_link || input.portfolioLink || "").trim();
  const uploadedCount = Number(input.uploaded_count || input.uploadedCount || 0);
  const expectedCount = Number(input.expected_count || input.expectedCount || 0);
  const telegramFallback = Boolean(input.telegram_fallback || input.telegramFallback);
  const uploadFailed = Boolean(input.upload_failed || input.uploadFailed);

  if (hasPortfolioLink(portfolioLink)) {
    return {
      provider,
      submission_mode: "portfolio_link",
      status: "link_provided",
      notes: [],
    };
  }

  if (telegramFallback) {
    return {
      provider,
      submission_mode: "telegram_pending",
      status: "telegram_pending",
      notes: [buildTelegramPendingMediaNote(input)],
    };
  }

  if (expectedCount > 0 && uploadedCount > 0 && uploadedCount < expectedCount) {
    return {
      provider,
      submission_mode: "telegram_pending",
      status: "partial_uploaded",
      notes: [],
    };
  }

  if (uploadFailed) {
    return {
      provider,
      submission_mode: "telegram_pending",
      status: "upload_failed",
      notes: [],
    };
  }

  return {
    provider,
    submission_mode: "telegram_pending",
    status: "telegram_pending",
    notes: [],
  };
}

function buildTelegramPendingMediaNote(input) {
  const mediaCount = Number(input.media_count || input.mediaCount || 0);
  const suffix = mediaCount > 0 ? ` (${mediaCount} item${mediaCount === 1 ? "" : "s"})` : "";
  return {
    type: "pending_media",
    channel: "telegram",
    status: "telegram_pending",
    text: `Telegram media pending${suffix}.`,
  };
}

function run() {
  assert.equal(normalizeProvider("cloudinary"), "cloudinary");
  assert.equal(normalizeProvider(" Cloudinary "), "cloudinary");
  assert.equal(normalizeProvider("none"), "none");
  assert.equal(normalizeProvider(""), "none");
  assert.equal(normalizeProvider("s3"), "none");

  assert.deepEqual(resolveSubmission({
    provider: "cloudinary",
    portfolio_link: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
    upload_failed: true,
  }), {
    provider: "cloudinary",
    submission_mode: "portfolio_link",
    status: "link_provided",
    notes: [],
  });

  assert.deepEqual(resolveSubmission({
    provider: "none",
    telegram_fallback: true,
    upload_failed: true,
    media_count: 2,
  }), {
    provider: "none",
    submission_mode: "telegram_pending",
    status: "telegram_pending",
    notes: [{
      type: "pending_media",
      channel: "telegram",
      status: "telegram_pending",
      text: "Telegram media pending (2 items).",
    }],
  });

  assert.deepEqual(resolveSubmission({
    provider: "cloudinary",
    uploaded_count: 1,
    expected_count: 3,
    upload_failed: true,
  }), {
    provider: "cloudinary",
    submission_mode: "telegram_pending",
    status: "partial_uploaded",
    notes: [],
  });

  assert.deepEqual(resolveSubmission({
    provider: "none",
    upload_failed: true,
  }), {
    provider: "none",
    submission_mode: "telegram_pending",
    status: "upload_failed",
    notes: [],
  });

  console.log("chat-worker smoke ok: provider, submission_mode, status precedence, fallback note");
}

run();
