const puppeteer = require('puppeteer');
const axios = require('axios');
const fs = require('fs');
const ProgressBar = require('progress');

// Helper function to format bytes as a readable string
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Get URL and output from arguments
const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Usage: node script.js <URL> <output without extension>');
  process.exit(1);
}

const link = args[0];

// Example output: name.js.html
const detectedFullname = link.split(/\/[a-z0-9]{12}\//)[1];
// Example output: name.js
const detectedFilename = detectedFullname.split('.html')[0];
// Example output: js
const detectedExtension = detectedFilename.split('.').at(-1);

const output = !!args?.[1] ? `${args[1]}.${detectedExtension}` : detectedFilename;

// Validate URL
if (!/https:\/\/dosya.co\/[a-z0-9]{12}\/.*\.html/.test(link)) {
  console.error('Invalid URL', 'Example: https://dosya.co/xxxxxxxxxxxx/name.html');
  process.exit(1);
}

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });

  const page = await browser.newPage();

  // Visit the download page
  await page.goto(link, { waitUntil: 'networkidle2' });

  // Get cookies
  const cookies = await page.cookies();

  // Get form data
  const formData = await page.evaluate(() => {
    const formElement = document.querySelector('form[name="F1"]');
    const formData = new FormData(formElement);
    const entries = {};
    for (let [key, value] of formData.entries()) {
      entries[key] = value;
    }
    return entries;
  });

  // Convert cookies and form data into axios request parameters
  const cookieString = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
  const postData = Object.entries(formData).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');

  const response = await axios.post(link, postData, {
    headers: {
      'Cookie': cookieString,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    responseType: 'stream'
  });

  // Initialize progress bar
  const totalBytes = Number(response.headers['content-length']);
  const progressBar = new ProgressBar('Downloading... [:bar] :percent :downloadedSize/:totalSize :etas', {
    width: 40,
    complete: '=',
    incomplete: ' ',
    renderThrottle: 1,
    total: totalBytes
  });

  // Save the response to file and update the progress bar
  const fileStream = fs.createWriteStream(output);
  let downloadedBytes = 0;
  response.data.on('data', (chunk) => {
    downloadedBytes += chunk.length;
    progressBar.tick(chunk.length, {
      downloadedSize: formatBytes(downloadedBytes),
      totalSize: formatBytes(totalBytes)
    });
  }).pipe(fileStream);

  // Close the browser when download is complete
  fileStream.on('finish', async () => {
    console.log(`\nFile saved to ${output}`);
    await browser.close();
  });

})();
