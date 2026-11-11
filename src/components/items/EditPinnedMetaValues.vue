<template>
  <div
    class="editing"
    :class="{
      'show-icons': showIcons,
      'editing--hero': layout === 'hero',
      'editing--inspector': layout === 'inspector',
      'editing--sections': useSections,
    }"
  >
    <aside
      v-if="layout === 'hero'"
      class="editing-aside"
      :class="{'editing-aside--collapsed': hideMediaPanel}"
    >
      <div
        v-show="!hideMediaPanel"
        class="edit-dialog-hero__media edit-dialog-hero__media--outlined"
      >
        <slot name="media"/>
      </div>

      <nav
        v-if="!hideMediaPanel"
        class="editing-nav"
        :aria-label="t('editing.sections_nav')"
      >
        <div class="editing-nav__head">
          <span class="editing-nav__head-title">{{ t('editing.sections_nav') }}</span>
          <v-btn
            v-tooltip:top="t('editing.hide_media_panel')"
            :aria-label="t('editing.hide_media_panel')"
            :aria-expanded="true"
            icon="mdi-chevron-double-left"
            variant="tonal"
            color="primary"
            size="small"
            rounded="lg"
            @click="toggleMediaPanel"
          />
        </div>
        <button
          v-for="section in sectionNav"
          :key="section.id"
          type="button"
          class="editing-nav__item"
          @click="scrollToSection(section.id)"
        >
          <v-icon size="16" class="editing-nav__icon" :icon="section.icon" />
          <span class="editing-nav__title">{{ section.title }}</span>
          <span
            v-if="section.total"
            class="editing-nav__count"
            :class="{'editing-nav__count--done': section.filled === section.total}"
          >{{ section.filled }}/{{ section.total }}</span>
        </button>
      </nav>

      <!-- Collapsed media panel: compact icon rail with section jumps + dialog quick actions -->
      <div v-if="hideMediaPanel" class="editing-rail">
        <v-btn
          v-tooltip:end="t('editing.show_media_panel')"
          :aria-label="t('editing.show_media_panel')"
          :aria-expanded="false"
          icon="mdi-chevron-double-right"
          variant="tonal"
          color="primary"
          size="small"
          rounded="lg"
          @click="toggleMediaPanel"
        />
        <template v-if="$slots['rail-media']">
          <span class="editing-rail__sep" aria-hidden="true" />
          <slot name="rail-media" />
        </template>
        <span class="editing-rail__sep" aria-hidden="true" />
        <v-btn
          v-for="section in sectionNav"
          :key="section.id"
          v-tooltip:end="section.total ? `${section.title} · ${section.filled}/${section.total}` : section.title"
          :aria-label="section.title"
          variant="text"
          size="small"
          rounded="lg"
          icon
          @click="scrollToSection(section.id)"
        >
          <v-badge
            :model-value="!!section.total && section.filled! < section.total"
            color="warning"
            dot
          >
            <v-icon size="20" :icon="section.icon" />
          </v-badge>
        </v-btn>
        <template v-if="$slots.rail">
          <span class="editing-rail__sep" aria-hidden="true" />
          <slot name="rail" />
        </template>
      </div>
    </aside>

    <div class="editing-main">
    <div v-if="layout === 'hero'" class="edit-dialog-hero__overview mb-1">
      <EditPinnedOverview
        :item="overviewItem"
        :is-media="isMedia"
        :completion-status="completionStatus"
        :preset-meta="preset_meta"
        @media-path-update="onMediaPathUpdate"
      />
      <slot name="after-overview" />
    </div>

    <template v-else-if="showOverview">
      <div class="editing-overview">
        <EditPinnedOverview
          :item="overviewItem"
          :is-media="isMedia"
          :completion-status="completionStatus"
          :preset-meta="preset_meta"
          @media-path-update="onMediaPathUpdate"
        />
      </div>
    </template>

    <!-- Main form -->
    <v-form v-model="valid" ref="form" @submit.prevent>
      <v-container fluid class="px-0 editing-form">
        <div v-if="showFieldToolbar" class="editing-section__toolbar">
          <div class="editing-section__group editing-section__group--filters">
            <SettingsSegmentedControl
              v-model="fieldFilter"
              class="editing-section__filters"
              :label="t('editing.filter_fields_label')"
              :items="[
                {value: 'all', title: t('editing.filter_all')},
                {value: 'filled', title: t('editing.filter_filled')},
                {value: 'empty', title: t('editing.filter_empty', {count: emptyPinnedCount})},
              ]"
              compact
            />
          </div>

          <div class="editing-section__group editing-section__group--search">
            <v-text-field
              v-model="fieldSearch"
              :placeholder="t('editing.search_fields')"
              :aria-label="t('editing.search_fields')"
              prepend-inner-icon="mdi-magnify"
              density="compact"
              hide-details
              clearable
              rounded="xl"
              variant="outlined"
              class="editing-section__search"
            />
          </div>
        </div>

        <div class="editing-grid">
          <EditingSectionHeader
            v-if="useSections"
            :ref="(el) => setSectionEl('main', el)"
            class="field--full"
            :title="sectionMeta.main.title"
            :icon="sectionMeta.main.icon"
          />

          <!-- Main section: own grid so the wide rating/favorite card can backfill holes -->
          <div class="editing-grid editing-grid--main field--full">

            <!-- Name field - only for tags -->
            <div v-if="isTag && meta" class="field">
              <v-card
                class="editing-field-card rounded-xl"
                :class="[fieldCardClass, propRows && propState('name', 'string')]"
                variant="flat"
              >
                <div v-if="propRows" class="prop-row__label">
                  <v-icon v-if="labelIcons" size="18" class="prop-row__icon" :icon="'mdi-alphabetical-variant'" />
                  <span class="prop-row__name">{{ t('common.name') }}</span>
                </div>
                <v-text-field
                  v-model="vals.name"
                  :rules="[nameRules]"
                  :prepend-icon="showIcons ? 'mdi-alphabetical-variant' : undefined"
                  v-bind="fieldCaption(t('common.name'))"
                  density="compact"
                  :hide-details="fieldHideDetails"
                  :variant="fieldVariant"
                >
                  <template v-if="vals.name !== old.name" #append-inner>
                    <EditingFieldRestoreBtn inline @click="restore('name')" />
                  </template>
                </v-text-field>
              </v-card>
            </div>

            <!-- Synonyms - only for tags -->
            <div v-if="isTag && showSynonymsField" class="field">
              <v-card
                class="editing-field-card rounded-xl"
                :class="[fieldCardClass, propRows && propState('synonyms', 'string')]"
                variant="flat"
              >
                <div v-if="propRows" class="prop-row__label">
                  <v-icon v-if="labelIcons" size="18" class="prop-row__icon" :icon="'mdi-alphabetical'" />
                  <span class="prop-row__name">{{ t('filters.sort.synonyms') }}</span>
                </div>
                <v-text-field
                  v-model="vals.synonyms"
                  :prepend-icon="showIcons ? 'mdi-alphabetical' : undefined"
                  v-bind="fieldCaption(t('filters.sort.synonyms'))"
                  :hint="isInspectorLayout ? undefined : t('editing.synonyms_hint')"
                  density="compact"
                  :hide-details="fieldHideDetails"
                  clearable
                  :variant="fieldVariant"
                >
                  <template v-if="vals.synonyms !== old.synonyms" #append-inner>
                    <EditingFieldRestoreBtn inline @click="restore('synonyms')" />
                  </template>
                </v-text-field>
              </v-card>
            </div>

            <!-- Rating & Favorite -->
            <!-- Dialog property list: rating and favorite are regular rows (fit the 2-column grid) -->
            <template v-if="splitIdentity">
              <div v-if="ratingEnabled" class="field" :class="halfClass(mainHalfKeys, 'rating')">
                <v-card
                  class="editing-field-card rounded-xl"
                  :class="[fieldCardClass, propState('rating', 'rating')]"
                  variant="flat"
                >
                  <div class="prop-row__label">
                    <v-icon v-if="labelIcons" size="18" class="prop-row__icon" icon="mdi-star-outline" />
                    <span class="prop-row__name">{{ t('meta.default_names.rating') }}</span>
                  </div>
                  <div class="editing-rating-field">
                    <v-rating
                      v-model="vals.rating"
                      active-color="yellow-darken-3"
                      color="grey-darken-1"
                      empty-icon="mdi-star-outline"
                      half-icon="mdi-star-half-full"
                      half-increments
                      clearable
                      density="compact"
                      :size="ratingSize"
                      hover
                    />
                  </div>
                  <EditingFieldRestoreBtn v-if="!equalOld('rating')" @click="restore('rating')" />
                </v-card>
              </div>
              <div v-if="favoriteEnabled" class="field" :class="halfClass(mainHalfKeys, 'favorite')">
                <v-card
                  class="editing-field-card rounded-xl"
                  :class="[fieldCardClass, propState('favorite', 'boolean'), 'prop-row--boolean']"
                  variant="flat"
                >
                  <div class="prop-row__label">
                    <v-icon v-if="labelIcons" size="18" class="prop-row__icon" icon="mdi-heart-outline" />
                    <span class="prop-row__name">{{ t('meta.default_names.favorite') }}</span>
                  </div>
                  <v-checkbox
                    v-model="vals.favorite"
                    :false-value="0"
                    :true-value="1"
                    false-icon="mdi-heart-outline"
                    true-icon="mdi-heart"
                    color="pink"
                    density="compact"
                    hide-details
                    class="fav-btn"
                  />
                  <EditingFieldRestoreBtn v-if="!equalOld('favorite')" @click="restore('favorite')" />
                </v-card>
              </div>
            </template>

            <div v-else-if="ratingEnabled || favoriteEnabled" class="field field--identity" :class="{'field--full': propRows}">
              <v-card
                class="editing-field-card editing-field-card--rating rounded-xl"
                :class="propRows ? 'editing-field-card--identity' : fieldCardClass"
                variant="flat"
              >
                <div class="editing-rating-field editing-rating-field--identity">
                  <template v-if="ratingEnabled">
                    <span class="editing-rating-field__name" :class="{'editing-rating-field__name--lead': propRows}">
                      <v-icon v-if="propRows && labelIcons" size="18" class="prop-row__icon" icon="mdi-star-outline" />
                      <span>{{ t('meta.default_names.rating') }}</span>
                    </span>
                    <v-rating
                      v-model="vals.rating"
                      active-color="yellow-darken-3"
                      color="grey-darken-1"
                      empty-icon="mdi-star-outline"
                      half-icon="mdi-star-half-full"
                      half-increments
                      clearable
                      density="compact"
                      :size="ratingSize"
                      hover
                    />
                  </template>
                  <template v-if="favoriteEnabled">
                    <span
                      v-if="ratingEnabled"
                      class="editing-rating-field__sep"
                      aria-hidden="true"
                    />
                    <span class="editing-rating-field__name" :class="{'editing-rating-field__name--lead': propRows && !ratingEnabled}">
                      <v-icon v-if="propRows && labelIcons && !ratingEnabled" size="18" class="prop-row__icon" icon="mdi-heart-outline" />
                      <span>{{ t('meta.default_names.favorite') }}</span>
                    </span>
                    <v-checkbox
                      v-model="vals.favorite"
                      :false-value="0"
                      :true-value="1"
                      false-icon="mdi-heart-outline"
                      true-icon="mdi-heart"
                      color="pink"
                      density="compact"
                      hide-details
                      class="fav-btn"
                    />
                  </template>
                  <template v-if="viewsInIdentity">
                    <span class="editing-rating-field__sep" aria-hidden="true" />
                    <span class="editing-rating-field__name">{{ t('settings_labels.appearance.number_of_views') }}</span>
                    <v-number-input
                      v-model="vals.views"
                      :min="0"
                      :step="1"
                      :rules="[numberRules]"
                      control-variant="split"
                      density="compact"
                      variant="solo-filled"
                      flat
                      hide-details
                      class="editing-views-inline"
                    >
                      <template v-if="!equalOld('views')" #append-inner>
                        <EditingFieldRestoreBtn inline @click="restore('views')" />
                      </template>
                    </v-number-input>
                  </template>
                </div>
                <EditingFieldRestoreBtn
                  v-if="!equalOld('rating') || !equalOld('favorite')"
                  @click="restoreIdentityRatingFavorite"
                />
              </v-card>
            </div>

            <!-- Number of views -->
            <div v-if="viewsEnabled && !viewsInIdentity" class="field" :class="halfClass(mainHalfKeys, 'views')">
              <v-card
                class="editing-field-card rounded-xl"
                :class="[fieldCardClass, propRows && propState('views', 'number')]"
                variant="flat"
              >
                <div v-if="propRows" class="prop-row__label">
                  <v-icon v-if="labelIcons" size="18" class="prop-row__icon" :icon="'mdi-eye'" />
                  <span class="prop-row__name">{{ t('settings_labels.appearance.number_of_views') }}</span>
                </div>
                <v-number-input
                  v-model="vals.views"
                  v-bind="fieldCaption(t('settings_labels.appearance.number_of_views'))"
                  :prepend-icon="showIcons ? 'mdi-eye' : undefined"
                  :min="0"
                  :step="1"
                  :rules="[numberRules]"
                  control-variant="split"
                  density="compact"
                  :hide-details="fieldHideDetails"
                  :variant="fieldVariant"
                >
                  <template
                    v-if="!equalOld('views')"
                    #append-inner
                  >
                    <EditingFieldRestoreBtn inline @click="restore('views')" />
                  </template>
                </v-number-input>
              </v-card>
            </div>

            <!-- Color - only for tags -->
            <div v-if="isTag && meta?.color" class="field" :class="halfClass(mainHalfKeys, 'color')">
              <v-card
                class="editing-field-card rounded-xl"
                :class="[fieldCardClass, propRows && propState('color', 'string')]"
                variant="flat"
              >
                <div v-if="propRows" class="prop-row__label">
                  <v-icon v-if="labelIcons" size="18" class="prop-row__icon" :icon="'mdi-palette-outline'" />
                  <span class="prop-row__name">{{ t('meta.default_names.color') }}</span>
                </div>
                <v-text-field
                  :model-value="vals.color || ''"
                  v-bind="fieldCaption(t('meta.default_names.color'))"
                  :prepend-icon="showIcons ? 'mdi-palette-outline' : undefined"
                  density="compact"
                  :variant="fieldVariant"
                  readonly
                  hide-details
                  class="editing-color-field"
                  @click="pickColor"
                >
                  <template #prepend-inner>
                    <v-icon
                      :color="vals.color || 'grey'"
                      size="20"
                      class="editing-color-field__swatch"
                      @click.stop="pickColor"
                    >
                      mdi-circle
                    </v-icon>
                  </template>
                  <template #append-inner>
                    <v-btn
                      @click.stop="pickColorFromImage"
                      :disabled="!hasMainTagImage"
                      v-tooltip:top="t('meta.settings.color_from_image')"
                      class="editing-color-field__eyedropper"
                      variant="text"
                      size="x-small"
                      icon
                    >
                      <v-icon size="18">mdi-eyedropper</v-icon>
                    </v-btn>
                    <EditingFieldRestoreBtn
                      v-if="!equalOld('color')"
                      inline
                      @click="restore('color')"
                    />
                  </template>
                </v-text-field>
              </v-card>
            </div>

            <!-- Country - only for tags -->
            <div v-if="isTag && showCountryField" class="field" :class="halfClass(mainHalfKeys, 'country')">
              <v-card
                class="editing-field-card rounded-xl"
                :class="[fieldCardClass, propRows && propState('country', 'array')]"
                variant="flat"
              >
                <div v-if="propRows" class="prop-row__label">
                  <v-icon v-if="labelIcons" size="18" class="prop-row__icon" :icon="'mdi-flag-outline'" />
                  <span class="prop-row__name">{{ t('meta.default_names.country') }}</span>
                </div>
                <MetaInputCountry
                  @update:model-value="setValByKey($event, 'country')"
                  :model-value="vals.country || []"
                  v-bind="fieldCaption(t('meta.default_names.country'))"
                  :label="propRows ? false : undefined"
                  :variant="fieldVariant"
                  density="compact"
                  hide-details
                />
                <EditingFieldRestoreBtn
                  v-if="!equalOld('country', 'array')"
                  @click="restore('country')"
                />
              </v-card>
            </div>

            <!-- Combined tags from all pinned array categories -->
          </div>

          <EditingSectionHeader
            v-if="showTagsSection"
            :ref="(el) => setSectionEl('tags', el)"
            class="field--full"
            :title="sectionMeta.tags.title"
            :icon="sectionMeta.tags.icon"
            :filled="sectionMeta.tags.filled"
            :total="sectionMeta.tags.total"
          >
            <template #actions>
              <SettingsSegmentedControl
                :model-value="useMixedTagsInput ? 'mixed' : 'separate'"
                class="editing-section__tags-segmented"
                @update:model-value="onTagsModeChange"
                :label="t('meta.fields.tags_mode_combined')"
                :items="[
                  {value: 'mixed', title: t('meta.fields.tags_mode_combined'), tooltip: t('meta.fields.tags_mode_combined_hint')},
                  {value: 'separate', title: t('meta.fields.tags_mode_separate'), tooltip: t('meta.fields.tags_mode_separate_hint')},
                ]"
                compact
              />
            </template>
          </EditingSectionHeader>

          <div
            v-if="showMixedTagsField"
            class="field field--full"
          >
            <v-card
              class="editing-field-card rounded-xl"
              :class="[fieldCardClass, propRows && {'prop-row--empty': !mixedTagsFilled, 'prop-row--dirty': mixedTagsDirty}]"
              variant="flat"
            >
              <div v-if="propRows" class="prop-row__label">
                <v-icon v-if="labelIcons" size="18" class="prop-row__icon" :icon="'mdi-tag-multiple-outline'" />
                <span class="prop-row__name">{{ t('meta.fields.mixed_tags_label') }}</span>
              </div>
              <MetaInputMixedTags
                :key="`mixed_${currentItemId}`"
                :ref="setMixedTagsRef"
                :meta-ids="mixedMetaIds"
                :model-value="mixedTagsValue"
                @update:model-value="setMixedTagsValue"
                :label="isInspectorLayout || propRows ? '' : undefined"
                :placeholder="propRows ? t('editing.add_value') : undefined"
                :variant="fieldVariant"
                :flat="propRows"
                :menu-props="mixedTagsMenuProps"
                density="compact"
                hide-details
              />
              <EditingFieldRestoreBtn
                v-if="mixedTagsDirty"
                @click="restoreMixedTags"
              />
            </v-card>
          </div>

          <template v-for="entry in fieldEntries" :key="entry.key">
            <EditingSectionHeader
              v-if="entry.kind === 'header'"
              :ref="(el) => setSectionEl(entry.section, el)"
              class="field--full"
              :title="sectionMeta[entry.section].title"
              :icon="sectionMeta[entry.section].icon"
              :filled="sectionMeta[entry.section].filled"
              :total="sectionMeta[entry.section].total"
            />

            <div
              v-else-if="entry.kind === 'more'"
              class="field field--full editing-more"
            >
              <v-btn
                variant="text"
                size="small"
                rounded="xl"
                color="primary"
                :prepend-icon="entry.expanded ? 'mdi-chevron-up' : 'mdi-chevron-down'"
                @click="toggleEmptyFields(entry.section)"
              >
                {{ entry.expanded
                  ? t('editing.hide_empty_fields')
                  : t('editing.show_empty_fields', {count: entry.count}) }}
              </v-btn>
            </div>

            <!-- Bookmark -->
            <div v-else-if="entry.kind === 'bookmark'" class="field">
              <v-card
                class="editing-field-card rounded-xl"
                :class="[fieldCardClass, propRows && propState('bookmark', 'string')]"
                variant="flat"
              >
                <div v-if="propRows" class="prop-row__label">
                  <v-icon v-if="labelIcons" size="18" class="prop-row__icon" :icon="'mdi-bookmark-outline'" />
                  <span class="prop-row__name">{{ t('meta.default_names.bookmark') }}</span>
                </div>
                <v-textarea
                  v-model="vals.bookmark"
                  :prepend-icon="showIcons ? 'mdi-bookmark' : undefined"
                  v-bind="fieldCaption(t('meta.default_names.bookmark'))"
                  density="compact"
                  hide-details
                  clearable
                  auto-grow
                  rows="1"
                  :variant="fieldVariant"
                >
                  <template v-if="vals.bookmark !== old.bookmark" #append-inner>
                    <EditingFieldRestoreBtn inline @click="restore('bookmark')" />
                  </template>
                </v-textarea>
              </v-card>
            </div>

            <!-- Assigned/Pinned metadata -->
            <div
              v-else
              class="field"
              :class="[{'field--full': isWideField(entry.item)}, halfClass(entryHalfKeys, entry.key)]"
            >
              <v-card
                class="editing-field-card rounded-xl"
                :class="[fieldCardClass, propRows && propState(getItemKey(entry.item), entry.item.meta?.type), propRows && `prop-row--${entry.item.meta?.type}`]"
                variant="flat"
              >
                <div v-if="propRows" class="prop-row__label">
                  <v-icon v-if="labelIcons" size="18" class="prop-row__icon" :icon="`mdi-${metaIcon(entry.item)}`" />
                  <span class="prop-row__name">{{ metaName(entry.item) }}</span>
                </div>
                <MetaInputArray
                  v-if="entry.item.meta?.type === 'array'"
                  @update:model-value="setVal($event, getItemKey(entry.item))"
                  :model-value="getArrayVal(entry.item)"
                  :meta-id="getMetaIdNumber(entry.item)"
                  :key="`${currentItemId}_${getItemKey(entry.item)}`"
                  :ref="el => setMetaInputRef(el, getItemKey(entry.item))"
                  :label="isInspectorLayout || propRows ? '' : undefined"
                  :placeholder="propRows ? t('editing.add_value') : undefined"
                  :variant="fieldVariant"
                  :flat="propRows"
                  :menu-props="arrayTagMenuProps"
                  density="compact"
                  :hide-details="fieldHideDetails"
                  multiple
                />

                <v-number-input
                  v-if="entry.item.meta?.type === 'number'"
                  :model-value="getNumberVal(entry.item)"
                  @update:model-value="setVal($event, getItemKey(entry.item))"
                  v-bind="fieldCaption(metaName(entry.item))"
                  :hint="isInspectorLayout ? undefined : metaHint(entry.item)"
                  :prepend-icon="showIcons ? `mdi-${metaIcon(entry.item)}` : undefined"
                  :rules="[numberRules]"
                  :precision="null"
                  control-variant="split"
                  density="compact"
                  :hide-details="fieldHideDetails"
                  clearable
                  :variant="fieldVariant"
                >
                  <template
                    v-if="!equalOld(getItemKey(entry.item), entry.item.meta?.type)"
                    #append-inner
                  >
                    <EditingFieldRestoreBtn inline @click="restore(getItemKey(entry.item))" />
                  </template>
                </v-number-input>

                <v-textarea
                  v-if="entry.item.meta?.type === 'string'"
                  :model-value="getStringVal(entry.item)"
                  @update:model-value="setVal($event, getItemKey(entry.item))"
                  v-bind="fieldCaption(metaName(entry.item))"
                  :hint="isInspectorLayout ? undefined : metaHint(entry.item)"
                  :prepend-icon="showIcons ? `mdi-${metaIcon(entry.item)}` : undefined"
                  density="compact"
                  :hide-details="fieldHideDetails"
                  clearable
                  auto-grow
                  rows="1"
                  :variant="fieldVariant"
                >
                  <template
                    v-if="!equalOld(getItemKey(entry.item), entry.item.meta?.type)"
                    #append-inner
                  >
                    <EditingFieldRestoreBtn inline @click="restore(getItemKey(entry.item))" />
                  </template>
                </v-textarea>

                <v-checkbox
                  v-if="entry.item.meta?.type === 'boolean'"
                  :model-value="getBooleanVal(entry.item)"
                  @update:model-value="setVal($event, getItemKey(entry.item))"
                  :label="propRows ? undefined : metaName(entry.item)"
                  :hint="isInspectorLayout ? undefined : metaHint(entry.item)"
                  :prepend-icon="showIcons ? `mdi-${metaIcon(entry.item)}` : undefined"
                  density="compact"
                  :hide-details="fieldHideDetails"
                />

                <v-text-field
                  v-if="entry.item.meta?.type === 'date'"
                  @click="pickDate(getItemKey(entry.item))"
                  :model-value="getStringVal(entry.item)"
                  :prepend-inner-icon="propRows ? 'mdi-calendar-blank-outline' : undefined"
                  v-bind="fieldCaption(metaName(entry.item))"
                  :hint="isInspectorLayout ? undefined : metaHint(entry.item)"
                  :prepend-icon="showIcons ? `mdi-${metaIcon(entry.item)}` : undefined"
                  density="compact"
                  :hide-details="fieldHideDetails"
                  readonly
                  clearable
                  :variant="fieldVariant"
                >
                  <template
                    v-if="!equalOld(getItemKey(entry.item), entry.item.meta?.type)"
                    #append-inner
                  >
                    <EditingFieldRestoreBtn inline @click="restore(getItemKey(entry.item))" />
                  </template>
                </v-text-field>

                <div v-if="entry.item.meta?.type === 'rating'" class="editing-rating-field">
                  <v-icon
                    v-if="showIcons"
                    class="editing-rating-field__icon"
                    size="20"
                    :icon="`mdi-${metaIcon(entry.item)}`"
                  />
                  <span v-if="!propRows" class="editing-rating-field__name">{{ metaName(entry.item) }}</span>
                  <div class="editing-rating-field__rating">
                    <v-rating
                      :model-value="getRatingVal(entry.item)"
                      @update:model-value="setVal($event, getItemKey(entry.item))"
                      :length="metaRatingMax(entry.item)"
                      :full-icon="`mdi-${metaRatingIcon(entry.item)}`"
                      :empty-icon="`mdi-${metaRatingIconEmpty(entry.item)}`"
                      :half-increments="metaRatingHalf(entry.item)"
                      :half-icon="`mdi-${metaRatingIconHalf(entry.item)}`"
                      :active-color="metaRatingColor(entry.item)"
                      color="grey-darken-1"
                      density="compact"
                      :size="ratingSize"
                      clearable
                      hover
                    />
                    <div
                      v-if="!isInspectorLayout && metaHint(entry.item)"
                      class="editing-rating-field__hint"
                    >
                      {{ metaHint(entry.item) }}
                    </div>
                  </div>
                </div>

                <EditingFieldRestoreBtn
                  v-if="!['number', 'string', 'date'].includes(entry.item.meta?.type || '') && !equalOld(getItemKey(entry.item), entry.item.meta?.type)"
                  @click="restore(getItemKey(entry.item))"
                />
              </v-card>
            </div>
          </template>
        </div>

        <div
          v-if="showFieldToolbar && visibleAssignedItems.length === 0 && !showMixedTagsField && assignedItems.length > 0"
          class="editing-section__empty text-medium-emphasis text-body-2 mt-2"
        >
          {{ t('editing.no_matching_fields') }}
        </div>
      </v-container>
    </v-form>

    <!-- Color picker dialog - only for tags -->
    <ColorPicker
      v-if="colorPicker.dialog"
      v-model="colorPicker.dialog"
      :color="colorPicker.color ?? '#777'"
      @get-color="setColor"
    />

    <!-- Date picker dialog -->
    <v-dialog v-model="datePicker.dialog" width="300">
      <v-date-picker
        @update:model-value="setDate"
        :model-value="datePicker.value"
        :title="t('filters.select_date')"
        :header="t('filters.enter_date')"
        color="primary"
        rounded="xl"
      />
    </v-dialog>
    </div>
  </div>
