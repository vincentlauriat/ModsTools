import { describe, expect, test } from 'claude-code/testing'

import { findSecret, mask } from './rules'

// Fixtures are split so this file itself holds no secret-looking literal.
const k = (...parts: string[]) => parts.join('')
const RANDOM = 'a8Fk2Lq9Zt4Xw7Nc3Vb6Hm1Pr5Sd0Gy'

describe('detected', () => {
  const cases: [string, string, string][] = [
    ['Anthropic', `ANTHROPIC_API_KEY=${k('sk-', 'ant-api03-', RANDOM)}`, 'Anthropic API key'],
    ['OpenAI', `const key = "${k('sk-', 'proj-', RANDOM)}"`, 'OpenAI API key'],
    ['OpenAI legacy', k('sk-', RANDOM), 'OpenAI API key'],
    ['GitHub ghp', `token: ${k('ghp', '_', RANDOM, 'Qe9z')}`, 'GitHub token'],
    ['GitHub gho', k('gho', '_', RANDOM), 'GitHub token'],
    ['GitHub ghs', k('ghs', '_', RANDOM), 'GitHub token'],
    ['GitHub fine-grained', k('github', '_pat_', '11ABCDEFG0', RANDOM), 'GitHub token'],
    ['AWS', `aws_access_key_id = ${k('AKIA', 'Z7Q2M4X9B1K3L8P5')}`, 'AWS access key id'],
    ['Slack', k('xox', 'b-', '1234567890-0987654321-', RANDOM), 'Slack token'],
    ['Google', `?key=${k('AIza', 'SyD8f3Kq', RANDOM.slice(0, 27))}`, 'Google API key'],
    ['PEM', k('-----BEGIN ', 'RSA PRIVATE KEY-----\n', 'MIIEowIBAAKCAQEAu1SU1LfVLPHCozMxH2Mo4lgOEePzNm0tRgeLezV6ffAt0gun\n'), 'private key'],
    ['PEM escaped in JSON', k('{"private_key": "-----BEGIN ', 'PRIVATE KEY-----\\n', 'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7\\n"}'), 'private key'],
    ['OpenSSH', k('-----BEGIN ', 'OPENSSH PRIVATE KEY-----\n', 'b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW\n'), 'private key'],
  ]
  for (const [name, text, kind] of cases) {
    test(name, () => {
      expect(findSecret(text)?.kind).toBe(kind)
    })
  }

  test('the preview shows only the first 4 characters', () => {
    const secret = k('sk-', 'ant-api03-', RANDOM)
    const found = findSecret(`x=${secret}`)
    expect(found?.preview).toBe('sk-a****')
    expect(found?.preview).not.toContain(RANDOM.slice(0, 6))
    expect(mask('ABCDEFGH')).toBe('ABCD****')
  })
})

describe('placeholders and clean text', () => {
  const cases: string[] = [
    'OPENAI_API_KEY=sk-xxxx',
    'OPENAI_API_KEY=sk-...',
    'OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    'ANTHROPIC_API_KEY=sk-ant-your-api-key-goes-here-123',
    'GITHUB_TOKEN=ghp_************',
    'GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    'aws_access_key_id = AKIAIOSFODNN7EXAMPLE',
    'SLACK_TOKEN=xoxb-your-token',
    'SLACK_TOKEN=xoxb-0000000000-0000000000',
    'the regex /-----BEGIN (RSA )?PRIVATE KEY-----/ in docs',
    k('-----BEGIN ', 'PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----'),
    'pip install scikit-learn-intelex-2024-something',
    'const risk-assessment-component-for-users = 1',
    'npm run build && git status',
    'export OPENAI_API_KEY="$(security find-generic-password -s openai -w)"',
  ]
  for (const text of cases) {
    test(text, () => {
      expect(findSecret(text)).toBeNull()
    })
  }
})
