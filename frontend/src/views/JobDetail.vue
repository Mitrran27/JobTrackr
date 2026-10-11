<script setup>
import { onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api, { errMsg } from '../api';
import { STATUSES, fmtDate, fromLocalInput, toDateInput, toLocalInput } from '../utils';
import MatchPanel from '../components/MatchPanel.vue';

const route = useRoute();
const router = useRouter();
const job = ref(null);
const form = reactive({ title: '', company: '', location: '', salaryText: '', employmentType: '', url: '', notes: '', description: '', appliedAt: '', interviewAt: '', followUpAt: '' });
const err = ref('');
const msg = ref('');
const saving = ref(false);
const busyScore = ref(false);

function fill(j) {
  job.value = j;
  for (const k of ['title', 'company', 'location', 'salaryText', 'employmentType', 'url', 'notes', 'description']) form[k] = j[k] || '';
  form.appliedAt = toDateInput(j.appliedAt);
  form.interviewAt = toLocalInput(j.interviewAt);
  form.followUpAt = toDateInput(j.followUpAt);
}

onMounted(async () => {
  try {
    fill((await api.get(`/jobs/${route.params.id}`)).data);
  } catch (e) {
    err.value = errMsg(e);
  }
});

async function setStatus(status) {
  if (job.value.status === status) return;
  try {
    fill((await api.patch(`/jobs/${job.value.id}`, { status })).data);
    msg.value = `Moved to ${STATUSES.find((s) => s.key === status).label}`;
  } catch (e) {
    err.value = errMsg(e);
  }
}

async function save() {
  err.value = '';
  msg.value = '';
  saving.value = true;
  try {
    const body = {
      ...form,
      appliedAt: form.appliedAt ? new Date(form.appliedAt).toISOString() : null,
      interviewAt: fromLocalInput(form.interviewAt),
      followUpAt: form.followUpAt ? new Date(form.followUpAt).toISOString() : null,
    };
    fill((await api.patch(`/jobs/${job.value.id}`, body)).data);
    msg.value = 'Saved';
  } catch (e) {
    err.value = errMsg(e);
  }
  saving.value = false;
}

async function rescore() {
  busyScore.value = true;
  try {
    await api.post(`/jobs/${job.value.id}/rescore`);
    fill((await api.get(`/jobs/${job.value.id}`)).data);
    msg.value = 'Match score refreshed from your latest profile';
  } catch (e) {
    err.value = errMsg(e);
  }
  busyScore.value = false;
}

async function remove() {
  if (!confirm('Delete this job?')) return;
  await api.delete(`/jobs/${job.value.id}`);
  router.push('/board');
}
</script>

<template>
  <div v-if="err && !job" class="alert err">{{ err }}</div>
  <div v-else-if="!job" class="empty"><div class="spinner dark" style="margin: auto"></div></div>

  <div v-else class="stack" style="gap: 18px; max-width: 900px">
    <div class="page-head" style="margin-bottom: 0">
      <div>
        <router-link to="/board" class="small">← Applications</router-link>
        <h1>{{ job.title }}</h1>
        <p class="sub">{{ job.company }}<span v-if="job.location"> · {{ job.location }}</span></p>
      </div>
      <a v-if="job.url" :href="job.url" target="_blank" rel="noopener" class="btn ghost">Open ad ↗</a>
    </div>

    <div class="card">
      <h2>Stage</h2>
      <div class="stepper">
        <button
          v-for="s in STATUSES"
          :key="s.key"
          class="step"
          :class="{ on: job.status === s.key }"
          :style="job.status === s.key ? { background: s.color } : {}"
          @click="setStatus(s.key)"
        >{{ s.label }}</button>
      </div>
      <p class="small muted" style="margin-top: 8px">{{ STATUSES.find((s) => s.key === job.status).hint }}</p>
    </div>

    <MatchPanel v-if="job.matchDetails" :match="job.matchDetails" />
    <div class="row">
      <button class="btn ghost sm" :disabled="busyScore" @click="rescore">{{ busyScore ? 'Scoring…' : 'Re-score with latest profile' }}</button>
    </div>

    <form class="card stack" @submit.prevent="save">
      <h2 style="margin: 0">Details & dates</h2>
      <div class="form-grid">
        <label class="field full">Title<input v-model="form.title" required /></label>
        <label class="field">Company<input v-model="form.company" /></label>
        <label class="field">Location<input v-model="form.location" /></label>
        <label class="field">Salary<input v-model="form.salaryText" /></label>
        <label class="field">Type<input v-model="form.employmentType" /></label>
        <label class="field full">Link<input v-model="form.url" type="url" /></label>
        <label class="field">Applied on<input v-model="form.appliedAt" type="date" /></label>
        <label class="field">Follow up on<input v-model="form.followUpAt" type="date" /></label>
        <label class="field full">Interview date & time<input v-model="form.interviewAt" type="datetime-local" /></label>
        <label class="field full">Notes<textarea v-model="form.notes" rows="4"></textarea></label>
      </div>
      <details>
        <summary class="small muted" style="cursor: pointer">Job description</summary>
        <textarea v-model="form.description" rows="12" style="margin-top: 8px"></textarea>
      </details>
      <div v-if="err" class="alert err">{{ err }}</div>
      <div v-if="msg" class="alert ok">{{ msg }}</div>
      <div class="row between wrap">
        <button class="btn" :disabled="saving">{{ saving ? 'Saving…' : 'Save changes' }}</button>
        <button type="button" class="btn danger" @click="remove">Delete job</button>
      </div>
      <p class="small muted">Added {{ fmtDate(job.createdAt) }} · updated {{ fmtDate(job.updatedAt, true) }}</p>
    </form>
  </div>
</template>
