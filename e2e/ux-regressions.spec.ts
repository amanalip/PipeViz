import { expect, test } from '@playwright/test'

async function loadSimpleSample(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Samples ▾' }).click()
  await page.getByRole('listbox').getByRole('option', { name: 'Simple CI' }).click()
  await expect(page.locator('.react-flow__node .stage-card').first()).toBeVisible()
}

async function loadSample(page: import('@playwright/test').Page, name: string) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Samples ▾' }).click()
  await page.getByRole('listbox').getByRole('option', { name }).click()
  await expect(page.locator('.react-flow__node').first()).toBeVisible()
}

test.describe('high-impact UX regressions', () => {
  test('nested stages expand into an ordered group and preserve the open toast', async ({ page }) => {
    await loadSample(page, 'Sequential Groups')
    const quality = page.getByRole('group', { name: /Quality Suite stage/ })
    await expect(quality).toHaveAttribute('aria-label', /collapsed, expandable/)
    await quality.click()
    await expect(page.getByRole('dialog')).toContainText('STAGE · Quality Suite')

    await quality.locator('.stage-card').dblclick()

    const group = page.getByRole('group', { name: /Sequential group Quality Suite/ })
    await expect(group).toBeVisible()
    await expect(group).toHaveClass(/selected/)
    await expect(page.getByRole('dialog')).toContainText('CONTAINER · Quality Suite')
    await expect(page.getByRole('group', { name: /Static Analysis stage/ })).toBeVisible()
    await expect(page.getByRole('group', { name: /Deep Checks stage/ })).toBeVisible()

    const first = await page.getByRole('group', { name: /Static Analysis stage/ }).boundingBox()
    const second = await page.getByRole('group', { name: /Deep Checks stage/ }).boundingBox()
    if (!first || !second) throw new Error('Sequential child geometry missing')
    expect(second.y).toBeGreaterThan(first.y + first.height)

    await group.locator('.parallel-container').dblclick()
    await expect(page.getByRole('group', { name: /Quality Suite stage/ })).toBeVisible()
    await expect(page.getByRole('group', { name: /Static Analysis stage/ })).toBeHidden()
  })

  test('graph search keeps context and highlights metadata or stage matches', async ({ page }) => {
    await loadSample(page, 'Parallel Tests')
    const search = page.getByRole('searchbox', { name: 'Find stage in graph' })
    await search.fill('Integration')
    await expect(page.locator('.react-flow__node.graph-search-match')).toHaveCount(1)
    await expect(page.locator('.react-flow__node.graph-search-dim')).toHaveCount(5)
    await expect(page.getByRole('group', { name: /Build stage/ })).toBeVisible()
    await search.press('Escape')
    await expect(page.locator('.react-flow__node.graph-search-dim')).toHaveCount(0)
  })

  test('Focus path isolates one parallel lane without hiding sibling lanes', async ({ page }) => {
    await loadSample(page, 'Parallel Tests')
    await page.getByRole('group', { name: /Unit stage/ }).click()
    await page.getByRole('button', { name: 'Focus path' }).click()

    await expect(page.getByRole('group', { name: /Build stage/ })).toHaveClass(/graph-path-active/)
    await expect(page.getByRole('group', { name: /Unit stage/ })).toHaveClass(/graph-path-active/)
    await expect(page.getByRole('group', { name: /Report stage/ })).toHaveClass(/graph-path-active/)
    await expect(page.getByRole('group', { name: /Lint stage/ })).toHaveClass(/graph-path-dim/)
    await expect(page.getByRole('group', { name: /Lint stage/ })).toBeVisible()
  })

  test('bulk group controls expand deep nesting and collapse it again', async ({ page }) => {
    await loadSample(page, 'Sequential Groups')
    await page.getByRole('button', { name: 'Expand all' }).click()
    await expect(page.getByRole('group', { name: /Sequential group Quality Suite/ })).toBeVisible()
    await expect(page.getByRole('group', { name: /Sequential group Deep Checks/ })).toBeVisible()
    await expect(page.getByRole('group', { name: /Dead Code stage/ })).toBeVisible()

    await page.getByRole('button', { name: 'Collapse all' }).click()
    await expect(page.getByRole('group', { name: /Quality Suite stage/ })).toBeVisible()
    await expect(page.getByRole('group', { name: /Dead Code stage/ })).toBeHidden()
  })

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

  test('pipeline and stage toast cards expose scoped metadata and source provenance', async ({ page }) => {
    await loadSimpleSample(page)

    const metadata = page.getByRole('button', { name: /AGENT · any/ })
    await expect(metadata).toContainText('ENV ×2')
    await metadata.click()
    const pipelineToast = page.getByRole('dialog', { name: 'PIPELINE METADATA' })
    await expect(pipelineToast).toContainText('AGENT')
    await expect(pipelineToast).toContainText('ENVIRONMENT (2)')

    await page.getByRole('button', { name: 'Close pipeline metadata' }).click()
    await page.getByRole('group', { name: /Build stage/ }).click()
    const stageToast = page.getByRole('dialog', { name: /STAGE · Build/ })
    await expect(stageToast).toContainText(/lines \d+-\d+ · build · 1 step/)
    await expect(stageToast).toContainText('AGENT · INHERITED')
    await expect(stageToast).toContainText(/line \d+ · known · sh 'make build'/)
    await expect(stageToast).toContainText('2 pipeline environment entries')
  })

  test('toast card stays below the metadata toolbar and inside the canvas', async ({ page }) => {
    await loadSimpleSample(page)
    await page.getByRole('group', { name: /Build stage/ }).click()

    const toolbar = await page.locator('.canvas-toolbar').boundingBox()
    const toast = await page.locator('.details-panel').boundingBox()
    const canvas = await page.locator('.canvas-area').boundingBox()
    if (!toolbar || !toast || !canvas) throw new Error('Toast geometry surfaces not visible')

    expect(toast.y).toBeGreaterThanOrEqual(toolbar.y + toolbar.height)
    expect(toast.x).toBeGreaterThanOrEqual(canvas.x)
    expect(toast.x + toast.width).toBeLessThanOrEqual(canvas.x + canvas.width)
    expect(toast.y + toast.height).toBeLessThanOrEqual(canvas.y + canvas.height)
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

  test('editor uses dedicated readable palettes in dark and light modes', async ({ page }) => {
    await loadSimpleSample(page)
    const editorColors = () => page.evaluate(() => {
      const styles = getComputedStyle(document.documentElement)
      return {
        background: styles.getPropertyValue('--editor-bg').trim(),
        ink: styles.getPropertyValue('--editor-ink').trim(),
        muted: styles.getPropertyValue('--editor-muted').trim(),
        keyword: styles.getPropertyValue('--editor-keyword').trim(),
      }
    })

    expect(await editorColors()).toEqual({
      background: '#111827',
      ink: '#e5edf8',
      muted: '#a8b5c7',
      keyword: '#67e8f9',
    })
    await page.getByRole('button', { name: 'Light mode' }).click()
    expect(await editorColors()).toEqual({
      background: '#f8fafc',
      ink: '#172033',
      muted: '#526176',
      keyword: '#0e7490',
    })
  })

  test('theme changes preserve selected stage and pipeline toast cards', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await loadSimpleSample(page)
    await page.getByRole('group', { name: /Build stage/ }).click()
    const stageToast = page.getByRole('dialog', { name: /STAGE · Build/ })
    await expect(stageToast).toBeVisible()

    await page.getByRole('button', { name: 'Light mode' }).click()
    await expect(stageToast).toBeVisible()
    await expect(page.getByRole('group', { name: /Build stage/ })).toHaveClass(/selected/)

    await stageToast.getByRole('button', { name: 'Close details panel' }).click()
    expect(pageErrors).toEqual([])
    await expect(page.locator('.app')).toBeVisible()
    await page.getByRole('button', { name: /AGENT · any/ }).click()
    const pipelineToast = page.getByRole('dialog', { name: 'PIPELINE METADATA' })
    await expect(pipelineToast).toBeVisible()
    await page.getByRole('button', { name: 'Dark mode' }).click()
    await expect(pipelineToast).toBeVisible()
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
