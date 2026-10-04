import { describe, expect, test } from 'claude-code/testing'

import { check, segments } from './rules'

describe('asks', () => {
  const cases = [
    'rm -rf src',
    'rm -fr src',
    'rm -Rf src',
    'rm -rfv build',
    'rm -r -f src',
    'rm -r --force src',
    'rm --recursive --force src',
    'rm -rf -- src',
    '/bin/rm -rf src',
    'sudo rm -rf /var/lib/x',
    'sudo -u root rm -rf /opt/x',
    'rtk rm -rf node_modules',
    'FOO=1 BAR=2 rm -rf dist',
    'env FOO=1 rm -rf dist',
    'nohup rm -rf ~/x &',
    'cd /proj && rm -rf .build',
    'ls; rm -rf src',
    'find . -name "*.o" | xargs rm -rf',
    'find . | xargs -I {} rm -rf {}',
    'rm -rf',
    'rm -rf /tmp/a src',
    'rm -rf /tmp/../Users/me',
    'rm -rf /tmp',
    'rm -rf $TMPDIR/x',
    'rm -rf "$HOME"',
    'git reset --hard',
    'git reset --hard origin/main',
    'rtk git reset --hard HEAD~1',
    'git -C repo reset --hard',
    'git clean -f',
    'git clean -fd',
    'git clean -fdx',
    'git clean -xdf',
    'git clean --force -d',
    'git checkout -- .',
    'git checkout .',
    'git restore .',
    'git restore -- .',
    'git restore --staged --worktree .',
    'psql -c "DROP TABLE users"',
    'sqlite3 db.sqlite "drop table users;"',
    "mysql -e 'Drop Database prod'",
    'psql -c "TRUNCATE users"',
    'psql -c "truncate table users"',
    'echo "DROP TABLE x" | psql db',
    'bash -c "rm -rf src"',
    "sh -lc 'git reset --hard'",
    'eval rm -rf dist',
    'find . -name "*.log" -delete',
    'find . -type d -exec rm -rf {} +',
    'mkfs /dev/disk2',
    'sudo mkfs.ext4 /dev/sdb1',
    'dd if=image.iso of=/dev/disk2 bs=1m',
  ]
  for (const command of cases) {
    test(command, () => {
      expect(check(command)).not.toBeNull()
    })
  }
})

describe('allowed', () => {
  const cases = [
    'rm file.txt',
    'rm -f file.txt',
    'rm -r dir',
    'rm -R dir',
    'rm -i -r dir',
    'rm -rf /tmp/build-123',
    'rm -rf /private/tmp/claude-501/x /tmp/y',
    'rm -rf "/tmp/x"',
    'git reset HEAD~1',
    'git reset --soft HEAD~1',
    'git clean -n',
    'git clean -fn',
    'git clean -f --dry-run',
    'git checkout main',
    'git checkout -- src/a.ts',
    'git restore src/a.ts',
    'git restore --staged .',
    'git restore -S .',
    'git status && git log --oneline',
    'psql -c "SELECT * FROM users"',
    'truncate -s 0 app.log',
    'git commit -m "fix: truncate long tool names"',
    'grep -rn "DROP TABLE" migrations/',
    'find . -name "*.ts"',
    'find . -exec grep x {} +',
    'dd if=/dev/zero of=disk.img bs=1m count=10',
    'echo rm',
    'npm run build',
  ]
  for (const command of cases) {
    test(command, () => {
      expect(check(command)).toBeNull()
    })
  }
})

describe('segments', () => {
  test('drops env, rtk, sudo and xargs prefixes and unquotes', () => {
    expect(segments('A=1 rtk git status && sudo -u me rm "x" | xargs -n 1 echo')).toEqual([
      ['git', 'status'],
      ['rm', 'x'],
      ['echo'],
    ])
  })
})
