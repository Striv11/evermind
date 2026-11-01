import { EMOTIONS, type Archive, type Emotion, type EpisodicMemory } from '../archive/schema';
import { decodeToMono16k, recordMic, SAMPLE_RATE } from '../audio/decode';
import { transcribe } from '../audio/transcribe';
import { dominant } from '../insight/emotions';
import { ingestAudio } from '../insight/pipeline';
import { answer } from '../insight/recall';
import type { ChatTurn } from '../identity/brain';
import { forSpeech } from '../insight/recall';
import { captureSection } from './captureView';
import { legacySection } from './legacyView';
import { rate } from '../identity/fidelity';
import { THEME_LABELS, THEMES, type Theme } from '../insight/themes';
import { bestFrame } from '../twin/frame';
import { DId, ElevenLabs } from '../twin/services';
import { h } from './dom';
import { activeVault, saveArchive } from './vaultView';

export const EMOTION_COLORS: Record<Emotion, string> = {
  joy: '#f2b705',
  love: '#e8547a',
  gratitude: '#2fa37a',
  pride: '#7b5cff',
  hope: '#3aa0e8',
  nostalgia: '#c27c3a',
  sadness: '#4f6db8',
  fear: '#8a5aa8',
  anger: '#d9472b',
  regret: '#7a7f8c',
  neutral: '#a8a6b3',
};

const PROMPTS = [
  'Your earliest memory, and who was there.',
  'The people who shaped you, and what each one taught you.',
  'A day you were proudest of.',
  'Something you regret, and what you would say now.',
  'What you believe about how to live a good life.',
  'Places that feel like home.',
  'Advice for someone you love, years from now.',
];

/** Session-only state: raw media never goes into the vault, only what was learned from it. */
interface Recording {
  name: string;
  blob: Blob;
  seconds: number;
}
const recordings: Recording[] = [];
let face: { jpeg: Blob; preview: string } | null = null;
let voiceId = '';
export const keys = { eleven: '', did: '', anthropic: '' };
/** Set by the story section; lets the interviewer feed recorded answers into the same pipeline. */
export let runMedia: ((name: string, blob: Blob) => Promise<void>) | null = null;
const chat: { turn: ChatTurn; citations: string[] }[] = [];
const filters: { emotion: Emotion | null; theme: Theme | null } = { emotion: null, theme: null };

export function studioView(root: HTMLElement): void {
  const vault = activeVault();
  if (!vault) {
    root.replaceChildren(
      h(
        'div',
        { class: 'panel' },
        h('h1', {}, 'Studio'),
        h(
          'p',
          { class: 'lead' },
          'Unlock your vault first. Everything you record is stored encrypted inside it.',
        ),
        h(
          'div',
          { class: 'cta' },
          h('a', { class: 'btn primary', href: '#/vault' }, 'Go to my vault'),
        ),
      ),
    );
    return;
  }
  const memoriesBox = h('section', { class: 'studio-section', 'aria-labelledby': 'mem-h' });
  const capture = captureSection(() => refresh());
  const refresh = () => {
    const v = activeVault();
    if (!v) return;
    memoriesBox.replaceChildren(...memoriesSection(v.data));
    capture.refresh();
  };
  memoriesBox.replaceChildren(...memoriesSection(vault.data));
  root.replaceChildren(
    h(
      'div',
      { class: 'studio' },
      h('div', { class: 'banner', role: 'note' }, '⚠ ' + vault.data.aiDisclosure),
      h('h1', {}, 'Studio'),
      h(
        'p',
        { class: 'lead' },
        'Talk about your life. Evermind transcribes it on this device, sorts it by emotion and life area, learns who you are, and keeps it all in your encrypted vault. The capture map shows how much of you is recorded and what to talk about next.',
      ),
      capture.el,
      storySection(refresh),
      memoriesBox,
      twinSection(refresh),
      legacySection(),
    ),
  );
}

