<template>
  <div class="h-full">
    <div ref="cesiumContainer" class="h-full"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, useTemplateRef } from "vue";
import { cesiumInit } from "@/lib/cesium/cesiumInit.js";
import { scene } from "./hooks/initEntities.js";

const cesiumRef = useTemplateRef("cesiumContainer");
const viewer = ref(null);

onMounted(async () => {
  viewer.value = await cesiumInit(cesiumRef.value);
  scene(viewer.value);
});
</script>

<style lang="scss" scoped></style>
