<script setup>
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { auth } from '../auth';
import api, { errMsg } from '../api';

const router = useRouter();
const mode = ref('login'); // login | register | forgot
const f = reactive({ name: '', email: '', password: '' });
const busy = ref(false);
const err = ref('');
const info = ref('');

async function submit() {
  err.value = '';
  info.value = '';
  busy.value = true;
  try {
    if (mode.value === 'login') await auth.login(f.email, f.password);
    else if (mode.value === 'register') await auth.register(f.name, f.email, f.password);
    else {
      await api.post('/auth/forgot', { email: f.email });
      info.value = 'If that email has an account, a reset link is on its way.';
      busy.value = false;
      return;
    }
    router.push(mode.value === 'register' ? '/profile' : '/');
  } catch (e) {
    err.value = errMsg(e);
  }
  busy.value = false;
}
</script>

<template>
  <div class="auth-wrap">
    <form class="card auth-card stack" @submit.prevent="submit">
      <div class="brand"><img src="/icon.svg" alt="" /> Landed</div>
      <p class="muted" style="text-align: center">
        {{ mode === 'login' ? 'Welcome back. Pick up where you left off.' : mode === 'register' ? 'Create your account to start tracking.' : 'Enter your email to get a reset link.' }}
      </p>
      <label v-if="mode === 'register'" class="field">Name<input v-model="f.name" required autocomplete="name" /></label>
      <label class="field">Email<input v-model="f.email" type="email" required autocomplete="email" /></label>
      <label v-if="mode !== 'forgot'" class="field">
        Password
        <input v-model="f.password" type="password" required minlength="8" :autocomplete="mode === 'login' ? 'current-password' : 'new-password'" />
      </label>
      <div v-if="err" class="alert err">{{ err }}</div>
      <div v-if="info" class="alert ok">{{ info }}</div>
      <button class="btn" :disabled="busy">
        <span v-if="busy" class="spinner"></span>
        {{ mode === 'login' ? 'Log in' : mode === 'register' ? 'Create account' : 'Send reset link' }}
      </button>
      <div class="small" style="text-align: center">
        <template v-if="mode === 'login'">
          <a href="#" @click.prevent="mode = 'forgot'">Forgot password?</a> ·
          <a href="#" @click.prevent="mode = 'register'">Create account</a>
        </template>
        <a v-else href="#" @click.prevent="mode = 'login'">Back to log in</a>
      </div>
    </form>
  </div>
</template>
