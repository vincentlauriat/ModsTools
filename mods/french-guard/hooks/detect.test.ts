import { expect, test } from 'claude-code/testing'

import { analyze, messages, stripNonProse } from './detect'

const FRENCH_WITH_CODE = `Voilà le résultat : la fonction est déjà créée et elle fonctionne très bien dans le projet.
Il faut ensuite vérifier que les tests passent avec la configuration que nous avons choisie pour cette étape.

\`\`\`ts
// the quick brown fox is the one that was in the file and it is not the same as this
const deja = tres(probleme, reponse, numero, resultat)
\`\`\`

Le fichier \`src/the/config.ts\` et le lien https://example.com/the/page ne changent pas, voir /Users/me/the/path aussi.`

const ENGLISH = `I have updated the function so that it now returns the result of the query, and the tests are passing with the new configuration.
You can run the build again to check that everything works, and if there is a problem with the output we should look at the logs from the last run.
This is what the change does and why it is needed for the project.`

const UNACCENTED_FRENCH = `Voila, j'ai verifie le fichier et le probleme est deja corrige dans la version que nous avons. Il y a une mise a jour pour le projet et la reponse
est dans le dossier, avec le numero de ticket. Apres cela, il faut relancer les tests pour que tout soit propre dans le depot.`

test('French prose with code blocks, inline code, URLs and paths does not trigger', async () => {
  expect(messages(FRENCH_WITH_CODE)).toEqual([])
  expect(analyze(FRENCH_WITH_CODE).isEnglish).toBe(false)
})

test('English prose over 40 words is flagged', async () => {
  expect(analyze(ENGLISH).wordCount).toBeGreaterThanOrEqual(40)
  expect(messages(ENGLISH)).toEqual(['french-guard: last answer looks English'])
})

test('short English text is not flagged (under 40 words)', async () => {
  expect(messages('Done, the build is passing and the tests are green.')).toEqual([])
})

test('unaccented French is flagged with a sample of the words', async () => {
  const [msg] = messages(UNACCENTED_FRENCH)
  expect(msg).toMatch(/^french-guard: \d+ unaccented words \(/)
  expect(msg).toContain('probleme')
})

test('one or two unaccented words stay silent; accented forms never count', async () => {
  expect(messages('Le probleme est résolu et le fichier est déjà prêt.')).toEqual([])
  expect(messages('déjà très problème réponse numéro vérifié créé après')).toEqual([])
})

test('stripNonProse removes fences, inline code, URLs and paths but keeps prose', async () => {
  const out = stripNonProse('avant `x` https://a.b/c ~/d/e fichier.ts ```\ncode\n``` après')
  expect(out).not.toMatch(/code|https|fichier|~\//)
  expect(out).toContain('avant')
  expect(out).toContain('après')
})
