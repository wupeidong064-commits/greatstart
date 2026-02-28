const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  // 清除存储
  await page.goto('http://localhost:5173');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  
  await page.reload();
  await page.waitForTimeout(5000);
  
  console.log('URL:', page.url());
  
  // 获取所有输入框
  const inputs = await page.evaluate(() => {
    const result = [];
    const allInputs = document.querySelectorAll('input');
    allInputs.forEach(input => {
      result.push({
        type: input.type,
        name: input.name,
        id: input.id,
        placeholder: input.placeholder,
        className: input.className
      });
    });
    return result;
  });
  
  console.log('输入框数量:', inputs.length);
  console.log('输入框详情:', JSON.stringify(inputs, null, 2));
  
  await page.waitForTimeout(15000);
  await browser.close();
})();
