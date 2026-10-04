import { expect, test } from 'claude-code/testing'

import { parseWeather, weatherUrl } from './weather'

test('collapses the double space after the emoji', () => {
  expect(parseWeather('☀️  Paris +21°C\n')).toBe('☀️ Paris +21°C')
})

test('drops raw coordinates from the IP-based guess, with or without a colon', () => {
  expect(parseWeather('☀️  37.751000,-97.822000 +76°F')).toBe('☀️ +76°F')
  expect(parseWeather('37.751000,-97.822000: ☀️  +24°C')).toBe('☀️ +24°C')
})

test('rejects HTML and wttr.in error texts', () => {
  expect(parseWeather('<!DOCTYPE html><html>…</html>')).toBeNull()
  expect(parseWeather('Unknown location; please try ~37.77,-122.42')).toBeNull()
  expect(parseWeather('location not found: upstream error: opencage: invalid response')).toBeNull()
})

test('rejects empty or oversized output', () => {
  expect(parseWeather('  \n')).toBeNull()
  expect(parseWeather('x '.repeat(80))).toBeNull()
})

test('builds a metric, encoded url', () => {
  expect(weatherUrl(' New York ', '%c+%l+%t')).toBe('https://wttr.in/New%20York?format=%25c%2B%25l%2B%25t&m')
  expect(weatherUrl('', '3')).toBe('https://wttr.in/?format=3&m')
})
