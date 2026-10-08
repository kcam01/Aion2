import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../emblem.js', import.meta.url), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

function setup({ reduced = false, saveData = false } = {}) {
  const video = new EventTarget();
  video.dataset = { src: '/assets/exalted-crest-animated.mp4' };
  video.paused = true;
  video.playCalls = 0;
  video.hasAttribute = name => name === 'src' && Boolean(video.src);
  video.pause = () => { video.paused = true; };
  video.play = () => {
    video.playCalls++;
    video.paused = false;
    video.dispatchEvent(new Event('playing'));
    return Promise.resolve();
  };
  const toggle = new EventTarget();
  const attributes = {};
  toggle.setAttribute = (key, value) => { attributes[key] = value; };
  toggle.getAttribute = key => attributes[key];
  const emblem = { dataset: {}, querySelector: selector => selector === 'video' ? video : toggle };
  const document = new EventTarget();
  document.hidden = false;
  document.querySelectorAll = () => [emblem];
  const motion = new EventTarget();
  motion.matches = reduced;
  let observe;
  class IntersectionObserver {
    constructor(callback) { observe = callback; }
    observe() {}
  }
  runInNewContext(source, { document, navigator: { connection: { saveData } }, matchMedia: () => motion, window: { IntersectionObserver }, IntersectionObserver });
  return { video, toggle, emblem, document, motion,
    visible(value) { observe([{ isIntersecting: value }]); },
    click() { toggle.dispatchEvent(new Event('click')); },
    reduce(value) { motion.matches = value; motion.dispatchEvent(new Event('change')); },
    hide(value) { document.hidden = value; document.dispatchEvent(new Event('visibilitychange')); },
  };
}

test('reduced-motion and data-saving visits do not download an animation', async () => {
  const reduced = setup({ reduced: true });
  reduced.visible(true);
  assert.equal(reduced.video.src, undefined);
  assert.equal(reduced.toggle.hidden, false);
  assert.equal(reduced.toggle.getAttribute('aria-label'), 'Play emblem animation');
  reduced.reduce(false);
  await flush();
  assert.equal(reduced.video.paused, false);
  const dataSaver = setup({ saveData: true });
  dataSaver.visible(true);
  assert.equal(dataSaver.video.src, undefined);
  assert.equal(dataSaver.toggle.getAttribute('aria-label'), 'Play emblem animation');
  dataSaver.click();
  await flush();
  assert.equal(dataSaver.video.paused, false);
});

test('reduced motion permits explicit playback and a new preference change revokes it', async () => {
  const view = setup({ reduced: true });
  view.visible(true);
  view.click();
  await flush();
  assert.equal(view.video.paused, false);
  assert.equal(view.emblem.dataset.motionOptIn, 'true');
  view.click();
  assert.equal(view.video.paused, true);
  view.click();
  await flush();
  view.reduce(true);
  assert.equal(view.video.paused, true);
  assert.equal(view.emblem.dataset.motionOptIn, 'false');
});

test('leaving the viewport or hiding the tab pauses and returning resumes', async () => {
  const view = setup();
  assert.equal(view.video.src, undefined);
  view.visible(true);
  await flush();
  assert.equal(view.video.paused, false);
  assert.equal(view.video.muted, true);
  view.visible(false);
  assert.equal(view.video.paused, true);
  view.visible(true);
  await flush();
  view.hide(true);
  assert.equal(view.video.paused, true);
  view.hide(false);
  await flush();
  assert.equal(view.video.paused, false);
});

test('a user pause persists across viewport and tab visibility changes', async () => {
  const view = setup();
  view.visible(true);
  await flush();
  view.click();
  view.visible(false);
  view.hide(true);
  view.visible(true);
  view.hide(false);
  await flush();
  assert.equal(view.video.paused, true);
  assert.equal(view.toggle.getAttribute('aria-label'), 'Play emblem animation');
  view.click();
  await flush();
  assert.equal(view.video.paused, false);
});

test('a late play promise cannot undo a pause made during loading', async () => {
  const view = setup();
  let finish;
  view.video.play = () => new Promise(resolve => { finish = () => { view.video.paused = false; resolve(); }; });
  view.visible(true);
  view.click();
  finish();
  await flush();
  assert.equal(view.video.paused, true);
});

test('blocked autoplay offers a manual retry without a rejection loop', async () => {
  const view = setup();
  const play = view.video.play;
  view.video.play = () => Promise.reject(new DOMException('Blocked', 'NotAllowedError'));
  view.visible(true);
  await flush();
  assert.equal(view.emblem.dataset.userPaused, 'true');
  assert.equal(view.toggle.getAttribute('aria-label'), 'Play emblem animation');
  view.video.play = play;
  view.click();
  await flush();
  assert.equal(view.video.paused, false);
});

test('a media error restores the original emblem and hides the unusable control', async () => {
  const view = setup();
  view.visible(true);
  await flush();
  view.video.dispatchEvent(new Event('error'));
  assert.equal(view.emblem.dataset.videoReady, 'false');
  assert.equal(view.video.paused, true);
  assert.equal(view.toggle.hidden, true);
  view.visible(false);
  view.visible(true);
  assert.equal(view.video.paused, true);
});
