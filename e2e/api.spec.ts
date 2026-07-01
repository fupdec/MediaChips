import { test, expect } from '@playwright/test'

test.describe('API', () => {
  test('ping responds', async ({ request }) => {
    const response = await request.get('/api/ping')
    expect(response.ok()).toBeTruthy()

    const body = await response.json()
    expect(body.message).toBe('Server is online')
    expect(typeof body.pong).toBe('number')
  })

  test('config responds for a fresh server', async ({ request }) => {
    const response = await request.get('/api/config')
    expect(response.ok()).toBeTruthy()

    const body = await response.json()
    expect(body.port).toBe(12321)
    expect(Array.isArray(body.databases)).toBe(true)
    expect(body.databases.length).toBeGreaterThan(0)
  })

  test('auth status reports no password on fresh server', async ({ request }) => {
    const response = await request.get('/api/auth/status')
    expect(response.ok()).toBeTruthy()

    const body = await response.json()
    expect(body.required).toBe(false)
    expect(body.authenticated).toBe(false)
  })

  test('login succeeds without password when protection is disabled', async ({ request }) => {
    const response = await request.post('/api/auth/login', {
      data: {},
    })
    expect(response.ok()).toBeTruthy()

    const body = await response.json()
    expect(body.required).toBe(false)
    expect(typeof body.token).toBe('string')
    expect(body.token.length).toBeGreaterThan(0)
  })

  test('home health responds', async ({ request }) => {
    const response = await request.get('/api/home/health')
    expect(response.ok()).toBeTruthy()

    const body = await response.json()
    expect(body).toBeTruthy()
  })

  test('backups list is empty on fresh server', async ({ request }) => {
    const response = await request.get('/api/TasksBackups/getBackups')
    expect(response.status()).toBe(201)

    const body = await response.json()
    expect(Array.isArray(body)).toBe(true)
  })

  test('legacy LowDB migration check returns 400 when no legacy data', async ({ request }) => {
    const response = await request.post('/api/Task/checkDataForMigrateFromLowDb')
    expect(response.status()).toBe(400)
  })

  test('media types list responds', async ({ request }) => {
    const response = await request.get('/api/mediaType')
    expect(response.ok()).toBeTruthy()

    const body = await response.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBeGreaterThan(0)
  })
})
