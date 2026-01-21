import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * 合并 CSS 类名，支持 Tailwind CSS 类名合并
 * @param {...string} inputs - 要合并的 CSS 类名
 * @returns {string} - 合并后的 CSS 类名
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}