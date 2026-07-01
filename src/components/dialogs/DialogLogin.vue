<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    width="500"
    opacity="1"
    persistent
  >
    <v-card>
      <DialogHeader
        @close="close"
        :header="t('login.welcome')"
        :buttons="buttons"
      />

      <v-card-text>
        <v-text-field
          v-model="password"
          @keyup.enter="logIn"
          :type="showPassword ? 'text' : 'password'"
          :hint="settingsStore.passwordHint"
          :label="t('settings_labels.security.password')"
          class="mt-6"
          variant="outlined"
          rounded
        >
          <template #append-inner>
            <v-btn @click="showPassword = !showPassword" variant="text" icon>
              <v-icon v-if="showPassword">mdi-eye</v-icon>
              <v-icon v-else>mdi-eye-off</v-icon>
            </v-btn>
          </template>
        </v-text-field>

        <v-alert
          type="warning"
          variant="tonal"
          density="compact"
          rounded="xl"
          class="mt-4 text-caption"
        >
          {{ t('login.password_required') }}
        </v-alert>

        <v-alert
          v-model="error"
          type="error"
          icon="mdi-alert"
          class="mt-4 text-caption"
          variant="tonal"
          density="compact"
          rounded="xl"
        >
          {{ t('login.wrong_password') }}
        </v-alert>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import {ref, computed} from 'vue';
import {useI18n} from 'vue-i18n'
import DialogHeader from "@/components/elements/DialogHeader.vue";
import {useSettingsStore} from '@/stores/settings';
import {typedApi} from '@/services/typedApi';
import {setAuthToken} from '@/services/authSession';
import {useEventBus} from '@/utils/eventBus';

// Props
defineProps({
  modelValue: {
    type: Boolean,
    required: true
  }
});

// Emits
const emit = defineEmits(['update:modelValue', 'success']);

// Pinia store
const settingsStore = useSettingsStore();
const {t} = useI18n()
const eventBus = useEventBus()

// Reactive data
const password = ref('');
const showPassword = ref(false);
const error = ref(false);
const loading = ref(false);
const buttons = computed(() => [
  {
    icon: "close",
    text: t('common.exit'),
    variant: "outlined",
    function: () => {
      close();
    },
  },
  {
    icon: "login",
    text: t('login.log_in'),
    color: "success",
    variant: "flat",
    function: () => {
      logIn();
    },
  }
]);

// Methods
const logIn = async () => {
  loading.value = true
  error.value = false

  try {
    const res = await typedApi.login(password.value)
    setAuthToken(res.data.token)
    emit('success')
    eventBus.emit('app:authenticated')
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
};

const close = () => {
  emit('update:modelValue', false);
};

</script>