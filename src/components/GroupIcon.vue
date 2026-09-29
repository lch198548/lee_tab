<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    v-html="iconDef.paths.join('')"
  ></svg>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { getGroupIcon } from './groupIcons'

const props = withDefaults(defineProps<{ icon?: string; size?: number }>(), {
  icon: '',
  size: 16
})

const iconDef = computed(() => getGroupIcon(props.icon))
</script>
