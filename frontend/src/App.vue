<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { auth } from './auth';

const route = useRoute();
const router = useRouter();
const isPublic = computed(() => !!route.meta.public);

const nav = [
  { to: '/', label: 'Home', icon: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z' },
  { to: '/board', label: 'Jobs', icon: 'M4 4h5v16H4zM10 4h5v10h-5zM16 4h4v13h-4z' },
  { to: '/jobs/new', label: 'Add', icon: 'M12 5v14M5 12h14' },
  { to: '/profile', label: 'Profile', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0' },
  { to: '/career', label: 'Career', icon: 'M3 17l6-6 4 4 8-8M15 7h6v6' },
  { to: '/cv', label: 'CV', icon: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6' },
];

function logout() {
  auth.logout();
  router.push('/login');
}
</script>

<template>
  <router-view v-if="isPublic" />
  <div v-else class="shell">
    <aside class="side">
      <div class="brand"><img src="/icon.svg" alt="" /> JobTrackr</div>
      <router-link v-for="n in nav" :key="n.to" :to="n.to" class="nav-link">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path :d="n.icon" /></svg>
        {{ n.label === 'Home' ? 'Dashboard' : n.label === 'Jobs' ? 'Applications' : n.label === 'Add' ? 'Add a job' : n.label === 'Career' ? 'Career & income' : n.label === 'CV' ? 'CV builder' : n.label }}
      </router-link>
      <div class="side-foot muted">
        <div style="font-weight: 600; color: var(--ink)">{{ auth.user?.name }}</div>
        <div class="small" style="overflow: hidden; text-overflow: ellipsis">{{ auth.user?.email }}</div>
        <button class="btn ghost sm" style="margin-top: 10px" @click="logout">Log out</button>
      </div>
    </aside>
    <main class="main">
      <router-view />
    </main>
    <nav class="bottom-nav">
      <router-link v-for="n in nav" :key="n.to" :to="n.to">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path :d="n.icon" /></svg>
        {{ n.label }}
      </router-link>
    </nav>
  </div>
</template>
