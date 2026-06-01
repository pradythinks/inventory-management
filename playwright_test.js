const { chromium } = require('playwright')

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  page.setDefaultTimeout(15000)

  const consoleErrors = []
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', err => consoleErrors.push('PAGE ERROR: ' + err.message))

  const pages = [
    { name: 'dashboard', url: 'http://localhost:3000/', selector: '.dashboard, .overview-grid, h1' },
    { name: 'inventory', url: 'http://localhost:3000/inventory', selector: '.inventory-view, table, h1' },
    { name: 'orders', url: 'http://localhost:3000/orders', selector: '.orders-view, table, h1' },
    { name: 'spending', url: 'http://localhost:3000/spending', selector: '.spending-view, .summary-grid, h1' },
    { name: 'demand', url: 'http://localhost:3000/demand', selector: '.demand-view, table, h1' },
    { name: 'restocking', url: 'http://localhost:3000/restocking', selector: '.restocking-view, table, h1' },
    { name: 'reports', url: 'http://localhost:3000/reports', selector: '.reports-view, table, h1' }
  ]

  for (const pg of pages) {
    await page.goto(pg.url, { waitUntil: 'networkidle' })
    try {
      await page.waitForSelector(pg.selector, { timeout: 8000 })
    } catch(e) {
      console.log(`WARN: selector not found on ${pg.name}: ${e.message}`)
    }
    await page.screenshot({ path: `screenshot_${pg.name}.png`, fullPage: true })
    const title = await page.title()
    const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 300))
    console.log(`=== ${pg.name.toUpperCase()} (${pg.url}) ===`)
    console.log('Title:', title)
    console.log('Body text preview:', bodyText.replace(/\n/g, ' | '))
    console.log('')
  }

  console.log('=== CONSOLE ERRORS ===')
  if (consoleErrors.length === 0) {
    console.log('No console errors detected')
  } else {
    consoleErrors.forEach(e => console.log(' -', e))
  }

  await browser.close()
})().catch(e => { console.error('FATAL:', e.message); process.exit(1) })
