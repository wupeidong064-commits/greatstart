const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  // 访问前端
  await page.goto('http://localhost:5173');
  await page.waitForTimeout(3000);
  
  console.log('URL:', page.url());
  console.log('Title:', await page.title());
  
  // 检查 localStorage
  const localStorage = await page.evaluate(() => {
    const storage = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      storage[key] = localStorage.getItem(key);
    }
    return storage;
  });
  console.log('LocalStorage keys:', Object.keys(localStorage));
  
  // 获取页面内容摘要
  const bodyText = await page.evaluate(() => {
    return document.body.innerText.substring(0, 800);
  });
  console.log('页面内容:', bodyText);
  
  // 截图
  await page.screenshot({ path: '/tmp/page-check.png' });
  console.log('截图已保存: /tmp/page-check.png');
  
  await page.waitForTimeout(15000);
  await browser.close();
})();