</template>

<script setup lang="ts">
import SettingsSegmentedControl from '@/components/ui/SettingsSegmentedControl.vue'
import {ref, computed, onMounted, onUnmounted, watch, reactive} from 'vue'
import {useI18n} from 'vue-i18n'
import {useAppStore} from '@/stores/app'
import {usePlayerStore} from '@/stores/player'
import {useSettingsStore} from '@/stores/settings'
import {useItemsStore} from '@/stores/items'
import {useDialogsStore} from '@/stores/dialogs'
import {useScraperStore} from '@mediachips/plugin-adult/stores/scraper'
import {useSceneScraperStore} from '@mediachips/plugin-adult/stores/sceneScraper'
import {useEventBus} from '@/utils/eventBus'
import {parseCountries, serializeCountries} from '@/utils/country'
import {typedApi} from '@/services/typedApi'
import {createImage, createUnavailableImage, checkFileExists} from '@/services/fileService'
import {refreshMediaFileInfo} from '@/services/mediaFileInfoService'
import {setNotification} from '@/services/notificationService'
import {setOption} from '@/services/settingsService'
import {
  cloneMetaFieldValue,
  cloneMetaValues,
  metaArrayValuesEqual,
} from '@/utils/metaValuesClone'
import path from 'path-browserify'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/en'
import 'dayjs/locale/de'
import 'dayjs/locale/fr'
import 'dayjs/locale/ja'
import 'dayjs/locale/pt-br'
import 'dayjs/locale/es'
import 'dayjs/locale/zh-cn'
import 'dayjs/locale/ru'
import {usePresetMeta} from '@/composable/ItemPresetMeta'
import {sortPinnedAssignmentItems} from '@/utils/pinnedMetaOrder'
import {
  DEFAULT_TAG_COLOR,
  extractColorFromImageUrl,
  extractColorFromLocalFile,
  isDefaultTagColor,
} from '@/utils/colorFromImage'
import {getCachedThumb, tagThumbKey} from '@/utils/thumbDisplayCache'
import {refreshTagThumbDisplay} from '@/utils/tagThumbRefresh'
import {isThumbUnavailable, resolveTagThumbDisplayUrl} from '@/utils/thumbSource'
import {
  TAG_AVATAR_SAVE_WIDTH,
  TAG_HEADER_SAVE_WIDTH,
  TAG_IMAGE_SAVE_WIDTH,
} from '@shared/tagImages'
import type {PresetMetaProps} from '@/types/itemsPage'
import type {
  ScraperImageAssignment,
  ScraperImageSlot,
  ScraperPinnedItem,
  ScraperTransferField,
} from '@mediachips/plugin-adult/types/scraper'
import {isScraperImageSlot} from '@mediachips/plugin-adult/utils/scraperPosters'
import type {AssignedMeta, ItemTagRef, ItemValueRef, MediaItem, Meta, Tag} from '@/types/stores'
import type { TagInTagEntry, ValueInTagEntry, EntityUpdatePayload } from '@shared/api/responses'
import {reloadTagsCatalog} from '@/composable/appCatalogs'
import type {VFormInstance} from '@/types/vue'
import {
  parseMetaBooleanValue,
  serializeMetaBooleanValue,
} from '@shared/schemas/coercion'

