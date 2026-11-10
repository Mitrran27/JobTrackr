<script setup>
import { nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import api, { errMsg } from '../api';
import { KINDS, cleanPaste, downloadDoc } from '../docs';

const route = useRoute();
const router = useRouter();
const id = route.params.id;

const doc = ref(null);
const title = ref('');
const kind = ref('CV');
const editor = ref(null);
const err = ref('');
const status = ref('saved'); // saved | dirty | saving | error
const exporting = ref('');
const active = reactive({ bold: false, italic: false, underline: false, strikeThrough: false, block: 'p', ul: false, ol: false, align: 'left' });
let timer = null;
let saving = null;
let range = null; // last selection inside the editor, restored after using the toolbar dropdown

onMounted(async () => {
  try {
    const { data } = await api.get(`/documents/${id}`);
    doc.value = data;
    title.value = data.title;
    kind.value = data.kind;
    await nextTick();
    editor.value.innerHTML = data.html || '<p><br></p>';
    try {
      document.execCommand('defaultParagraphSeparator', false, 'p');
      document.execCommand('styleWithCSS', false, false);
    } catch {
      /* older browsers */
    }
  } catch (e) {
    err.value = errMsg(e);
  }
  document.addEventListener('selectionchange', refreshState);
  window.addEventListener('beforeunload', warnUnload);
});

onBeforeUnmount(() => {
  document.removeEventListener('selectionchange', refreshState);
  window.removeEventListener('beforeunload', warnUnload);
  clearTimeout(timer);
});

onBeforeRouteLeave(async () => {
  if (status.value === 'dirty' || status.value === 'error') await save();
  if (status.value === 'error') return confirm('Your latest changes could not be saved. Leave anyway?');
  return true;
});

function warnUnload(e) {
  if (status.value !== 'saved') {
    e.preventDefault();
    e.returnValue = '';
  }
}

function changed() {
  status.value = 'dirty';
  clearTimeout(timer);
  timer = setTimeout(save, 1200);
}

async function save() {
  clearTimeout(timer);
  if (saving) await saving; // let an in-flight save finish first
  if (status.value === 'saved' || !editor.value) return;
  status.value = 'saving';
  const payload = { title: title.value.trim() || 'Untitled', kind: kind.value, html: editor.value.innerHTML };
  saving = api
    .patch(`/documents/${id}`, payload)
    .then(() => {
      // if more edits arrived while saving, they will be saved by their own timer
      if (status.value === 'saving') status.value = 'saved';
      err.value = '';
    })
    .catch((e) => {
      status.value = 'error';
      err.value = errMsg(e);
    })
    .finally(() => (saving = null));
  await saving;
}

// ------------------------------------------------------------ formatting

function exec(cmd, value = null) {
  const sel = window.getSelection();
  const lost = !sel?.anchorNode || !editor.value.contains(sel.anchorNode);
  editor.value.focus();
  if (range && lost) {
    sel.removeAllRanges();
    sel.addRange(range);
  }
  document.execCommand(cmd, false, value);
  refreshState();
  changed();
}

function setBlock(tag) {
  exec('formatBlock', `<${tag}>`);
}

/** keep the editor's selection when clicking toolbar buttons (but let the dropdown open) */
function keepSelection(e) {
  if (!e.target.closest('select')) e.preventDefault();
}

function addLink() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) {
    alert('Select the text you want to turn into a link first.');
    return;
  }
  let url = prompt('Link address (https://…, mailto:… or tel:…)', 'https://');
  if (!url) return;
  url = url.trim();
  if (/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(url)) url = 'mailto:' + url;
  else if (!/^(https?:|mailto:|tel:)/i.test(url)) url = 'https://' + url;
  exec('createLink', url);
}

function refreshState() {
  const sel = window.getSelection();
  if (!editor.value || !sel?.anchorNode || !editor.value.contains(sel.anchorNode)) return;
  if (sel.rangeCount) range = sel.getRangeAt(0).cloneRange();
  for (const k of ['bold', 'italic', 'underline', 'strikeThrough']) active[k] = document.queryCommandState(k);
  active.ul = document.queryCommandState('insertUnorderedList');
  active.ol = document.queryCommandState('insertOrderedList');
  let n = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
  active.block = 'p';
  active.align = 'left';
  while (n && n !== editor.value) {
    if (/^(P|H1|H2|H3|LI|DIV)$/.test(n.tagName)) {
      if (/^H[123]$/.test(n.tagName)) active.block = n.tagName.toLowerCase();
      active.align = n.style.textAlign || 'left';
      break;
    }
    n = n.parentElement;
  }
}

