<script setup>
import { computed, onMounted, ref } from 'vue';
import api, { errMsg } from '../api';
import { auth } from '../auth';
import { STATUSES, fmtDate, fmtMoney } from '../utils';
import ScoreBadge from '../components/ScoreBadge.vue';

const stats = ref(null);
const goal = ref(null);
const top = ref([]);
const err = ref('');

onMounted(async () => {
  try {
    const [s, g, j] = await Promise.all([api.get('/jobs/stats'), api.get('/profile/goal'), api.get('/jobs')]);
    stats.value = s.data;
    goal.value = g.data;
    top.value = j.data.filter((x) => x.status === 'SAVED' && x.matchScore != null).sort((a, b) => b.matchScore - a.matchScore).slice(0, 4);
  } catch (e) {
    err.value = errMsg(e);
  }
});

const active = computed(() => (stats.value ? stats.value.total - stats.value.byStatus.CLOSED : 0));
const hello = computed(() => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
});
</script>

<template>
  <div class="page-head">
    <div>
      <h1>{{ hello }}, {{ auth.user?.name?.split(' ')[0] }}</h1>
      <p class="sub">Here is where your job search stands.</p>
    </div>
    <router-link to="/jobs/new" class="btn">+ Add a job</router-link>
  </div>

  <div v-if="err" class="alert err">{{ err }}</div>
  <div v-else-if="!stats" class="empty"><div class="spinner dark" style="margin: auto"></div></div>

  <div v-else class="stack" style="gap: 18px">
    <div class="grid cols-4">
      <div class="card stat"><b>{{ active }}</b><span>Active applications</span></div>
      <div class="card stat"><b>{{ stats.byStatus.INTERVIEW }}</b><span>Interviews to attend</span></div>
      <div class="card stat"><b>{{ stats.responseRate }}%</b><span>Response rate</span></div>
      <div class="card stat"><b>{{ stats.avgMatch }}%</b><span>Average match</span></div>
    </div>

    <div class="card">
      <h2>Pipeline</h2>
      <div class="pipeline" style="margin-bottom: 12px">
        <i v-for="s in STATUSES" :key="s.key" :style="{ width: (stats.total ? (stats.byStatus[s.key] / stats.total) * 100 : 0) + '%', background: s.color }"></i>
      </div>
      <div class="row wrap" style="gap: 16px">
        <router-link v-for="s in STATUSES" :key="s.key" to="/board" class="row small" style="gap: 6px; color: var(--ink)">
          <span class="dot" :style="{ background: s.color }"></span>{{ s.label }} <b>{{ stats.byStatus[s.key] }}</b>
        </router-link>
      </div>
    </div>

    <div class="grid cols-2">
      <div class="card">
        <h2>Income goal</h2>
        <template v-if="goal.current != null">
          <p class="muted small">Now: {{ fmtMoney(goal.current, goal.currency) }} / {{ goal.period === 'YEAR' ? 'year' : 'month' }}</p>
          <p style="font-size: 1.6rem; font-weight: 700; letter-spacing: -0.02em; margin: 4px 0">
            {{ fmtMoney(goal.targetMin, goal.currency) }} – {{ fmtMoney(goal.targetMax, goal.currency) }}
          </p>
          <p class="muted small">Target range (+{{ goal.increaseMin }}% to +{{ goal.increaseMax }}%) per {{ goal.period === 'YEAR' ? 'year' : 'month' }}</p>
        </template>
        <div v-else class="alert info">Set your current income to see your target range. <router-link to="/career">Set it now</router-link></div>
      </div>

      <div class="card">
        <h2>Coming up</h2>
        <div v-if="!stats.upcoming.length && !stats.followUps.length" class="muted">No interviews or follow-ups due.</div>
        <router-link v-for="u in stats.upcoming" :key="u.id" :to="`/jobs/${u.id}`" class="list-item" style="color: var(--ink)">
          <span class="chip" style="background: #f3e8ff; color: #6d28d9; border-color: #e9d5ff">Interview</span>
          <div class="grow"><b>{{ u.title }}</b><div class="small muted">{{ u.company }} · {{ fmtDate(u.interviewAt, true) }}</div></div>
        </router-link>
        <router-link v-for="u in stats.followUps" :key="u.id" :to="`/jobs/${u.id}`" class="list-item" style="color: var(--ink)">
          <span class="chip warn">Follow up</span>
          <div class="grow"><b>{{ u.title }}</b><div class="small muted">{{ u.company }} · {{ fmtDate(u.followUpAt) }}</div></div>
        </router-link>
      </div>
    </div>

    <div class="card">
      <h2>Best saved matches</h2>
      <div v-if="!top.length" class="muted">Save a few jobs and your highest-confidence ones show here.</div>
      <router-link v-for="j in top" :key="j.id" :to="`/jobs/${j.id}`" class="list-item" style="color: var(--ink)">
        <div class="grow"><b>{{ j.title }}</b><div class="small muted">{{ j.company }}<span v-if="j.location"> · {{ j.location }}</span></div></div>
        <ScoreBadge :score="j.matchScore" />
      </router-link>
    </div>
  </div>
</template>
