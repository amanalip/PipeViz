// ---------------------------------------------------------------------------
// e2e/empty-state.spec.ts - the how-to card's three input-path chips.
//
// Regression specs for the reported bug where the Paste / Upload / Samples
// pills on the empty-state card were static list items: clicking them did
// nothing at all. Each chip is now a real button with the behavior its
// label promises; these specs fail if any of them ever goes dead again.
// ---------------------------------------------------------------------------

import { test, expect } from '@playwright/test'

test.describe('empty-state input paths', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.empty-state')).toBeVisible()
  })

  test('Paste chip inserts the clipboard contents and renders the graph', async ({
    page,
    browserName,
  }) => {
    // The chip reads the clipboard literally; grant it so readText resolves.
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.evaluate(() =>
      navigator.clipboard.writeText(
        ['pipeline {', '  agent any', '  stages {', '    stage("FromClipboard") {', '      steps {', '        echo "pasted"', '      }', '    }', '  }', '}'].join(
          '\n',
        ),
      ),
    )

    await page.locator('.empty-state').getByRole('button', { name: 'Paste' }).click()

    await expect(page.locator('.cm-content')).toContainText('FromClipboard')
    // The graph follows without touching the editor again.
    await expect(
      page.locator('.react-flow__node .stage-card', { hasText: 'FromClipboard' }),
    ).toBeVisible()
    await expect(page.locator('.empty-state')).toBeHidden()
    // Caret stays live afterwards for immediate typing tweaks.
    if (browserName === 'chromium') {
      await page.keyboard.type(' ')
      await expect(page.locator('.cm-content')).toContainText('echo "pasted" ')
    }
  })

  test('Paste chip falls back to focusing the editor when the clipboard is off limits', async ({
    page,
  }) => {
    const content = page.locator('.cm-content')

    // No permissions granted: readText() rejects headless, so the chip
    // must still hand over a usable caret instead of dying silently.
    // Click elsewhere first so passing proves the chip refocused.
    await page.locator('.empty-state h2').click()
    await expect(content).not.toBeFocused()

    await page.locator('.empty-state').getByRole('button', { name: 'Paste' }).click()

    await expect(content).toBeFocused()
    await page.keyboard.type("stage('X')")
    await expect(content).toContainText("stage('X')")
  })

  test('Upload chip opens a file chooser and the picked file renders', async ({ page }) => {
    const jenkinsfile = [
      'pipeline {',
      '  agent any',
      '  stages {',
      '    stage("FromDisk") {',
      '      steps {',
      '        echo "hi"',
      '      }',
      '    }',
      '  }',
      '}',
    ].join('\n')

    const chooserPromise = page.waitForEvent('filechooser')
    await page.locator('.empty-state').getByRole('button', { name: 'Upload' }).click()
    const chooser = await chooserPromise
    await chooser.setFiles({
      name: 'Jenkinsfile',
      mimeType: 'text/plain',
      buffer: Buffer.from(jenkinsfile, 'utf8'),
    })

    await expect(page.locator('.cm-content')).toContainText('FromDisk')
    await expect(
      page.locator('.react-flow__node .stage-card', { hasText: 'FromDisk' }),
    ).toBeVisible()
    await expect(page.locator('.empty-state')).toBeHidden()
  })

  test('Samples chip drops the menu down and a pick loads the graph', async ({ page }) => {
    await page.locator('.empty-state').getByRole('button', { name: 'Samples' }).click()

    const menu = page.getByRole('listbox', { name: 'Bundled sample pipelines' })
    await expect(menu).toBeVisible()
    await menu.getByRole('option', { name: 'Simple CI' }).click()

    await expect(menu).toBeHidden()
    await expect(page.locator('.canvas-caption')).toHaveText('sample · Simple CI')
    await expect(page.locator('.react-flow__node .stage-card').first()).toBeVisible()
    await expect(page.locator('.empty-state')).toBeHidden()
  })

  test('Samples chip leaves keyboard focus on the trigger, so arrows + Enter pick', async ({
    page,
  }) => {
    await page.locator('.empty-state').getByRole('button', { name: 'Samples' }).click()

    // openMenu() focuses the trigger; ArrowDown highlights option #2 and
    // Enter chooses it without a single mouse event.
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')

    await expect(page.locator('.canvas-caption')).toHaveText('sample · Parallel Tests')
  })
})
