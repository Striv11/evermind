import type { Archive } from '../archive/schema';
import { recordMic } from '../audio/decode';
import { ingestAudio } from '../insight/pipeline';
import { DIMENSIONS, dimension, type DimensionId } from '../identity/dimensions';
import { coverage, nextQuestion, type IdentityProfile } from '../identity/profile';
import { h } from './dom';
import { keys, runMedia } from './studioView';
import { activeVault, saveArchive } from './vaultView';

const pct = (x: number) => `${Math.round(x * 100)}%`;

let current: { dimension: DimensionId; question: string } | null = null;

/** Step 1 of the Studio: how much of you is captured, the next question, and who Evermind thinks you are. */
export function captureSection(onChange: () => void): { el: HTMLElement; refresh: () => void } {
  const mapBox = h('div', { class: 'capture-map', 'data-testid': 'capture-map' });
  const askBox = h('div', {
    class: 'interview',
    'aria-live': 'polite',
    'data-testid': 'interview',
  });
  const profileBox = h('div', { class: 'profile', 'data-testid': 'profile' });
  const status = h('p', { class: 'fine', role: 'status', 'aria-live': 'polite' });
  const fail = (e: unknown) => {
    status.textContent = (e as Error).message;
    status.className = 'error';
  };
  const note = (t: string) => {
    status.textContent = t;
    status.className = 'fine';
  };

  const key = h('input', {
    type: 'password',
    id: 'k-anthropic',
    autocomplete: 'off',
    placeholder: 'Anthropic API key (sk-ant-…)',
    'data-testid': 'k-anthropic',
  });
  key.value = keys.anthropic;
  key.addEventListener('input', () => {
    keys.anthropic = key.value.trim();
    renderProfile();
  });

  const save = async (next: Archive) => {
    await saveArchive(next);
    onChange();
  };

  const markAsked = async () => {
    const v = activeVault();
    if (!v || !current) return;
    await saveArchive({
      ...v.data,
      interview: [
        ...(v.data.interview ?? []),
        {
          question: current.question,
          dimension: current.dimension,
          askedAt: new Date().toISOString(),
        },
      ],
    });
    current = null;
  };

  const loadQuestion = async () => {
    const v = activeVault();
    if (!v) return;
    askBox.replaceChildren(h('p', { class: 'empty' }, 'Thinking of a good question…'));
    try {
      current = keys.anthropic
        ? await (await import('../identity/brain')).interviewQuestion(keys.anthropic, v.data)
        : nextQuestion(v.data);
    } catch (e) {
      fail(e);
      current = nextQuestion(v.data);
    }
    renderQuestion();
  };

  function renderMap() {
    const v = activeVault();
    if (!v) return;
    const c = coverage(v.data);
    mapBox.replaceChildren(
      h(
        'div',
        { class: 'overall' },
        h('span', { class: 'big', 'data-testid': 'coverage-overall' }, pct(c.overall)),
        h('span', {}, ' of you captured'),
      ),
      h(
        'ul',
        { class: 'dims' },
        ...c.dimensions.map((d) =>
          h(
            'li',
            { title: dimension(d.id).why },
            h('span', { class: 'dim-label' }, d.label),
            h('span', { class: 'dim-bar' }, h('span', { style: `width:${pct(d.score)}` })),
            h('span', { class: 'dim-pct' }, pct(d.score)),
          ),
        ),
      ),
    );
  }

  function renderQuestion() {
    if (!current) {
      askBox.replaceChildren(
        h(
          'p',
          { class: 'empty' },
          'Every prepared question is answered. Add an Anthropic key for endless follow-ups.',
        ),
      );
      return;
    }
    const q = current;
    const rec = h(
      'button',
      { class: 'btn primary', type: 'button', 'data-testid': 'answer-record' },
      '● Record answer',
    );
    const typeBtn = h(
      'button',
      { class: 'btn', type: 'button', 'data-testid': 'answer-type' },
      'Type instead',
    );
    const skip = h(
      'button',
      { class: 'btn', type: 'button', 'data-testid': 'answer-skip' },
      'Ask something else',
    );
    const area = h('textarea', {
      rows: '4',
      class: 'answer',
      'data-testid': 'answer-text',
      'aria-label': 'Your answer',
      hidden: '',
    });
    const saveTyped = h(
      'button',
      { class: 'btn primary', type: 'button', hidden: '', 'data-testid': 'answer-save' },
      'Save answer',
    );
    let stop: (() => Promise<Blob>) | null = null;

    rec.addEventListener('click', () => {
      void (async () => {
        try {
          if (!stop) {
            stop = (await recordMic()).stop;
            rec.textContent = '■ Stop and save';
            return;
          }
          const blob = await stop();
          stop = null;
          rec.textContent = '● Record answer';
          if (!runMedia) throw new Error('The recorder is not ready.');
          note('Your answer is being transcribed and sorted (see step 2)…');
          await markAsked();
          void runMedia(`Answer: ${q.question}`, blob);
          void loadQuestion();
        } catch (e) {
          fail(e);
        }
      })();
    });
    typeBtn.addEventListener('click', () => {
      area.hidden = false;
      saveTyped.hidden = false;
      area.focus();
    });
    saveTyped.addEventListener('click', () => {
      void (async () => {
        const v = activeVault();
        const text = area.value.trim();
        if (!v || !text) return;
        try {
          const r = ingestAudio(v.data, {
            fileName: `Answer: ${q.question}`,
            kind: 'typed',
            recordedAt: new Date().toISOString().slice(0, 10),
            chunks: [{ text, start: 0, end: 0 }],
          });
          await saveArchive(r.archive);
          await markAsked();
          note(`Saved ${r.memories.length} memory.`);
          onChange();
          void loadQuestion();
        } catch (e) {
          fail(e);
        }
      })();
    });
    skip.addEventListener('click', () => {
      void markAsked().then(loadQuestion);
    });

    askBox.replaceChildren(
      h('p', { class: 'eyebrow' }, `Next: ${dimension(q.dimension).label}`),
      h('p', { class: 'question', 'data-testid': 'question' }, q.question),
      h('div', { class: 'cta' }, rec, typeBtn, skip),
      area,
      saveTyped,
    );
  }

  function renderProfile() {
    const v = activeVault();
    if (!v) return;
    const p = v.data.identity;
    const btn = h(
      'button',
      { class: 'btn primary', type: 'button', 'data-testid': 'understand' },
      p ? 'Update my profile' : 'Understand me',
    );
    btn.addEventListener('click', () => {
      void (async () => {
        const vv = activeVault();
        if (!vv) return;
        if (!keys.anthropic) return fail(new Error('Add your Anthropic API key above.'));
        btn.disabled = true;
        note(
          `Reading all ${vv.data.memories.length} memories and building your profile… (about a minute)`,
        );
        try {
          const { understand } = await import('../identity/brain');
          const identity = await understand(keys.anthropic, vv.data);
          await save({ ...vv.data, identity });
          note('Profile updated.');
        } catch (e) {
          fail(e);
        } finally {
          btn.disabled = false;
        }
      })();
    });
    const fresh = p ? v.data.memories.length - p.basedOnMemories : 0;
    profileBox.replaceChildren(
      h('h3', {}, 'Who Evermind thinks you are'),
      p
        ? profileView(p, async (i) => {
            const vv = activeVault();
            if (!vv?.data.identity) return;
            const traits = vv.data.identity.traits.filter((_, j) => j !== i);
            await save({ ...vv.data, identity: { ...vv.data.identity, traits } });
          })
        : h(
            'p',
            { class: 'empty' },
            'Not built yet. After a few recordings, Evermind reads everything you said and writes down your values, opinions, personality, humor and way of talking, each backed by your own words.',
          ),
      h(
        'div',
        { class: 'cta' },
        btn,
        fresh > 0
          ? h('span', { class: 'fine' }, ` ${fresh} new memories since the last update.`)
          : null,
      ),
    );
  }

  const el = h(
    'section',
    { class: 'studio-section', 'aria-labelledby': 'capture-h' },
    h('h2', { id: 'capture-h' }, '1 · Capture all of you'),
    h(
      'p',
      {},
      'Twelve dimensions make up a person here. Answer the interviewer’s questions by voice; it always goes after your weakest area. The Anthropic key lets Evermind ask smart follow-ups, understand you, and let your twin think like you. Your memories are sent to Anthropic only when you use those features; the key stays in this tab.',
    ),
    h('div', { class: 'row' }, h('label', { for: 'k-anthropic' }, 'Anthropic API key'), key),
    mapBox,
    askBox,
    status,
    profileBox,
  );
  renderMap();
  renderProfile();
  if (current) renderQuestion();
  else void loadQuestion();
  return {
    el,
    refresh: () => {
      renderMap();
      renderProfile();
    },
  };
}