function onPaste(e) {
  const html = e.clipboardData?.getData('text/html');
  const text = e.clipboardData?.getData('text/plain');
  if (!html && !text) return;
  e.preventDefault();
  if (html) document.execCommand('insertHTML', false, cleanPaste(html));
  else document.execCommand('insertText', false, text);
  changed();
}

function onKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    save();
  }
}

async function exportAs(format) {
  exporting.value = format;
  err.value = '';
  try {
    await save();
    if (status.value === 'error') throw new Error(err.value || 'Save failed');
    await downloadDoc(id, format, title.value);
  } catch (e) {
    err.value = e.message;
  }
  exporting.value = '';
}

const statusText = { saved: 'All changes saved', dirty: 'Unsaved changes', saving: 'Saving…', error: 'Not saved' };
</script>

<template>
  <div class="page-head">
    <div class="grow" style="min-width: 220px">
      <router-link to="/documents" class="small">← All documents</router-link>
      <input v-model="title" class="title-input" maxlength="150" placeholder="Document title" aria-label="Document title" @input="changed" />
    </div>
    <div class="row wrap">
      <select v-model="kind" style="width: auto" aria-label="Document type" @change="changed">
        <option v-for="k in KINDS" :key="k.key" :value="k.key">{{ k.label }}</option>
      </select>
      <button class="btn ghost" :disabled="!doc || !!exporting" @click="exportAs('docx')">
        <span v-if="exporting === 'docx'" class="spinner dark"></span>Download Word
      </button>
      <button class="btn" :disabled="!doc || !!exporting" @click="exportAs('pdf')">
        <span v-if="exporting === 'pdf'" class="spinner"></span>Download PDF
      </button>
    </div>
  </div>

  <div v-if="err" class="alert err" style="margin-bottom: 12px">{{ err }}</div>

  <div v-if="doc" class="editor-wrap">
    <div class="toolbar" role="toolbar" aria-label="Formatting" @mousedown="keepSelection">
      <select :value="active.block" title="Text style" aria-label="Text style" @change="setBlock($event.target.value)">
        <option value="p">Normal text</option>
        <option value="h1">Title</option>
        <option value="h2">Section heading</option>
        <option value="h3">Subheading</option>
      </select>
      <span class="sep"></span>
      <button :class="{ on: active.bold }" title="Bold (Ctrl+B)" @click="exec('bold')"><b>B</b></button>
      <button :class="{ on: active.italic }" title="Italic (Ctrl+I)" @click="exec('italic')"><i>I</i></button>
      <button :class="{ on: active.underline }" title="Underline (Ctrl+U)" @click="exec('underline')"><u>U</u></button>
      <button :class="{ on: active.strikeThrough }" title="Strikethrough" @click="exec('strikeThrough')"><s>S</s></button>
      <span class="sep"></span>
      <button :class="{ on: active.ul }" title="Bullet list" @click="exec('insertUnorderedList')">
        <svg viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1.2" /><circle cx="4.5" cy="12" r="1.2" /><circle cx="4.5" cy="18" r="1.2" /></svg>
      </button>
      <button :class="{ on: active.ol }" title="Numbered list" @click="exec('insertOrderedList')">
        <svg viewBox="0 0 24 24"><path d="M10 6h10M10 12h10M10 18h10M4 4.5h1.5V9M4 9h3M4 14.5h3l-3 4h3" /></svg>
      </button>
      <button title="Decrease indent" @click="exec('outdent')">
        <svg viewBox="0 0 24 24"><path d="M11 6h9M11 12h9M11 18h9M7 9l-3 3 3 3" /></svg>
      </button>
      <button title="Increase indent" @click="exec('indent')">
        <svg viewBox="0 0 24 24"><path d="M11 6h9M11 12h9M11 18h9M4 9l3 3-3 3" /></svg>
      </button>
      <span class="sep"></span>
      <button :class="{ on: active.align === 'left' || active.align === 'start' }" title="Align left" @click="exec('justifyLeft')">
        <svg viewBox="0 0 24 24"><path d="M4 6h16M4 10h10M4 14h16M4 18h10" /></svg>
      </button>
      <button :class="{ on: active.align === 'center' }" title="Centre" @click="exec('justifyCenter')">
        <svg viewBox="0 0 24 24"><path d="M4 6h16M7 10h10M4 14h16M7 18h10" /></svg>
      </button>
      <button :class="{ on: active.align === 'right' }" title="Align right" @click="exec('justifyRight')">
        <svg viewBox="0 0 24 24"><path d="M4 6h16M10 10h10M4 14h16M10 18h10" /></svg>
      </button>
      <button :class="{ on: active.align === 'justify' }" title="Justify" @click="exec('justifyFull')">
        <svg viewBox="0 0 24 24"><path d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
      </button>
      <span class="sep"></span>
      <button title="Add link" @click="addLink">
        <svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>
      </button>
      <button title="Clear formatting" @click="exec('removeFormat')">
        <svg viewBox="0 0 24 24"><path d="M6 5h12M12 5l-3 14M4 20l16-16" /></svg>
      </button>
      <span class="sep"></span>
      <button title="Undo (Ctrl+Z)" @click="exec('undo')">
        <svg viewBox="0 0 24 24"><path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" /></svg>
      </button>
      <button title="Redo (Ctrl+Y)" @click="exec('redo')">
        <svg viewBox="0 0 24 24"><path d="M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" /></svg>
      </button>
      <span class="status small" :class="status">{{ statusText[status] }}</span>
    </div>

    <div class="paper-scroll">
      <div
        ref="editor"
        class="paper"
        contenteditable="true"
        spellcheck="true"
        aria-label="Document editor"
        @input="changed"
        @paste="onPaste"
        @keydown="onKeydown"
        @keyup="refreshState"
        @mouseup="refreshState"
      ></div>
    </div>
    <p class="small muted" style="margin-top: 10px">
      Changes save automatically. The download uses the same fonts and headings you see here; images and tables from
      uploaded files are not kept.
    </p>
  </div>
  <div v-else-if="!err" class="skeleton" style="height: 70vh"></div>
