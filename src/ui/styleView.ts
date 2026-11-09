import type { Archive } from '../archive/schema';
import { computeStyleProfile, buildStylePrompt } from '../style/profile';
import { h } from './dom';

/** Profile viewer: numbers, signature phrases and the prompt that would condition a generator. */
export function styleSection(a: Archive): HTMLElement {
  const p = computeStyleProfile(a.voiceSamples);
  const row = (k: string, v: string) => h('tr', {}, h('th', { scope: 'row' }, k), h('td', {}, v));
  return h(
    'section',
    { 'aria-labelledby': 'style-h', 'data-testid': 'style-section' },
    h('h2', { id: 'style-h' }, 'Writing style'),
    p.wordCount === 0
      ? h(
          'p',
          { class: 'empty' },
          'No writing samples yet. Import chats or journals to build a style profile.',
        )
      : h(
          'div',
          {},
          h(
            'table',
            { class: 'facts' },
            h(
              'tbody',
              {},
              row('Samples / words', `${p.sampleCount} / ${p.wordCount}`),
              row(
                'Sentence length',
                `${p.avgSentenceLength.toFixed(1)} ± ${p.sentenceLengthStd.toFixed(1)} words`,
              ),
              row('Vocabulary richness', p.vocabRichness.toFixed(2)),
              row('Commas / 100 words', p.punctuation.comma.toFixed(1)),
              row('Emoji / 100 words', p.emojiPer100.toFixed(1)),
              row('Signature phrases', p.signaturePhrases.join(', ') || 'none yet'),
            ),
          ),
          h('h3', {}, 'Style prompt'),
          h('p', { class: 'meta', 'data-testid': 'style-prompt' }, buildStylePrompt(p)),
        ),
  );
}