function storySection(onAdded: () => void): HTMLElement {
  const queue = h('ol', { class: 'queue', 'aria-live': 'polite', 'data-testid': 'queue' });
  const birth = h('input', {
    type: 'number',
    id: 'birth',
    min: '1920',
    max: String(new Date().getFullYear()),
    placeholder: 'e.g. 2001',
    inputmode: 'numeric',
  });
  const files = h('input', {
    type: 'file',
    id: 'audio-files',
    accept: 'audio/*,video/*',
    multiple: '',
    'data-testid': 'audio-files',
  });
  const recBtn = h('button', { class: 'btn', type: 'button' }, '● Record');
  let stopRec: (() => Promise<Blob>) | null = null;

  const run = async (name: string, blob: Blob) => {
    const status = h('span', {}, 'Decoding…');
    const bar = h('progress', { max: '100', value: '0' });
    queue.append(h('li', {}, h('strong', {}, name), ' ', status, bar));
    try {
      const pcm = await decodeToMono16k(blob);
      const seconds = pcm.length / SAMPLE_RATE;
      if (blob.type.startsWith('audio/') || blob.type === '' || blob.type.includes('webm'))
        recordings.push({ name, blob, seconds });
      const chunks = await transcribe(pcm, (stage, pct) => {
        status.textContent =
          stage === 'download'
            ? 'Downloading speech model (first time only)…'
            : 'Transcribing on this device…';
        bar.value = stage === 'download' ? pct : Math.max(bar.value, 5);
      });
      status.textContent = 'Sorting emotions and life areas…';
      const v = activeVault();
      if (!v) throw new Error('The vault was locked while processing.');
      const year = Number(birth.value);
      const r = ingestAudio(
        v.data,
        {
          fileName: name,
          recordedAt: new Date().toISOString().slice(0, 10),
          chunks,
          pcm,
          sampleRate: SAMPLE_RATE,
        },
        year > 1900 ? { birthYear: year } : {},
      );
      await saveArchive(r.archive);
      bar.value = 100;
      const mood = r.overall
        ? ` · tone ${r.overall.arousal > 0.55 ? 'energetic' : r.overall.arousal < 0.3 ? 'calm' : 'steady'}`
        : '';
      status.textContent = `${r.memories.length} memories from ${Math.round(seconds)} s${mood}. Saved.`;
      onAdded();
    } catch (e) {
      status.textContent = (e as Error).message;
      status.className = 'error';
    }
  };
  runMedia = run;

  files.addEventListener('change', () => {
    void (async () => {
      for (const f of Array.from(files.files ?? [])) await run(f.name, f);
      files.value = '';
    })();
  });
  recBtn.addEventListener('click', () => {
    void (async () => {
      if (stopRec) {
        const blob = await stopRec();
        stopRec = null;
        recBtn.textContent = '● Record';
        await run(`Recording ${new Date().toLocaleTimeString()}`, blob);
      } else {
        try {
          stopRec = (await recordMic()).stop;
          recBtn.textContent = '■ Stop and save';
        } catch {
          queue.append(h('li', { class: 'error' }, 'Microphone permission was denied.'));
        }
      }
    })();
  });

  return h(
    'section',
    { class: 'studio-section', 'aria-labelledby': 'story-h' },
    h('h2', { id: 'story-h' }, '2 · Tell your story freely'),
    h(
      'p',
      {},
      'Upload voice notes or videos, or record right here. Any language Whisper knows works, including Hindi and mixed Hinglish. Ideas to talk about:',
    ),
    h('ul', { class: 'prompts' }, ...PROMPTS.map((p) => h('li', {}, p))),
    h(
      'div',
      { class: 'row' },
      h('label', { for: 'birth' }, 'Birth year (turns “when I was 12” into a date)'),
      birth,
    ),
    h(
      'div',
      { class: 'row' },
      h('label', { for: 'audio-files' }, 'Audio or video files'),
      files,
      recBtn,
    ),
    queue,
  );
}