</template>

<style scoped>
.title-input {
  font-size: 1.45rem; font-weight: 700; letter-spacing: -0.02em; border-color: transparent; background: transparent;
  padding: 4px 8px; margin: 4px 0 0 -8px;
}
.title-input:hover { border-color: var(--line); }

.editor-wrap { display: flex; flex-direction: column; }
.toolbar {
  position: sticky; top: 0; z-index: 5; display: flex; flex-wrap: wrap; align-items: center; gap: 2px;
  padding: 6px 8px; background: var(--surface); border: 1px solid var(--line); border-radius: 12px 12px 0 0;
}
.toolbar select { width: auto; padding: 6px 8px; font-size: 0.85rem; margin-right: 2px; }
.toolbar button {
  font: inherit; width: 34px; height: 34px; display: inline-grid; place-items: center; border: 0; border-radius: 8px;
  background: transparent; color: var(--ink); cursor: pointer; font-size: 0.95rem;
}
.toolbar button:hover { background: var(--bg); }
.toolbar button.on { background: var(--brand-soft); color: var(--brand-ink); }
.toolbar svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; }
.toolbar circle { fill: currentColor; stroke: none; }
.sep { width: 1px; height: 22px; background: var(--line); margin: 0 4px; }
.status { margin-left: auto; padding: 0 6px; color: var(--muted); white-space: nowrap; }
.status.dirty, .status.saving { color: var(--warn); }
.status.error { color: var(--bad); font-weight: 600; }

.paper-scroll {
  background: #e9ebf3; border: 1px solid var(--line); border-top: 0; border-radius: 0 0 12px 12px;
  padding: 28px 16px; overflow-x: auto;
}
/* roughly an A4 page with ~2 cm margins, in the same serif font as the export */
.paper {
  max-width: 794px; min-height: 1123px; margin: 0 auto; background: #fff; color: #000; padding: 75px;
  box-shadow: 0 2px 10px rgba(27, 31, 59, 0.12); outline: none;
  font-family: 'Times New Roman', Times, serif; font-size: 11pt; line-height: 1.35; overflow-wrap: anywhere;
}
.paper :deep(h1) { font-size: 18pt; margin: 0 0 6px; }
.paper :deep(h2) { font-size: 13.5pt; margin: 14px 0 6px; padding-bottom: 2px; border-bottom: 0.8px solid #000; }
.paper :deep(h3) { font-size: 12pt; margin: 10px 0 4px; }
.paper :deep(p) { margin: 0 0 6px; }
.paper :deep(ul), .paper :deep(ol) { margin: 0 0 6px; padding-left: 26px; }
.paper :deep(li) { margin: 0 0 2px; }
.paper :deep(a) { color: #1a0dab; text-decoration: underline; }
.paper :deep(blockquote) { margin: 0 0 0 26px; }

@media (max-width: 860px) {
  .toolbar { top: 0; border-radius: 10px 10px 0 0; }
  .paper-scroll { padding: 10px 6px; }
  .paper { padding: 28px 22px; min-height: 70vh; }
}
</style>
