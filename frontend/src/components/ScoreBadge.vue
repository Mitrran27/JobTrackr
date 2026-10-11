<script setup>
import { scoreColor } from '../utils';
defineProps({ score: { type: Number, default: null } });
</script>

<template>
  <span v-if="score != null" class="score" :style="{ background: scoreColor(score) }" :title="`${score}% match with your profile`">{{ score }}%</span>
</template>