function profileView(p: IdentityProfile, remove: (i: number) => Promise<void>): HTMLElement {
  const big = Object.entries(p.bigFive);
  return h(
    'div',
    {},
    h('blockquote', { 'data-testid': 'profile-summary' }, p.summary),
    h(
      'ul',
      { class: 'dims' },
      ...big.map(([k, b]) =>
        h(
          'li',
          {},
          h('span', { class: 'dim-label' }, k[0]!.toUpperCase() + k.slice(1)),
          h('span', { class: 'dim-bar' }, h('span', { style: `width:${pct(b.score)}` })),
          h('span', { class: 'dim-pct' }, b.evidence.length ? pct(b.score) : '?'),
        ),
      ),
    ),
    h('p', { class: 'fine' }, `How you talk: ${p.speech.style}`),
    p.speech.phrases.length
      ? h(
          'div',
          { class: 'chips' },
          ...p.speech.phrases.map((ph) => h('span', { class: 'chip' }, `“${ph}”`)),
        )
      : null,
    ...DIMENSIONS.filter((d) => p.traits.some((t) => t.dimension === d.id)).map((d) =>
      h(
        'details',
        { class: 'traits' },
        h('summary', {}, `${d.label} (${p.traits.filter((t) => t.dimension === d.id).length})`),
        h(
          'ul',
          {},
          ...p.traits.flatMap((t, i) => {
            if (t.dimension !== d.id) return [];
            const x = h(
              'button',
              { class: 'x', type: 'button', 'aria-label': 'Remove this, it is wrong' },
              '×',
            );
            x.addEventListener('click', () => void remove(i));
            return [
              h(
                'li',
                {},
                t.statement,
                h(
                  'span',
                  { class: 'fine' },
                  ` · ${pct(t.confidence)} sure · ${t.evidence.length} memories `,
                ),
                x,
              ),
            ];
          }),
        ),
      ),
    ),
    p.gaps.length
      ? h('p', { class: 'fine' }, 'Still unknown: ' + p.gaps.slice(0, 5).join(' · '))
      : null,
  );
}
