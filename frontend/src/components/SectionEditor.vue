<script setup>
import { onMounted, ref, watch } from 'vue';
import api, { errMsg, fileUrl } from '../api';

const props = defineProps({ config: { type: Object, required: true } });
const emit = defineEmits(['changed']);

const items = ref([]);
const loading = ref(true);
const editing = ref(null); // null | 'new' | item id
const draft = ref({});
const err = ref('');
const saving = ref(false);
const uploading = ref(false);

async function load() {
  loading.value = true;
  try {
    items.value = (await api.get(`/profile/section/${props.config.section}`)).data;
  } catch (e) {
    err.value = errMsg(e);
  }
  loading.value = false;
}
onMounted(load);
watch(() => props.config.section, () => {
  editing.value = null;
  load();
});

const blank = () => {
  const d = {};
  for (const f of props.config.fields) d[f.key] = f.type === 'checkbox' ? false : f.type === 'images' ? [] : '';
  return d;
};

function startNew() {
  err.value = '';
  draft.value = blank();
  editing.value = 'new';
}

function startEdit(it) {
  err.value = '';
  const d = {};
  for (const f of props.config.fields) {
    const v = it[f.key];
    if (f.type === 'lines') d[f.key] = (v || []).join('\n');
    else if (f.type === 'tags') d[f.key] = (v || []).join(', ');
    else if (f.type === 'images') d[f.key] = [...(v || [])];
    else if (f.type === 'checkbox') d[f.key] = !!v;
    else d[f.key] = v ?? '';
  }
  draft.value = d;
  editing.value = it.id;
}

function payload() {
  const out = {};
  for (const f of props.config.fields) {
    const v = draft.value[f.key];
    if (f.type === 'lines') out[f.key] = String(v).split('\n').map((s) => s.trim()).filter(Boolean);
    else if (f.type === 'tags') out[f.key] = String(v).split(',').map((s) => s.trim()).filter(Boolean);
    else if (f.type === 'number') out[f.key] = v === '' || v == null ? null : Number(v);
    else out[f.key] = v;
  }
  return out;
}

async function save() {
  err.value = '';
  const req = props.config.fields.find((f) => f.required);
  if (req && !String(draft.value[req.key] || '').trim()) {
    err.value = `${req.label} is required`;
    return;
  }
  saving.value = true;
  try {
    if (editing.value === 'new') await api.post(`/profile/section/${props.config.section}`, payload());
    else await api.patch(`/profile/section/${props.config.section}/${editing.value}`, payload());
    editing.value = null;
    await load();
    emit('changed');
  } catch (e) {
    err.value = errMsg(e);
  }
  saving.value = false;
}

async function remove(it) {
  if (!confirm('Delete this entry?')) return;
  try {
    await api.delete(`/profile/section/${props.config.section}/${it.id}`);
    await load();
    emit('changed');
  } catch (e) {
    err.value = errMsg(e);
  }
}

async function move(idx, dir) {
  const arr = [...items.value];
  const j = idx + dir;
  if (j < 0 || j >= arr.length) return;
  [arr[idx], arr[j]] = [arr[j], arr[idx]];
  items.value = arr;
  try {
    await api.put(`/profile/section/${props.config.section}/order`, { ids: arr.map((x) => x.id) });
    emit('changed');
  } catch (e) {
    err.value = errMsg(e);
  }
}

async function upload(key, ev) {
  const files = [...(ev.target.files || [])];
  ev.target.value = '';
  uploading.value = true;
  err.value = '';
  try {
    for (const file of files) {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post('/files', fd);
      draft.value[key].push(data.id);
    }
  } catch (e) {
    err.value = errMsg(e);
  }
  uploading.value = false;
}
</script>

<template>
  <div class="stack">
    <div class="row between">
      <h2 style="margin: 0">{{ config.label }}</h2>
      <button v-if="!editing" class="btn sm" @click="startNew">+ {{ config.addLabel }}</button>
    </div>

    <div v-if="err && !editing" class="alert err">{{ err }}</div>

    <form v-if="editing" class="card flat stack" @submit.prevent="save">
      <div class="form-grid">
        <template v-for="f in config.fields" :key="f.key">
          <div :class="{ full: !f.half }">
            <label v-if="f.type === 'checkbox'" class="check">
              <input v-model="draft[f.key]" type="checkbox" /> {{ f.label }}
            </label>
            <label v-else class="field">
              {{ f.label }}
              <textarea v-if="f.type === 'textarea' || f.type === 'lines'" v-model="draft[f.key]" :placeholder="f.placeholder" :rows="f.type === 'lines' ? 5 : 4"></textarea>
              <div v-else-if="f.type === 'images'" class="stack" style="gap: 8px">
                <div class="thumbs">
                  <div v-for="(id, i) in draft[f.key]" :key="id" class="thumb">
                    <img :src="fileUrl(id)" alt="" />
                    <button type="button" aria-label="Remove image" @click="draft[f.key].splice(i, 1)">×</button>
                  </div>
                </div>
                <input type="file" accept="image/png,image/jpeg" multiple :disabled="uploading" @change="upload(f.key, $event)" />
                <span v-if="uploading" class="small muted">Uploading…</span>
              </div>
              <input v-else v-model="draft[f.key]" :type="f.type === 'number' ? 'number' : 'text'" :placeholder="f.placeholder" step="any" />
            </label>
          </div>
        </template>
      </div>
      <div v-if="err" class="alert err">{{ err }}</div>
      <div class="row">
        <button class="btn" :disabled="saving || uploading">{{ saving ? 'Saving…' : 'Save' }}</button>
        <button type="button" class="btn ghost" @click="editing = null">Cancel</button>
      </div>
    </form>

    <div v-if="loading" class="empty"><div class="spinner dark" style="margin: auto"></div></div>
    <div v-else-if="!items.length && !editing" class="empty card flat">Nothing here yet. Use “{{ config.addLabel }}” to start.</div>

    <div v-else-if="config.compact" class="chips">
      <span v-for="it in items" :key="it.id" class="chip" style="padding-right: 6px">
        {{ config.title(it) }}<span v-if="config.sub(it)" class="muted"> · {{ config.sub(it) }}</span>
        <button type="button" class="btn ghost icon sm" style="padding: 0 6px" aria-label="Edit" @click="startEdit(it)">✎</button>
        <button type="button" class="btn ghost icon sm" style="padding: 0 6px" aria-label="Delete" @click="remove(it)">×</button>
      </span>
    </div>

    <div v-else class="card flat" style="padding-top: 4px; padding-bottom: 4px">
      <div v-for="(it, idx) in items" :key="it.id" class="list-item">
        <div class="grow">
          <div style="font-weight: 650">{{ config.title(it) }}</div>
          <div class="small muted">{{ config.sub(it) }}</div>
          <div v-if="it.imageIds?.length" class="thumbs" style="margin-top: 6px">
            <div v-for="id in it.imageIds" :key="id" class="thumb" style="width: 56px; height: 40px"><img :src="fileUrl(id)" alt="" /></div>
          </div>
        </div>
        <div class="row" style="gap: 4px">
          <button class="btn ghost icon sm" :disabled="idx === 0" aria-label="Move up" @click="move(idx, -1)">↑</button>
          <button class="btn ghost icon sm" :disabled="idx === items.length - 1" aria-label="Move down" @click="move(idx, 1)">↓</button>
          <button class="btn ghost sm" @click="startEdit(it)">Edit</button>
          <button class="btn danger sm" @click="remove(it)">Delete</button>
        </div>
      </div>
    </div>
  </div>
</template>
