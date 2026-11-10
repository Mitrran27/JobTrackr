<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import api, { errMsg } from '../api';
import { auth } from '../auth';
import { KINDS, downloadDoc, kindLabel, template } from '../docs';
import { fmtDate } from '../utils';

const router = useRouter();
const docs = ref([]);
const loading = ref(true);
const err = ref('');
const filter = ref('ALL');
const uploadKind = ref('CV');
const uploading = ref(false);
const busyId = ref('');

const shown = computed(() => (filter.value === 'ALL' ? docs.value : docs.value.filter((d) => d.kind === filter.value)));
const count = (k) => docs.value.filter((d) => d.kind === k).length;

onMounted(load);

async function load() {
  loading.value = true;
  try {
    docs.value = (await api.get('/documents')).data;
  } catch (e) {
    err.value = errMsg(e);
  }
  loading.value = false;
}

async function upload(ev) {
  const file = ev.target.files?.[0];
  ev.target.value = '';
  if (!file) return;
  err.value = '';
  uploading.value = true;
  try {
    const fd = new FormData();
    fd.append('kind', uploadKind.value);
    fd.append('file', file);
    const { data } = await api.post('/documents/upload', fd);
    router.push(`/documents/${data.id}`);
  } catch (e) {
    err.value = errMsg(e);
  }
  uploading.value = false;
}

async function createBlank(kind) {
  err.value = '';
  try {
    const title = kind === 'CV' ? 'My CV' : 'Cover letter';
    const { data } = await api.post('/documents', { kind, title, html: template(kind, auth.user?.name) });
    router.push(`/documents/${data.id}`);
  } catch (e) {
    err.value = errMsg(e);
  }
}

async function duplicate(d) {
  busyId.value = d.id;
  try {
    const { data } = await api.post(`/documents/${d.id}/duplicate`);
    docs.value.unshift({ ...data, html: undefined });
  } catch (e) {
    err.value = errMsg(e);
  }
  busyId.value = '';
}

async function remove(d) {
  if (!confirm(`Delete “${d.title}”? This cannot be undone.`)) return;
  try {
    await api.delete(`/documents/${d.id}`);
    docs.value = docs.value.filter((x) => x.id !== d.id);
  } catch (e) {
    err.value = errMsg(e);
  }
}

async function download(d, format) {
  busyId.value = d.id + format;
  err.value = '';
  try {
    await downloadDoc(d.id, format, d.title);
  } catch (e) {
    err.value = e.message;
  }
  busyId.value = '';
}
</script>

<template>
  <div class="page-head">
    <div>
      <h1>CV &amp; cover letters</h1>
      <p class="sub">Upload your CV or cover letter, edit it here, then download it as PDF or Word.</p>
    </div>
    <div class="row wrap">
      <button class="btn ghost" @click="createBlank('CV')">+ New CV</button>
      <button class="btn ghost" @click="createBlank('COVER_LETTER')">+ New cover letter</button>
    </div>
  </div>

  <div class="grid" style="grid-template-columns: minmax(0, 340px) minmax(0, 1fr); align-items: start" id="docs-grid">
    <div class="card stack">
      <h2 style="margin: 0">Upload</h2>
      <div class="stepper">
        <button v-for="k in KINDS" :key="k.key" class="step" :class="{ on: uploadKind === k.key }" :style="uploadKind === k.key ? { background: 'var(--brand)' } : null" @click="uploadKind = k.key">
          {{ k.label }}
        </button>
      </div>
      <label class="drop">
        <input
          type="file"
          accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          style="display: none"
          :disabled="uploading"
          @change="upload"
        />
        <div v-if="uploading" class="row" style="justify-content: center"><span class="spinner dark"></span> Reading your file…</div>
        <template v-else>
          <b>Upload {{ uploadKind === 'CV' ? 'a CV' : 'a cover letter' }}</b>
          <div class="small muted">PDF, Word (.docx) or text, up to 8 MB</div>
        </template>
      </label>
      <p class="small muted">
        Word files keep their headings, bold text and bullet points. PDFs are converted from their text, so check the
        layout after uploading. Scanned (image) PDFs cannot be read.
      </p>
    </div>

    <div class="card">
      <div class="tabs" style="margin-bottom: 8px">
        <button class="tab" :class="{ on: filter === 'ALL' }" @click="filter = 'ALL'">All ({{ docs.length }})</button>
        <button v-for="k in KINDS" :key="k.key" class="tab" :class="{ on: filter === k.key }" @click="filter = k.key">
          {{ k.label }}s ({{ count(k.key) }})
        </button>
      </div>
      <div v-if="err" class="alert err" style="margin-bottom: 8px">{{ err }}</div>

      <div v-if="loading" class="stack">
        <div v-for="i in 3" :key="i" class="skeleton" style="height: 52px"></div>
      </div>
      <div v-else-if="!shown.length" class="empty">
        <p>No documents yet.</p>
        <p class="small">Upload one, or start from a blank template.</p>
      </div>
      <div v-for="d in shown" v-else :key="d.id" class="list-item doc-item">
        <router-link :to="`/documents/${d.id}`" class="grow" style="color: inherit; text-decoration: none">
          <div class="row" style="gap: 8px">
            <b style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap">{{ d.title }}</b>
            <span class="chip" :class="{ good: d.kind === 'COVER_LETTER' }">{{ kindLabel(d.kind) }}</span>
          </div>
          <div class="small muted">
            Edited {{ fmtDate(d.updatedAt, true) }}<span v-if="d.sourceName"> · from {{ d.sourceName }}</span>
          </div>
        </router-link>
        <div class="row wrap doc-actions">
          <router-link :to="`/documents/${d.id}`" class="btn sm">Edit</router-link>
          <button class="btn ghost sm" :disabled="busyId === d.id + 'pdf'" @click="download(d, 'pdf')">PDF</button>
          <button class="btn ghost sm" :disabled="busyId === d.id + 'docx'" @click="download(d, 'docx')">Word</button>
          <button class="btn ghost sm" title="Duplicate" :disabled="busyId === d.id" @click="duplicate(d)">Copy</button>
          <button class="btn danger sm" title="Delete" @click="remove(d)">Delete</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@media (max-width: 860px) {
  #docs-grid { grid-template-columns: 1fr !important; }
  .doc-item { flex-direction: column; align-items: stretch; }
}
</style>
