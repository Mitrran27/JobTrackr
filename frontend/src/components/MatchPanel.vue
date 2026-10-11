<script setup>
import { computed } from 'vue';
import { scoreColor } from '../utils';
const props = defineProps({ match: { type: Object, required: true } });
const verdict = computed(() =>
  props.match.score >= 70 ? 'Strong fit, go for it' : props.match.score >= 45 ? 'Possible fit, tailor your CV' : 'Stretch, close the gaps first',
);
</script>

<template>
  <div class="card stack">
    <div class="row" style="gap: 18px">
      <div class="gauge" :style="{ '--p': match.score, '--c': scoreColor(match.score) }">
        <div>
          <span><b>{{ match.score }}%</b><br /><small>confidence</small></span>
        </div>
      </div>
      <div class="grow stack" style="gap: 8px">
        <div>
          <h2 style="margin: 0">{{ verdict }}</h2>
          <p class="muted small">{{ match.label }} match based on your profile and uploaded CV</p>
        </div>
        <div v-for="[label, v] in [['Skills', match.skillScore], ['Job title', match.titleScore], ['Experience', match.experienceScore]]" :key="label">
          <div class="row between small"><span>{{ label }}</span><b>{{ v }}%</b></div>
          <div class="bar"><i :style="{ width: v + '%', background: scoreColor(v) }"></i></div>
        </div>
      </div>
    </div>

    <div v-if="match.matchedSkills?.length">
      <div class="small muted" style="margin-bottom: 6px; font-weight: 600">You have</div>
      <div class="chips"><span v-for="s in match.matchedSkills" :key="s" class="chip good">{{ s }}</span></div>
    </div>
    <div v-if="match.missingSkills?.length">
      <div class="small muted" style="margin-bottom: 6px; font-weight: 600">Not on your profile yet</div>
      <div class="chips"><span v-for="s in match.missingSkills" :key="s" class="chip warn">{{ s }}</span></div>
    </div>
    <ul v-if="match.reasons?.length" class="small muted" style="margin: 0; padding-left: 18px">
      <li v-for="r in match.reasons" :key="r">{{ r }}</li>
    </ul>
  </div>
</template>
