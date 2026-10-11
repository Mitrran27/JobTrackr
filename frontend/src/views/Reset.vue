<script setup>
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api, { errMsg } from '../api';

const route = useRoute();
const router = useRouter();
const password = ref('');
const busy = ref(false);
const err = ref('');
const done = ref(false);

async function submit() {
  err.value = '';
  busy.value = true;
  try {
    await api.post('/auth/reset', { token: route.query.token, password: password.value });
    done.value = true;
    setTimeout(() => router.push('/login'), 1500);
  } catch (e) {
    err.value = errMsg(e);
  }
  busy.value = false;
}
</script>

<template>
  <div class="auth-wrap">
    <form class="card auth-card stack" @submit.prevent="submit">
      <div class="brand"><img src="/icon.svg" alt="" /> JobTrackr</div>
      <h2 style="text-align: center">Choose a new password</h2>
      <label class="field">New password<input v-model="password" type="password" minlength="8" required autocomplete="new-password" /></label>
      <div v-if="err" class="alert err">{{ err }}</div>
      <div v-if="done" class="alert ok">Password updated. Redirecting to log in…</div>
      <button class="btn" :disabled="busy || done">Update password</button>
    </form>
  </div>
</template>
