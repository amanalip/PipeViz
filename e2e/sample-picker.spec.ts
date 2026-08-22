// ---------------------------------------------------------------------------
// e2e/sample-picker.spec.ts - header "Samples ▾" dropdown (regression specs).
//
// Guards against the reported bug where menu options could not be selected:
// the canvas pane painted above the header's dropdown (both sat at the same
// stacking level, workspace panes later in DOM order), so its transparent
// surface intercepted every click aimed at the hanging menu. The fix
// elevates .app-header; these specs fail if that ever regresses.
// ---------------------------------------------------------------------------

import { test, expect } from '@playwright/test'

test.describe('sample picker dropdown', () => {
  test('clicking an option loads it into the editor and labels the canvas', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Samples ▾' }).click()
    const menu = page.getByRole('listbox', { name: 'Bundled sample pipelines' })
    await expect(menu).toBeVisible()

    await menu.getByRole('option', { name: 'Simple CI' }).click()

    await expect(menu).toBeHidden()
    await expect(page.locator('.cm-content')).toContainText("stage('Build')")
    await expect(page.locator('.canvas-caption')).toHaveText('sample · Simple CI')
    await expect(page.locator('.status-bar')).toContainText('4 stages')
  })

  test('every option is clickable, not just the first', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Samples ▾' }).click()
    const menu = page.getByRole('listbox', { name: 'Bundled sample pipelines' })

    // A mid-list entry: proves hit-testing works along the whole menu body.
    await menu.getByRole('option', { name: 'Matrix Build' }).click()

    await expect(page.locator('.cm-content')).toContainText('matrix')
    await expect(page.locator('.canvas-caption')).toHaveText('sample · Matrix Build')
  })

  test('a picked sample renders stage cards on the canvas', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Samples ▾' }).click()
    await page.getByRole('listbox').getByRole('option', { name: 'Parallel Tests' }).click()

    await expect(page.locator('.react-flow__node .stage-card').first()).toBeVisible()
  })
})

test.describe('stage card selection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Samples ▾' }).click()
    await page.getByRole('listbox').getByRole('option', { name: 'Simple CI' }).click()
    await expect(page.locator('.react-flow__node .stage-card').first()).toBeVisible()
  })

  test('clicking a stage card opens the details panel with its steps', async ({ page }) => {
    await page.locator('.react-flow__node .stage-card', { hasText: 'Build' }).first().click()

    const panel = page.locator('.details-panel')
    await expect(panel).toBeVisible()
    await expect(panel).toContainText('STAGE · Build')
    await expect(panel).toContainText("sh 'make build'")
  })

  test('the selection ring lands on the clicked card and the status bar echoes it', async ({
    page,
  }) => {
    await page.locator('.react-flow__node .stage-card', { hasText: 'Test' }).first().click()

    await expect(
      page.locator('.react-flow__node.selected .stage-card', { hasText: 'Test' }),
    ).toBeVisible()
    await expect(page.locator('.status-bar')).toContainText('selection: Test')

    // Clicking empty canvas drops both ring and panel.
    await page.mouse.click(700, 300)
    await expect(page.locator('.details-panel')).toBeHidden()
  })
})
