import { en, type MessageKey } from "./en";
import { zh } from "./zh";
import type { AppLocale } from "../store/useUiStore";

export type { MessageKey };

export const MESSAGES: Record<AppLocale, Record<MessageKey, string>> = {
  en: en as unknown as Record<MessageKey, string>,
  zh
};