function memoriesSection(a: Archive): Node[] {
  const mems = a.memories.filter((m) => m.sourceId && m.emotions);
  if (!mems.length)
    return [
      h('h2', { id: 'mem-h' }, '3 · Your memories'),
      h(
        'p',
        { class: 'empty' },
        'Nothing yet. Your first recording will appear here, sorted by feeling and life area.',
      ),
    ];
  const counts = new Map<Emotion, number>();
  for (const m of mems)
    counts.set(dominant(m.emotions), (counts.get(dominant(m.emotions)) ?? 0) + 1);
  const themeCounts = new Map<Theme, number>();
  for (const m of mems)
    for (const t of (m.themes ?? []) as Theme[]) themeCounts.set(t, (themeCounts.get(t) ?? 0) + 1);

  const rerender = () => {
    const box = document.querySelector('[aria-labelledby="mem-h"]');
    if (box) box.replaceChildren(...memoriesSection(a));
  };
  const chip = (
    label: string,
    n: number,
    active: boolean,
    color: string | null,
    onClick: () => void,
  ) => {
    const b = h(
      'button',
      { type: 'button', class: 'chip', 'aria-pressed': String(active) },
      ...(color ? [h('span', { class: 'dot', style: `background:${color}` })] : []),
      `${label} ${n}`,
    );
    b.addEventListener('click', onClick);
    return b;
  };
  const total = mems.length;
  const spectrum = h(
    'div',
    { class: 'spectrum', role: 'img', 'aria-label': 'Emotional spectrum of your memories' },
    ...EMOTIONS.filter((e) => counts.get(e)).map((e) =>
      h('span', {
        style: `flex:${counts.get(e)};background:${EMOTION_COLORS[e]}`,
        title: `${e}: ${counts.get(e)}`,
      }),
    ),
  );
  const shown = mems
    .filter((m) => !filters.emotion || dominant(m.emotions) === filters.emotion)
    .filter((m) => !filters.theme || m.themes?.includes(filters.theme))
    .sort((x, y) => x.date.localeCompare(y.date));
  const people = new Map(a.people.map((p) => [p.id, p.name]));

  return [
    h('h2', { id: 'mem-h' }, `3 · Your memories (${total})`),
    spectrum,
    h(
      'div',
      { class: 'chips', role: 'group', 'aria-label': 'Filter by emotion' },
      ...EMOTIONS.filter((e) => counts.get(e)).map((e) =>
        chip(e, counts.get(e)!, filters.emotion === e, EMOTION_COLORS[e], () => {
          filters.emotion = filters.emotion === e ? null : e;
          rerender();
        }),
      ),
    ),
    h(
      'div',
      { class: 'chips', role: 'group', 'aria-label': 'Filter by life area' },
      ...(Object.keys(THEMES) as Theme[])
        .filter((t) => themeCounts.get(t))
        .map((t) =>
          chip(THEME_LABELS[t], themeCounts.get(t)!, filters.theme === t, null, () => {
            filters.theme = filters.theme === t ? null : t;
            rerender();
          }),
        ),
    ),
    h(
      'ul',
      { class: 'memories', 'data-testid': 'memories' },
      ...shown.map((m) => memoryCard(m, people)),
    ),
  ];
}

function memoryCard(m: EpisodicMemory, people: Map<string, string>): HTMLElement {
  const top = dominant(m.emotions);
  return h(
    'li',
    { class: 'memory', style: `border-left-color:${EMOTION_COLORS[top]}` },
    h(
      'p',
      { class: 'meta' },
      m.date,
      ' · ',
      ...(m.emotions ?? []).map(
        (e, i) => `${i ? ', ' : ''}${e.label} ${Math.round(e.score * 100)}%`,
      ),
      m.themes?.length ? ` · ${m.themes.map((t) => THEME_LABELS[t as Theme] ?? t).join(', ')}` : '',
    ),
    h('p', {}, m.text),
    m.people?.length
      ? h('p', { class: 'fine' }, 'People: ' + m.people.map((p) => people.get(p) ?? p).join(', '))
      : null,
  );
}

