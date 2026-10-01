import { describe, expect, it } from 'vitest'
import { MAX_WELCOME_IMAGE_BYTES, isValidWelcomeImage, welcomeImageFileName } from './pocImage.ts'

const dataUrl = (bytes: number, type = 'image/png') => `data:${type};base64,${Buffer.alloc(bytes).toString('base64')}`

describe('isValidWelcomeImage', () => {
  it('accepts an http(s) link or an embedded PNG/JPEG/GIF/WebP image up to 2 MB', () => {
    expect(isValidWelcomeImage('https://cdn.example.com/welcome.png')).toBe(true)
    expect(isValidWelcomeImage(dataUrl(1024))).toBe(true)
    expect(isValidWelcomeImage(dataUrl(1024, 'image/webp'))).toBe(true)
    expect(isValidWelcomeImage(dataUrl(MAX_WELCOME_IMAGE_BYTES))).toBe(true)
  })

  it('rejects other schemes, other file types and images over 2 MB', () => {
    expect(isValidWelcomeImage('javascript:alert(1)')).toBe(false)
    expect(isValidWelcomeImage('C:/Users/me/welcome.png')).toBe(false)
    expect(isValidWelcomeImage(dataUrl(10, 'image/svg+xml'))).toBe(false)
    expect(isValidWelcomeImage(dataUrl(10, 'text/html'))).toBe(false)
    expect(isValidWelcomeImage(dataUrl(MAX_WELCOME_IMAGE_BYTES + 1))).toBe(false)
    expect(isValidWelcomeImage('data:image/png;base64,not base64!')).toBe(false)
  })
})

describe('welcomeImageFileName', () => {
  it('names the download after the POC with the image extension', () => {
    expect(welcomeImageFileName('POC 02 — Procurement', dataUrl(4, 'image/jpeg'))).toBe('poc-02-procurement-welcome.jpg')
    expect(welcomeImageFileName('Agata', dataUrl(4))).toBe('agata-welcome.png')
  })
})
