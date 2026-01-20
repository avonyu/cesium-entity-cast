<template>
  <div class="h-full">
    <div ref="cesiumContainer" class="h-full"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, useTemplateRef } from "vue";
import { cesiumInit } from "@/utils/cesium/cesiumInit.js";
import { castToCartesian3 } from "@/utils/cast.js";

const cesiumRef = useTemplateRef("cesiumContainer");
const viewer = ref(null);

onMounted(() => {
  viewer.value = cesiumInit(cesiumRef.value);
  castToCartesian3(viewer.value);
});
</script>

<style lang="scss" scoped></style>