function twinSection(onChange: () => void): HTMLElement {
  const consent = h('input', { type: 'checkbox', id: 'consent', 'data-testid': 'consent' });
  const eleven = h('input', {
    type: 'password',
    id: 'k-eleven',
    autocomplete: 'off',
    placeholder: 'ElevenLabs API key',
  });
  const did = h('input', {
    type: 'password',
    id: 'k-did',
    autocomplete: 'off',
    placeholder: 'D-ID API key',
  });
  eleven.value = keys.eleven;
  did.value = keys.did;
  eleven.addEventListener('input', () => (keys.eleven = eleven.value.trim()));
  did.addEventListener('input', () => (keys.did = did.value.trim()));

  const log = h('p', { role: 'status', 'aria-live': 'polite', class: 'fine' });
  const fail = (e: unknown) => {
    log.textContent = (e as Error).message;
    log.className = 'error';
  };
  const say = (t: string) => {
    log.textContent = t;
    log.className = 'fine';
  };
  const ready = () => {
    if (!consent.checked) throw new Error('Confirm the consent statement first.');
  };

  const extraVoice = h('input', {
    type: 'file',
    accept: 'audio/*',
    multiple: '',
    id: 'voice-files',
  });
  const cloneBtn = h(
    'button',
    { class: 'btn', type: 'button' },
    voiceId ? 'Voice ready ✓ (re-clone)' : 'Clone my voice',
  );
  cloneBtn.addEventListener('click', () => {
    void (async () => {
      try {
        ready();
        if (!keys.eleven) throw new Error('Add your ElevenLabs API key.');
        const samples = [...recordings.map((r) => r.blob), ...Array.from(extraVoice.files ?? [])];
        const secs = recordings.reduce((n, r) => n + r.seconds, 0);
        if (!samples.length)
          throw new Error('Record or upload your voice in step 1 (or pick files here) first.');
        say(
          `Uploading ${samples.length} recording(s)${secs ? `, ${Math.round(secs / 60)} min` : ''} to ElevenLabs…`,
        );
        voiceId = await new ElevenLabs(keys.eleven).cloneVoice(
          'Evermind – my voice',
          samples.slice(0, 25),
          'Personal voice clone created by the account owner in Evermind.',
        );
        cloneBtn.textContent = 'Voice ready ✓ (re-clone)';
        say('Your voice clone is ready.');
      } catch (e) {
        fail(e);
      }
    })();
  });

  const video = h('input', {
    type: 'file',
    accept: 'video/*,image/*',
    id: 'face-video',
    'data-testid': 'face-video',
  });
  const facePreview = h('img', {
    class: 'face',
    alt: 'Chosen frame of your face',
    ...(face ? { src: face.preview } : {}),
  });
  video.addEventListener('change', () => {
    void (async () => {
      const f = video.files?.[0];
      if (!f) return;
      try {
        say('Finding the sharpest, best-lit frame of your face…');
        face = f.type.startsWith('image/')
          ? { jpeg: f, preview: URL.createObjectURL(f) }
          : await bestFrame(f);
        facePreview.src = face.preview;
        say('Face frame selected. Upload another video or photo to change it.');
      } catch (e) {
        fail(e);
      }
    })();
  });

  const q = h('input', {
    type: 'text',
    id: 'ask',
    placeholder: 'Talk to your twin, e.g. “Should I quit my job to start a company?”',
    'data-testid': 'ask',
  });
  const reply = h('div', { class: 'reply', 'aria-live': 'polite', 'data-testid': 'reply' });
  const askBtn = h('button', { class: 'btn primary', type: 'submit' }, 'Send');
  const form = h('form', { class: 'row' }, q, askBtn);

  /** One assistant bubble, with buttons to voice it or turn it into video. */
  const bubble = (
    text: string,
    citations: string[],
    inferredNote: boolean,
    question = '',
    rated = false,
  ) => {
    const body = h('blockquote', {}, text);
    const media = h('div', { class: 'media' });
    const speakBtn = h('button', { class: 'btn', type: 'button' }, '🔊 In my voice');
    const videoBtn = h('button', { class: 'btn', type: 'button' }, '🎬 As a video of me');
    let speech: Blob | null = null;
    const getSpeech = async () => {
      ready();
      if (!keys.eleven || !voiceId) throw new Error('Clone your voice first.');
      speech ??= await new ElevenLabs(keys.eleven).speak(
        voiceId,
        forSpeech(body.textContent ?? ''),
      );
      return speech;
    };
    speakBtn.addEventListener('click', () => {
      void (async () => {
        try {
          say('Generating speech…');
          media.replaceChildren(
            h('audio', { controls: '', autoplay: '', src: URL.createObjectURL(await getSpeech()) }),
          );
          say('');
        } catch (e) {
          fail(e);
        }
      })();
    });
    videoBtn.addEventListener('click', () => {
      void (async () => {
        try {
          if (!keys.did) throw new Error('Add your D-ID API key.');
          if (!face) throw new Error('Upload a video or photo of your face first.');
          say('Generating speech…');
          const url = await new DId(keys.did).talkingVideo(face.jpeg, await getSpeech(), (st) =>
            say(`Video: ${st}…`),
          );
          media.replaceChildren(
            h('video', {
              controls: '',
              autoplay: '',
              playsinline: '',
              src: url,
              class: 'twin-video',
            }),
            h(
              'p',
              { class: 'fine' },
              'AI-generated. ',
              h('a', { href: url, download: 'evermind-twin.mp4' }, 'Download'),
            ),
          );
          say('');
        } catch (e) {
          fail(e);
        }
      })();
    });
    const meta = h('p', { class: 'fine' });
    const setMeta = (cites: string[]) => {
      meta.textContent = cites.length
        ? `Grounded in ${cites.length} of your memories${inferredNote ? '; anything uncited is the twin reasoning from your profile' : ''}.`
        : inferredNote
          ? 'No memory cited: this is the twin reasoning from your profile.'
          : '';
    };
    setMeta(citations);
    const verdictBox = h('div', { class: 'verdict', 'data-testid': 'verdict' });
    /** "That's me" / "Not me" (+ correction). Shown once the reply is complete. */
    const showVerdict = (reply: string, cites: string[]) => {
      const save = async (verdict: 'me' | 'not-me', correction?: string) => {
        const v = activeVault();
        if (!v) return;
        try {
          const r = rate(v.data, {
            question,
            reply,
            verdict,
            citations: cites,
            ...(correction ? { correction } : {}),
          });
          await saveArchive(r.archive);
          verdictBox.replaceChildren(
            h(
              'p',
              { class: 'fine', role: 'status' },
              r.memory
                ? 'Thanks. Your correction is now one of your memories.'
                : verdict === 'me'
                  ? 'Noted: that sounds like you.'
                  : 'Noted: that does not sound like you.',
            ),
          );
          onChange();
        } catch (e) {
          fail(e);
        }
      };
      const yes = h(
        'button',
        { class: 'btn', type: 'button', 'data-testid': 'rate-me' },
        '✓ That’s me',
      );
      const no = h(
        'button',
        { class: 'btn', type: 'button', 'data-testid': 'rate-not-me' },
        '✗ Not me',
      );
      const fix = h('textarea', {
        rows: '3',
        class: 'answer',
        'aria-label': 'What you would really say',
        placeholder: 'What would you really say? (optional, saved as a memory)',
        'data-testid': 'correction',
      });
      const send = h(
        'button',
        { class: 'btn primary', type: 'button', 'data-testid': 'rate-send' },
        'Save',
      );
      yes.addEventListener('click', () => void save('me'));
      no.addEventListener('click', () => {
        verdictBox.replaceChildren(fix, send);
        fix.focus();
      });
      send.addEventListener('click', () => void save('not-me', fix.value));
      verdictBox.replaceChildren(
        h('span', { class: 'fine' }, 'Does this sound like you? '),
        yes,
        no,
      );
    };
    if (question && text && !rated) showVerdict(text, citations);
    const el = h(
      'div',
      { class: 'turn twin' },
      h('p', { class: 'ai-label' }, 'AI reconstruction'),
      body,
      meta,
      h('div', { class: 'cta' }, speakBtn, videoBtn),
      verdictBox,
      media,
    );
    return { el, body, setMeta, showVerdict };
  };

  const renderHistory = () =>
    reply.replaceChildren(
      ...chat.map(({ turn, citations }, i) =>
        turn.role === 'user'
          ? h('div', { class: 'turn you' }, h('p', {}, turn.text))
          : bubble(
              turn.text,
              citations,
              !!keys.anthropic,
              chat[i - 1]?.turn.text ?? '',
              !!activeVault()?.data.fidelity?.some((r) => r.reply === turn.text),
            ).el,
      ),
    );
  renderHistory();

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const v = activeVault();
    const text = q.value.trim();
    if (!v || !text) return;
    q.value = '';
    chat.push({ turn: { role: 'user', text }, citations: [] });
    reply.append(h('div', { class: 'turn you' }, h('p', {}, text)));
    if (!keys.anthropic) {
      // Offline: quote recorded memories only.
      const a = answer(v.data, text);
      chat.push({ turn: { role: 'assistant', text: a.text }, citations: a.citations });
      reply.append(bubble(a.text, a.citations, false, text).el);
      return;
    }
    const b = bubble('', [], true, text);
    b.body.textContent = '…';
    reply.append(b.el);
    askBtn.disabled = true;
    void (async () => {
      try {
        let first = true;
        const { speak } = await import('../identity/brain');
        const r = await speak(
          keys.anthropic,
          v.data,
          chat.map((c) => c.turn),
          (d: string) => {
            if (first) b.body.textContent = '';
            first = false;
            b.body.textContent += d;
          },
        );
        chat.push({ turn: { role: 'assistant', text: r.text }, citations: r.citations });
        b.setMeta(r.citations);
        b.showVerdict(r.text, r.citations);
      } catch (e) {
        b.body.textContent = '';
        chat.pop();
        fail(e);
      } finally {
        askBtn.disabled = false;
      }
    })();
  });

  return h(
    'section',
    { class: 'studio-section', 'aria-labelledby': 'twin-h' },
    h('h2', { id: 'twin-h' }, '4 · Your digital self'),
    h(
      'p',
      {},
      'Your voice and face are cloned by ElevenLabs and D-ID, using API keys from your own accounts. Keys stay in this tab’s memory and are sent only to those two services. Your recordings and one still of your face are uploaded to them; your memories and transcripts are not, only the sentence being spoken.',
    ),
    h(
      'label',
      { class: 'consent' },
      consent,
      ' This is my own voice and face, and I consent to creating an AI clone of them. I will not use it to impersonate me to anyone without telling them it is AI.',
    ),
    h('div', { class: 'row' }, h('label', { for: 'k-eleven' }, 'ElevenLabs key'), eleven),
    h('div', { class: 'row' }, h('label', { for: 'k-did' }, 'D-ID key'), did),
    h('h3', {}, 'Voice'),
    h(
      'div',
      { class: 'row' },
      h('label', { for: 'voice-files' }, 'Extra clean voice samples (optional)'),
      extraVoice,
      cloneBtn,
    ),
    h('h3', {}, 'Face'),
    h(
      'div',
      { class: 'row' },
      h('label', { for: 'face-video' }, 'A video (or photo) looking at the camera'),
      video,
    ),
    facePreview,
    h('h3', {}, 'Talk to your twin'),
    h(
      'p',
      { class: 'fine' },
      'With an Anthropic key (step 1) your twin thinks and talks like you, citing memories and reasoning from your profile. Without one it can only quote what you recorded.',
    ),
    reply,
    form,
    log,
  );
}
