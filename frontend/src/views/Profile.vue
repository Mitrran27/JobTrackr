<script setup>
import { onMounted, reactive, ref } from 'vue';
import api, { errMsg } from '../api';
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

onMounted(async () => {
  try {
    const { data } = await api.get('/profile');
    Object.keys(form).forEach((k) => (form[k] = data.profile[k] ?? form[k]));
  } catch (e) {
    err.value = errMsg(e);
  }
});

async function save() {
  err.value = '';
  msg.value = '';
  saving.value = true;
  try {
    await api.put('/profile', form);
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

  <form v-if="tab === 'personal'" class="card stack" style="max-width: 860px" @submit.prevent="save">
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
