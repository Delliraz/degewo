import puppeteer from 'puppeteer';
import fetch from 'node-fetch';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const URL = 'https://www.degewo.de/immosuche';

const DATA_FILE = 'known_ids.json';
const chatIds = ['1100647892', '5165447932']; //

async function sendTelegramMessage(message) {
  for (const chatId of chatIds) {
    try {
      const res = await fetch(`https://api.telegram.org/bot7588994340:AAFs8CVR1nWdn6Cp-8abuq9Ilq5VMzR3Bg0/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML'
        })
      });
      const data = await res.json();
      if (!data.ok) {
        console.error(`Telegram error for chat ${chatId}:`, data.description);
      } else {
        console.log(`Message sent to ${chatId}`);
      }
    } catch (err) {
      console.error(`Failed to send to ${chatId}:`, err);
    }
  }
}

function loadKnownIDs() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE));
  } catch {
    return [];
  }
}

function saveKnownIDs(ids) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(ids, null, 2));
}

async function getCurrentListings() {
  const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});
  const page = await browser.newPage();
  await page.goto(URL, { waitUntil: 'networkidle2' });


  await page.waitForSelector('[id^="immobilie-list-item-"]');

  const listings = await page.evaluate(() => {
    const elements = document.querySelectorAll('[id^="immobilie-list-item-"]')
    console.log(elements)
    return Array.from(elements).map(el => {
      const title = el.querySelector('.article__title')?.innerText || 'Kein Titel';
      const link = el.querySelector('a')?.href || '';
      const warmmieteHtml = el.querySelector('.article__price-tag .price', el => el.innerText.trim());
      const warmmiete = parseFloat(warmmieteHtml.innerHTML.trim().replace('€', '').trim().replace(',', '.'));
      const zimmer = el.querySelector('.article__properties-item .text', spans =>
  spans.find(span => span.innerText.includes('Zimmer'))?.innerText.split(' ')[0] || null).innerText;
      const id = link.split('/').pop(); // Use URL slug as ID
      return { id, title, link, warmmiete, zimmer };
    });
  });

  await browser.close();
  return listings;
}

async function main() {
  
  setInterval(checkListings, 5 * 60 * 1000);

}

async function checkListings() {
    const knownIDs = loadKnownIDs();
  const listings = await getCurrentListings();

  const newListings = listings.filter(l => !knownIDs.includes(l.id) && (l.zimmer.includes(3) || l.zimmer.includes(4)) && l.warmmiete < 850);

  if (newListings.length) {
    for (const item of newListings) {
      const msg = `<b>${item.title}</b>\n<b>${item.warmmiete} €</b>\n<b>${item.zimmer}</b>\n<a href="${item.link}">Ansehen</a>`;
      await sendTelegramMessage(msg);
    }

    const updatedIDs = [...knownIDs, ...newListings.map(l => l.id)];
    saveKnownIDs(updatedIDs);
    console.log(`✅ ${newListings.length} new listing(s) sent.`);
  } else {
    console.log('🔄 No new listings found.');
  }
}

main().catch(console.error);
