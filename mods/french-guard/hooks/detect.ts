export const MIN_WORDS = 40
export const ENGLISH_RATIO = 0.65
export const MIN_UNACCENTED = 3

const ENGLISH = new Set(
  'the and is are was were with that this for to of it you have has not be will can which from but if then when what there their would should could been your we they i by an'.split(' '),
)
const FRENCH = new Set(
  'le la les un une des du de et est sont avec que qui pour dans pas ce cette ces il elle nous vous je ne se au aux sur par mais où ou en ça été être très je tu ils elles'.split(' '),
)
// Frequent French words written without their accent; none is a valid French or common English word.
const UNACCENTED = new Set(
  `deja etre tres voila apres probleme problemes cree crees verifie verifies verifier reponse reponses numero numeros
   electricite etape etapes ecran fenetre fenetres francais resultat resultats systeme systemes evenement evenements
   creer genere generer generes memoire regle regles premiere derniere ecrire ecrit developpeur deploye specifique
   specifiques theorie ca`.split(/\s+/),
)

export function stripNonProse(text: string): string {
  return text
    .replace(/```[\s\S]*?(```|$)/g, ' ')
    .replace(/~~~[\s\S]*?(~~~|$)/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/\bhttps?:\/\/\S+/g, ' ')
    .replace(/\S*\/\S*/g, ' ')
    .replace(/\b[\w-]+\.(?:ts|tsx|js|json|md|swift|py|sh|yml|yaml|toml|html|css|txt|plist)\b/g, ' ')
}

export function words(prose: string): string[] {
  return prose.toLowerCase().match(/[a-zàâäçéèêëîïôöùûüÿœ]+(?:'[a-zàâäçéèêëîïôöùûüÿœ]+)?/g) ?? []
}

export type Verdict = { isEnglish: boolean; unaccented: string[]; wordCount: number }

export function analyze(answer: string): Verdict {
  const all = words(stripNonProse(answer))
  let en = 0
  let fr = 0
  const unaccented: string[] = []
  for (const w of all) {
    const bare = w.includes("'") ? (w.split("'")[1] ?? w) : w
    if (ENGLISH.has(w)) en += 1
    else if (FRENCH.has(w) || FRENCH.has(bare)) fr += 1
    if (UNACCENTED.has(bare)) unaccented.push(bare)
  }
  const isEnglish = all.length >= MIN_WORDS && en + fr > 0 && en / (en + fr) >= ENGLISH_RATIO

  return { isEnglish, unaccented, wordCount: all.length }
}

export function messages(answer: string): string[] {
  const v = analyze(answer)
  if (v.isEnglish) return ['french-guard: last answer looks English']
  if (v.unaccented.length >= MIN_UNACCENTED) {
    const sample = [...new Set(v.unaccented)].slice(0, 4).join(', ')

    return [`french-guard: ${v.unaccented.length} unaccented words (${sample})`]
  }

  return []
}