// Components
import MetaInputArray from '@/components/meta/input/MetaInputArray.vue'
import MetaInputMixedTags from '@/components/meta/input/MetaInputMixedTags.vue'
import MetaInputCountry from '@/components/meta/input/MetaInputCountry.vue'
import EditPinnedOverview from '@/components/items/EditPinnedOverview.vue'
import ColorPicker from '@/components/elements/ColorPicker.vue'
import EditingFieldRestoreBtn from '@/components/items/EditingFieldRestoreBtn.vue'
import EditingSectionHeader from '@/components/items/EditingSectionHeader.vue'

type EditLayout = 'default' | 'hero' | 'inspector'

type PinnedMetaAssignment = AssignedMeta

type MetaFieldValue = string | number | boolean | string[] | number[] | null | undefined

interface PinnedMetaValues {
  name?: string | null
  color?: string | null
  synonyms?: string | null
  rating?: number
  favorite?: number
  views?: number
  bookmark?: string | null
  country?: string[] | null
  [key: string]: MetaFieldValue
}

interface EntityUpdateFormValues extends Omit<PinnedMetaValues, 'country'> {
  country?: string[] | null
}

interface TagInTagPayload {
  parentTagId: number
  tagId: number
  metaId: string | number
}

interface TagInMediaPayload {
  mediaId: number
  tagId: number
  metaId: string | number
}

interface ValueInTagPayload {
  value: unknown
  tagId: number
  metaId: string | number
}

interface ValueInMediaPayload {
  value: unknown
  mediaId: number
  metaId: string | number
}

interface MetaInputArrayInstance {
  create: (name: string) => void
}

interface MetaInputMixedTagsInstance {
  create: (name?: string, metaId?: number) => void | Promise<void>
}

const props = withDefaults(defineProps<{
  layout?: EditLayout
  hideMediaPanel?: boolean
  showOverview?: boolean
  tag?: Tag | null
  meta?: Meta | null
  media?: MediaItem | null
}>(), {
  layout: 'default',
  showOverview: true,
  tag: null,
  meta: null,
  media: null,
})

const emit = defineEmits<{
  close: []
  'dirty-change': [dirty: boolean]
  saved: [payload: {id: number; type: 'tag' | 'media'}]
  'update:hideMediaPanel': [value: boolean]
}>()

const toggleMediaPanel = () => emit('update:hideMediaPanel', !props.hideMediaPanel)

const isInspectorLayout = computed(() => props.layout === 'inspector')
const ratingSize = 28
/** Property-list rows (label column + value) in hero/default layouts. */
const propRows = computed(() => true)
const fieldVariant = computed(() => 'solo-filled' as const)
const fieldHideDetails = computed(() => (isInspectorLayout.value ? true : 'auto'))

const isTag = computed(() => !!props.tag)
const isMedia = computed(() => !props.tag && !!props.media)
const mediaOverride = ref<MediaItem | null>(null)
const currentItem = computed((): MediaItem | Tag | null => {
  if (isTag.value) return props.tag ?? null
  const media = props.media ?? null
  if (
    mediaOverride.value
    && media
    && Number(mediaOverride.value.id) === Number(media.id)
  ) {
    return mediaOverride.value
  }
  return media
})
const currentItemId = computed(() => currentItem.value?.id)
const overviewItem = computed((): MediaItem | Tag => {
  return currentItem.value ?? props.tag ?? props.media ?? {id: 0}
})

const appStore = useAppStore()
const playerStore = usePlayerStore()
const settingsStore = useSettingsStore()
const dialogsStore = useDialogsStore()
const scraperStore = useScraperStore()
const sceneScraperStore = useSceneScraperStore()
const itemsStore = useItemsStore()
const eventBus = useEventBus()
const {t} = useI18n()

const locale = computed(() => settingsStore.locale == 'cn' ? 'zh-cn' : settingsStore.locale == 'pt' ? 'pt-br' : settingsStore.locale)
dayjs.extend(relativeTime)
dayjs.locale(locale.value)

// Body-teleported menus render outside the fullscreened .player element and
// become invisible under native browser fullscreen — attach inside it there.
const fullscreenAttach = computed(() => playerStore.fullscreen ? '.player' : undefined)

const mixedTagsMenuProps = computed(() => ({
  contentClass: 'custom-list ac-dropdown mixed-tags-dropdown',
  maxHeight: isInspectorLayout.value ? 240 : 280,
  zIndex: 2800,
  attach: fullscreenAttach.value,
}))

const arrayTagMenuProps = computed(() => ({
  contentClass: 'custom-list ac-dropdown meta-input-array-list',
  maxHeight: 280,
  zIndex: 2800,
  attach: fullscreenAttach.value,
}))

const form = ref<VFormInstance>(null)
const valid = ref(false)
const vals = ref<PinnedMetaValues>({})
const old = ref<PinnedMetaValues>({})
const assignedItems = ref<PinnedMetaAssignment[]>([])

// Keep the card and inspector summary in sync with unsaved identity edits.
// The full form is still persisted together by save(), but rating/favorite
// should be visible everywhere immediately while the form is dirty.
// Do NOT depend on currentItemId: on selection change vals still hold the
// previous card, and writing them onto the new id leaks rating/favorite.
watch(
  () => [vals.value.rating, vals.value.favorite] as const,
  ([rating, favorite]) => {
    const itemId = currentItemId.value
    if (itemId == null) return
    if (rating !== undefined) {
      itemsStore.updateItemField({id: Number(itemId), field: 'rating', value: rating})
    }
    if (favorite !== undefined) {
      itemsStore.updateItemField({id: Number(itemId), field: 'favorite', value: favorite})
    }
  },
  {flush: 'sync'},
)

// Also accept changes made directly on the card while this editor is open.
// Do not reload the whole form: other unsaved fields must remain untouched.
// Skip when the bound item changes — loadEditingState owns that reset, and
// copying the new card into vals before save(previousId) would corrupt it.
watch(
  () => [currentItemId.value, props.media?.rating, props.media?.favorite, props.tag?.rating, props.tag?.favorite] as const,
  ([itemId, mediaRating, mediaFavorite, tagRating, tagFavorite], previous) => {
    const prevItemId = previous?.[0]
    if (itemId == null || (prevItemId != null && itemId !== prevItemId)) return

    const rating = isMedia.value ? mediaRating : tagRating
    const favorite = isMedia.value ? mediaFavorite : tagFavorite
    if (rating !== undefined && rating !== vals.value.rating) {
      vals.value.rating = Number(rating) || 0
      old.value.rating = vals.value.rating
    }
    const normalizedFavorite = Number(favorite) ? 1 : 0
    if (favorite !== undefined && normalizedFavorite !== vals.value.favorite) {
      vals.value.favorite = normalizedFavorite
      old.value.favorite = vals.value.favorite
    }
  },
  {flush: 'sync'},
)
const metaInputRefs = ref<Record<string | number, MetaInputArrayInstance>>({})
const mixedTagsInputRef = ref<MetaInputMixedTagsInstance | null>(null)

const presetMetaInput = reactive<PresetMetaProps>({
  get type() {
    return isTag.value ? 'tag' : 'media'
  },
  get item() {
    return overviewItem.value
  },
  isShowAll: true,
})
const {preset_meta} = usePresetMeta(presetMetaInput)

const colorPicker = ref<{
  dialog: boolean
  color: string | null
}>({
  dialog: false,
  color: null,
})

const datePicker = ref<{
  dialog: boolean
  metaId: string | number | null
  value: string | null
}>({
  dialog: false,
  metaId: null,
  value: null,
})

const settings = computed(() => settingsStore)
/** Icons inside inputs (legacy card style) — property rows show icons in the label column instead. */
const showIcons = computed(() => false)
const labelIcons = computed(() => settings.value.showIconsOfMetaInEditingDialog === '1')

