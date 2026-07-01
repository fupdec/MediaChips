<template>
  <div>
    <div class="tool-action">
      <div class="tool-action__hint text-caption text-medium-emphasis">
        {{ t('settings_labels.tools.analyze_paths_tooltip') }}
      </div>
      <v-btn
        @click="openSuggestedTags"
        :loading="loading"
        color="primary"
        rounded
        variant="flat"
      >
        <v-icon icon="mdi-tag-plus-outline" start/>
        {{ t('settings_labels.tools.suggest_tags_btn') }}
      </v-btn>
    </div>

    <v-alert
      v-if="message"
      :type="messageType"
      class="mt-3 mb-4"
      density="compact"
      rounded="xl"
      variant="tonal"
    >
      {{ message }}
    </v-alert>

    <TagsAdd :button="false"/>
  </div>
</template>

<script setup lang="ts">
import {ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {typedApi} from '@/services/typedApi'
import {useEventBus} from '@/utils/eventBus'
import TagsAdd from '@/components/app/appbar/elements/TagsAdd.vue'

const eventBus = useEventBus()
const {t} = useI18n()

const loading = ref(false)
const message = ref('')
const messageType = ref<'info' | 'success' | 'error' | 'warning'>('info')


async function openSuggestedTags() {
  loading.value = true
  message.value = ''

  try {
    const res = await typedApi.suggestTagsFromPaths({
      limit: 150,
      maxWords: 3,
      excludeExisting: true,
    })

    const names = (res.data?.suggestions || [])
      .map((item) => item.word)
      .filter((word): word is string => Boolean(word))
      .slice(0, 150)

    if (names.length === 0) {
      messageType.value = 'info'
      message.value = t('notifications_text.suggested_tags_not_found')
      return
    }

    eventBus.emit('openTagsAddWithNames', {
      names,
      title: t('notifications_text.suggested_tags_title'),
    })

    messageType.value = 'success'
    message.value = t('notifications_text.found_suggested_tags', {count: names.length})
  } catch (error) {
    console.error(error)
    messageType.value = 'error'
    message.value = t('notifications_text.suggest_tags_failed')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.tool-action {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.tool-action__hint {
  max-width: 640px;
  line-height: 1.4;
}
</style>
