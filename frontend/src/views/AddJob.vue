<script setup>
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import api, { errMsg } from '../api';
import { STATUSES } from '../utils';
import MatchPanel from '../components/MatchPanel.vue';

const router = useRouter();
const url = ref('');
const rawText = ref('');
const pasteMode = ref(false);
const busy = ref(false);
const saving = ref(false);
const err = ref('');
const match = ref(null);
const source = ref('');
const warning = ref('');
const job = reactive({ url: '', title: '', company: '', location: '', description: '', salaryText: '', employmentType: '', status: 'SAVED', notes: '' });

async function analyse() {
  err.value = '';
  if (!pasteMode.value && !url.value.trim()) return (err.value = 'Paste a job link first');
  if (pasteMode.value && rawText.value.trim().length < 40) return (err.value = 'Paste the full job description');
  busy.value = true;
  match.value = null;
  warning.value = '';
  try {
    const { data } = await api.post('/jobs/preview', { url: url.value.trim(), rawText: pasteMode.value ? rawText.value : undefined });
    Object.assign(job, data.job, { status: job.status, notes: job.notes });
    match.value = data.match;
    source.value = data.job.source;
    warning.value = data.job.warning || '';
    if (warning.value) pasteMode.value = true; // let the user add the full description
  } catch (e) {
    err.value = errMsg(e);
    if (!pasteMode.value) pasteMode.value = true;
  }
  busy.value = false;
}

async function save() {
  err.value = '';
  saving.value = true;
  try {
    const { data } = await api.post('/jobs', { ...job });
    router.push(`/jobs/${data.id}`);
  } catch (e) {
    err.value = errMsg(e);
    saving.value = false;
  }
}
</script>

<template>
  <div class="page-head">
    <div>
      <h1>Add a job</h1>
      <p class="sub">Paste a link. I read the ad and score it against your profile and CV.</p>
    </div>
  </div>

  <div class="stack" style="gap: 18px; max-width: 860px">
    <form class="card stack" @submit.prevent="analyse">
      <label class="field">
        Job URL
        <input v-model="url" type="url" placeholder="https://company.com/careers/software-engineer" inputmode="url" />
      </label>
      <label v-if="pasteMode" class="field">
        Or paste the job description
        <textarea v-model="rawText" rows="8" placeholder="Paste the whole job post here (title on the first line works best)"></textarea>
      </label>
      <div v-if="err" class="alert err">{{ err }}</div>
      <div class="row wrap">
        <button class="btn" :disabled="busy">
          <span v-if="busy" class="spinner"></span>{{ busy ? 'Reading the job…' : 'Analyse job' }}
        </button>
        <button type="button" class="btn ghost" @click="pasteMode = !pasteMode">{{ pasteMode ? 'Use link only' : 'Paste text instead' }}</button>
      </div>
      <p class="small muted">Some sites (LinkedIn, Indeed, JobStreet) block automated reading. If that happens, paste the description and the score still works.</p>
    </form>

    <template v-if="match">
      <div v-if="warning" class="alert info">{{ warning }} Use the box above, then press Analyse job again.</div>
      <MatchPanel :match="match" />

      <form class="card stack" @submit.prevent="save">
        <div class="row between">
          <h2 style="margin: 0">Job details</h2>
          <span class="chip">{{ source === 'structured' ? 'Read from job data' : source === 'page' ? 'Read from page (check details)' : 'From pasted text' }}</span>
        </div>
        <div class="form-grid">
          <label class="field full">Title<input v-model="job.title" required /></label>
          <label class="field">Company<input v-model="job.company" /></label>
          <label class="field">Location<input v-model="job.location" /></label>
          <label class="field">Salary<input v-model="job.salaryText" placeholder="Not listed" /></label>
          <label class="field">Type<input v-model="job.employmentType" placeholder="Full time" /></label>
          <label class="field full">
            Status
            <select v-model="job.status"><option v-for="s in STATUSES" :key="s.key" :value="s.key">{{ s.label }}: {{ s.hint }}</option></select>
          </label>
          <label class="field full">Notes<textarea v-model="job.notes" rows="3" placeholder="Referral, contact person, why you like it…"></textarea></label>
        </div>
        <details>
          <summary class="small muted" style="cursor: pointer">Job description ({{ job.description.length }} characters)</summary>
          <textarea v-model="job.description" rows="10" style="margin-top: 8px"></textarea>
        </details>
        <div class="row wrap">
          <button class="btn" :disabled="saving">{{ saving ? 'Saving…' : 'Save job' }}</button>
          <a v-if="job.url" :href="job.url" target="_blank" rel="noopener" class="btn ghost">Open original ↗</a>
        </div>
      </form>
    </template>
  </div>
</template>
