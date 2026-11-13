import { pgEnum } from 'drizzle-orm/pg-core';

import {
  ACTOR_TYPES,
  ALLERGEN_CODES,
  ALLERGEN_STATUSES,
  ANSWER_STATUSES,
  ASSET_KINDS,
  CHAT_INTENTS,
  CHAT_ROLES,
  CURRENCIES,
  DIET_TAGS,
  DISCOUNT_SCOPES,
  DISCOUNT_TYPES,
  IMPORT_STATUSES,
  ITEM_TAGS,
  LOCALE_VALUES,
  MEMBER_ROLES,
  ORDERING_MODES,
  PARTICIPANT_ROLES,
  PARTICIPANT_STATUSES,
  PAYMENT_METHODS,
  PLAN_CODES,
  RESTAURANT_STATUSES,
  ROUND_STATUSES,
  SESSION_ITEM_STATUSES,
  SESSION_STATUSES,
  SPLIT_MODES,
  SUBSCRIPTION_STATUSES,
  SUGGESTION_SOURCES,
  WAITER_CALL_STATUSES,
  WAITER_CALL_TYPES,
} from '@radd/shared';

// DATA_MODEL §1. Values come from `@radd/shared` so the database and the app cannot drift.
export const localeEnum = pgEnum('locale', LOCALE_VALUES);
export const currencyEnum = pgEnum('currency', CURRENCIES);
export const memberRoleEnum = pgEnum('member_role', MEMBER_ROLES);
export const restaurantStatusEnum = pgEnum('restaurant_status', RESTAURANT_STATUSES);
export const orderingModeEnum = pgEnum('ordering_mode', ORDERING_MODES);
export const allergenCodeEnum = pgEnum('allergen_code', ALLERGEN_CODES);
export const allergenStatusEnum = pgEnum('allergen_status', ALLERGEN_STATUSES);
export const suggestionSourceEnum = pgEnum('suggestion_source', SUGGESTION_SOURCES);
export const dietTagEnum = pgEnum('diet_tag', DIET_TAGS);
export const itemTagEnum = pgEnum('item_tag', ITEM_TAGS);
export const assetKindEnum = pgEnum('asset_kind', ASSET_KINDS);
export const importStatusEnum = pgEnum('import_status', IMPORT_STATUSES);
export const sessionStatusEnum = pgEnum('session_status', SESSION_STATUSES);
export const participantRoleEnum = pgEnum('participant_role', PARTICIPANT_ROLES);
export const participantStatusEnum = pgEnum('participant_status', PARTICIPANT_STATUSES);
export const sessionItemStatusEnum = pgEnum('session_item_status', SESSION_ITEM_STATUSES);
export const roundStatusEnum = pgEnum('round_status', ROUND_STATUSES);
export const waiterCallTypeEnum = pgEnum('waiter_call_type', WAITER_CALL_TYPES);
export const waiterCallStatusEnum = pgEnum('waiter_call_status', WAITER_CALL_STATUSES);
export const paymentMethodEnum = pgEnum('payment_method', PAYMENT_METHODS);
export const discountScopeEnum = pgEnum('discount_scope', DISCOUNT_SCOPES);
export const discountTypeEnum = pgEnum('discount_type', DISCOUNT_TYPES);
export const splitModeEnum = pgEnum('split_mode', SPLIT_MODES);
export const chatRoleEnum = pgEnum('chat_role', CHAT_ROLES);
export const chatIntentEnum = pgEnum('chat_intent', CHAT_INTENTS);
export const answerStatusEnum = pgEnum('answer_status', ANSWER_STATUSES);
export const planCodeEnum = pgEnum('plan_code', PLAN_CODES);
export const subscriptionStatusEnum = pgEnum('subscription_status', SUBSCRIPTION_STATUSES);
export const actorTypeEnum = pgEnum('actor_type', ACTOR_TYPES);
