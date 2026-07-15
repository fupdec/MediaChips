// app/tasks/items.js - исправленный ES модуль

import findIndex from 'lodash/findIndex'
import uniqBy from 'lodash/uniqBy'
import isEmpty from 'lodash/isEmpty'
import groupBy from 'lodash/groupBy'
import shuffle from 'lodash/shuffle'
import orderBy from 'lodash/orderBy'
import type { DbItemRow, ParsedItem, ParsedItemTags } from '../types/items'
import type { FilterLike } from '../../api/types/db'
import { parseCountries } from '../../api/utils/country'
import { normalizeExt, parseExtList } from '../../api/utils/ext'
import { getItemSortIteratee } from '../../api/utils/metaValueSort'

const parseItemsFromDb = (items: DbItemRow[]) => {
  const parseTagsAndValues = (item: DbItemRow): ParsedItemTags => {
    const data: ParsedItemTags = {
      tags: [],
      values: [],
      key: `${item.id}_${Date.now()}`,
    }

    const item_tags = item.media_tags || item.tag_tags;
    const item_values = item.media_values || item.tag_values;

    if (item_tags) {
      const tagRows = item_tags.split(/,(?=[^,]*\^)/).map((entry) => entry.split('^'));
      for (const row of tagRows) {
        data.tags.push({
          tagId: Number(row[0]),
          metaId: Number(row[1]),
        });
      }
    }
    if (item_values) {
      const valueRows = item_values.split(/,(?=[^,]*\^)/).map((entry) => entry.split('^'));
      for (const row of valueRows) {
        data.values.push({
          value: row[0],
          metaId: Number(row[1]),
        });
      }
    }
    return data;
  }

  const parsed: ParsedItem[] = []
  for (const item of items) {
    const parsedData = parseTagsAndValues(item);

    // удаляем ненужные ключи из предметов, где была строка с айдишниками
    delete item.media_tags;
    delete item.media_values;
    delete item.tag_tags;
    delete item.tag_values;

    const index = findIndex(parsed, {id: item.id});
    if (index > -1) {
      const existing = parsed[index]
      let tags = [...existing.tags, ...parsedData.tags]
      let values = [...existing.values, ...parsedData.values]
      tags = uniqBy(tags, 'tagId')
      values = uniqBy(values, 'metaId')
      const replaced: ParsedItem = {...existing, tags, values}
      parsed.splice(index, 1, replaced);
    } else {
      const merged: ParsedItem = {...item, ...parsedData};
      parsed.push(merged);
    }
  }
  return parsed;
}

const resolveMetaId = (param: unknown) => {
  if (typeof param === 'number' && Number.isFinite(param)) return param
  if (typeof param === 'string') {
    const trimmed = param.trim()
    if (!trimmed) return null
    if (/^\d+$/.test(trimmed)) return Number(trimmed)
    const num = Number(trimmed)
    if (Number.isFinite(num) && Number.isInteger(num)) return num
  }
  return null
}

const isTruthyValue = (value: unknown) => (
  value === '1' || value === 1 || value === true || value === 'true' || value === 'TRUE'
)

