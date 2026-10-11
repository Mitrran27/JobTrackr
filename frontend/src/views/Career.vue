<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import api, { errMsg } from '../api';
import { SECTION_CONFIGS } from '../sections';
import { fmtMoney, toDateInput } from '../utils';
import SectionEditor from '../components/SectionEditor.vue';
import ScoreBadge from '../components/ScoreBadge.vue';

const income = reactive({ currentSalary: '', salaryCurrency: 'MYR', salaryPeriod: 'MONTH', targetIncreaseMin: 20, targetIncreaseMax: 30 });
const plan = reactive({ targetRole: '', targetIndustries: '', targetLocations: '', targetDate: '', notes: '' });
const offers = ref([]);
const targets = ref([]);
const msg = ref({ income: '', plan: '' });
const err = ref('');

onMounted(async () => {
  try {
    const [p, c, jobs] = await Promise.all([api.get('/profile'), api.get('/profile/career'), api.get('/jobs')]);
    Object.keys(income).forEach((k) => (income[k] = p.data.profile[k] ?? income[k]));
    Object.assign(plan, c.data, { targetDate: toDateInput(c.data.targetDate) });
    offers.value = jobs.data.filter((j) => j.status === 'OFFER');
    targets.value = jobs.data.filter((j) => j.status === 'SAVED' && j.matchScore != null).sort((a, b) => b.matchScore - a.matchScore).slice(0, 5);
  } catch (e) {
    err.value = errMsg(e);
  }
});

const cur = computed(() => (income.currentSalary === '' || income.currentSalary == null ? null : Number(income.currentSalary)));
const lo = computed(() => (cur.value != null ? Math.round(cur.value * (1 + income.targetIncreaseMin / 100)) : null));
const hi = computed(() => (cur.value != null ? Math.round(cur.value * (1 + income.targetIncreaseMax / 100)) : null));
const perYear = computed(() => (income.salaryPeriod === 'MONTH' ? 12 : 1));

async function saveIncome() {
  msg.value.income = '';
  try {
    await api.put('/profile', { ...income, currentSalary: cur.value });
    msg.value.income = 'Income goal saved';
  } catch (e) {
    err.value = errMsg(e);
  }
}

async function savePlan() {
  msg.value.plan = '';
  try {
    await api.put('/profile/career', { ...plan, targetDate: plan.targetDate || null });
    msg.value.plan = 'Plan saved';
  } catch (e) {
    err.value = errMsg(e);
  }
}
</script>

<template>
  <div class="page-head">
    <div>
      <h1>Career & income</h1>
      <p class="sub">Where you have been, where you are heading and what you want to earn.</p>
    </div>
  </div>
  <div v-if="err" class="alert err" style="margin-bottom: 12px">{{ err }}</div>

  <div class="stack" style="gap: 18px; max-width: 900px">
    <form class="card stack" @submit.prevent="saveIncome">
      <h2 style="margin: 0">Income goal</h2>
      <div class="form-grid">
        <label class="field">Current income<input v-model="income.currentSalary" type="number" min="0" step="any" placeholder="3500" /></label>
        <label class="field">
          Per
          <select v-model="income.salaryPeriod"><option value="MONTH">month</option><option value="YEAR">year</option></select>
        </label>
        <label class="field">Currency<input v-model="income.salaryCurrency" maxlength="3" style="text-transform: uppercase" /></label>
        <span></span>
        <label class="field">Increase from (%)<input v-model.number="income.targetIncreaseMin" type="number" min="0" max="500" /></label>
        <label class="field">Increase to (%)<input v-model.number="income.targetIncreaseMax" type="number" min="0" max="500" /></label>
      </div>

      <div v-if="cur != null" class="alert info">
        <div class="small">Your target</div>
        <div style="font-size: 1.5rem; font-weight: 700">{{ fmtMoney(lo, income.salaryCurrency) }} – {{ fmtMoney(hi, income.salaryCurrency) }}</div>
        <div class="small">
          per {{ income.salaryPeriod === 'MONTH' ? 'month' : 'year' }}
          <template v-if="income.salaryPeriod === 'MONTH'"> · about {{ fmtMoney(lo * perYear, income.salaryCurrency) }} – {{ fmtMoney(hi * perYear, income.salaryCurrency) }} a year</template>
        </div>
      </div>
      <div v-if="msg.income" class="alert ok">{{ msg.income }}</div>
      <div><button class="btn">Save income goal</button></div>

      <div v-if="offers.length">
        <div class="small muted" style="font-weight: 600; margin-bottom: 4px">Open offers to compare with your target</div>
        <router-link v-for="o in offers" :key="o.id" :to="`/jobs/${o.id}`" class="list-item" style="color: var(--ink)">
          <div class="grow"><b>{{ o.title }}</b><div class="small muted">{{ o.company }}</div></div>
          <span class="chip">{{ o.salaryText || 'Salary not listed' }}</span>
        </router-link>
      </div>
    </form>

    <form class="card stack" @submit.prevent="savePlan">
      <h2 style="margin: 0">Next job plan</h2>
      <div class="form-grid">
        <label class="field full">Target role<input v-model="plan.targetRole" placeholder="Full-stack developer" /></label>
        <label class="field">Industries<input v-model="plan.targetIndustries" placeholder="Fintech, IoT, SaaS" /></label>
        <label class="field">Locations<input v-model="plan.targetLocations" placeholder="Klang Valley, Remote" /></label>
        <label class="field full">Aim to start by<input v-model="plan.targetDate" type="date" /></label>
        <label class="field full">Plan & notes<textarea v-model="plan.notes" rows="5" placeholder="Skills to learn, companies to apply to, people to contact…"></textarea></label>
      </div>
      <div v-if="msg.plan" class="alert ok">{{ msg.plan }}</div>
      <div><button class="btn">Save plan</button></div>

      <div v-if="targets.length">
        <div class="small muted" style="font-weight: 600; margin-bottom: 4px">Best saved matches for this plan</div>
        <router-link v-for="t in targets" :key="t.id" :to="`/jobs/${t.id}`" class="list-item" style="color: var(--ink)">
          <div class="grow"><b>{{ t.title }}</b><div class="small muted">{{ t.company }}</div></div>
          <ScoreBadge :score="t.matchScore" />
        </router-link>
      </div>
    </form>

    <div class="card">
      <SectionEditor :config="SECTION_CONFIGS.experience" />
      <p class="small muted" style="margin-top: 10px">Add your salary on each previous job to keep a record of your income growth.</p>
    </div>
  </div>
</template>