/** Property rows: the name lives in the label column, the field shows an "Add…" placeholder. */
function fieldCaption(label: string | undefined) {
  void label
  return {label: undefined as string | undefined, placeholder: t('editing.add_value'), flat: true}
}
const fieldCardClass = computed(() => {
  return 'editing-field-card--prop prop-row'
})

/** Row state for property rows: dim empty labels, mark edited rows. */
const propState = (key: string | number, type?: string) => ({
  'prop-row--empty': !isValueFilled(vals.value[String(key)], type),
  'prop-row--dirty': !equalOld(key, type),
})

const ratingEnabled = computed(() => {
  if (isTag.value) return props.meta?.rating
  if (isMedia.value) return true
  return false
})

const favoriteEnabled = computed(() => {
  if (isTag.value) return props.meta?.favorite
  if (isMedia.value) return true
  return false
})

const showSynonymsField = computed(() => Boolean(props.meta?.synonyms || props.meta?.scraper))
const showCountryField = computed(() => Boolean(props.meta?.country || props.meta?.scraper))

type FieldFilter = 'all' | 'filled' | 'empty'
const FIELD_TOOLBAR_MIN_PINNED = 4
const fieldFilter = ref<FieldFilter>('all')
const fieldSearch = ref<string | null>('')

const viewsEnabled = computed(() => settingsStore.count_number_of_views === '1')
/** Property rows: views counter joins the rating/favorite strip instead of its own row. */
const viewsInIdentity = computed(() =>
  propRows.value && !isInspectorLayout.value && !splitIdentity.value && viewsEnabled.value && !!(ratingEnabled.value || favoriteEnabled.value),
)
const showFieldToolbar = computed(() => assignedItems.value.length > FIELD_TOOLBAR_MIN_PINNED)

const isValueFilled = (val: MetaFieldValue, type?: string): boolean => {
  if (val === undefined || val === null || val === '') return false
  if (type === 'boolean' || typeof val === 'boolean') return true
  if (type === 'number' || type === 'rating' || typeof val === 'number') {
    const n = Number(val)
    return Number.isFinite(n) && n > 0
  }
  if (typeof val === 'string' || Array.isArray(val)) return val.length > 0
  return false
}

const matchesFieldSearch = (label: string): boolean => {
  const query = (fieldSearch.value ?? '').trim().toLowerCase()
  if (!query) return true
  return label.toLowerCase().includes(query)
}

const shouldShowPinnedField = (options: {
  label: string
  filled: boolean
  dirty: boolean
}): boolean => {
  if (!showFieldToolbar.value) return true
  if (!matchesFieldSearch(options.label)) return false
  if (options.dirty) return true
  if (fieldFilter.value === 'all') return true
  if (fieldFilter.value === 'filled') return options.filled
  return !options.filled
}

const useMixedTagsInput = computed(() => settingsStore.mixedTagsInputInEditingDialog === '1')

function onTagsModeChange(mode: unknown) {
  const next = mode === 'mixed' ? '1' : '0'
  if (settingsStore.mixedTagsInputInEditingDialog === next) return
  void setOption(next, 'mixedTagsInputInEditingDialog')
}

const visibleAssignedItems = computed(() =>
  assignedItems.value.filter((item) => {
    if (useMixedTagsInput.value && item.meta?.type === 'array') return false
    const key = getItemKey(item)
    return shouldShowPinnedField({
      label: metaName(item) || '',
      filled: isValueFilled(vals.value[key], item.meta?.type),
      dirty: !equalOld(key, item.meta?.type),
    })
  }),
)

const arrayAssignedItems = computed(() =>
  assignedItems.value.filter((item) => item.meta?.type === 'array'),
)

const mixedMetaIds = computed(() =>
  arrayAssignedItems.value
    .map((item) => getMetaIdNumber(item))
    .filter((id) => Number.isFinite(id) && id > 0),
)

const mixedTagsValue = computed(() => {
  const keys: string[] = []
  for (const item of arrayAssignedItems.value) {
    const metaId = getMetaIdNumber(item)
    const tagIds = getArrayVal(item) || []
    for (const tagId of tagIds) {
      const id = Number(tagId)
      if (!Number.isFinite(id)) continue
      keys.push(`${metaId}:${id}`)
    }
  }
  return keys
})

const mixedTagsDirty = computed(() =>
  arrayAssignedItems.value.some((item) => !equalOld(getItemKey(item), 'array')),
)

const mixedTagsFilled = computed(() =>
  arrayAssignedItems.value.some((item) =>
    isValueFilled(vals.value[getItemKey(item)], 'array'),
  ),
)

const showMixedTagsField = computed(() => {
  if (!useMixedTagsInput.value || !arrayAssignedItems.value.length) return false
  return shouldShowPinnedField({
    label: t('meta.fields.mixed_tags_label'),
    filled: mixedTagsFilled.value,
    dirty: mixedTagsDirty.value,
  })
})

const setMixedTagsValue = (keys: string[]) => {
  const byMeta = new Map<number, number[]>()
  for (const key of keys) {
    const [metaPart, tagPart] = String(key).split(':')
    const metaId = Number(metaPart)
    const tagId = Number(tagPart)
    if (!metaId || !tagId) continue
    const list = byMeta.get(metaId) || []
    if (!list.includes(tagId)) list.push(tagId)
    byMeta.set(metaId, list)
  }

  for (const item of arrayAssignedItems.value) {
    const metaId = getMetaIdNumber(item)
    setVal(byMeta.get(metaId) || [], getItemKey(item))
  }
}

const restoreMixedTags = () => {
  for (const item of arrayAssignedItems.value) {
    restore(getItemKey(item))
  }
}

const emptyPinnedCount = computed(() =>
  assignedItems.value.filter((item) =>
    !isValueFilled(vals.value[getItemKey(item)], item.meta?.type),
  ).length,
)

// --- Sections (hero/default layouts): Main / Tags & links / Attributes ---
type SectionId = 'main' | 'tags' | 'attrs'
type FieldEntry =
  | {kind: 'header'; key: string; section: SectionId}
  | {kind: 'more'; key: string; section: SectionId; count: number; expanded: boolean}
  | {kind: 'bookmark'; key: string}
  | {kind: 'item'; key: string; item: PinnedMetaAssignment}

/** Collapse empty fields into a "+N more" toggle only when there are at least this many. */
const COLLAPSE_EMPTY_MIN = 2

const useSections = computed(() => true)
const expandedEmpty = reactive<Record<SectionId, boolean>>({main: false, tags: false, attrs: false})

const toggleEmptyFields = (section: SectionId) => {
  expandedEmpty[section] = !expandedEmpty[section]
}

const isArrayItem = (item: PinnedMetaAssignment) => item.meta?.type === 'array'

// ─── Two-column property list (dialog only) ─────────────────────────────────
// Short controls (rating, favorite, counters, dates, color…) pair up two per
// row once the form is wide enough (CSS container query); text and tag inputs
// always keep the full row. A short field with no partner in its run also gets
// the full row, so the grid never leaves holes and field order is preserved.
const twoColumnLayout = computed(() => propRows.value && !isInspectorLayout.value)
const splitIdentity = twoColumnLayout

const isCompactItem = (item: PinnedMetaAssignment) => {
  const type = item.meta?.type || ''
  if (type === 'rating') return (metaRatingMax(item) ?? 5) <= 6
  return ['number', 'boolean', 'date'].includes(type)
}

const pairHalves = (keys: Array<string | null>) => {
  const half = new Set<string>()
  let run: string[] = []
  const flush = () => {
    run.slice(0, run.length - (run.length % 2)).forEach((key) => half.add(key))
    run = []
  }
  for (const key of keys) {
    if (key === null) flush()
    else run.push(key)
  }
  flush()
  return half
}

const mainHalfKeys = computed(() => {
  if (!twoColumnLayout.value) return new Set<string>()
  return pairHalves([
    ratingEnabled.value ? 'rating' : null,
    favoriteEnabled.value ? 'favorite' : null,
    viewsEnabled.value ? 'views' : null,
    isTag.value && props.meta?.color ? 'color' : null,
    isTag.value && showCountryField.value ? 'country' : null,
  ].filter((key): key is string => key !== null))
})

const entryHalfKeys = computed(() => {
  if (!twoColumnLayout.value) return new Set<string>()
  return pairHalves(fieldEntries.value.map((entry) =>
    entry.kind === 'item' && isCompactItem(entry.item) ? entry.key : null))
})

const halfClass = (set: Set<string>, key: string) => ({'field--half': set.has(key)})

const isWideField = (item: PinnedMetaAssignment) =>
  useSections.value && ['array', 'string'].includes(item.meta?.type || '')

const canCollapseEmpty = computed(() =>
  useSections.value
  && !propRows.value
  && fieldFilter.value === 'all'
  && !(fieldSearch.value ?? '').trim(),
)

/** Empty and untouched — safe to hide behind the "+N more" toggle. */
const isCollapsibleEmpty = (item: PinnedMetaAssignment) => {
  const key = getItemKey(item)
  return !isValueFilled(vals.value[key], item.meta?.type) && equalOld(key, item.meta?.type)
}

const toItemEntry = (item: PinnedMetaAssignment): FieldEntry => ({
  kind: 'item',
  key: `${currentItemId.value}_${item.pinnedMetaId || item.metaId}`,
  item,
})

const buildSectionEntries = (section: SectionId, items: PinnedMetaAssignment[]): FieldEntry[] => {
  const empties = canCollapseEmpty.value ? items.filter(isCollapsibleEmpty) : []
  const collapsible = empties.length >= COLLAPSE_EMPTY_MIN
  const collapsed = collapsible && !expandedEmpty[section]
  const entries = items
    .filter((item) => !(collapsed && empties.includes(item)))
    .map(toItemEntry)
  if (collapsible) {
    entries.push({
      kind: 'more',
      key: `more_${section}`,
      section,
      count: empties.length,
      expanded: !collapsed,
    })
  }
  return entries
}

const fieldEntries = computed<FieldEntry[]>(() => {
  const items = visibleAssignedItems.value
  const bookmark: FieldEntry = {kind: 'bookmark', key: 'bookmark'}
  if (!useSections.value) return [...items.map(toItemEntry), bookmark]

  const tagEntries = buildSectionEntries('tags', items.filter(isArrayItem))
  const attrEntries = buildSectionEntries('attrs', items.filter((item) => !isArrayItem(item)))
  const attrMore = attrEntries.filter((entry) => entry.kind === 'more')
  const attrFields = attrEntries.filter((entry) => entry.kind !== 'more')
  return [
    ...tagEntries,
    {kind: 'header', key: 'header_attrs', section: 'attrs'},
    ...attrFields,
    bookmark,
    ...attrMore,
  ]
})

const countFilled = (items: PinnedMetaAssignment[]) =>
  items.filter((item) => isValueFilled(vals.value[getItemKey(item)], item.meta?.type)).length

const attrAssignedItems = computed(() => assignedItems.value.filter((item) => !isArrayItem(item)))

const showTagsSection = computed(() =>
  useSections.value
  && arrayAssignedItems.value.length > 0
  && (showMixedTagsField.value || fieldEntries.value.some((entry) =>
    (entry.kind === 'item' && isArrayItem(entry.item))
    || (entry.kind === 'more' && entry.section === 'tags'),
  )),
)

type SectionInfo = {title: string; icon: string; filled?: number; total?: number}

const sectionMeta = computed<Record<SectionId, SectionInfo>>(() => ({
  main: {
    title: t('editing.section_main'),
    icon: 'mdi-card-account-details-outline',
  },
  tags: {
    title: t('editing.section_tags'),
    icon: 'mdi-tag-multiple-outline',
    filled: countFilled(arrayAssignedItems.value),
    total: arrayAssignedItems.value.length,
  },
  attrs: {
    title: t('editing.section_attributes'),
    icon: 'mdi-format-list-bulleted-type',
    filled: countFilled(attrAssignedItems.value),
    total: attrAssignedItems.value.length,
  },
}))

const sectionNav = computed(() => {
  const ids: SectionId[] = ['main']
  if (showTagsSection.value) ids.push('tags')
  ids.push('attrs')
  return ids.map((id) => ({id, ...sectionMeta.value[id]}))
})

const sectionEls: Partial<Record<SectionId, Element>> = {}

const setSectionEl = (id: SectionId, el: unknown) => {
  const node = el instanceof Element ? el : (el as {$el?: unknown} | null)?.$el
  if (node instanceof Element) sectionEls[id] = node
  else delete sectionEls[id]
}

const scrollToSection = (id: SectionId) => {
  sectionEls[id]?.scrollIntoView({behavior: 'smooth', block: 'start'})
}

const isDirty = computed(() => {
  const keys = new Set<string>([
    ...Object.keys(vals.value),
    ...Object.keys(old.value),
  ])
  for (const key of keys) {
    const assigned = assignedItems.value.find((item) => String(getItemKey(item)) === key)
    const type = assigned?.meta?.type ?? (key === 'country' ? 'array' : undefined)
    if (!equalOld(key, type)) return true
  }
  return false
})