const filterItems = (
  filters_all: FilterLike[],
  type: string,
  items: ParsedItem[],
  sortBy: string,
  direction: string,
  find_duplicates: boolean,
  duplicates_by = 'filesize',
  sortMetaType?: string | null,
) => {
  // отсеиваем неактивные и без условий (в случае бага)
  const filters = filters_all.filter((i: FilterLike) => {
    const isActive = i.active === true || i.active === 1 || i.active === '1'
    return isActive && i.cond
  })

  const filterItem = (item: ParsedItem) => {
    const compareNumber = (sign: string | undefined, filterValue: unknown, itemValue: unknown) => {
      const a = Number(filterValue)
      const b = Number(itemValue)
      if (Number.isNaN(a) || Number.isNaN(b)) return false

      if (sign === 'equal' || sign === '=') return b === a
      if (sign === 'not equal' || sign === '!==') return b !== a
      if (sign === 'greater than' || sign === '>') return b > a
      if (sign === 'less than' || sign === '<') return b < a
      if (sign === 'greater than or equal' || sign === '>=') return b >= a
      if (sign === 'less than or equal' || sign === '<=') return b <= a
      return false
    }

    const filters_matches = [];

    for (const filter of filters) {
      const by = filter.param
      const cond = filter.cond
      let val = filter.val
      const type = filter.type
      let is_match = false;
      const metaId = resolveMetaId(by)
      let item_val

      if (metaId !== null) {
        const found = item.values?.find((entry) => Number(entry.metaId) === metaId)
        item_val = found?.value
      } else if (typeof by === 'string' || typeof by === 'number') {
        item_val = item[by as keyof ParsedItem]
      }

      if (type == 'string' && typeof val === 'string') val = val.toLowerCase().trim()
      if (type === 'boolean') {
        is_match = isTruthyValue(item_val)
        if (cond === '!=') {
          is_match = !is_match;
        }
      } else if (type === 'date') {
        const itemDate = new Date(String(item_val ?? ''))
        const filterDate = new Date(String(val ?? ''))
        if (Number.isNaN(itemDate.getTime()) || Number.isNaN(filterDate.getTime())) {
          is_match = false
        } else {
          is_match = compareNumber(cond, filterDate.getTime(), itemDate.getTime())
        }
      } else if (type === 'number' || type === 'rating') {
        if (item_val === null || item_val === undefined || item_val === '') {
          is_match = false
        } else if (val === null || val === undefined || val === '') {
          is_match = false
        } else {
          is_match = compareNumber(cond, val, item_val)
        }
      } else if (type === 'string') {
        const itemText = String(item_val ?? '')
        const filterText = String(val ?? '')
        if (cond == 'includes' || cond == 'like') {
          is_match = itemText ? itemText.toLowerCase().includes(filterText) : false
        } else if (cond == 'excludes' || cond == 'not like') {
          is_match = itemText ? !itemText.toLowerCase().includes(filterText) : true
        } else if (cond == 'is null') {
          is_match = !item_val;
        } else if (cond == 'not null') {
          is_match = Boolean(item_val);
        } else if (cond == 'regex') {
          const regex = new RegExp(filterText, 'i');
          is_match = Boolean(itemText.match(regex));
        }
      } else if (type === 'array' || type === 'select') {
        let tags: Array<number | string> = []
        if (by === 'country') {
          if (!isEmpty(item.country)) {
            tags = parseCountries(String(item.country))
          }
        } else if (by === 'ext') {
          const normalizedExt = normalizeExt(item_val as string | null | undefined)
          if (normalizedExt) tags = [normalizedExt]
          val = parseExtList(val as string | string[] | null | undefined)
        } else if (metaId !== null) {
          tags = item.tags
            .filter((entry) => Number(entry.metaId) === metaId)
            .map((entry) => entry.tagId)
        }

        const filterValues = Array.isArray(val) ? val : []

        if (cond === 'is null') { // пусто
          is_match = isEmpty(tags);
        } else if (cond === 'not null') { // не пусто
          is_match = !isEmpty(tags);
        } else if (cond === 'not in') {
          is_match = !tags.some((tagId) => filterValues.includes(tagId))
        } else if (cond === 'not in all') { // excludes all (missing at least one)
          if (!filterValues.length) {
            is_match = !isEmpty(tags);
          } else {
            is_match = !filterValues.every((entry) => tags.includes(entry))
          }
        } else if (cond === 'in only') {
          is_match = !isEmpty(filterValues)
            && tags.length === filterValues.length
            && filterValues.every((entry) => tags.includes(entry))
        } else if (!isEmpty(filterValues) && !isEmpty(tags)) { // если есть значения
          if (cond === 'in') { // включая один из
            is_match = tags.some((tagId) => filterValues.includes(tagId))
          } else if (cond === 'in all') { // включая все
            is_match = filterValues.every((entry) => tags.includes(entry))
          }
        }
      }
      filters_matches.push(is_match);
    }
    return filters_matches.every(Boolean);
  }

  let result: ParsedItem[] = items

  if (find_duplicates) {
    const groupKey = duplicates_by === 'path' ? 'path' : 'filesize'
    const grouped_items = groupBy(result, groupKey);
    let items_dups: ParsedItem[] = []
    for (const key in grouped_items) {
      if (grouped_items[key].length > 1) {
        items_dups = [...items_dups, ...grouped_items[key]];
      }
    }
    result = items_dups;
  } else {
    result = result.filter((item) => filterItem(item));
  }

  if (sortBy === 'shuffle') {
    result = shuffle(result);
  } else {
    const iteratee = getItemSortIteratee(sortBy, sortMetaType)
    result = orderBy(result, [iteratee], [direction as 'asc' | 'desc']);
  }

  return result;
}

export { parseItemsFromDb, filterItems };

