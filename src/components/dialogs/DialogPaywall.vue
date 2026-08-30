<template>
  <v-dialog
    :model-value="dialogsStore.paywall.show"
    width="520"
    scrollable
    @update:model-value="onDialogModel"
  >
    <v-card rounded="xl">
      <DialogHeader
        icon="lock-open-variant-outline"
        :header="t('registration.paywall_title')"
        :subheader="t('registration.paywall_subtitle', {cap: FREE_LIBRARY_CAP})"
        closable
        @close="close"
      />

      <v-card-text class="pa-4 pa-sm-6">
        <p class="mb-4 text-medium-emphasis">
          {{ t('registration.paywall_usage', {
            count: registrationStore.libraryCount,
            cap: FREE_LIBRARY_CAP,
          }) }}
        </p>

        <ul class="paywall-benefits mb-6">
          <li>{{ t('registration.paywall_benefit_unlimited') }}</li>
          <li>{{ t('registration.paywall_benefit_lifetime') }}</li>
          <li>{{ t('registration.paywall_benefit_devices') }}</li>
          <li>{{ t('registration.paywall_benefit_local') }}</li>
        </ul>

        <p class="text-caption text-medium-emphasis mb-4">
          {{ t('registration.paywall_offer') }}
        </p>

        <div class="d-flex flex-column ga-2">
          <v-btn
            color="primary"
            rounded="lg"
            variant="flat"
            size="large"
            block
            @click="buyKey"
          >
            <v-icon start>mdi-cart</v-icon>
            {{ t('registration.buy_lifetime_key') }}
          </v-btn>

          <v-btn
            color="primary"
            rounded="lg"
            variant="tonal"
            size="large"
            block
            @click="enterKey"
          >
            <v-icon start>mdi-key</v-icon>
            {{ t('registration.enter_activation_key') }}
          </v-btn>

          <v-btn
            rounded="lg"
            variant="text"
            block
            @click="close"
          >
            {{ t('registration.paywall_not_now') }}
          </v-btn>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import {useRouter} from 'vue-router'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import {useDialogsStore} from '@/stores/dialogs'
import {useRegistrationStore} from '@/stores/registration'
import {openExternal} from '@/services/shellService'
import {BUY_ACTIVATION_KEY_URL, FREE_LIBRARY_CAP} from '@/utils/freeLibraryCap'

const {t} = useI18n()
const router = useRouter()
const dialogsStore = useDialogsStore()
const registrationStore = useRegistrationStore()

function close() {
  dialogsStore.closePaywall()
}

function onDialogModel(open: boolean) {
  if (!open) close()
}

async function buyKey() {
  await openExternal(BUY_ACTIVATION_KEY_URL)
}

function enterKey() {
  close()
  registrationStore.requestKeyEntry()
  if (!router.currentRoute.value.path.startsWith('/settings')) {
    void router.push('/settings/?tab=about')
  }
}
</script>

<style scoped lang="scss">
.paywall-benefits {
  margin: 0;
  padding-left: 1.25rem;

  li {
    margin-bottom: 0.5rem;
  }
}
</style>
