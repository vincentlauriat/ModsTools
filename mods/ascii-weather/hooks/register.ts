import type { EngineInterface, Register } from 'claude-code'

import { REFRESH_MS, parseWeather, weatherUrl } from './weather'

async function fetchWeather($: EngineInterface, location: string, format: string): Promise<string | null> {
  try {
    const out = await $.process.run(['curl', '-s', '-m', '5', weatherUrl(location, format)])

    return out.exitCode === 0 ? parseWeather(out.stdout) : null
  } catch {
    return null
  }
}

async function refresh($: EngineInterface, location: string, state: { at: number }): Promise<void> {
  state.at = await $.clock.now()
  $.ui.status((await fetchWeather($, location, '%c+%l+%t')) ?? undefined)
}

export const register: Register = (on, options) => {
  const location = typeof options?.location === 'string' ? options.location : ''
  const state = { at: Number.NEGATIVE_INFINITY }

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'weather', description: 'ascii-weather: the one-line forecast for the configured location' })
    await refresh($, location, state)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined && (await $.clock.now()) - state.at >= REFRESH_MS) await refresh($, location, state)

    return next(e)
  })

  on('command.run', { command: 'weather' }, async $ => ({
    text: (await fetchWeather($, location, '3')) ?? 'Weather unavailable (wttr.in did not answer or the location is unknown).',
  }))
}