// Methods

const nameRules = (value: string) => {
  if (!value || value.trim().length === 0) {
    return t('validation.name_required')
  }
  return true
}

const numberRules = (value: unknown) => {
  if (value == null || value === '') return true
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) || t('validation.incorrect_value')
}

const getItemKey = (item: PinnedMetaAssignment): string | number => {
  return item.pinnedMetaId ?? item.metaId ?? item.id ?? ''
}

/** Category id for tag API lookups (not the assignment storage key). */
const getMetaIdNumber = (item: PinnedMetaAssignment): number => {
  const fromMeta = Number(item.meta?.id ?? item.metaId)
  if (Number.isFinite(fromMeta) && fromMeta > 0) return fromMeta
  const fallback = Number(getItemKey(item))
  return Number.isFinite(fallback) ? fallback : 0
}

const getArrayVal = (item: PinnedMetaAssignment): number[] | undefined => {
  const val = vals.value[getItemKey(item)]
  return Array.isArray(val) ? val as number[] : undefined
}

const getStringVal = (item: PinnedMetaAssignment): string | undefined => {
  const val = vals.value[getItemKey(item)]
  if (val == null) return undefined
  return String(val)
}

const getNumberVal = (item: PinnedMetaAssignment): number | null => {
  const val = vals.value[getItemKey(item)]
  if (val == null || val === '') return null
  const n = Number(val)
  return isNaN(n) ? null : n
}

const getBooleanVal = (item: PinnedMetaAssignment): boolean => {
  const val = vals.value[getItemKey(item)]
  return parseMetaBooleanValue(val)
}

const getRatingVal = (item: PinnedMetaAssignment): number | undefined => {
  const val = vals.value[getItemKey(item)]
  if (val == null || val === '') return undefined
  const n = Number(val)
  return isNaN(n) ? undefined : n
}

const metaName = (item: PinnedMetaAssignment): string | undefined => item.meta?.name as string | undefined
const metaHint = (item: PinnedMetaAssignment): string | undefined => item.meta?.hint as string | undefined
const metaIcon = (item: PinnedMetaAssignment): string | undefined => item.meta?.icon as string | undefined
const metaRatingMax = (item: PinnedMetaAssignment): number | undefined => Number(item.meta?.ratingMax) || undefined
const metaRatingIcon = (item: PinnedMetaAssignment): string | undefined => item.meta?.ratingIcon as string | undefined
const metaRatingIconEmpty = (item: PinnedMetaAssignment): string | undefined => {
  return (item.meta?.ratingIconEmpty || item.meta?.ratingIcon) as string | undefined
}
const metaRatingHalf = (item: PinnedMetaAssignment): boolean | undefined => Boolean(item.meta?.ratingHalf)
const metaRatingIconHalf = (item: PinnedMetaAssignment): string | undefined => {
  return (item.meta?.ratingIconHalf || item.meta?.ratingIcon) as string | undefined
}
const metaRatingColor = (item: PinnedMetaAssignment): string | undefined => item.meta?.ratingColor as string | undefined

const findAssignedItemByMetaId = (metaId: string | number): PinnedMetaAssignment | undefined => {
  return assignedItems.value.find((item) =>
    Number(getItemKey(item)) === Number(metaId)
    || Number(item.meta?.id) === Number(metaId)
  )
}

const resolveItemKey = (metaId: string | number): string | number => {
  const item = findAssignedItemByMetaId(metaId)
  return item ? getItemKey(item) : metaId
}

const getDefaultMetaValue = (type?: string): MetaFieldValue => {
  if (type === 'array') return []
  if (type === 'boolean') return false
  return null
}

const initBaseValues = (tagSource?: Tag | null) => {
  if (isTag.value) {
    const tag = tagSource ?? props.tag
    if (!tag) return

    const countries = parseCountries(tag.country as string | undefined)
    vals.value = {
      country: countries,
      name: tag.name || null,
      color: (tag.color as string | undefined) || DEFAULT_TAG_COLOR,
      synonyms: tag.synonyms || null,
      rating: Number(tag.rating) || 0,
      favorite: Number(tag.favorite) || 0,
      views: Number(tag.views) || 0,
      bookmark: tag.bookmark || null,
    }
    return
  }

  if (isMedia.value) {
    const media = mediaOverride.value || props.media
    if (!media) return

    vals.value = {
      name: media.name || media.basename || null,
      rating: Number(media.rating) || 0,
      favorite: Number(media.favorite) || 0,
      views: Number(media.views) || 0,
      bookmark: media.bookmark || null,
    }
  }
}

const setVal = (val: MetaFieldValue, key: string | number) => {
  vals.value[key] = val
}

const setValByKey = (val: MetaFieldValue, key: string | number) => {
  setVal(val, key)
}

const pickColor = () => {
  colorPicker.value.color = (vals.value.color as string | undefined) ?? DEFAULT_TAG_COLOR
  colorPicker.value.dialog = true
}

const tryApplyAutoColorFromImage = (color: string) => {
  if (!isTag.value || !props.meta?.color || !props.meta?.autoColorFromImage) return
  if (!isDefaultTagColor(vals.value.color)) return

  vals.value.color = color
}

const hasMainTagImage = computed(() => {
  if (!isTag.value || !props.meta || !props.tag) return false

  const url = resolveTagThumbDisplayUrl({
    dbPath: appStore.dbPath,
    metaId: props.meta.id,
    tagId: props.tag.id,
    type: 'main',
  })

  return !isThumbUnavailable(url)
})

const pickColorFromImage = async () => {
  if (!isTag.value || !props.meta?.color || !props.tag) return

  const cached = getCachedThumb(tagThumbKey(props.meta.id, props.tag.id, 'main'))
  let color: string

  if (cached?.startsWith('data:')) {
    color = await extractColorFromImageUrl(cached)
  } else {
    const filePath = path.join(
      appStore.dbPath,
      'meta',
      `${props.meta.id}`,
      `${props.tag.id}_main.jpg`,
    )
    color = await extractColorFromLocalFile(filePath)
  }

  if (isDefaultTagColor(color)) return

  vals.value.color = color
}

const setColor = (color: string) => {
  vals.value.color = color
  colorPicker.value.dialog = false
}

const pickDate = (metaId: string | number) => {
  datePicker.value.dialog = true
  datePicker.value.value = vals.value[metaId] as string | null
  datePicker.value.metaId = metaId
}

const setDate = (date: string | Date | null) => {
  datePicker.value.dialog = false
  if (datePicker.value.metaId != null && date) {
    vals.value[datePicker.value.metaId] = dayjs(date).format('YYYY-MM-DD')
  }
}

const equalOld = (metaId: string | number, metaType?: string) => {
  const val = vals.value[metaId]
  const oldVal = old.value[metaId]

  if (metaType === 'array') {
    return metaArrayValuesEqual(val, oldVal)
  }
  return val === oldVal
}

const restore = (key: string | number) => {
  vals.value[key] = cloneMetaFieldValue(old.value[key])
}

const restoreIdentityRatingFavorite = () => {
  if (ratingEnabled.value) restore('rating')
  if (favoriteEnabled.value) restore('favorite')
}

const discard = () => {
  vals.value = cloneMetaValues(old.value)
}

const getIsDirty = () => isDirty.value

watch(isDirty, (dirty) => emit('dirty-change', dirty), {immediate: true})

const applyMediaFileInfo = (fileInfo: Partial<MediaItem> | null) => {
  if (!fileInfo || !isMedia.value) return

  const base = mediaOverride.value || props.media
  if (!base) return

  mediaOverride.value = {...base, ...fileInfo}

  // Thumb refresh is deferred to refreshEditingMediaFileInfo so the caller
  // can capture pre-refresh dimensions (updateItem mutates items in-place).
}

const refreshEditingMediaFileInfo = async () => {
  if (!isMedia.value || currentItemId.value == null) return

  const base = mediaOverride.value || props.media
  // Capture dimensions before the async call — syncMediaFileInfo inside
  // refreshMediaFileInfo mutates the store item in-place via updateItem.
  const prevW = base ? (Number(base.width) || 0) : 0
  const prevH = base ? (Number(base.height) || 0) : 0

  const fileInfo = await refreshMediaFileInfo(Number(currentItemId.value))
  applyMediaFileInfo(fileInfo)

  if (!fileInfo) return

  const nextW = Number(fileInfo.width) || 0
  const nextH = Number(fileInfo.height) || 0
  // Only bust the card thumb when width/height were resolved for the first time
  // or actually changed.  Blind refreshThumb on every inspector focus bumps the
  // VImg :key and causes a visible blank flash on unchanged thumbs.
  if (prevW !== nextW || prevH !== nextH) {
    const mediaId = Number(base?.id ?? currentItemId.value)
    if (mediaId) {
      itemsStore.refreshThumb(mediaId)
    }
  }
}

const onMediaPathUpdate = (updatedMedia: MediaItem) => {
  if (!isMedia.value) return
  mediaOverride.value = updatedMedia
  // Keep form name in sync with path rename. Save writes MEDIA_ENTITY_FIELD_KEYS
  // including name; without this, Save reverts the wall title to the stale stem.
  if (updatedMedia.name != null) {
    vals.value.name = updatedMedia.name
    old.value.name = updatedMedia.name
  }
  void refreshEditingMediaFileInfo()
}

const setMetaInputRef = (el: unknown, metaId: string | number) => {
  if (el) {
    metaInputRefs.value[metaId] = el as MetaInputArrayInstance
  }
}

const setMixedTagsRef = (el: unknown) => {
  mixedTagsInputRef.value = el ? el as MetaInputMixedTagsInstance : null
}

const getMetaValues = async () => {
  try {
    if (!currentItemId.value) return

    let tags: TagInTagEntry[] = []
    let values: ValueInTagEntry[] = []

    if (isTag.value && props.meta) {
      const tagsResponse = await typedApi.getTagsInTag(currentItemId.value)
      tags = tagsResponse.data

      const valuesResponse = await typedApi.getValuesInTag(currentItemId.value)
      values = valuesResponse.data

      const pinnedResponse = await typedApi.getPinnedChildMeta(props.meta.id)
      assignedItems.value = sortPinnedAssignmentItems(pinnedResponse.data)
      scraperStore.pinned = assignedItems.value as ScraperPinnedItem[]

    } else if (isMedia.value) {
      const mediaId = currentItemId.value
      const mediaTypeId = props.media?.mediaTypeId ?? itemsStore.environment?.media_type_id
      const [tagsResponse, valuesResponse, pinnedResponse] = await Promise.all([
        typedApi.getTagsInMedia(mediaId),
        typedApi.getValuesInMedia(mediaId),
        mediaTypeId ? typedApi.getAssignedMetaForMediaType(mediaTypeId) : null,
      ])
      if (mediaId !== currentItemId.value) return

      tags = tagsResponse.data
      values = valuesResponse.data
      assignedItems.value = sortPinnedAssignmentItems(pinnedResponse?.data ?? itemsStore.safeAssigned)
      sceneScraperStore.pinned = assignedItems.value as ScraperPinnedItem[]
    }

    for (const item of assignedItems.value) {
      setVal(getDefaultMetaValue(item.meta?.type), getItemKey(item))
    }

    for (const value of values) {
      const item = findAssignedItemByMetaId(value.metaId)
      let val = value.value

      if (item) {
        const type = item.meta?.type
        if (type === 'rating' || type === 'number') {
          if (val == null || val === '') {
            val = null
          } else {
            const n = Number(val)
            val = isNaN(n) ? null : n
          }
        } else if (type === 'boolean') {
          val = parseMetaBooleanValue(val)
        }
      }

      setVal(val as MetaFieldValue, resolveItemKey(value.metaId))
    }

    const parsedTags: Record<string, number[]> = {}
    for (const tag of tags) {
      const metaIdKey = String(tag.metaId)
      const tagId = Number(tag.tagId)
      if (!Number.isFinite(tagId)) continue
      if (!parsedTags[metaIdKey]) {
        parsedTags[metaIdKey] = [tagId]
      } else if (!parsedTags[metaIdKey].includes(tagId)) {
        parsedTags[metaIdKey].push(tagId)
      }
    }

    for (const metaId in parsedTags) {
      setVal(parsedTags[metaId], resolveItemKey(metaId))
    }

    old.value = cloneMetaValues(vals.value)

    if (isTag.value) {
      scraperStore.currentValues = vals.value
    } else if (isMedia.value) {
      sceneScraperStore.currentValues = vals.value
    }

  } catch (error) {
    console.error('Error getting meta values:', error)
  }
}

const loadEditingState = async () => {
  if (!currentItemId.value) return

  if (isTag.value) {
    let tagSource = props.tag
    try {
      const response = await typedApi.getTagById(Number(currentItemId.value))
      tagSource = response.data ?? tagSource
    } catch (error) {
      console.error('Error loading tag base values:', error)
    }
    initBaseValues(tagSource)
  } else {
    initBaseValues()
  }

  await getMetaValues()
}

