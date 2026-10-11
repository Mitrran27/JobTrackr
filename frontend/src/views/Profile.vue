<script setup>
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import api, { errMsg } from '../api';
import { readCache, writeCache } from '../cache';
import { SECTION_CONFIGS } from '../sections';
import SectionEditor from '../components/SectionEditor.vue';

const tabs = [
  { key: 'personal', label: 'Personal' },
  ...['education', 'experience', 'skills', 'projects', 'certifications', 'publications', 'references'].map((k) => ({ key: k, label: SECTION_CONFIGS[k].label.split(' / ')[0] })),
];
const tab = ref('personal');
const form = reactive({ fullName: '', headline: '', email: '', phone: '', location: '', linkedin: '', github: '', website: '', summary: '', remindersEnabled: true });
const err = ref('');
const msg = ref('');
const saving = ref(false);
const rescoring = ref(false);

// Show the last known details immediately; refresh quietly in the background
const cached = readCache('profile');
if (cached) Object.keys(form).forEach((k) => (form[k] = cached[k] ?? form[k]));
const loading = ref(!cached);
const slow = ref(false);
const touched = ref(false); // do not overwrite what the user is already typing
let slowTimer;

onMounted(async () => {
  slowTimer = setTimeout(() => (slow.value = true), 4000);
  try {
    const { data } = await api.get('/profile');
    if (!touched.value) Object.keys(form).forEach((k) => (form[k] = data.profile[k] ?? form[k]));
    writeCache('profile', data.profile);
  } catch (e) {
    if (!cached) err.value = errMsg(e);
  }
  loading.value = false;
  slow.value = false;
});
onBeforeUnmount(() => clearTimeout(slowTimer));

async function save() {
  err.value = '';
  msg.value = '';
  saving.value = true;
  try {
    await api.put('/profile', form);
    writeCache('profile', { ...(readCache('profile') || {}), ...form });
    msg.value = 'Saved';
  } catch (e) {
    err.value = errMsg(e);
  }
  saving.value = false;
}

/** Profile changed: refresh every saved job's match score */
async function rescoreAll() {
  rescoring.value = true;
  try {
    const { data } = await api.post('/jobs/rescore-all');
    msg.value = `Re-scored ${data.rescored} job(s) against your latest profile`;
  } catch (e) {
    err.value = errMsg(e);
  }
  rescoring.value = false;
}
</script>

<template>
  <div class="page-head">
    <div>
      <h1>Your profile</h1>
      <p class="sub">Everything here feeds your match scores and your generated CV.</p>
    </div>
    <div class="row wrap">
      <button class="btn ghost" :disabled="rescoring" @click="rescoreAll">{{ rescoring ? 'Re-scoring…' : 'Re-score my jobs' }}</button>
      <router-link to="/cv" class="btn">Build CV</router-link>
    </div>
  </div>

  <div class="tabs">
    <button v-for="t in tabs" :key="t.key" class="tab" :class="{ on: tab === t.key }" @click="tab = t.key">{{ t.label }}</button>
  </div>

  <div v-if="tab === 'personal' && loading" class="card stack" style="max-width: 860px">
    <div class="form-grid">
      <div v-for="n in 8" :key="n" class="skeleton" style="height: 62px"></div>
      <div class="skeleton full" style="height: 130px"></div>
    </div>
    <p v-if="slow" class="small muted">Waking up the server, this can take up to a minute after it has been idle…</p>
    <div v-if="err" class="alert err">{{ err }}</div>
  </div>

  <form v-else-if="tab === 'personal'" class="card stack" style="max-width: 860px" @input="touched = true" @submit.prevent="save">
    <div class="form-grid">
      <label class="field">Full name<input v-model="form.fullName" /></label>
      <label class="field">Headline<input v-model="form.headline" placeholder="Full-stack developer" /></label>
      <label class="field">Email<input v-model="form.email" type="email" /></label>
      <label class="field">Phone<input v-model="form.phone" /></label>
      <label class="field">Location<input v-model="form.location" placeholder="Klang, Selangor" /></label>
      <label class="field">LinkedIn<input v-model="form.linkedin" /></label>
      <label class="field">GitHub<input v-model="form.github" /></label>
      <label class="field">Website<input v-model="form.website" /></label>
      <label class="field full">Summary<textarea v-model="form.summary" rows="5" placeholder="Two or three lines about who you are and what you want next"></textarea></label>
      <label class="check full"><input v-model="form.remindersEnabled" type="checkbox" /> Email me a morning reminder for interviews and follow-ups</label>
    </div>
    <div v-if="err" class="alert err">{{ err }}</div>
    <div v-if="msg" class="alert ok">{{ msg }}</div>
    <div><button class="btn" :disabled="saving">{{ saving ? 'Saving…' : 'Save' }}</button></div>
  </form>

  <div v-else class="card" style="max-width: 860px">
    <SectionEditor :key="tab" :config="SECTION_CONFIGS[tab]" />
  </div>
</template>
