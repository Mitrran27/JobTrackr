<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import api, { errMsg } from '../api';

const ALL = [
  ['summary', 'Profile summary'],
  ['education', 'Education'],
  ['experience', 'Experience'],
  ['projects', 'Projects'],
  ['skills', 'Skills'],
  ['certifications', 'Certifications'],
  ['publications', 'Publications'],
  ['references', 'References'],
];
const chosen = ref(ALL.map((a) => a[0]));
const images = ref(true);
const pdfUrl = ref('');
const busy = ref(false);
const uploading = ref(false);
const err = ref('');
const result = ref(null);
const hasCv = ref(false);

onMounted(async () => {
  try {
    const { data } = await api.get('/profile');
    hasCv.value = data.profile.hasCvText;
  } catch {
    /* ignore */
  }
  generate();
});
onBeforeUnmount(() => pdfUrl.value && URL.revokeObjectURL(pdfUrl.value));

async function upload(ev) {
  const file = ev.target.files?.[0];
  ev.target.value = '';
  if (!file) return;
  err.value = '';
  result.value = null;
  uploading.value = true;
  try {
    const fd = new FormData();
    fd.append('file', file);
    result.value = (await api.post('/cv/upload', fd)).data;
    hasCv.value = true;
    await api.post('/jobs/rescore-all');
    generate();
  } catch (e) {
    err.value = errMsg(e);
  }
  uploading.value = false;
}

async function fetchPdf(download = false) {
  const params = { sections: chosen.value.join(','), images: images.value ? 1 : 0 };
  const { data } = await api.get('/cv/pdf', { params, responseType: 'blob' });
  return URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
}

async function generate() {
  busy.value = true;
  err.value = '';
  try {
    const next = await fetchPdf();
    if (pdfUrl.value) URL.revokeObjectURL(pdfUrl.value);
    pdfUrl.value = next;
  } catch (e) {
    err.value = e?.response?.data instanceof Blob ? 'Could not build the CV' : errMsg(e);
  }
  busy.value = false;
}

function download() {
  const a = document.createElement('a');
  a.href = pdfUrl.value;
  a.download = 'CV.pdf';
  a.click();
}

async function viewOriginal() {
  try {
    const { data } = await api.get('/cv/original', { responseType: 'blob' });
    window.open(URL.createObjectURL(data), '_blank');
  } catch (e) {
    err.value = errMsg(e);
  }
}
</script>

<template>
  <div class="page-head">
    <div>
      <h1>CV builder</h1>
      <p class="sub">Upload your current CV for matching, then generate a clean PDF from your profile.</p>
    </div>
  </div>

  <div class="grid cols-2" style="align-items: start; grid-template-columns: minmax(0, 360px) minmax(0, 1fr)">
    <div class="stack">
      <div class="card stack">
        <h2 style="margin: 0">1. Your CV</h2>
        <label class="drop">
          <input type="file" accept="application/pdf,text/plain" style="display: none" :disabled="uploading" @change="upload" />
          <div v-if="uploading" class="row" style="justify-content: center"><span class="spinner dark"></span> Reading your CV…</div>
          <template v-else>
            <b>{{ hasCv ? 'Replace your CV' : 'Upload your CV' }}</b>
            <div class="small muted">PDF up to 5 MB</div>
          </template>
        </label>
        <div v-if="result" class="alert ok small">
          Read {{ result.chars.toLocaleString() }} characters.
          <span v-if="result.skillsAdded.length">Added {{ result.skillsAdded.length }} skills: {{ result.skillsAdded.slice(0, 8).join(', ') }}{{ result.skillsAdded.length > 8 ? '…' : '' }}.</span>
          Your jobs were re-scored.
        </div>
        <button v-if="hasCv" class="btn ghost sm" @click="viewOriginal">View uploaded CV</button>
        <p class="small muted">Your CV text is used to score each job. Contact details and skills are filled in only where your profile is empty.</p>
      </div>

      <div class="card stack">
        <h2 style="margin: 0">2. Generate</h2>
        <label v-for="[k, label] in ALL" :key="k" class="check"><input v-model="chosen" type="checkbox" :value="k" /> {{ label }}</label>
        <label class="check"><input v-model="images" type="checkbox" /> Include project images</label>
        <div class="row wrap">
          <button class="btn" :disabled="busy" @click="generate"><span v-if="busy" class="spinner"></span>Update preview</button>
          <button class="btn ghost" :disabled="!pdfUrl" @click="download">Download PDF</button>
        </div>
        <router-link to="/profile" class="small">Edit your profile details →</router-link>
      </div>
    </div>

    <div class="card stack">
      <div class="row between">
        <h2 style="margin: 0">Preview</h2>
        <a v-if="pdfUrl" :href="pdfUrl" target="_blank" class="btn ghost sm">Open in new tab ↗</a>
      </div>
      <div v-if="err" class="alert err">{{ err }}</div>
      <iframe v-if="pdfUrl" :src="pdfUrl" class="pdf-frame" title="CV preview"></iframe>
      <div v-else-if="busy" class="empty"><div class="spinner dark" style="margin: auto"></div></div>
      <p class="small muted">If the preview is blank on your phone, use “Open in new tab” or download the PDF.</p>
    </div>
  </div>
</template>