const TAG_ENTITY_FIELD_KEYS = [
  'name',
  'color',
  'synonyms',
  'rating',
  'favorite',
  'views',
  'bookmark',
] as const

const MEDIA_ENTITY_FIELD_KEYS = [
  'name',
  'rating',
  'favorite',
  'views',
  'bookmark',
] as const

const normalizeEntityFieldValue = (
  key: string,
  value: MetaFieldValue,
): MetaFieldValue => {
  switch (key) {
    case 'rating':
    case 'views':
      return value == null || value === '' ? 0 : Number(value) || 0
    case 'favorite':
      return value === true || value === 1 ? 1 : 0
    case 'synonyms':
    case 'bookmark':
    case 'color':
      return value == null || value === '' ? null : value
    case 'name':
      return typeof value === 'string' ? value.trim() : value
    default:
      return value
  }
}

const buildEntityUpdateData = (): EntityUpdatePayload => {
  const cloned = cloneMetaValues(vals.value) as EntityUpdateFormValues
  const {country, ...rest} = cloned
  const updateData: Record<string, MetaFieldValue> = {}
  const fieldKeys = isTag.value ? TAG_ENTITY_FIELD_KEYS : MEDIA_ENTITY_FIELD_KEYS

  for (const key of fieldKeys) {
    if (!(key in rest)) continue
    updateData[key] = normalizeEntityFieldValue(key, rest[key])
  }

  if (isTag.value) {
    updateData.country = country?.length ? serializeCountries(country) : null
  }

  return updateData as EntityUpdatePayload
}

const save = async (options?: {itemId?: number}): Promise<boolean> => {
  if (!form.value) return false

  const targetId = options?.itemId ?? currentItemId.value
  if (targetId == null) return false

  const {valid: isValid} = await form.value.validate()
  if (!isValid) return false

  const tags: Array<TagInTagPayload | TagInMediaPayload> = []
  const values: Array<ValueInTagPayload | ValueInMediaPayload> = []
  const assignedKeys = new Set(
    assignedItems.value.map((item) => String(getItemKey(item)))
  )

  for (const key in vals.value) {
    const isMeta = /\d/.test(key)
    if (!isMeta || !assignedKeys.has(String(key))) continue

    let val = vals.value[key]
    const assignedItem = findAssignedItemByMetaId(key)
    const metaType = assignedItem?.meta?.type
    const valType = typeof val
    const metaId = Number(key)

    if (metaType === 'boolean') {
      val = serializeMetaBooleanValue(val)
    } else if (valType === 'string') {
      val = (val as string).trim()
      if ((val as string).length === 0) val = null
    } else if (Array.isArray(val)) {
      const seenTagIds = new Set<number>()
      for (const rawTagId of val as number[]) {
        const tagId = Number(rawTagId)
        if (!Number.isFinite(tagId) || seenTagIds.has(tagId)) continue
        seenTagIds.add(tagId)
        if (isTag.value) {
          tags.push({
            parentTagId: targetId,
            tagId,
            metaId,
          })
        } else if (isMedia.value) {
          tags.push({
            mediaId: targetId,
            tagId,
            metaId,
          })
        }
      }
    }

    if (isMeta && !Array.isArray(val)) {
      if (isTag.value) {
        values.push({
          value: val,
          tagId: targetId,
          metaId,
        })
      } else if (isMedia.value) {
        values.push({
          value: val,
          mediaId: targetId,
          metaId,
        })
      }
    }
  }

  const updateData = buildEntityUpdateData()

  try {
    const endpoint = isTag.value ? 'tag' : 'media'
    await typedApi.updateEntity(endpoint, targetId, updateData)

    const tagsEndpoint = isTag.value ? 'TagsInTag' : 'TagsInMedia'
    await typedApi.deleteItemTags(tagsEndpoint, targetId)

    if (tags.length > 0) {
      await typedApi.postItemTags(tagsEndpoint, tags)
    }

    const valuesEndpoint = isTag.value ? 'ValuesInTag' : 'ValuesInMedia'
    await typedApi.deleteItemValues(valuesEndpoint, targetId)

    if (values.length > 0) {
      await typedApi.postItemValues(valuesEndpoint, values)
    }

    // Chips resolve tagId → name via appStore.tags; reload first so newly created
    // tags are visible immediately (same order as scene scrape card refresh).
    await reloadTagsCatalog()

    const cardTags: ItemTagRef[] = tags.map((entry) => ({
      tagId: Number(entry.tagId),
      metaId: Number(entry.metaId),
    })).filter((entry) => Number.isFinite(entry.tagId) && Number.isFinite(entry.metaId))

    const currentItemTags = (
      itemsStore.itemsOnPage.find((item) => Number(item.id) === Number(targetId))
      ?? itemsStore.entities.find((item) => Number(item.id) === Number(targetId))
    )?.tags
    const inheritedFolderTags = (currentItemTags || []).filter((entry) => entry.fromFolder)
    if (inheritedFolderTags.length) {
      const seen = new Set(cardTags.map((entry) => `${entry.metaId}:${entry.tagId}`))
      for (const entry of inheritedFolderTags) {
        const tagId = Number(entry.tagId)
        const metaId = Number(entry.metaId)
        if (!Number.isFinite(tagId) || !Number.isFinite(metaId)) continue
        const key = `${metaId}:${tagId}`
        if (seen.has(key)) continue
        seen.add(key)
        cardTags.push({tagId, metaId, fromFolder: true})
      }
    }

    const cardValues: ItemValueRef[] = values.map((entry) => ({
      value: entry.value,
      metaId: Number(entry.metaId),
    })).filter((entry) => Number.isFinite(entry.metaId))

    // Keep wall cards in sync immediately — entity fields and chip links.
    // listSync.getItemsFromDb still runs after emit for an authoritative refresh.
    itemsStore.updateItem({
      id: targetId,
      item: {
        ...(updateData as Partial<MediaItem>),
        tags: cardTags,
        values: cardValues,
      },
    })

    if (isTag.value && props.meta) {
      refreshTagThumbDisplay(itemsStore, appStore.dbPath, props.meta.id, targetId)
    }

    // Mark clean before a follow-up loadEditingState (inspector item switch).
    old.value = cloneMetaValues(vals.value)
    emit('saved', {id: targetId, type: isTag.value ? 'tag' : 'media'})
    return true
  } catch (error) {
    console.error('Error saving item:', error)
    return false
  }
}

const transferSceneScrapedInfo = async () => {
  if (!isMedia.value) return

  // Manual apply now persists in DialogSceneScraper; reload the open editor form.
  mediaOverride.value = null
  await loadEditingState()
}

function saveSizesForScraperSlot(type: ScraperImageSlot, metaAspectRatio: number) {
  if (type === 'avatar') {
    return {width: TAG_AVATAR_SAVE_WIDTH, height: TAG_AVATAR_SAVE_WIDTH}
  }
  if (type === 'header') {
    return {width: TAG_HEADER_SAVE_WIDTH, height: TAG_HEADER_SAVE_WIDTH / 2.3}
  }
  const ar = Number(metaAspectRatio) || 1
  return {width: TAG_IMAGE_SAVE_WIDTH, height: TAG_IMAGE_SAVE_WIDTH / ar}
}

const transferScrapedInfo = async () => {
  if (!isTag.value || !props.meta || !props.tag) return

  const images = (dialogsStore.scraper?.images || [])
    .filter((item): item is ScraperImageAssignment => (
      Boolean(item?.url)
      && isScraperImageSlot(item?.type)
    ))
  const ar = Number(props.meta.imageAspectRatio) || 1
  const mainSizes = saveSizesForScraperSlot('main', ar)
  const mainImagePath = path.join(
    appStore.dbPath,
    'meta',
    `${props.meta.id}`,
    `${props.tag.id}_main.jpg`,
  )

  let mainSaved = false

  if (images.length > 0) {
    let failedCount = 0

    for (const assignment of images) {
      const imagePath = path.join(
        appStore.dbPath,
        'meta',
        `${props.meta.id}`,
        `${props.tag.id}_${assignment.type}.jpg`,
      )

      const res = await createImage(
        assignment.url,
        imagePath,
        saveSizesForScraperSlot(assignment.type, ar),
      )
      if (res.status != 201) {
        ++failedCount
      } else if (assignment.type === 'main') {
        mainSaved = true
      }
    }

    if (failedCount > 0) {
      setNotification({
        type: failedCount === images.length ? 'error' : 'warning',
        title: t('scraper.error'),
        text: t('scraper.images_import_partial', {
          failed: failedCount,
          total: images.length,
        }),
      })
    }
  }

  if (!mainSaved) {
    const alreadyHasMain = await checkFileExists(mainImagePath)
    if (!alreadyHasMain) {
      const fallback = await createUnavailableImage(mainImagePath, mainSizes)
      mainSaved = fallback.status === 201
    }
  }

  if (
    mainSaved
    && props.meta.autoColorFromImage
    && props.meta.color
    && isDefaultTagColor(vals.value.color)
  ) {
    const color = await extractColorFromLocalFile(mainImagePath)
    if (!isDefaultTagColor(color)) {
      vals.value.color = color
    }
  }

  if (images.length > 0 || mainSaved) {
    eventBus.emit('scraperGotImages')
    dialogsStore.scraper.images = []
    refreshTagThumbDisplay(itemsStore, appStore.dbPath, props.meta.id, props.tag.id)
  }

  const fields = (scraperStore.fields || []) as ScraperTransferField[]

  for (const field of fields) {
    if (field.isTransfered) {
      if (field.dataType === 'array') {
        const metaId = field.meta.id

        if (field.isTagExists) {
          const tags = appStore.getTagsByMetaId(metaId)
          const tag = tags.find((i) => i.name === field.valueScraper)

          if (tag) {
            const arr = [...(vals.value[metaId] as number[] || [])]

            if (!arr.includes(tag.id)) {
              arr.push(tag.id)
              setValByKey(arr, metaId)
            }
          }
        } else {
          const scraperName = String(field.valueScraper ?? '').trim()
          if (!scraperName) {
            // skip
          } else if (useMixedTagsInput.value) {
            void mixedTagsInputRef.value?.create(scraperName, metaId)
          } else {
            const input = metaInputRefs.value[metaId]
            if (input?.create) {
              input.create(scraperName)
            }
          }
        }
      } else if (field.dataType === 'country') {
        setValByKey(field.valueCurrent as MetaFieldValue, 'country')
      } else if (field.dataType === 'synonyms') {
        setValByKey(field.valueCurrent as MetaFieldValue, 'synonyms')
      } else if (field.dataType === 'bookmark') {
        setValByKey(field.valueCurrent as MetaFieldValue, 'bookmark')
      } else {
        setValByKey(field.valueScraper as MetaFieldValue, field.meta.id)
      }
    }
  }
}

// Lifecycle (из первого файла с адаптацией)
onMounted(async () => {
  await loadEditingState()

  // Подписываемся на событие передачи данных из скрапера (только для тегов)
  if (isTag.value) {
    eventBus.on('transferScrapedInfo', transferScrapedInfo)
  } else if (isMedia.value) {
    eventBus.on('transferSceneScrapedInfo', transferSceneScrapedInfo)
    void refreshEditingMediaFileInfo()
  }
})

watch(currentItemId, async (itemId, previousItemId) => {
  if (!itemId || itemId === previousItemId) return
  // Inspector edits in-place: persist pending changes before loading the next item.
  if (isInspectorLayout.value && previousItemId != null && getIsDirty()) {
    await save({itemId: previousItemId})
  }
  if (mediaOverride.value && Number(mediaOverride.value.id) !== Number(itemId)) {
    mediaOverride.value = null
  }
  await loadEditingState()
  if (isMedia.value) {
    void refreshEditingMediaFileInfo()
  }
})

watch(
  () => dialogsStore.sceneScraper.show,
  (show) => {
    if (!show || !isMedia.value || currentItemId.value == null) return
    sceneScraperStore.transferMediaId = Number(currentItemId.value)
    sceneScraperStore.pinned = assignedItems.value as ScraperPinnedItem[]
    sceneScraperStore.currentValues = vals.value
  },
)

onUnmounted(() => {
  if (isTag.value) {
    eventBus.off('transferScrapedInfo', transferScrapedInfo)
  } else if (isMedia.value) {
    eventBus.off('transferSceneScrapedInfo', transferSceneScrapedInfo)
  }
})

// Computed properties только для тегов (из первого файла)
const completionStatus = computed(() => {
  const completed: number[] = []

  for (const item of assignedItems.value) {
    const val = vals.value[getItemKey(item)]

    if (val === undefined || val === null) {
      completed.push(0)
    } else if (typeof val === 'boolean') {
      completed.push(1)
    } else if (typeof val === 'number') {
      completed.push(val > 0 ? 1 : 0)
    } else if (typeof val === 'string' || Array.isArray(val)) {
      completed.push(val.length > 0 ? 1 : 0)
    } else {
      completed.push(0)
    }
  }

  if (completed.length === 0) return 0

  const completedValue = completed.reduce((sum, value) => sum + value, 0)
  return Math.ceil((completedValue / completed.length) * 100)
})

