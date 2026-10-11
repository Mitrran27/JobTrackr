<script setup>
import { computed, onMounted, ref } from 'vue';
import api, { errMsg } from '../api';
import { STATUSES, fmtDate } from '../utils';
import ScoreBadge from '../components/ScoreBadge.vue';

const jobs = ref([]);
const loading = ref(true);
const err = ref('');
const q = ref('');
const dragId = ref(null);
const overCol = ref(null);

async function load() {
  try {
    jobs.value = (await api.get('/jobs')).data;
  } catch (e) {
    err.value = errMsg(e);
  }
  loading.value = false;
}
onMounted(load);

const grouped = computed(() => {
  const term = q.value.trim().toLowerCase();
  const g = Object.fromEntries(STATUSES.map((s) => [s.key, []]));
  for (const j of jobs.value) {
    if (term && !`${j.title} ${j.company} ${j.location}`.toLowerCase().includes(term)) continue;
    g[j.status].push(j);
  }
  return g;
});

async function move(id, status) {
  const j = jobs.value.find((x) => x.id === id);
  if (!j || j.status === status) return;
  const prev = j.status;
  j.status = status;
  try {
    await api.patch(`/jobs/${id}`, { status });
  } catch (e) {
    j.status = prev;
    err.value = errMsg(e);
  }
}

function onDrop(status) {
  overCol.value = null;
  if (dragId.value) move(dragId.value, status);
  dragId.value = null;
}
</script>

<template>
  <div class="page-head">
    <div>
      <h1>Applications</h1>
      <p class="sub">Drag cards between columns, or use the menu on a card.</p>
    </div>
    <div class="row">
      <input v-model="q" placeholder="Search jobs…" style="width: 200px" />
      <router-link to="/jobs/new" class="btn">+ Add</router-link>
    </div>
  </div>
  <div v-if="err" class="alert err" style="margin-bottom: 12px">{{ err }}</div>
  <div v-if="loading" class="empty"><div class="spinner dark" style="margin: auto"></div></div>

  <div v-else class="board">
    <section
      v-for="s in STATUSES"
      :key="s.key"
      class="col"
      :class="{ over: overCol === s.key }"
      @dragover.prevent="overCol = s.key"
      @dragleave="overCol === s.key && (overCol = null)"
      @drop.prevent="onDrop(s.key)"
    >
      <div class="col-head">
        <b><span class="dot" :style="{ background: s.color }"></span>{{ s.label }}</b>
        <span class="chip">{{ grouped[s.key].length }}</span>
      </div>
      <router-link
        v-for="j in grouped[s.key]"
        :key="j.id"
        :to="`/jobs/${j.id}`"
        class="job-card"
        :class="{ dragging: dragId === j.id }"
        draggable="true"
        @dragstart="dragId = j.id"
        @dragend="dragId = null; overCol = null"
      >
        <div class="row between" style="align-items: flex-start">
          <h3>{{ j.title }}</h3>
          <ScoreBadge :score="j.matchScore" />
        </div>
        <div class="small muted">{{ j.company }}<span v-if="j.location"> · {{ j.location }}</span></div>
        <div v-if="j.interviewAt" class="small" style="margin-top: 6px; color: #6d28d9">Interview: {{ fmtDate(j.interviewAt, true) }}</div>
        <div v-else-if="j.appliedAt" class="small muted" style="margin-top: 6px">Applied {{ fmtDate(j.appliedAt) }}</div>
        <select :value="j.status" aria-label="Move to" @click.prevent.stop @change="move(j.id, $event.target.value)">
          <option v-for="o in STATUSES" :key="o.key" :value="o.key">{{ o.label }}</option>
        </select>
      </router-link>
      <div v-if="!grouped[s.key].length" class="small muted" style="text-align: center; padding: 18px 4px">{{ s.hint }}</div>
    </section>
  </div>
</template>
