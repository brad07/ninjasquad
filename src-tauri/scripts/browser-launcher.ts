#!/usr/bin/env node
import { chromium } from 'playwright';

const url = process.argv[2];
const headless = process.argv[3] === 'true';

if (!url) {
  console.error('Usage: browser-launcher.ts <url> [headless]');
  process.exit(1);
}

async function launchBrowser() {
  console.log(`[Browser] Launching Chromium${headless ? ' (headless)' : ''} and navigating to ${url}...`);

  try {
    const browser = await chromium.launch({
      headless: headless,
      args: headless ? [] : ['--start-maximized']
    });

    const context = await browser.newContext({
      viewport: null // Use full screen
    });

    const page = await context.newPage();

    // Navigate to the URL
    await page.goto(url, {
      waitUntil: 'networkidle', // Wait for network to be idle
      timeout: 30000 // 30 second timeout
    });

    console.log(`[Browser] Successfully navigated to ${url}`);
    console.log('[Browser] Browser will stay open. Close manually when done.');

    // Keep the script running so the browser stays open
    // The browser will close when the user closes it manually
    await new Promise(() => {}); // Wait indefinitely

  } catch (error) {
    console.error('[Browser] Failed to launch:', error);
    process.exit(1);
  }
}

launchBrowser();