// Expose methods to parent component
defineExpose({
  save,
  tryApplyAutoColorFromImage,
  discard,
  isDirty: getIsDirty,
})
</script>

<style lang="scss">
.fav-btn {
  .v-selection-control,
  .v-checkbox-btn {
    min-height: 24px !important;
  }
}

.editing-color-field {
  cursor: pointer;

  .v-field {
    cursor: pointer;
  }

  &__swatch {
    cursor: pointer;
  }

  &__eyedropper {
    margin-inline-end: 2px;
  }
}

.editing--hero {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  column-gap: 16px;
  align-items: stretch;

  // Expanded video player: stack the media above the form.
  &:has(.embedded-expanded) {
    grid-template-columns: minmax(0, 1fr);

    .editing-aside.editing-aside {
      width: 100%;
      padding: 0;
      margin: 0;
      position: static;
      max-height: none;
      overflow: visible;
    }

    .editing-nav__item {
      display: none;
    }
  }

  @media (max-width: 760px) {
    grid-template-columns: minmax(0, 1fr);

    .editing-aside.editing-aside {
      width: 100%;
      padding: 0;
      margin: 0 0 8px;
      position: static;
      max-height: none;
      overflow: visible;
    }

    .editing-nav__item {
      display: none;
    }
  }
}

.editing-aside {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 200px;
  min-width: 0;

  // Full mode: pin the whole panel (media + section nav) while the form scrolls,
  // same as the collapsed rail. Taller than the viewport → scrolls on its own.
  &:not(.editing-aside--collapsed) {
    position: sticky;
    top: calc(4px - var(--editing-aside-bleed));
    z-index: 1;
    align-self: start;
    max-height: var(--editing-aside-max-h, calc(100dvh - 180px));
    overflow-y: auto;
    // overflow clips the media card shadow / nav border: give them room.
    width: calc(200px + 2 * var(--editing-aside-bleed));
    padding: var(--editing-aside-bleed);
    margin: calc(-1 * var(--editing-aside-bleed));
    --editing-aside-bleed: 6px;
    padding-bottom: 18px;
    margin-bottom: -18px;
    overscroll-behavior: contain;
    scrollbar-width: thin;

    .editing-nav {
      position: static;
    }
  }

  &--collapsed {
    width: auto;
  }

  .edit-dialog-hero__media {
    max-width: 100%;
  }
}

.editing-main {
  min-width: 0;
}

// Hero: start the right column at the same height as the left panel's
// outlined media frame, so the two columns' top edges line up.
.editing--hero > .editing-main {
  padding-top: var(--editing-main-offset-top, 3px);
}

// Stacked (expanded video / narrow) — no side-by-side edge to match.
.editing--hero:has(.embedded-expanded) > .editing-main {
  padding-top: 0;
}

@media (max-width: 760px) {
  .editing--hero > .editing-main {
    padding-top: 0;
  }
}

.editing-rail {
  position: sticky;
  top: 4px;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  align-self: center;
  gap: 2px;
  padding: 4px;
  border: 1px solid rgba(var(--v-theme-primary), 0.16);
  border-radius: 14px;
  background: rgb(var(--v-theme-surface));

  &__sep {
    width: 60%;
    height: 1px;
    margin-block: 2px;
    background: rgba(var(--v-border-color), var(--v-border-opacity));
  }

  .v-btn {
    opacity: 0.8;

    &:hover {
      opacity: 1;
    }
  }
}

@media (max-width: 760px) {
  .editing-rail {
    flex-direction: row;
    align-self: flex-start;

    .editing-rail__sep {
      width: 1px;
      height: 20px;
      margin-block: 0;
      margin-inline: 2px;
    }
  }
}

.editing-nav {
  position: sticky;
  top: 4px;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px;
  border: 1px solid rgba(var(--v-theme-primary), 0.16);
  border-radius: var(--edit-deck-radius, 16px);
  background: rgb(var(--v-theme-surface));

  &__item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 10px;
    border-radius: 10px;
    font-size: 0.8125rem;
    text-align: start;
    color: inherit;
    cursor: pointer;
    transition: background-color 120ms ease;

    &:hover,
    &:focus-visible {
      background: rgba(var(--v-theme-primary), 0.08);
      outline: none;
    }
  }

  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 0 0 4px 10px;
  }

  &__head-title {
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    opacity: 0.55;
  }

  &__icon {
    opacity: 0.65;
  }

  &__title {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__count {
    flex: 0 0 auto;
    font-size: 0.72rem;
    font-variant-numeric: tabular-nums;
    padding: 0 6px;
    border-radius: 999px;
    background: rgba(var(--v-theme-on-surface), 0.07);

    &--done {
      background: rgba(var(--v-theme-success), 0.15);
      color: rgb(var(--v-theme-success));
    }
  }
}

.editing .editing-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
  gap: 8px;
  align-items: start;

  > .field,
  > .field--full {
    min-width: 0;
  }

  > .field--full {
    grid-column: 1 / -1;
  }

  .editing-group-header {
    scroll-margin-top: 8px;
  }

  .editing-more {
    display: flex;
    justify-content: center;
    margin-top: -2px;
  }
}

.editing .editing-grid--main {
  container-type: inline-size;
  grid-auto-flow: row dense;
}

// Rating + favorite needs ~2 columns; span them once the grid has at least 2 tracks.
@container (min-width: 608px) {
  .editing--sections .editing-grid--main > .field--identity {
    grid-column: span 2;
  }
}

// Fallback for a single narrow column: let favorite wrap under the stars.
.editing--sections .field--identity .editing-rating-field--identity {
  flex-wrap: wrap;
  row-gap: 4px;
}

.editing {
  .editing-field-card {
    position: relative;
  }

  .field {
    position: relative;
  }

  .editing-section__toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
  }

  .editing-section__group {
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: 100%;
  }

  .editing-section__group--filters + .editing-section__group--tags {
    margin-inline-start: 10px;
  }

  .editing-section__group--search {
    flex: 0 1 18rem;
    margin-inline-start: auto;
  }

  .editing-section__tags-icon {
    flex: 0 0 auto;
    opacity: 0.6;
  }

  .editing-section__group-label {
    display: none;
  }

  .editing-section__search {
    flex: 1 1 auto;
    min-width: 0;
    max-width: none;
    width: 100%;
  }

  .editing-section__tags-segmented,
  .editing-section__filters {
    flex: 0 0 auto;
  }
}
// ─── Property-list rows (hero/default layouts) ─────────────────────────────
// Label column on the left, value on the right, no nested surfaces. Empty
// values read as a quiet "Add…" placeholder; the field surface appears on
// hover/focus. Edited rows get a primary accent bar.
.editing--sections {
  --prop-label-w: 168px;

  --prop-control-h: var(--edit-deck-control-h, 40px);
  --prop-chip-pad: 8px;
  --prop-row-pad-x: 12px;
  --prop-row-pad-y: 4px;
  --prop-row-gap: 4px;
  --prop-col-gap: 16px;

  // One column: every label sits in the same column, values start on one line.
  .editing-grid,
  .editing-grid--main {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--prop-row-gap);
  }

  // The identity strip used to `span 2`, which created an implicit second
  // column and pushed neighbouring fields off the right edge.
  .editing-grid--main > .field--identity,
  .editing-grid--main > .field--full {
    grid-column: 1 / -1;
  }

  // Section headers share the rows' left edge (icon over icon) and run to the
  // same right edge as the toolbar / strip.
  .editing-group-header {
    padding: 24px 0 8px var(--prop-row-pad-x);
  }

  .editing-grid--main + .editing-group-header {
    padding-top: 24px;
  }

  .editing-group-header:first-child {
    padding-top: 8px;
  }

  .field {
    container-type: inline-size;
  }

  .editing-field-card.prop-row {
    display: grid !important;
    // Restore column exists only when a restore button is shown, so an empty
    // track + column-gap don't widen the right inset.
    grid-template-columns: var(--prop-label-w) minmax(0, 1fr);
    align-items: start;
    column-gap: var(--prop-col-gap);
    min-height: calc(var(--prop-control-h) + 2 * var(--prop-row-pad-y));
    padding: var(--prop-row-pad-y) var(--prop-row-pad-y) var(--prop-row-pad-y) var(--prop-row-pad-x) !important;

    &:has(> .editing-field-restore--float) {
      grid-template-columns: var(--prop-label-w) minmax(0, 1fr) auto;
      column-gap: var(--prop-col-gap);
    }
    border-radius: 12px !important;
    background: transparent !important;
    box-shadow: none;
    transition: background-color 120ms ease, box-shadow 120ms ease;

    &:hover {
      background: rgba(var(--v-theme-on-surface), 0.035) !important;
    }

    &:focus-within {
      background: rgba(var(--v-theme-primary), 0.05) !important;
    }

    &.prop-row--dirty {
      box-shadow: inset 3px 0 0 rgb(var(--v-theme-primary));
    }

    // Floating restore sits in its own column instead of overlaying the input.
    &:has(.editing-field-restore--float) {
      padding-inline-end: var(--prop-row-pad-y) !important;
    }

    .editing-field-restore--float {
      position: static;
      align-self: center;
      transform: none;
      box-shadow: none;

      &:hover {
        transform: scale(1.06);
      }
    }

    > .v-input,
    > .editing-rating-field {
      grid-column: 2;
      min-width: 0;
    }

    // Icons live in the label column.
    .v-input__prepend {
      display: none;
    }

    .v-field {
      --v-field-padding-start: 10px;
      --v-field-padding-end: 6px;
      border-radius: 8px;
      background: transparent !important;
      box-shadow: none !important;
      transition: background-color 120ms ease;
    }

    .v-field__overlay {
      display: none;
    }

    &:hover .v-field,
    .v-field--focused {
      background: rgba(var(--v-theme-on-surface), 0.05) !important;
    }

    .v-field--focused {
      box-shadow: inset 0 0 0 1px rgba(var(--v-theme-primary), 0.55) !important;
    }



    .v-field__input input::placeholder,
    .v-field__input textarea::placeholder {
      color: rgba(var(--v-theme-on-surface), 0.38);
      opacity: 1;
    }

    // Secondary controls (sort, dropdown arrow, clear) only on hover/focus.
    .v-field__append-inner > :not(.editing-field-restore),
    .v-field__clearable {
      opacity: 0;
      transition: opacity 120ms ease;
    }

    &:hover,
    &:focus-within {
      .v-field__append-inner > :not(.editing-field-restore),
      .v-field__clearable {
        opacity: 1;
      }
    }

    .v-input__details {
      padding-inline: 10px;
    }

    .editing-rating-field {
      min-height: var(--prop-control-h);
      padding-inline-start: 2px;
    }

    .editing-rating-field__hint {
      inset-inline-start: calc(var(--prop-label-w) + var(--prop-col-gap) + 8px);
    }

    .v-checkbox {
      margin-inline-start: 2px;
    }
  }

  // Counters: compact, never stretched across the whole row.
  .prop-row--number .v-number-input,
  .field:has(> .prop-row .v-number-input) .v-number-input {
    max-width: 220px;
  }

  .prop-row__label {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    min-height: var(--prop-control-h);
    grid-column: 1;
    font-size: 0.875rem;
    font-weight: 500;
    color: rgba(var(--v-theme-on-surface), 0.78);
    transition: color 120ms ease;
  }

  .prop-row__icon {
    flex: 0 0 auto;
    opacity: 0.6;
  }

  .prop-row__name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .prop-row--empty:not(:focus-within) .prop-row__label {
    color: rgba(var(--v-theme-on-surface), 0.5);
  }

  .prop-row:focus-within .prop-row__label {
    color: rgb(var(--v-theme-primary));

    .prop-row__icon {
      opacity: 0.9;
    }
  }

  // Narrow cell: label above value (inspector keeps the label column — see below).
  @container (max-width: 420px) {
    &:not(.editing--inspector) .editing-field-card.prop-row {
      grid-template-columns: minmax(0, 1fr);
      row-gap: 0;

      &:has(> .editing-field-restore--float) {
        grid-template-columns: minmax(0, 1fr) auto;
      }
      padding-top: 6px !important;

      .prop-row__label {
        grid-column: 1 / -1;
        min-height: 24px;
        font-size: 0.8125rem;
      }

      > .v-input,
      > .editing-rating-field {
        grid-column: 1;
      }
    }
  }

  // Rating / favorite / views: a regular prop row (no own surface). The lead
  // label sits in the label column, so the stars start where other values do;
  // favorite and views follow inline as quieter secondary pairs.
  .editing-field-card--identity {
    display: flex !important;
    align-items: center;
    min-height: calc(var(--prop-control-h) + 2 * var(--prop-row-pad-y));
    margin-block: 0;
    padding: var(--prop-row-pad-y) var(--prop-row-pad-y) var(--prop-row-pad-y) var(--prop-row-pad-x) !important;
    border-radius: 12px !important;
    background: transparent !important;
    box-shadow: none !important;
    transition: background-color 120ms ease;

    &:hover {
      background: rgba(var(--v-theme-on-surface), 0.035) !important;
    }

    &:focus-within {
      background: rgba(var(--v-theme-primary), 0.05) !important;
    }

    .editing-rating-field--identity {
      flex: 1 1 auto;
      flex-wrap: wrap;
      align-items: center;
      row-gap: 4px;
      column-gap: 0;
      min-height: var(--prop-control-h);
      padding-inline-start: 0;
    }

    .editing-rating-field__name {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      font-size: 0.875rem;
      line-height: 1.2;
      color: rgba(var(--v-theme-on-surface), 0.6);
      margin-inline-end: 14px;
    }

    // Lead label = label column of a prop row.
    .editing-rating-field__name--lead {
      flex: 0 0 auto;
      width: calc(var(--prop-label-w) + var(--prop-col-gap));
      margin-inline-end: 0;
      font-weight: 500;
      color: rgba(var(--v-theme-on-surface), 0.78);
    }

    &:focus-within .editing-rating-field__name--lead {
      color: rgb(var(--v-theme-primary));
    }

    .editing-rating-field__sep {
      width: 1px;
      height: 20px;
      margin-inline: 32px;
      background: rgba(var(--v-theme-on-surface), 0.12);
    }

    // Stars: same visual weight as an input line, slight negative inset so
    // the first star lines up with input text.
    .v-rating {
      margin-inline-start: -4px;
    }

    // A little air between stars: easier to hit the right one.
    .v-rating .v-btn {
      width: 32px !important;
      height: 32px !important;
      min-width: 32px !important;
      margin-inline: 1px;
    }

    .v-rating .v-icon {
      font-size: 24px !important;
    }

    .fav-btn .v-icon {
      font-size: 24px !important;
    }

    .editing-field-restore--float {
      position: static;
      transform: none;
      box-shadow: none;
      margin-inline-start: auto;
    }
  }

  // Views stepper: transparent like other fields, surface on hover/focus only.
  .editing-views-inline {
    flex: 0 0 auto;
    width: 140px;

    .v-field {
      border-radius: 8px;
      background: transparent !important;
      box-shadow: none !important;
      transition: background-color 120ms ease;
    }

    .v-field__overlay {
      display: none;
    }

    .v-field__input {
      text-align: center;
      font-variant-numeric: tabular-nums;
    }
  }

  .editing-field-card--identity:hover .editing-views-inline .v-field,
  .editing-views-inline:focus-within .v-field {
    background: rgba(var(--v-theme-on-surface), 0.05) !important;
  }

  .editing-views-inline .v-field--focused {
    box-shadow: inset 0 0 0 1px rgba(var(--v-theme-primary), 0.55) !important;
  }
}

