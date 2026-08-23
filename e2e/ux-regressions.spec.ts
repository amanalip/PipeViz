import { expect, test } from '@playwright/test'

async function loadSimpleSample(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Samples ▾' }).click()
  await page.getByRole('listbox').getByRole('option', { name: 'Simple CI' }).click()
  await expect(page.locator('.react-flow__node .stage-card').first()).toBeVisible()
}

test.describe('high-impact UX regressions', () => {
  test('the canvas toolbar does not block the first stage card', async ({ page }) => {
    await loadSimpleSample(page)

    await page.locator('.react-flow__node .stage-card', { hasText: 'Checkout' }).click()

    await expect(page.locator('.details-panel')).toContainText('STAGE · Checkout')
  })

  test('details focus enters the dialog and returns to the selected card', async ({ page }) => {
    await loadSimpleSample(page)
    const build = page.getByRole('group', { name: /Build stage/ })

    await build.click()
    const panel = page.getByRole('dialog', { name: /STAGE · Build/ })
    await expect(panel).toBeFocused()

    await panel.getByRole('button', { name: 'Close details panel' }).click()
    await expect(panel).toBeHidden()
    await expect(build).toBeFocused()
  })

  test('session draft recovers after reload without a share hash', async ({ page }) => {
    await page.goto('/')
    const editor = page.locator('.cm-content')
    await editor.click()
    await page.keyboard.type("pipeline { stages { stage('Recovered') {} } }")

    page.once('dialog', (dialog) => dialog.accept())
    await page.reload()

    await expect(page.locator('.cm-content')).toContainText("stage('Recovered')")
    await expect(page.getByRole('status')).toContainText('Recovered your draft after reload')
  })

  test('close-tab protection applies only to work that diverges from its load', async ({ page }) => {
    await loadSimpleSample(page)
    const unloadState = () =>
      page.evaluate(() => {
        const event = new Event('beforeunload', { cancelable: true })
        return {
          allowed: window.dispatchEvent(event),
          prevented: event.defaultPrevented,
        }
      })

    await expect.poll(unloadState).toEqual({ allowed: true, prevented: false })

    await page.locator('.cm-content').click()
    await page.keyboard.press('End')
    await page.keyboard.type(' // local edit')

    await expect.poll(unloadState).toEqual({ allowed: false, prevented: true })
  })

  test('dismissing an invalid share removes it from the URL permanently', async ({ page }) => {
    await page.goto('/#pv1=%%%')
    const warning = page.getByRole('alert').filter({ hasText: 'invalid or corrupted' })
    await expect(warning).toBeVisible()

    await warning.getByRole('button', { name: 'Dismiss' }).click()

    await expect(warning).toBeHidden()
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('')
    await page.reload()
    await expect(warning).toBeHidden()
  })

  test('leaving an invalid share hash clears its stale warning', async ({ page }) => {
    await page.goto('/#pv1=%%%')
    const warning = page.getByRole('alert').filter({ hasText: 'invalid or corrupted' })
    await expect(warning).toBeVisible()

    await page.evaluate(() => {
      window.location.hash = 'documentation'
    })

    await expect(warning).toBeHidden()
  })

  test('empty editor has concise guidance and disables empty JSON export', async ({ page }) => {
    await page.goto('/')

    await expect(page.locator('.cm-placeholder')).toHaveText(
      'Paste or upload a Jenkinsfile to visualize it.',
    )
    await expect(page.getByRole('button', { name: 'Copy JSON' })).toBeDisabled()
  })

  test('narrow header keeps every primary action visible', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    const header = page.getByRole('navigation', { name: 'Input actions' })

    for (const name of ['Samples ▾', 'Upload', 'Copy JSON', 'Copy link', 'Export PNG', 'Light mode']) {
      await expect(header.getByRole('button', { name })).toBeInViewport()
    }
    await expect(header.getByRole('link', { name: 'GitHub ↗' })).toBeInViewport()
  })

  test('editor divider supports keys, dragging, and reload persistence', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await loadSimpleSample(page)
    const editor = page.locator('.editor-pane')
    const divider = page.getByRole('separator', { name: 'Resize pipeline source editor' })
    const initial = await editor.boundingBox()
    if (!initial) throw new Error('Editor pane not visible')

    await divider.focus()
    await page.keyboard.press('ArrowRight')
    const afterKey = await editor.boundingBox()
    expect(afterKey?.width).toBeGreaterThan(initial.width)

    const dividerBox = await divider.boundingBox()
    if (!dividerBox) throw new Error('Editor divider not visible')
    await page.mouse.move(dividerBox.x + dividerBox.width / 2, dividerBox.y + 100)
    await page.mouse.down()
    await page.mouse.move(dividerBox.x + 600, dividerBox.y + 100, { steps: 8 })
    await page.mouse.up()
    const afterDrag = await editor.boundingBox()
    expect(afterDrag?.width).toBeGreaterThan(afterKey?.width ?? 0)
    await expect(page.locator('.stage-card', { hasText: 'Checkout' })).toBeInViewport()
    await expect(page.locator('.stage-card', { hasText: 'Deploy' })).toBeInViewport()

    await page.setViewportSize({ width: 1000, height: 900 })
    const afterNarrow = await editor.boundingBox()
    await expect
      .poll(async () => {
        const valueNow = Number(await divider.getAttribute('aria-valuenow'))
        const valueMax = Number(await divider.getAttribute('aria-valuemax'))
        return valueNow <= valueMax
      })
      .toBe(true)
    const valueMax = Number(await divider.getAttribute('aria-valuemax'))
    expect(afterNarrow?.width).toBeLessThanOrEqual(valueMax)
    await expect
      .poll(() => page.evaluate(() => Number(localStorage.getItem('pipeviz-editor-width'))))
      .toBeLessThanOrEqual(valueMax)

    await page.reload()
    const afterReload = await editor.boundingBox()
    expect(afterReload?.width).toBeCloseTo(afterNarrow?.width ?? 0, 0)
  })
})