// ─── Value alignment inside prop rows ──────────────────────────────────────
// item.scss reserves 14px on top of filled/solo fields (and multi-selects) for
// a floating label. Prop rows have no in-field label, so that space only pushed
// the text / chips below the row label. The doubled classes out-rank those
// rules (they use :not() chains + !important).
.editing.editing--sections .editing-field-card.prop-row.prop-row {
  .v-input.v-input .v-field.v-field.v-field {
    --v-field-padding-top: 0px;
    --v-field-padding-bottom: 0px;
    --v-input-padding-top: 0px;
    align-items: flex-start !important;
  }

  // Single-line text / number / select: text centred in the control height.
  .v-input.v-input .v-field.v-field.v-field .v-field__input.v-field__input {
    min-height: var(--prop-control-h) !important;
    padding-top: 0 !important;
    padding-bottom: 0 !important;
    align-items: center !important;
  }

  // Textarea keeps a small symmetric inset so wrapped lines don't touch the edge.
  .v-textarea.v-textarea .v-field.v-field.v-field .v-field__input.v-field__input:not(.v-textarea__sizer) {
    padding-top: 9px !important;
    padding-bottom: 9px !important;
    line-height: 1.35 !important;
  }

  // Chips (tags, country, mixed tags): first row of chips on the label line,
  // following rows wrap below with the same gap; equal inset top and bottom.
  .v-autocomplete--multiple.v-input,
  .v-combobox--multiple.v-input,
  .v-select--multiple.v-input {
    --v-input-padding-top: 0px;
    --v-input-padding-bottom: 0px;

    .v-field.v-field.v-field .v-field__input.v-field__input {
      min-height: var(--prop-control-h) !important;
      padding-block: var(--prop-chip-pad) !important;
      align-content: center !important;
      align-items: center !important;
      row-gap: 6px !important;
      column-gap: 6px !important;
    }

    .v-field.v-field.v-field.v-field--dirty .v-field__input.v-field__input,
    .v-field.v-field.v-field.v-field--active .v-field__input.v-field__input {
      padding-top: var(--prop-chip-pad) !important;
    }

    .v-field__input.v-field__input > input {
      min-height: 24px;
      align-self: center;
    }
  }

  // Affixes (sort, arrow, clear, restore, eyedropper) on the first line.
  .v-input.v-input .v-field.v-field.v-field {
    .v-field__prepend-inner,
    .v-field__append-inner,
    .v-field__clearable {
      align-self: flex-start !important;
      align-items: center !important;
      min-height: var(--prop-control-h);
      margin-top: 0 !important;
      padding-top: 0 !important;
      padding-bottom: 0 !important;
    }
  }
}
// Views counter in the rating strip: same floating-label padding problem —
// centre the number vertically and keep it level with the strip labels.
.editing.editing--sections .editing-views-inline.editing-views-inline.v-input.v-input {
  align-self: center;

  .v-field.v-field.v-field {
    --v-field-padding-top: 0px;
    --v-field-padding-bottom: 0px;
    --v-input-padding-top: 0px;
    align-items: center !important;
  }

  .v-field.v-field.v-field .v-field__input.v-field__input {
    min-height: var(--prop-control-h) !important;
    padding-top: 0 !important;
    padding-bottom: 0 !important;
    align-items: center !important;
    justify-content: center;
    text-align: center;
  }

  .v-field__append-inner,
  .v-field__prepend-inner {
    align-self: stretch !important;
    align-items: center !important;
    padding-top: 0 !important;
  }
}
// ─── Number steppers (prop rows + views in the rating strip) ────────────────
// One look for every split number input: at rest only the value and faint
// −/+ are visible; on row hover / focus the surface, light dividers and
// stronger buttons appear. (The generic "hide append-inner at rest" rule hid
// only the + and left the − visible, so the two states looked different.)
.editing.editing--sections .editing-field-card.v-card {
  .v-number-input.v-input .v-field .v-field__prepend-inner > .v-number-input__control,
  .v-number-input.v-input .v-field .v-field__append-inner > .v-number-input__control {
    opacity: 1;
  }

  .v-number-input.v-input .v-number-input__control .v-btn {
    opacity: 0.45;
    transition: opacity 120ms ease;
  }

  .v-number-input.v-input .v-number-input__control .v-divider {
    opacity: 0;
    transition: opacity 120ms ease;
  }

  &:hover .v-number-input.v-input,
  .v-number-input.v-input:focus-within {
    .v-number-input__control .v-btn {
      opacity: 0.85;
    }

    .v-number-input__control .v-divider {
      opacity: var(--v-border-opacity, 0.12);
    }
  }
}
// ─── Inspector (right side panel) ──────────────────────────────────────────
// Same property list as the edit dialog, scaled to a ~360px panel: narrow
// label column, shorter controls, tighter section headers. No `zoom` hack —
// sizes come from the shared prop-row variables.
.editing.editing--inspector.editing--sections {
  --prop-label-w: 88px;
  --prop-control-h: 30px;
  --prop-chip-pad: 3px;
  --prop-row-pad-x: 8px;
  --prop-row-pad-y: 1px;
  --prop-row-gap: 1px;
  --prop-col-gap: 8px;

  .editing-form {
    padding-top: 0 !important;
    padding-bottom: 0 !important;
  }

  .editing-group-header {
    min-height: 26px;
    gap: 6px;
    padding: 14px 0 4px var(--prop-row-pad-x);

    &:first-child {
      padding-top: 2px;
    }

    .editing-group-header__icon {
      font-size: 15px !important;
    }

    .editing-group-header__title {
      font-size: 0.6875rem;
      letter-spacing: 0.05em;
    }

    .editing-group-header__count {
      font-size: 0.6875rem;
      padding: 0 5px;
    }
  }

  .editing-grid--main + .editing-group-header {
    padding-top: 14px;
  }

  // Tags-mode toggle in the section header: pill-sized.
  .editing-section__tags-segmented {
    .settings-segmented__option {
      min-height: 20px;
      padding: 1px 6px;
      font-size: 0.65rem;
    }
  }

  .editing-section__toolbar {
    flex-wrap: nowrap;
    gap: 6px;
    margin: 4px 0 14px;
  }

  .editing-section__group--search {
    flex: 1 1 auto;
    min-width: 0;
  }

  .editing-section__filters .settings-segmented__option {
    min-height: 22px;
    padding: 2px 6px;
    font-size: 0.65rem;
  }

  .editing-section__search .v-field {
    --v-input-control-height: 28px;
    min-height: 28px;
    font-size: 0.75rem;
  }

  .editing-section__search .v-field__input {
    min-height: 28px !important;
    padding-top: 0 !important;
    padding-bottom: 0 !important;
  }

  .editing-field-card.prop-row,
  .editing-field-card--identity {
    border-radius: 8px !important;
  }

  .editing-field-card.prop-row {
    .v-field {
      --v-field-padding-start: 6px;
      --v-field-padding-end: 4px;
      border-radius: 6px;
      font-size: 0.8125rem;
    }

    .v-field__input,
    .v-field__input input,
    .v-field__input textarea {
      font-size: 0.8125rem !important;
    }

    .v-field__append-inner .v-icon,
    .v-field__prepend-inner .v-icon,
    .v-field__clearable .v-icon {
      font-size: 16px !important;
    }

    .v-number-input .v-btn {
      width: 24px !important;
      min-width: 24px !important;
      height: 24px !important;
    }

    .v-chip {
      --v-chip-height: 22px;
      height: 22px !important;
      font-size: 0.75rem !important;
      padding-inline: 6px !important;
    }

    .v-chip .v-icon {
      font-size: 13px !important;
    }

    .editing-field-restore {
      transform: scale(0.85);
    }
  }

  .prop-row__label {
    gap: 6px;
    font-size: 0.75rem;
    line-height: 1.2;
  }

  .prop-row__icon {
    font-size: 15px !important;
    width: 15px;
    height: 15px;
  }

  .prop-row--number .v-number-input,
  .field:has(> .prop-row .v-number-input) .v-number-input {
    max-width: 150px;
  }

  // Rating strip: lead label in the label column, stars, then a bare heart
  // (its own label would not fit in the panel width).
  .editing-field-card--identity {
    .editing-rating-field--identity {
      flex-wrap: nowrap;
    }

    .editing-rating-field__name {
      gap: 6px;
      font-size: 0.75rem;
    }

    .editing-rating-field__name:not(.editing-rating-field__name--lead) {
      display: none;
    }

    .editing-rating-field__sep {
      height: 16px;
      margin-inline: 8px;
    }

    .v-rating .v-btn {
      width: 26px !important;
      height: 26px !important;
      min-width: 26px !important;
      margin-inline: 0;
    }

    .v-rating .v-icon,
    .fav-btn .v-icon {
      font-size: 20px !important;
    }

    .fav-btn .v-selection-control {
      min-height: 26px;
    }
  }

  // Very narrow panel (dragged down to its minimum): label above value.
  @container (max-width: 230px) {
    .editing-field-card.prop-row {
      grid-template-columns: minmax(0, 1fr);
      row-gap: 0;

      &:has(> .editing-field-restore--float) {
        grid-template-columns: minmax(0, 1fr) auto;
      }

      .prop-row__label {
        grid-column: 1 / -1;
        min-height: 20px;
      }

      > .v-input,
      > .editing-rating-field {
        grid-column: 1;
      }
    }
  }
}

// ─── Two-column property list (dialog) ──────────────────────────────────────
// Short fields marked `.field--half` (see pairHalves) share a row once the form
// is wide enough that each half keeps the label column (> 420px, otherwise the
// row would switch to "label above"). Everything else spans the full row.
.editing.editing--sections:not(.editing--inspector) .editing-form {
  container: edit-form / inline-size;
}

@container edit-form (min-width: 900px) {
  .editing.editing--sections .editing-grid.editing-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: 24px;

    > * {
      grid-column: 1 / -1;
    }

    > .field--half {
      grid-column: auto;
    }
  }
}
</style>
